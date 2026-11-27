// Deep Dive: a join-code trivia game with rarity scoring. No dependencies: run `node server.js`.
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
let PORT = Number(process.env.PORT) || 80; // port 80 gives a short join link; falls back to 3000 if 80 is busy
const MAX_TEAMS = 6, LAPS = 2; // each team gets up to 2 turns per question
const TURN_SECONDS = Number(process.env.TURN_SECONDS) || 10;
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

// ---- rooms: hot-potato turns ----
function newCode() {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ"; let s;
  do { s = Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join(""); } while (rooms.has(s));
  return s;
}
const ids = r => [...r.teams.keys()];
function nextHolder(r, from) { // next living team after index `from` that still has turns left
  const list = ids(r);
  for (let k = 1; k <= list.length; k++) {
    const id = list[(from + k) % list.length];
    if (r.alive.has(id) && r.taken.get(id) < LAPS) return id;
  }
  return null;
}
function view(r) {
  const q = r.data.questions[r.q];
  return {
    now: Date.now(), code: r.code, phase: r.phase, q: r.q, total: r.data.questions.length, tiers: r.data.tiers,
    turnSeconds: TURN_SECONDS, laps: LAPS, prompt: q && (r.phase === "question" || r.phase === "reveal") ? q.prompt : null,
    endsAt: r.endsAt, holder: r.holder, next: r.phase === "question" ? nextHolder(r, ids(r).indexOf(r.holder)) : null,
    log: r.log, results: r.results,
    teams: [...r.teams.values()].map(t => ({ id: t.id, name: t.name, score: t.score, alive: r.alive.has(t.id), turns: r.taken.get(t.id) || 0 })),
  };
}
function push(r) { const m = `data: ${JSON.stringify(view(r))}\n\n`; for (const c of r.clients) c.write(m); }
function beginTurn(r, id) {
  r.holder = id; r.endsAt = Date.now() + TURN_SECONDS * 1000;
  clearTimeout(r.timer); r.timer = setTimeout(() => pop(r), TURN_SECONDS * 1000 + 200); push(r);
}
function passOn(r) { const id = nextHolder(r, ids(r).indexOf(r.holder)); id ? beginTurn(r, id) : endQuestion(r); }
function startQuestion(r) {
  const list = ids(r);
  r.phase = "question"; r.alive = new Set(list); r.taken = new Map(list.map(i => [i, 0])); r.said = new Set(); r.log = []; r.results = [];
  beginTurn(r, nextHolder(r, (r.q + list.length - 1) % list.length)); // the puffer starts with a different team each question
}
function pop(r) { // fuse ran out: this team is out for the rest of the question
  if (r.phase !== "question") return;
  const t = r.teams.get(r.holder); r.alive.delete(t.id);
  r.log.push({ teamId: t.id, name: t.name, popped: true, points: 0 }); passOn(r);
}
function endQuestion(r) {
  if (r.phase !== "question") return;
  clearTimeout(r.timer);
  r.results = [...r.teams.values()].map(t => ({ teamId: t.id, name: t.name, popped: !r.alive.has(t.id),
    points: r.log.filter(l => l.teamId === t.id).reduce((n, l) => n + l.points, 0) })).sort((x, y) => y.points - x.points);
  r.phase = "reveal"; r.endsAt = 0; r.holder = null; push(r);
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
        teams: new Map(), alive: new Set(), taken: new Map(), said: new Set(), log: [], holder: null, results: [], endsAt: 0, clients: new Set(), timer: null };
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
        t = { id: crypto.randomBytes(4).toString("hex"), name, score: 0 };
        r.teams.set(t.id, t); push(r);
      }
      return send(res, 200, { code: r.code, teamId: t.id, name: t.name });
    }
    if (u.pathname === "/api/answer") {
      const t = r.teams.get(b.teamId), text = String(b.text || "").trim().slice(0, 80);
      if (!t || r.phase !== "question" || r.holder !== t.id) return send(res, 400, { error: "It’s not your turn." });
      if (!norm(text)) return send(res, 400, { error: "Type an answer." });
      const a = findAnswer(r.data.questions[r.q], text), key = a ? norm(a.text) : norm(text);
      if (r.said.has(key)) return send(res, 400, { error: "Someone already said that. Try another!" });
      r.said.add(key);
      const tier = a ? a.tier : null, points = tier ? r.data.tiers[tier].points : 0, label = tier ? r.data.tiers[tier].label : "Not on the list";
      t.score += points; r.taken.set(t.id, r.taken.get(t.id) + 1);
      r.log.push({ teamId: t.id, name: t.name, text, tier, points, label });
      send(res, 200, { ok: true, label, points }); return passOn(r);
    }
    if (u.pathname === "/api/host") {
      if (b.hostKey !== r.hostKey) return send(res, 403, { error: "Not the host." });
      if (b.action === "start" && r.phase === "lobby" && r.teams.size) { r.q = 0; startQuestion(r); }
      else if (b.action === "reveal") endQuestion(r);
      else if (b.action === "next" && r.phase === "reveal") {
        if (r.q + 1 < r.data.questions.length) { r.q++; startQuestion(r); } else { r.phase = "final"; push(r); }
      }
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
