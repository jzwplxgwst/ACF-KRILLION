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
