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
// Drives every .inflate element from the countdown: grows, shakes and reddens near zero.
let _maxMs = 25000, _lastQ = null;
function tickPuffer(state, skew) {
  const el = document.getElementById("hot"), t = document.getElementById("t");
  if (!state || state.phase !== "question") return;
  const left = Math.max(0, state.endsAt - (Date.now() + skew));
  if (_lastQ !== state.q) { _lastQ = state.q; _maxMs = Math.max(left, 1000); }
  const p = 1 - left / _maxMs;
  if (t) t.textContent = Math.ceil(left / 1000);
  if (el) {
    el.style.setProperty("--p", p.toFixed(3));
    el.classList.toggle("panic", left < 6000);
  }
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
    let inner = '<div class="rock empty"></div><div class="nm">open</div>';
    if (t) {
      const r = ph === "reveal" && s.results.find(r => r.teamId === t.id);
      const bub = r ? `<span class="bub badge ${r.tier ? "t-" + r.tier : ""}">${esc(r.label)} +${r.points}</span>`
        : ph === "question" && t.answered ? '<span class="bub ok">✓ locked in</span>' : "";
      inner = `${bub}<div class="shr">${shrimp(teamColor(s, t.id))}</div><div class="rock"></div>
        <div class="nm ${t.id === meId ? "me" : ""}">${esc(t.name)}</div><div class="sc">${t.score}</div>`;
    }
    seats += `<div class="seat" style="left:${x}%;top:${y}%">${inner}</div>`;
  }
  const mid = ph === "question" ? `<div class="hot" id="hot">${puffer("#ffb020")}</div>` : `<div class="hot idle">${puffer("#ffb020")}</div>`;
  return `<div class="arena">${seats}<div class="mid">${mid}</div></div>`;
}
