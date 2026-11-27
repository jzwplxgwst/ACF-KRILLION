// Shared pufferfish mascot. Inflates as the timer runs down (hot-potato style), pops at zero.
const PUFFER_COLORS = ["#ffb020", "#ff7a59", "#44e3cf", "#59b0ee", "#ab87f0", "#ff6fa8"];
function puffer(color = "#ffb020", cls = "") {
  let spikes = "";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x1 = 100 + Math.cos(a) * 66, y1 = 100 + Math.sin(a) * 66, x2 = 100 + Math.cos(a) * 80, y2 = 100 + Math.sin(a) * 80;
    spikes += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<svg class="puffer ${cls}" viewBox="0 0 200 200" aria-hidden="true">
    <g class="spikes" stroke="${color}" stroke-width="6" stroke-linecap="round">${spikes}</g>
    <path d="M30 100 L6 78 L10 122 Z" fill="${color}"/>
    <circle cx="100" cy="100" r="66" fill="${color}"/>
    <ellipse cx="108" cy="124" rx="44" ry="30" fill="#fff6d8" opacity=".85"/>
    <path d="M138 96 q14 -6 24 6 q-12 12 -24 -6z" fill="#03121c" opacity=".18"/>
    <circle cx="132" cy="84" r="13" fill="#fff"/><circle cx="135" cy="85" r="6.5" fill="#03121c"/><circle cx="137" cy="83" r="2" fill="#fff"/>
    <ellipse cx="158" cy="112" rx="6" ry="8" fill="#03121c"/>
  </svg>`;
}
const teamColor = (s, id) => PUFFER_COLORS[[...s.teams].findIndex(t => t.id === id) % PUFFER_COLORS.length] || PUFFER_COLORS[0];
// Drives the center puffer from the turn countdown: grows, shakes and reddens near zero. Resets every turn.
function tickPuffer(state, skew) {
  const el = document.getElementById("hot"), t = document.getElementById("t");
  if (!state || state.phase !== "question") return;
  const left = Math.max(0, state.endsAt - (Date.now() + skew));
  const p = 1 - left / state.turnMs;
  if (t) t.textContent = Math.ceil(left / 1000);
  if (el) {
    el.style.setProperty("--p", p.toFixed(3));
    el.classList.toggle("panic", left < 5000);
  }
}

// ---- shared turn-based helpers ----
const hearts = (n, max) => Array.from({ length: max }, (_, i) => i < n ? "♥" : "<i>♥</i>").join("");
const teamName = (s, id) => (s.teams.find(t => t.id === id) || {}).name || "";
// one line describing what just happened
function ticker(s) {
  const l = s.last; if (!l) return "";
  return l.kind === "hit"
    ? `<p class="tick"><b>${esc(l.name)}</b> said <b>${esc(l.text)}</b> <span class="badge t-${l.tier}">${esc(l.label)}</span> <b>+${l.points}</b></p>`
    : `<p class="tick bad"><b>${esc(l.name)}</b> ran out of time and lost a life${l.label === "Eliminated" ? " — eliminated!" : "."}</p>`;
}
// answers claimed so far on this question
function usedList(s) {
  const rows = s.used.map(u => `<div class="row"><span><b>${esc(u.text)}</b> <span class="mute">· ${esc(u.by)}</span></span>
    <span><span class="badge t-${u.tier}">${esc(u.label)}</span> <b>+${u.points}</b></span></div>`).join("");
  return `<div class="card"><p class="mute">${s.left} answer${s.left === 1 ? "" : "s"} left to find</p>${rows}</div>`;
}
const endNote = s => s.endReason === "all" ? "Every answer found! Lives are safe." : s.endReason === "half" ? "More than half the answers were found, so the question ends here." : "Question skipped.";
// full answer list once a question is over (unclaimed ones too)
function revealList(s) {
  return `<div class="card">${s.results.map(r => `<div class="row"><span><b>${esc(r.text)}</b> <span class="mute">· ${r.by ? esc(teamName(s, r.by)) : "nobody got it"}</span></span>
    <span><span class="badge t-${r.tier}">${esc(r.label)}</span> <b>${r.by ? "+" + r.points : r.points}</b></span></div>`).join("")}</div>`;
}
// last one standing first, then by score; eliminated players by how late they went out
function ranking(s) {
  const live = s.teams.filter(t => t.lives > 0).sort((x, y) => y.score - x.score || y.lives - x.lives);
  const dead = s.teams.filter(t => t.lives <= 0).sort((x, y) => y.out - x.out);
  return [...live, ...dead];
}

// ---- Arena: every team is a shrimp on a rock seat around the puffer (6 seats) ----
function shrimp(color) {
  return `<svg class="shrimp" viewBox="0 0 40 48" aria-hidden="true"><path d="M10 7Q3 0 1 9M30 7Q37 0 39 9" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M20 4c10 0 16 8 12 18-2 5-6 6-6 12H14c0-8-8-8-8-16C6 10 12 4 20 4z" fill="${color}"/>
    <path d="M12 40h16l-3 7H15z" fill="${color}" opacity=".8"/><circle cx="15" cy="16" r="3.4" fill="#fff"/><circle cx="16" cy="16.5" r="1.7" fill="#03121c"/></svg>`;
}
function arena(s, meId) {
  const N = 6, ph = s.phase; let seats = "";
  for (let i = 0; i < N; i++) {
    const a = (-90 + i * 360 / N) * Math.PI / 180, x = 50 + 39 * Math.cos(a), y = 47 + 35 * Math.sin(a), t = s.teams[i];
    let inner = '<div class="rock empty"></div><div class="nm">open</div>', cls = "";
    if (t) {
      const turn = ph === "question" && s.turn === t.id, dead = ph !== "lobby" && t.lives <= 0;
      cls = (turn ? " turn" : "") + (dead ? " dead" : "");
      const bub = turn ? `<span class="bub ok">${t.id === meId ? "▶ YOUR TURN" : "▶ turn"}</span>` : "";
      inner = `${bub}<div class="shr">${shrimp(teamColor(s, t.id))}</div><div class="rock"></div>
        <div class="nm ${t.id === meId ? "me" : ""}">${esc(t.name)}</div><div class="lv">${hearts(t.lives, s.maxLives)}</div><div class="sc">${t.score}</div>`;
    }
    seats += `<div class="seat${cls}" style="left:${x}%;top:${y}%">${inner}</div>`;
  }
  const mid = ph === "question" ? `<div class="hot" id="hot">${puffer("#ffb020")}</div>` : `<div class="hot idle">${puffer("#ffb020")}</div>`;
  return `<div class="arena">${seats}<div class="mid">${mid}</div></div>`;
}
