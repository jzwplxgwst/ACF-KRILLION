// Krillion Puffer Party: a join-code, turn-based hot-potato trivia game with rarity scoring and lives. No dependencies: run `node server.js`.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
let PORT = Number(process.env.PORT) || 80; // port 80 gives a short join link; falls back to 3000 if 80 is busy
const MAX_TEAMS = 6, TURN_SECONDS = 15, START_LIVES = 2, BREAK_SECONDS = 10, MAX_STRIKES = 2; // MAX_STRIKES: hearts lost (by anyone) that end a question // each player gets TURN_SECONDS to name an unused answer
const PUB = path.join(__dirname, "public");
const load = () => JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf8")); // re-read for each new room
const rooms = new Map();

// ---- answer matching ----
const norm = s => String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function findAnswer(q, text) {
  const n = norm(text);
  if (!n) return null;
  for (const a of q.answers) for (const v of [a.text, ...(a.aliases || [])]) {
    const m = norm(v);
    // exact match, or one typo allowed on longer answers without digits ("2 John" must not match "3 John")
    if (n === m || (m.length >= 5 && !/\d/.test(m) && lev(n, m) <= 1)) return a;
  }
  return null;
}

// ---- rooms ----
function newCode() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ"; let s;
  do { s = Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join(""); } while (rooms.has(s));
  return s;
}
function view(r) {
  const inQ = r.phase === "question" || r.phase === "reveal", q = inQ ? r.data.questions[r.q] : null;
  // scores are hidden during the last question and its break; the final screen reveals them
  const hide = inQ && r.q === r.data.questions.length - 1, hp = p => hide ? null : p;
  return {
    scoresHidden: hide, finalAt: r.finalAt, now: Date.now(), code: r.code, phase: r.phase, q: r.q, total: r.data.questions.length, tiers: r.data.tiers,
    prompt: q ? q.prompt : null, endsAt: r.endsAt, turnMs: TURN_SECONDS * 1000, turn: r.turn, turnN: r.turnN,
    maxLives: START_LIVES, breakMs: BREAK_SECONDS * 1000, left: q ? q.answers.length - r.used.length : 0,
    used: r.used.map(u => ({ ...u.pub, points: hp(u.pub.points) })), last: r.last && { ...r.last, points: hp(r.last.points) },
    results: r.results.map(x => ({ ...x, points: hp(x.points) })), endReason: r.endReason,
    teams: [...r.teams.values()].map(t => ({ id: t.id, name: t.name, score: hp(t.score), lives: t.lives, out: t.out })),
  };
}
function push(r) { const m = `data: ${JSON.stringify(view(r))}\n\n`; for (const c of r.clients) c.write(m); }

const alive = r => [...r.teams.values()].filter(t => t.lives > 0);
// next living player after `fromId` in join order (null = start from the first seat)
function nextAlive(r, fromId) {
  const ts = [...r.teams.values()], n = ts.length, start = fromId ? ts.findIndex(t => t.id === fromId) : -1;
  for (let i = 1; i <= n; i++) { const t = ts[(start + i + n) % n]; if (t.lives > 0) return t; }
  return null;
}
function startTurn(r) {
  r.turnN++; r.endsAt = Date.now() + TURN_SECONDS * 1000;
  clearTimeout(r.timer); r.timer = setTimeout(() => timeout(r), TURN_SECONDS * 1000 + 300); // small grace for network lag
  push(r);
}
function startQuestion(r) {
  r.phase = "question"; r.used = []; r.results = []; r.last = null; r.endReason = null; r.strikes = 0;
  const cur = r.teams.get(r.turn);
  if (!cur || cur.lives <= 0) r.turn = nextAlive(r, null).id; // otherwise the rotation just carries on
  startTurn(r);
}
function reveal(r, reason = "skip") { // question over (every answer found, or host skipped): nobody loses a life
  if (r.phase !== "question") return;
  clearTimeout(r.timer);
  const q = r.data.questions[r.q];
  r.results = q.answers.map((a, i) => {
    const u = r.used.find(u => u.idx === i), tier = r.data.tiers[a.tier];
    return { text: a.text, tier: a.tier, label: tier.label, points: tier.points, by: u ? u.by : null };
  });
  r.endReason = reason; r.phase = "reveal";
  r.endsAt = Date.now() + BREAK_SECONDS * 1000; // "get ready" countdown, then the next question starts by itself
  r.timer = setTimeout(() => nextQuestion(r), BREAK_SECONDS * 1000);
  push(r);
}
function nextQuestion(r) {
  if (r.phase !== "reveal") return;
  clearTimeout(r.timer);
  if (r.q + 1 < r.data.questions.length) { r.q++; startQuestion(r); } else finish(r);
}
function finish(r) { clearTimeout(r.timer); r.phase = "final"; r.endsAt = 0; r.finalAt = Date.now(); push(r); }
// last player standing wins (with a single player, the game runs until they are out)
function checkOver(r) {
  const n = alive(r).length;
  if (n === 0 || (r.startN > 1 && n === 1)) { finish(r); return true; }
  return false;
}
function advance(r) { r.turn = nextAlive(r, r.turn).id; startTurn(r); }
function timeout(r) {
  if (r.phase !== "question") return;
  const t = r.teams.get(r.turn);
  t.lives--;
  if (t.lives <= 0) t.out = ++r.outN;
  r.last = { teamId: t.id, name: t.name, kind: "timeout", text: "", label: t.lives > 0 ? "Out of time" : "Eliminated", points: 0, tier: null };
  r.strikes++;
  if (checkOver(r)) return;
  // MAX_STRIKES hearts lost in one question: it ends, next player opens the next one
  if (r.strikes >= MAX_STRIKES) { r.turn = nextAlive(r, r.turn).id; return reveal(r, "strikes"); }
  // a life was lost with more than half the answers already used: the question ends, next player opens the next one
  if (r.used.length * 2 > r.data.questions[r.q].answers.length) { r.turn = nextAlive(r, r.turn).id; return reveal(r, "half"); }
  advance(r);
}

// ---- http ----
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(ok => {
  let b = ""; req.on("data", c => { b += c; if (b.length > 1e5) req.destroy(); });
  req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } });
});
const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => (i.family === "IPv4" || i.family === 4) && !i.internal).map(i => `http://${i.address}${PORT === 80 ? "" : ":" + PORT}`);
const types = { ".png": "image/png", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "GET" && u.pathname === "/api/events") {
    const r = rooms.get((u.searchParams.get("code") || "").toUpperCase());
    if (!r) return send(res, 404, { error: "Room not found" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(view(r))}\n\n`);
    r.clients.add(res); req.on("close", () => r.clients.delete(res));
    return;
  }
  if (req.method === "POST" && u.pathname.startsWith("/api/")) {
    const b = await readBody(req);
    if (u.pathname === "/api/create") {
      let data; try { data = load(); } catch (e) { return send(res, 500, { error: "questions.json is invalid: " + e.message }); }
      const r = { code: newCode(), hostKey: crypto.randomBytes(8).toString("hex"), data, phase: "lobby", q: -1,
        teams: new Map(), used: [], results: [], turn: null, turnN: 0, strikes: 0, finalAt: 0, last: null, endReason: null, outN: 0, startN: 0, endsAt: 0, clients: new Set(), timer: null };
      rooms.set(r.code, r);
      return send(res, 200, { code: r.code, hostKey: r.hostKey, urls: lanUrls() });
    }
    const r = rooms.get(String(b.code || "").toUpperCase());
    if (!r) return send(res, 404, { error: "No room with that code." });
    if (u.pathname === "/api/join") {
      const name = String(b.name || "").trim().slice(0, 20);
      if (!name) return send(res, 400, { error: "Enter a team name." });
      let t = [...r.teams.values()].find(t => norm(t.name) === norm(name)); // same name = rejoin
      if (!t) {
        if (r.phase !== "lobby") return send(res, 400, { error: "That game already started." });
        if (r.teams.size >= MAX_TEAMS) return send(res, 400, { error: `This room is full (${MAX_TEAMS} teams).` });
        t = { id: crypto.randomBytes(4).toString("hex"), name, score: 0, lives: START_LIVES, out: 0 };
        r.teams.set(t.id, t); push(r);
      }
      return send(res, 200, { code: r.code, teamId: t.id, name: t.name });
    }
    if (u.pathname === "/api/answer") {
      const t = r.teams.get(b.teamId), text = String(b.text || "").trim().slice(0, 80);
      if (!t || r.phase !== "question" || !text) return send(res, 400, { error: "Answers are closed." });
      if (r.turn !== t.id) return send(res, 400, { error: "It's not your turn." });
      const q = r.data.questions[r.q], hit = findAnswer(q, text);
      if (!hit) return send(res, 400, { error: "Not on the list. Try another!" });
      const idx = q.answers.indexOf(hit);
      if (r.used.some(u => u.idx === idx)) return send(res, 400, { error: "Already used. Try another!" });
      const tier = r.data.tiers[hit.tier];
      t.score += tier.points;
      r.used.push({ idx, by: t.id, pub: { text: hit.text, by: t.name, tier: hit.tier, label: tier.label, points: tier.points } });
      r.last = { teamId: t.id, name: t.name, kind: "hit", text: hit.text, tier: hit.tier, label: tier.label, points: tier.points };
      send(res, 200, { ok: true });
      if (r.used.length >= q.answers.length) { r.turn = nextAlive(r, r.turn).id; return reveal(r, "all"); } // all answers gone: next question starts with the next player, lives kept
      return advance(r);
    }
    if (u.pathname === "/api/host") {
      if (b.hostKey !== r.hostKey) return send(res, 403, { error: "Not the host." });
      if (b.action === "start" && r.phase === "lobby" && r.teams.size) { r.q = 0; r.startN = r.teams.size; startQuestion(r); }
      else if (b.action === "reveal") reveal(r);
      else if (b.action === "next") nextQuestion(r); // host can skip the countdown
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Unknown endpoint" });
  }
  const p = u.pathname === "/" ? "/play.html" : u.pathname === "/host" ? "/host.html" : u.pathname;
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(d);
  });
});
server.on("listening", () => {
  console.log(`Host screen:  http://localhost${PORT === 80 ? "" : ":" + PORT}/host`);
  lanUrls().forEach(u => console.log(`Teams join:   ${u}`));
});
server.on("error", e => {
  if (PORT === 80 && (e.code === "EADDRINUSE" || e.code === "EACCES")) { PORT = 3000; server.listen(PORT); } else throw e;
});
server.listen(PORT);
