let me = {
  authenticated: false, username: null, is_admin: false, infinite_coins: false,
  human_verified: false, guest_remaining_sec: null, level: 1, xp: 0, needed_xp: 100,
  coins: 0, rating: 800, avatar_url: "", avatar_color: "#3b82f6", avatar_frame: "none",
  rank_title: "Beginner", rank_color: "#9ca3af", is_creator: false,
  pending_proposals_count: 0, custom_frames: []
};
let customFramesMap = {};
let allProblems = [], currentProblem = null, solveCM = null, pgCM = null;
let submissionsCache = [], adminUsersCache = [], forwardPid = null, guestTimer = null;
let activeRoomCode = "", activeRoomData = null, roomPollTimer = null, lastRoomMsgId = 0, roomReplyId = null;
let activeDmPartner = "", dmPollTimer = null, lastDmMsgId = 0, dmReplyId = null;
let bullsGameId = "", calcGameId = "", calcTimerInt = null, lastCalcQid = "";
let dailyTimerInterval = null, dailyProblemKey = null;
let shopCache = null, shopFilterCategory = "all";
let voiceRecorder = null, voiceChunks = [], voiceStream = null, voiceTimerInt = null, voiceStartTs = 0, voiceActiveMode = "";
let pendingExpanded = false, creativeCache = [], pingStarted = false;

const TEMPLATES = {
  python: "# Kodunuzu bura yazın\n",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n",
  c: "#include <stdio.h>\n\nint main() {\n    return 0;\n}\n",
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}\n",
  javascript: "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\nconsole.log(data.join(' '));\n"
};

const FRAME_TIERS = {
  "none": "classic", "angry-anime": "classic", "neon-spark": "classic", "golden-aura": "classic",
  "afternoon-bloom": "nature", "butterfly-dream": "nature", "cyclone-wind": "nature",
  "purple-runes": "fantasy", "venom-symbiote": "fantasy", "oni-glitch": "fantasy",
  "thunder-god": "fantasy", "flaming-bull": "fantasy",
  "phoenix-wings": "legendary", "fallen-angel": "legendary", "angel-wings": "legendary"
};
function frameTier(id) {
  if (customFramesMap[id]) return customFramesMap[id].tier || "fantasy";
  return FRAME_TIERS[String(id || "none").trim()] || "classic";
}

const SVG_FRAMES = {
  "angry-anime": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <circle cx="120" cy="120" r="88" fill="none" stroke="#ef4444" stroke-width="5" stroke-dasharray="28 14" opacity=".8"/>
    <g class="fx-pulse-angry">
      <path d="M168 48 Q174 62 188 64 M186 42 Q178 56 196 58 M160 58 Q172 68 176 80 M154 66 Q166 72 168 84" fill="none" stroke="#ef4444" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="64" cy="176" rx="22" ry="18" fill="#fff" stroke="#111" stroke-width="4"/>
      <text x="64" y="183" text-anchor="middle" font-size="22" font-weight="900" fill="#ef4444">!</text>
    </g></svg>`,
  "neon-spark": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-spin-fast">
      <circle cx="120" cy="120" r="88" fill="none" stroke="#38bdf8" stroke-width="5" stroke-dasharray="45 20 12 20" stroke-linecap="round"/>
      <circle cx="120" cy="32" r="6" fill="#e0f2fe"/><circle cx="120" cy="208" r="5" fill="#22d3ee"/>
    </g>
    <g class="fx-spin-rev">
      <circle cx="120" cy="120" r="95" fill="none" stroke="#818cf8" stroke-width="2.5" stroke-dasharray="18 32" opacity=".85"/>
    </g></svg>`,
  "afternoon-bloom": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <path d="M48 168 Q120 222 192 168" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round"/>
    <g class="fx-sway">
      <circle cx="52" cy="148" r="10" fill="#f472b6"/><circle cx="52" cy="148" r="4" fill="#fde047"/>
      <circle cx="72" cy="178" r="9" fill="#fb7185"/><circle cx="72" cy="178" r="3.5" fill="#fef08a"/>
      <circle cx="186" cy="148" r="10" fill="#fbbf24"/><circle cx="186" cy="148" r="4" fill="#ea580c"/>
      <circle cx="164" cy="182" r="8" fill="#c084fc"/><circle cx="164" cy="182" r="3" fill="#fef08a"/>
      <path d="M96 196 Q104 180 112 198 Q122 178 130 198 Q140 182 146 196" fill="none" stroke="#4ade80" stroke-width="4" stroke-linecap="round"/>
    </g></svg>`,
  "butterfly-dream": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-glitch-scan">
      <circle cx="120" cy="120" r="88" fill="none" stroke="#f43f5e" stroke-width="5" stroke-dasharray="60 12 16 12"/>
      <circle cx="120" cy="120" r="94" fill="none" stroke="#0f172a" stroke-width="3" stroke-dasharray="30 24"/>
    </g>
    <g class="fx-butterfly">
      <path d="M65 62 C44 40 32 58 52 72 C38 80 48 94 65 76 Z" fill="#e11d48" stroke="#fda4af" stroke-width="1.5"/>
      <path d="M65 62 C86 40 98 58 78 72 C92 80 82 94 65 76 Z" fill="#be123c" stroke="#fda4af" stroke-width="1.5"/>
      <line x1="65" y1="54" x2="65" y2="82" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
    </g></svg>`,
  "golden-aura": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <defs><linearGradient id="azGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>
    <g class="fx-spin-slow">
      <circle cx="120" cy="120" r="88" fill="none" stroke="url(#azGold)" stroke-width="8" stroke-dasharray="140 22"/>
      <circle cx="120" cy="120" r="96" fill="none" stroke="#fde047" stroke-width="2.5" stroke-dasharray="14 28" opacity=".85"/>
    </g></svg>`,
  "purple-runes": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-spin-slow">
      <circle cx="120" cy="120" r="90" fill="none" stroke="#a855f7" stroke-width="8" opacity=".85"/>
      <circle cx="120" cy="120" r="90" fill="none" stroke="#e879f9" stroke-width="2" stroke-dasharray="6 14"/>
      <text fill="#f0abfc" font-size="13" font-weight="800" letter-spacing="10">
        <textPath href="#azRuneP">✦ ᛟ ᚦ ᚱ ✦ ᛉ ᛊ ᛏ ✦ ᛗ ᛚ ᛜ</textPath>
      </text>
      <path id="azRuneP" d="M120,30 A90,90 0 1,1 119,30" fill="none"/>
    </g></svg>`,
  "cyclone-wind": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-spin-fast">
      <path d="M40 110 Q120 55 200 95" fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      <path d="M55 155 Q130 195 205 135" fill="none" stroke="#a5f3fc" stroke-width="4" stroke-linecap="round" opacity=".85"/>
      <path d="M75 55 Q175 75 185 170" fill="none" stroke="#06b6d4" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>
    </g></svg>`,
  "venom-symbiote": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-venom-writhe">
      <circle cx="120" cy="120" r="84" fill="none" stroke="#090d16" stroke-width="11"/>
      <path d="M120 36 Q108 14 128 8 M175 58 Q198 36 212 46 M202 120 Q226 112 232 132 M176 184 Q202 204 196 220 M118 204 Q106 228 124 234 M62 184 Q36 206 28 192 M36 118 Q12 108 8 128 M64 56 Q38 36 48 22" fill="none" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
      <path d="M120 36 Q108 14 128 8 M202 120 Q226 112 232 132 M118 204 Q106 228 124 234 M36 118 Q12 108 8 128" fill="none" stroke="#94a3b8" stroke-width="1.5" opacity=".7" stroke-linecap="round"/>
    </g></svg>`,
  "oni-glitch": `<svg class="fx-svg fx-svg-md" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-glitch-scan">
      <rect x="34" y="42" width="52" height="6" rx="3" fill="#06b6d4" opacity=".85"/>
      <rect x="156" y="54" width="48" height="5" rx="2" fill="#ec4899" opacity=".85"/>
      <rect x="28" y="168" width="60" height="6" rx="3" fill="#a855f7" opacity=".85"/>
      <rect x="148" y="182" width="56" height="5" rx="2" fill="#22d3ee" opacity=".85"/>
      <circle cx="120" cy="120" r="88" fill="none" stroke="#22d3ee" stroke-width="3.5" stroke-dasharray="24 10 8 12"/>
      <circle cx="120" cy="120" r="92" fill="none" stroke="#ec4899" stroke-width="2" stroke-dasharray="14 26"/>
    </g></svg>`,
  "thunder-god": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-thunder">
      <polyline points="62,188 46,162 66,154 44,118 68,112" fill="none" stroke="#fde047" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="178,52 194,78 174,86 196,122 172,128" fill="none" stroke="#facc15" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="92,38 112,26 116,44 138,30" fill="none" stroke="#fef08a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    </g></svg>`,
  "flaming-bull": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs><linearGradient id="azFire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#dc2626"/><stop offset=".6" stop-color="#f97316"/><stop offset="1" stop-color="#fde047"/></linearGradient></defs>
    <g class="fx-flame-rise">
      <circle cx="120" cy="126" r="84" fill="none" stroke="url(#azFire)" stroke-width="7"/>
      <path d="M58 84 C32 54 34 26 68 22 C54 40 58 60 76 74 Z" fill="url(#azFire)"/>
      <path d="M182 84 C208 54 206 26 172 22 C186 40 182 60 164 74 Z" fill="url(#azFire)"/>
      <path d="M88 198 Q120 226 152 198" fill="none" stroke="#fb923c" stroke-width="6" stroke-linecap="round"/>
    </g></svg>`,
  "phoenix-wings": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs><linearGradient id="azPhx" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fde047"/><stop offset=".45" stop-color="#f97316"/><stop offset="1" stop-color="#dc2626"/></linearGradient></defs>
    <g class="fx-flame-rise">
      <path d="M148 134 C186 116 216 82 228 42 C210 70 184 92 150 118 Z" fill="url(#azPhx)"/>
      <path d="M146 146 C188 138 214 114 232 84 C208 106 180 124 146 136 Z" fill="url(#azPhx)"/>
      <path d="M92 134 C54 116 24 82 12 42 C30 70 56 92 90 118 Z" fill="url(#azPhx)"/>
      <path d="M94 146 C52 138 26 114 8 84 C32 106 60 124 94 136 Z" fill="url(#azPhx)"/>
      <path d="M84 184 Q120 218 156 184" fill="none" stroke="#fbbf24" stroke-width="7" stroke-linecap="round"/>
    </g></svg>`,
  "fallen-angel": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azWingA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e8edf8"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>
      <linearGradient id="azWingB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>
      <g id="azWingR">
        <path fill="url(#azWingA)" d="M150,112 C175,68 206,50 235,46 C216,72 190,96 156,120 Z"/>
        <path fill="url(#azWingA)" d="M152,118 C186,90 216,82 238,86 C215,102 186,116 156,126 Z"/>
        <path fill="url(#azWingB)" d="M152,124 C182,110 210,110 230,122 C209,130 182,132 154,132 Z"/>
        <path fill="url(#azWingB)" d="M150,114 C168,94 189,86 203,88 C189,102 170,112 152,120 Z"/>
        <path fill="url(#azWingB)" opacity=".9" d="M152,128 C175,126 196,132 208,144 C191,146 170,140 152,134 Z"/>
      </g>
    </defs>
    <ellipse cx="120" cy="30" rx="34" ry="8" fill="none" stroke="#fde047" stroke-width="4" opacity=".9"/>
    <g class="wing wing-r"><use href="#azWingR"/></g>
    <g class="wing wing-l"><use href="#azWingR" transform="translate(240 0) scale(-1 1)"/></g>
    <g class="az-feathers">
      <path class="az-feather" style="--dx:-10px; --rot:-120deg; animation-delay:0s;" fill="#f3f6fb" opacity=".9" d="M68,66 C71,68 71,76 68,80 C65,76 65,68 68,66 Z"/>
      <path class="az-feather" style="--dx:14px; --rot:150deg; animation-delay:.7s;" fill="#eef2f9" opacity=".85" d="M101,46 C104,48 104,56 101,60 C98,56 98,48 101,46 Z"/>
      <path class="az-feather" style="--dx:-16px; --rot:-160deg; animation-delay:1.4s;" fill="#f8fafc" opacity=".9" d="M172,66 C175,68 175,76 172,80 C169,76 169,68 172,66 Z"/>
      <path class="az-feather" style="--dx:12px; --rot:135deg; animation-delay:2.1s;" fill="#eef2f9" opacity=".85" d="M139,46 C142,48 142,56 139,60 C136,56 136,48 139,46 Z"/>
      <path class="az-feather" style="--dx:-8px; --rot:-110deg; animation-delay:2.8s;" fill="#f3f6fb" opacity=".8" d="M54,92 C57,94 57,102 54,106 C51,102 51,94 54,92 Z"/>
      <path class="az-feather" style="--dx:9px; --rot:140deg; animation-delay:3.5s;" fill="#f8fafc" opacity=".8" d="M186,92 C189,94 189,102 186,106 C183,102 183,94 186,92 Z"/>
    </g>
  </svg>`
};
SVG_FRAMES["angel-wings"] = SVG_FRAMES["fallen-angel"];

function el(id) { return document.getElementById(id); }
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function q(s) { return "'" + String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"') + "'"; }
function fmtStmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function renderMath(node) {
  if (node && typeof renderMathInElement === "function") {
    renderMathInElement(node, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false });
  }
}
function cmMode(lang) { return lang === "python" ? "python" : lang === "javascript" ? "javascript" : lang === "cpp" ? "text/x-c++src" : lang === "c" ? "text/x-csrc" : "text/x-java"; }
function closeModal(id) { const n = el(id); if (n) n.classList.remove("open"); }
function copyText(txt, msg) {
  const m = msg || "Kopyalandı!";
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast(m)).catch(() => fallbackCopy(txt, m));
  else fallbackCopy(txt, m);
}
function fallbackCopy(txt, msg) {
  try { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); toast(msg); }
  catch (e) { toast("Kopyalama alınmadı", true); }
}
function toast(msg, err) {
  const t = el("toast"); if (!t) return;
  t.textContent = msg; t.style.borderColor = err ? "var(--danger)" : "var(--primary)"; t.style.display = "block";
  clearTimeout(window._tt); window._tt = setTimeout(() => { t.style.display = "none"; }, 3400);
}
function togglePw(id, btn) {
  const inp = el(id); if (!inp) return;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  if (btn) btn.textContent = show ? "🙈" : "👁️";
}

function getRankInfo(rating, isAdm) {
  if (isAdm) return { title: "Yaradıcı", color: "rainbow", creator: true };
  const r = Number(rating || 800);
  if (r < 1200) return { title: "Beginner", color: "#9ca3af", creator: false };
  if (r < 1400) return { title: "Pupil", color: "#22c55e", creator: false };
  if (r < 1600) return { title: "Specialist", color: "#06b6d4", creator: false };
  if (r < 1900) return { title: "Expert", color: "#3b82f6", creator: false };
  if (r < 2100) return { title: "Candidate Master", color: "#a855f7", creator: false };
  if (r < 2300) return { title: "Master", color: "#f59e0b", creator: false };
  if (r < 2400) return { title: "International Master", color: "#ea580c", creator: false };
  if (r < 2600) return { title: "Grandmaster", color: "#ef4444", creator: false };
  if (r < 3000) return { title: "International Grandmaster", color: "#dc2626", creator: false };
  return { title: "Legendary Grandmaster", color: "#ff2e4c", creator: false };
}
function applyRankEl(node, rating, isAdm) {
  if (!node) return;
  const rk = getRankInfo(rating, isAdm);
  if (rk.creator) { node.className = "rank-creator"; node.style.color = ""; node.textContent = rk.title; }
  else { node.className = "rank-title"; node.style.color = rk.color; node.textContent = rk.title; }
}
function renderRankHtml(rating, isAdm) {
  const rk = getRankInfo(rating, isAdm);
  return rk.creator ? `<span class="rank-creator">${esc(rk.title)}</span>` : `<span class="rank-title" style="color:${rk.color};">${esc(rk.title)}</span>`;
}
function renderName(name, isAdm) { return isAdm ? `<span class="admin-chromatic">${esc(name)}</span>` : `<strong>${esc(name)}</strong>`; }
function renderNameWithRank(name, isAdm, rating) {
  return `<span class="name-rank-wrap">${renderName(name, isAdm)}${renderRankHtml(rating, isAdm)}</span>`;
}
function coinTxt(v) { return (me.infinite_coins || me.is_admin) ? "∞" : String(v ?? 0); }
function fxMediaHtml(url, anim) {
  const isVid = /^data:video\/|\.(mp4|webm|mov)(\?|$)/i.test(url || "");
  return isVid
    ? `<video class="fx-vid ${esc(anim || 'fx-screen')}" src="${esc(url)}" autoplay loop muted playsinline></video>`
    : `<img class="fx-img ${esc(anim || 'fx-float')}" src="${esc(url)}" alt="">`;
}
function injectSvgFrame(w, frameId) {
  if (!w) return;
  w.querySelectorAll(".fx-svg, .fx-img, .fx-vid").forEach(n => n.remove());
  if (SVG_FRAMES[frameId]) w.insertAdjacentHTML("beforeend", SVG_FRAMES[frameId]);
  else if (customFramesMap[frameId]) w.insertAdjacentHTML("beforeend", fxMediaHtml(customFramesMap[frameId].image_url, customFramesMap[frameId].anim_class));
}
function setAvatar(wrapId, imgId, txtId, sizeCls, u) {
  const w = el(wrapId), im = el(imgId), tx = el(txtId); if (!w) return;
  w.className = ("av-wrap " + (sizeCls || "") + " frame-" + (u.avatar_frame || "none")).replace(/\s+/g, " ").trim();
  w.style.background = u.avatar_color || "#3b82f6";
  if (im && tx) {
    if (u.avatar_url) { im.src = u.avatar_url; im.style.display = "block"; tx.style.display = "none"; }
    else { im.style.display = "none"; tx.style.display = "inline"; tx.textContent = (u.username || "A")[0]; }
  }
  injectSvgFrame(w, u.avatar_frame);
}

/* ── İNSAN DOĞRULAMASI & QONAQ ── */
function checkHumanGate() { const g = el("humanGate"); if (g) g.style.display = me.human_verified ? "none" : "flex"; }
async function verifyHuman() {
  const ic = el("humanBoxIcon"), st = el("humanStatusText"); if (!ic || !st) return;
  ic.className = "human-square spinning"; st.textContent = "Yoxlanılır...";
  try {
    const cd = await (await fetch("/api/human-challenge")).json();
    await new Promise(r => setTimeout(r, 420));
    const vr = await fetch("/api/human-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_token: cd.challenge_token }) });
    if (!vr.ok) { ic.className = "human-square"; st.textContent = "Yenidən klikləyin"; return; }
    ic.className = "human-square checked"; ic.textContent = "✔"; st.textContent = "Təsdiqləndi!"; me.human_verified = true;
    setTimeout(() => { const g = el("humanGate"); if (g) g.style.display = "none"; }, 300);
  } catch (e) { ic.className = "human-square"; st.textContent = "Xəta oldu"; }
}
async function startGuestMode() {
  const d = await (await fetch("/api/guest/start", { method: "POST" })).json();
  if (d.guest_remaining_sec !== null && d.guest_remaining_sec !== undefined) runGuestTimer(d.guest_remaining_sec);
  switchTab("announcements"); toast("5 dəqiqəlik qonaq rejimi başladı!");
}
function runGuestTimer(sec) {
  clearInterval(guestTimer); const pill = el("hdrGuestPill"); if (!pill) return;
  if (me.authenticated || sec === null || sec === undefined) { pill.style.display = "none"; return; }
  let left = sec;
  const tick = () => {
    if (me.authenticated) { pill.style.display = "none"; clearInterval(guestTimer); return; }
    if (left <= 0) { pill.style.display = "none"; clearInterval(guestTimer); switchTab("welcome"); openAuthModal(); toast("5 dəqiqəlik qonaq vaxtı bitdi — hesab açın!", true); return; }
    pill.style.display = "inline-block";
    pill.textContent = `Qonaq ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    left--;
  };
  tick(); guestTimer = setInterval(tick, 1000);
}

/* ── DRAWERS & NAVİQASİYA ── */
function toggleLeftDrawer(force) {
  const d = el("leftDrawer"), b = el("leftBackdrop"), open = force !== undefined ? force : !d.classList.contains("open");
  d.classList.toggle("open", open); b.classList.toggle("open", open);
}
function toggleProfileDrawer(force) {
  const d = el("profileDrawer"), b = el("rightBackdrop"), open = force !== undefined ? force : !d.classList.contains("open");
  d.classList.toggle("open", open); b.classList.toggle("open", open);
}
function togglePdSub(id) { const n = el(id); if (n) n.style.display = n.style.display === "none" ? "block" : "none"; }
function switchTab(tab) {
  toggleLeftDrawer(false);
  const sec = el("tab-" + tab); if (!sec) return;
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".drawer-item").forEach(b => b.classList.remove("active"));
  sec.classList.add("active");
  const nav = document.querySelector(`.drawer-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add("active");
  if (tab === "welcome") loadWelcomeReviews();
  if (tab === "announcements") loadPosts();
  if (tab === "problems") loadProblems("archive");
  if (tab === "submit" && solveCM) setTimeout(() => solveCM.refresh(), 50);
  if (tab === "gym") loadGym();
  if (tab === "contests") loadContests();
  if (tab === "daily") loadDailyChallenge();
  if (tab === "chat") { loadMyRooms(); loadRoomProblemsPicker(); loadDmChats(); }
  if (tab === "shop") loadShop();
  if (tab === "propose") { loadMyProposals(); if (me.is_admin) loadAdminPendingBar(); }
  if (tab === "registrations") loadRegistrations("weekly");
  if (tab === "submissions") loadSubmissions();
  if (tab === "leaderboard") loadLeaderboard();
  if (tab === "creative") loadCreative();
  if (tab === "playground" && pgCM) setTimeout(() => pgCM.refresh(), 50);
  if (tab === "admin" && me.is_admin) loadAdminData();
}

/* ── AUTH ── */
async function syncMe() {
  me = await (await fetch("/api/auth/me")).json();
  customFramesMap = {};
  (me.custom_frames || []).forEach(cf => { customFramesMap[cf.id] = cf; });

  const pb = el("hdrProfileBtn"), ab = el("hdrAuthBtn");
  if (me.authenticated) {
    pb.style.display = "inline-flex"; ab.style.display = "none";
    el("hdrUserName").innerHTML = me.is_admin ? `<span class="admin-chromatic">${esc(me.username)}</span>` : esc(me.username);
    applyRankEl(el("hdrUserRank"), me.rating, me.is_admin);
    el("hdrUserLvl").textContent = `Lv.${me.level} · 🪙${coinTxt(me.coins)}`;
    setAvatar("hdrAvatarWrap", "hdrAvatarImg", "hdrAvatarTxt", "", me);
    el("hdrGuestPill").style.display = "none";
    if (!pingStarted) {
      pingStarted = true;
      setInterval(() => { if (me.authenticated && !document.hidden) fetch("/api/ping", { method: "POST" }).catch(() => {}); }, 45000);
    }
  } else {
    pb.style.display = "none"; ab.style.display = "inline-flex";
    if (me.guest_remaining_sec !== null && me.guest_remaining_sec !== undefined) runGuestTimer(me.guest_remaining_sec);
  }

  const showAdm = me.is_admin ? "inline-flex" : "none";
  ["newPostBtn", "deleteProblemBtn", "dailyPickBtn", "dailyAdminNewBtn", "shopAddCustomBtn", "openPendingModalBtn"].forEach(id => {
    const n = el(id); if (n) n.style.display = showAdm;
  });
  const rf = el("reviewFormBox"); if (rf) rf.style.display = me.authenticated ? "block" : "none";

  const pCnt = me.pending_proposals_count || 0;
  const hBtn = el("hdrPropsBtn"), nBtn = el("navAdminPropsBtn");
  if (hBtn) { hBtn.style.display = (me.is_admin && pCnt > 0) ? "inline-flex" : "none"; if (el("hdrPropCnt")) el("hdrPropCnt").textContent = pCnt; }
  if (nBtn) { nBtn.style.display = me.is_admin ? "flex" : "none"; if (el("navPropCnt")) el("navPropCnt").textContent = pCnt; }
}

async function loadWelcomeReviews() {
  const d = await (await fetch("/api/site-reviews")).json();
  el("wStatUsers").textContent = d.stats.users;
  el("wStatProbs").textContent = d.stats.problems;
  el("wStatSubs").textContent = d.stats.submissions;
  el("wStatRating").textContent = `${d.stats.avg_rating} ★`;
  el("siteReviewsList").innerHTML = d.reviews.map(r => `
    <div class="card" style="margin:0 0 8px;background:rgba(7,10,16,.65);">
      <div class="row" style="justify-content:space-between;font-size:.84rem;">
        ${renderNameWithRank(r.username, r.is_admin_user, r.user_rating)}
        <span style="color:#fbbf24;">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
      </div>
      <p class="muted" style="margin:6px 0 0;font-size:.85rem;">${esc(r.comment)}</p>
    </div>`).join("");
}
async function submitSiteReview() {
  const r = await fetch("/api/site-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: el("revStars").value, comment: el("revComment").value }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { el("revComment").value = ""; loadWelcomeReviews(); }
}
function openAuthModal() { el("authModal").classList.add("open"); }
function switchAuthTab(t) {
  el("loginPane").style.display = t === "login" ? "block" : "none";
  el("registerPane").style.display = t === "register" ? "block" : "none";
  el("tabLoginBtn").className = t === "login" ? "btn btn-sm btn-primary" : "btn btn-sm";
  el("tabRegBtn").className = t === "register" ? "btn btn-sm btn-primary" : "btn btn-sm";
}
function validatePasswordConfirm() {
  const p1 = el("rgPass"), p2 = el("rgPassConfirm"), warn = el("rgPassMatch");
  if (!p1 || !p2) return true;
  const a = p1.value, b = p2.value;
  if (!b) { if (warn) warn.style.display = "none"; p2.classList.remove("valid", "invalid"); return false; }
  const ok = (a === b && a.length >= 6);
  p2.classList.toggle("valid", ok); p2.classList.toggle("invalid", !ok);
  if (warn) { warn.style.display = ok ? "none" : "block"; warn.textContent = a.length < 6 ? "⚠ Parol ən azı 6 simvol olmalıdır!" : "⚠ Parollar uyğun gəlmir!"; }
  return ok;
}
async function doLogin() {
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: el("liIdent").value, password: el("liPass").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); el("liPass").value = "";
  await syncMe(); switchTab("announcements"); toast(d.message);
}
async function sendRegCode() {
  const pw = el("rgPass").value, pw2 = el("rgPassConfirm").value;
  if (pw.length < 6) return toast("Parol ən azı 6 simvol olmalıdır!", true);
  if (pw !== pw2) { validatePasswordConfirm(); return toast("Parollar uyğun gəlmir!", true); }
  const btn = el("sendCodeBtn"); btn.disabled = true;
  const r = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: el("rgUser").value, email: el("rgEmail").value, password: pw, password_confirm: pw2 }) });
  btn.disabled = false; const d = await r.json();
  if (!r.ok) return toast(d.error, true);
  el("regCodeWrap").style.display = "block"; toast(d.dev_code ? `Kod: ${d.dev_code}` : d.message);
}
async function doRegister() {
  const pw = el("rgPass").value, pw2 = el("rgPassConfirm").value;
  if (pw !== pw2) { validatePasswordConfirm(); return toast("Parollar uyğun gəlmir!", true); }
  const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: el("rgUser").value, email: el("rgEmail").value, password: pw, password_confirm: pw2, code: el("rgCode").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); await syncMe(); switchTab("announcements"); toast(d.message);
}
async function logoutAll() {
  await fetch("/api/auth/logout", { method: "POST" });
  toggleProfileDrawer(false); await syncMe(); switchTab("welcome"); toast("Çıxış edildi");
}

/* ── ADMİN META & PROFİL DRAWER & TAM PROFİL ── */
function applyAdminMeta(prefix, p) {
  const box = el(prefix + "AdminMeta"); if (!box) return;
  const meta = p.admin_meta;
  if (me.is_admin && meta) {
    box.style.display = "block";
    const onEl = el(prefix + "OnlineStatus"), regEl = el(prefix + "RegDate");
    if (onEl) {
      onEl.className = meta.is_online ? "online" : "offline";
      onEl.innerHTML = meta.is_online ? `<span class="online-dot on"></span> Onlayn` : `<span class="online-dot off"></span> Oflayn · ${esc(meta.last_seen || "")}`;
    }
    if (regEl) regEl.textContent = String(meta.joined_at || p.created_at || "—").slice(0, 16);
  } else box.style.display = "none";
}

async function openProfileDrawer() {
  if (!me.authenticated) return openAuthModal();
  toggleProfileDrawer(true);
  const r = await fetch("/api/profile"); if (!r.ok) return;
  const p = await r.json();
  setAvatar("pdAvatarWrap", "pdAvatarImg", "pdAvatarTxt", "av-lg", p);
  el("pdName").innerHTML = renderName(p.username, p.is_admin_user);
  applyRankEl(el("pdRank"), p.rating, p.is_admin_user);
  el("pdEmail").textContent = p.email || "";
  el("pdLvlBadge").textContent = `Lv.${p.level}`;
  el("pdCoins").textContent = p.infinite_coins ? "∞" : p.coins;
  el("pdRating").textContent = p.rating;
  el("pdStreak").textContent = p.streak;
  el("pdXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  el("pdXpFill").style.width = `${p.progress_pct}%`;
  el("profBioInput").value = p.bio || "";
  el("profColorInput").value = p.avatar_color || "#3b82f6";
  applyAdminMeta("pd", p);
  el("pdIncomingReqs").innerHTML = (p.incoming_requests || []).map(u => `
    <div class="row" style="justify-content:space-between;font-size:.8rem;margin-bottom:4px;">
      <span>${esc(u)}</span>
      <span><button class="btn btn-sm btn-success" onclick="respondFriend(${q(u)},'accept')">✔</button> <button class="btn btn-sm btn-danger" onclick="respondFriend(${q(u)},'reject')">✕</button></span>
    </div>`).join("");
  el("pdFriendsList").innerHTML = (p.friends || []).length
    ? p.friends.map(f => `
      <div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:.82rem;">
        <span style="cursor:pointer;" onclick="toggleProfileDrawer(false);openFullProfile(${q(f.username)})">${renderName(f.username, f.is_admin_user)} <span class="muted">Lv.${f.level}</span></span>
        <button class="btn btn-sm btn-primary" onclick="toggleProfileDrawer(false);switchTab('chat');switchChatMode('dm');openDmWith(${q(f.username)})">💬</button>
      </div>`).join("")
    : `<div class="muted" style="font-size:.8rem;">Dost yoxdur.</div>`;
}

async function sendCoinsToUser() {
  if (!me.authenticated) return openAuthModal();
  const u = el("coinTargetInput").value.trim().replace(/^@/, ""), amt = parseInt(el("coinAmtInput").value, 10);
  if (!u || !amt || amt <= 0) return toast("İstifadəçi adı və düzgün miqdar yazın!", true);
  const r = await fetch("/api/coins/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, amount: amt }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { el("coinTargetInput").value = ""; el("coinAmtInput").value = ""; await syncMe(); openProfileDrawer(); }
}
async function quickSendCoins(target) {
  const amt = prompt(`${target} istifadəçisinə neçə AzCoin göndərmək istəyirsiniz?`, "50"); if (!amt) return;
  const r = await fetch("/api/coins/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: target, amount: parseInt(amt, 10) || 0 }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) await syncMe();
}
async function uploadAvatar() {
  const f = el("avatarFileInput").files[0]; if (!f) return toast("Şəkil seçin", true);
  const btn = el("uploadAvBtn"); btn.disabled = true;
  const fd = new FormData(); fd.append("avatar", f);
  const r = await fetch("/api/profile/avatar", { method: "POST", body: fd }); btn.disabled = false;
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { await syncMe(); openProfileDrawer(); }
}
async function saveProfileBio() {
  const r = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: el("profBioInput").value, avatar_color: el("profColorInput").value }) });
  if (r.ok) { await syncMe(); openProfileDrawer(); toast("Yadda saxlanıldı!"); }
  else toast((await r.json()).error || "Xəta", true);
}
async function sendFriendRequestTo(target) {
  const r = await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: target }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); return r.ok;
}
async function sendFriendRequest() { const i = el("addFriendInput"); if (await sendFriendRequestTo(i.value.trim())) i.value = ""; }
async function respondFriend(username, action) {
  await fetch("/api/friends/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, action }) });
  openProfileDrawer();
}

async function openFullProfile(uname) {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch(`/api/users/${encodeURIComponent(uname)}`);
  if (!r.ok) return toast("Profil tapılmadı", true);
  const p = await r.json();
  switchTab("profile");
  setAvatar("fpAvatarWrap", "fpAvatarImg", "fpAvatarTxt", "av-xl", p);
  el("fpName").innerHTML = renderName(p.username, p.is_admin_user);
  applyRankEl(el("fpRank"), p.rating, p.is_admin_user);
  el("fpBio").textContent = p.bio || "Bio yazılmayıb.";
  el("fpLvlBadge").textContent = `Səviyyə ${p.level}`;
  el("fpRatingBadge").textContent = `Reytinq: ${p.rating}`;
  el("fpStreakBadge").textContent = `🔥 ${p.streak} gün`;
  el("fpSolvedBadge").textContent = `✔ ${p.solved_count} həll`;
  el("fpXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  el("fpXpFill").style.width = `${p.progress_pct}%`;
  applyAdminMeta("fp", p);
  el("fpActions").innerHTML = (p.username === me.username) ? "" : `
    <button class="btn btn-primary btn-sm" onclick="switchTab('chat');switchChatMode('dm');openDmWith(${q(p.username)})">💬 Mesaj Yaz</button>
    <button class="btn btn-success btn-sm" onclick="quickSendCoins(${q(p.username)})">🪙 Coin Göndər</button>
    <button class="btn btn-sm" onclick="sendFriendRequestTo(${q(p.username)})">+ Dost Ol</button>`;
  el("fpRecentSolved").innerHTML = (p.recent_solved || []).length
    ? p.recent_solved.map(s => `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openProblem(${q(s.code_label || s.id)})">✔ <strong>${esc(s.code_label)}. ${esc(s.title)}</strong> <span class="muted">(${s.rating})</span></div>`).join("")
    : `<span class="muted">Hələ yoxdur.</span>`;
  renderHeatmap(p.heatmap || {});
  drawRatingChart((p.rating_history && p.rating_history.length) ? p.rating_history : [{ rating: p.rating }]);
}
function renderHeatmap(heat) {
  const grid = el("profileHeatmap"); if (!grid) return; grid.innerHTML = "";
  const now = new Date();
  for (let i = 167; i >= 0; i--) {
    const key = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10), cnt = heat[key] || 0;
    const cell = document.createElement("div");
    cell.className = "hm-cell " + (cnt >= 5 ? "hm-4" : cnt >= 3 ? "hm-3" : cnt >= 2 ? "hm-2" : cnt >= 1 ? "hm-1" : "");
    cell.title = `${key}: ${cnt} göndəriş`; grid.appendChild(cell);
  }
}
function drawRatingChart(hist) {
  const c = el("ratingChartCanvas"); if (!c) return;
  const ctx = c.getContext("2d"), W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
  const bands = [[0, 1200, "rgba(148,163,184,.12)"], [1200, 1400, "rgba(34,197,94,.12)"], [1400, 1600, "rgba(6,182,212,.14)"], [1600, 1900, "rgba(59,130,246,.15)"], [1900, 3500, "rgba(168,85,247,.16)"]];
  const minR = 600, maxR = 2400, yOf = r => H - 18 - ((Math.min(maxR, Math.max(minR, r)) - minR) / (maxR - minR)) * (H - 36);
  bands.forEach(([a, b, col]) => { ctx.fillStyle = col; ctx.fillRect(0, yOf(b), W, yOf(a) - yOf(b)); });
  if (!hist.length) return;
  const xOf = idx => 22 + (hist.length === 1 ? (W - 44) / 2 : (idx * (W - 44)) / (hist.length - 1));
  ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5; ctx.beginPath();
  hist.forEach((pt, idx) => idx ? ctx.lineTo(xOf(idx), yOf(pt.rating)) : ctx.moveTo(xOf(idx), yOf(pt.rating)));
  ctx.stroke();
  hist.forEach((pt, idx) => { ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(xOf(idx), yOf(pt.rating), 4, 0, Math.PI * 2); ctx.fill(); });
}

/* ── QEYDİYYATLAR PƏNCƏRƏSİ (GÜNLÜK / HƏFTƏLİK) ── */
async function loadRegistrations(period) {
  const p = period || "weekly";
  document.querySelectorAll(".reg-filter-btn").forEach(b => b.classList.remove("active"));
  const actBtn = [...document.querySelectorAll(".reg-filter-btn")].find(b => (b.getAttribute("onclick") || "").includes(`'${p}'`));
  if (actBtn) actBtn.classList.add("active");

  const d = await (await fetch(`/api/users/registrations?period=${p}`)).json();
  el("regTodayCnt").textContent = d.today_count;
  el("regWeekCnt").textContent = d.week_count;
  el("regTotalCnt").textContent = d.total_count;

  const isAdm = !!d.viewer_is_admin;
  el("regOnlineChip").style.display = isAdm ? "block" : "none";
  if (isAdm) el("regOnlineCnt").textContent = d.online_count || 0;
  el("regStatusTh").style.display = isAdm ? "table-cell" : "none";

  el("registrationsBody").innerHTML = (d.users || []).length
    ? d.users.map(u => `
      <tr class="clickable" onclick="openFullProfile(${q(u.username)})">
        <td>${renderNameWithRank(u.username, u.is_admin_user, u.rating)}</td>
        <td><span class="badge">Lv.${u.level}</span> · ${u.rating}</td>
        <td class="muted" style="font-size:.82rem;">📅 ${esc(String(u.created_at || "").slice(0, 16))}</td>
        ${isAdm ? `<td>${u.is_online ? '<span style="color:#4ade80;font-weight:700;"><span class="online-dot on"></span>Onlayn</span>' : `<span class="muted"><span class="online-dot off"></span>Oflayn (${esc(u.last_seen || "—")})</span>`}</td>` : ""}
      </tr>`).join("")
    : `<tr><td colspan="${isAdm ? 4 : 3}" class="muted">Bu aralıqda qeydiyyat tapılmadı.</td></tr>`;
}

/* ── DUYURU & ANKET ── */
function togglePostForm() { const f = el("postFormBox"); if (f) f.style.display = f.style.display === "none" ? "block" : "none"; }
async function createPost() {
  if (!me.is_admin) return toast("Duyurunu yalnız Admin paylaşa bilər.", true);
  const title = el("postTitle").value.trim(), body = el("postBody").value.trim();
  const opts = el("postPollOpts").value.split(",").map(s => s.trim()).filter(Boolean);
  if (!title || (!body && opts.length < 2)) return toast("Başlıq və məzmun (və ya ən azı 2 anket variantı) yazın!", true);
  const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, poll_options: opts, is_pinned: el("postPin").checked }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { el("postTitle").value = ""; el("postBody").value = ""; el("postPollOpts").value = ""; togglePostForm(); loadPosts(); }
}
async function loadPosts() {
  const posts = await (await fetch("/api/posts")).json();
  el("postsList").innerHTML = posts.map(p => {
    const pollHtml = (p.poll_options || []).map((o, i) => {
      const pct = p.total_votes ? Math.round(o.votes * 100 / p.total_votes) : 0;
      return `<div class="poll-opt ${p.my_vote === i ? 'voted' : ''}" onclick="votePoll(${p.id},${i})"><div class="poll-bar" style="width:${pct}%"></div><div class="poll-txt"><span>${esc(o.text)}</span><span>${o.votes} (${pct}%)</span></div></div>`;
    }).join("");
    const reactHtml = (p.reactions || []).map(rx => `<button class="react-btn ${rx.mine ? 'mine' : ''}" onclick="reactPost(${p.id},'${rx.emoji}')">${rx.emoji} ${rx.count}</button>`).join("");
    const cmtHtml = (p.comments || []).map(c => `<div class="comment-item ${c.parent_id ? 'comment-reply' : ''}">${renderName(c.author, c.is_admin_user)}: ${esc(c.body)} <button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyComment(${p.id},${c.id},${q(c.author)})">Cavabla</button></div>`).join("");
    return `<div class="card post-card ${p.is_pinned ? 'pinned' : ''}">
      <div class="row" style="justify-content:space-between;"><strong>${p.is_pinned ? '📌 ' : ''}${esc(p.title)}</strong>
        <span class="muted" style="font-size:.8rem;">${renderName(p.author, p.is_admin_user)} · ${esc(p.created_at)} ${me.is_admin ? `<button class="btn btn-sm btn-danger" onclick="deletePost(${p.id})">Sil</button>` : ''}</span>
      </div>
      ${p.body ? `<p style="margin:8px 0;white-space:pre-wrap;">${esc(p.body)}</p>` : ""}
      ${pollHtml}
      <div class="row" style="margin-top:10px;">${reactHtml}</div>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">${cmtHtml}
        <div class="row" style="margin-top:8px;"><input id="cmtIn-${p.id}" placeholder="Şərh yaz..." style="flex:1;"><input id="cmtPar-${p.id}" type="hidden"><button class="btn btn-sm btn-primary" onclick="sendComment(${p.id})">Yaz</button></div>
      </div></div>`;
  }).join("");
}
async function votePoll(pid, idx) {
  if (!me.authenticated) return openAuthModal();
  await fetch(`/api/posts/${pid}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_index: idx }) });
  loadPosts();
}
async function reactPost(pid, emoji) {
  if (!me.authenticated) return openAuthModal();
  await fetch(`/api/posts/${pid}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) });
  loadPosts();
}
function replyComment(pid, cid, author) { const par = el(`cmtPar-${pid}`), i = el(`cmtIn-${pid}`); if (!par || !i) return; par.value = cid; i.placeholder = `@${author} cavab...`; i.focus(); }
async function sendComment(pid) {
  if (!me.authenticated) return openAuthModal();
  const i = el(`cmtIn-${pid}`), par = el(`cmtPar-${pid}`).value; if (!i.value.trim()) return;
  const r = await fetch(`/api/posts/${pid}/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: i.value, parent_id: par || null }) });
  if (r.ok) loadPosts(); else toast((await r.json()).error, true);
}
async function deletePost(pid) { await fetch(`/api/posts/${pid}`, { method: "DELETE" }); loadPosts(); }

/* ── MƏSƏLƏLƏR ── */
async function loadProblems(view) { allProblems = await (await fetch(`/api/problems?view=${view || "archive"}`)).json(); renderProblemsTable(); }
function renderProblemsTable() {
  const sb = el("problemSearch"), ht = el("hideTagsToggle"); if (!sb) return;
  const qy = (sb.value || "").toLowerCase(), hide = ht ? ht.checked : false;
  const rows = allProblems.filter(p => p.title.toLowerCase().includes(qy) || (p.tags || "").toLowerCase().includes(qy) || (p.code_label || "").toLowerCase().includes(qy));
  el("problemsTableBody").innerHTML = rows.length
    ? rows.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem(${q(p.code_label || p.id)})">
        <td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td>
        <td>${hide ? '<span class="muted">gizli</span>' : (p.tags || "").split(",").map(t => `<span class="tag-pill">${esc(t.trim())}</span>`).join("")}</td>
        <td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td>
        <td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${q(p.title)})">🔗</button></td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">Yoxdur.</td></tr>`;
}
async function loadGym() {
  const list = await (await fetch("/api/problems?view=gym")).json();
  el("gymTableBody").innerHTML = list.length
    ? list.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem(${q(p.code_label || p.id)})">
        <td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td><td>${esc(p.tags)}</td>
        <td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td>
        <td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${q(p.title)})">🔗</button></td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">Hələ bitmiş yarış məsələsi yoxdur.</td></tr>`;
}
async function openProblem(key) {
  const r = await fetch(`/api/problems/${encodeURIComponent(key)}`), p = await r.json();
  if (!r.ok) return toast(p.error, true);
  currentProblem = p; switchTab("problems");
  el("problemListView").style.display = "none"; el("problemReadView").style.display = "block";
  el("probTitle").textContent = `${p.code_label ? p.code_label + '. ' : ''}${p.title}`;
  el("probLimits").textContent = `time limit per test: ${p.time_limit}s | memory limit per test: ${p.memory_limit} MB`;
  el("probAuthorMeta").innerHTML = `Müəllif: ${renderName(p.author, p.author_is_admin)} | Reytinq: ${p.rating}`;
  const st = el("probStatement"), ins = el("probInputSpec"), out = el("probOutputSpec");
  st.innerHTML = fmtStmt(p.statement); renderMath(st);
  ins.innerHTML = fmtStmt(p.input_spec || "—"); renderMath(ins);
  out.innerHTML = fmtStmt(p.output_spec || "—"); renderMath(out);
  el("probNoteWrap").style.display = p.note ? "block" : "none";
  if (p.note) { el("probNote").innerHTML = fmtStmt(p.note); renderMath(el("probNote")); }
  el("probEditorialWrap").style.display = p.editorial ? "block" : "none";
  if (p.editorial) { el("probEditorial").innerHTML = fmtStmt(p.editorial); renderMath(el("probEditorial")); }
  el("probSamples").innerHTML = (p.samples || []).map((s, i) => `
    <div class="sample-box"><div class="sample-head"><span>Nümunə #${i + 1}</span>
      <button class="btn btn-sm" onclick="copyText(currentProblem.samples[${i}].input_data,'Giriş kopyalandı')">Kopyala</button></div>
      <div class="sample-grid"><pre>${esc(s.input_data)}</pre><pre>${esc(s.expected_output)}</pre></div></div>`).join("");
}
function backToProblemList() { el("problemReadView").style.display = "none"; el("problemListView").style.display = "block"; loadProblems("archive"); }
function copyWholeProblem() {
  if (!currentProblem) return; const p = currentProblem;
  const smps = (p.samples || []).map((s, i) => `Nümunə #${i + 1}\nInput:\n${s.input_data}\nOutput:\n${s.expected_output}`).join("\n\n");
  copyText(`${p.code_label}. ${p.title}\n\n${p.statement}\n\nInput:\n${p.input_spec}\n\nOutput:\n${p.output_spec}\n\n${smps}`, "Bütün sual mətni kopyalandı!");
}
function goSubmitForCurrent() { if (!currentProblem) return; el("subProbCode").value = currentProblem.code_label || currentProblem.id; lookupSubmitProblem(); switchTab("submit"); }
async function lookupSubmitProblem() {
  const code = el("subProbCode").value.trim(), hint = el("subProbHint"); if (!hint) return;
  if (!code) { hint.textContent = ""; return; }
  const r = await fetch(`/api/problems/${encodeURIComponent(code)}`);
  if (r.ok) { const p = await r.json(); hint.style.color = "var(--success)"; hint.textContent = `✔ ${p.code_label}. ${p.title} (${p.rating})`; }
  else { hint.style.color = "var(--danger)"; hint.textContent = "Belə kodlu məsələ tapılmadı"; }
}
function shareProblemLink(pid, title) {
  const url = `${location.origin}/?problem=${pid}`;
  if (navigator.share) navigator.share({ title: `AzForces: ${title}`, url }).catch(() => copyText(url, "Link kopyalandı!"));
  else copyText(url, "Məsələ linki kopyalandı!");
}
async function openForwardModal(pid) {
  if (!me.authenticated) return openAuthModal();
  forwardPid = pid; el("forwardModal").classList.add("open");
  const list = await (await fetch("/api/rooms/mine")).json();
  el("fwdGroupsBox").innerHTML = list.length
    ? `<label class="muted" style="font-size:.82rem;">Qrupa at:</label>` + list.map(g => `<button class="btn btn-sm" style="margin:4px 4px 0 0;" onclick="forwardProblemToRoom('${g.room_code}')">👥 ${esc(g.title)}</button>`).join("")
    : `<span class="muted">Qrupunuz yoxdur.</span>`;
}
async function forwardProblemToRoom(code) {
  await fetch(`/api/rooms/${code}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ yönləndirdi:", shared_problem_id: forwardPid }) });
  closeModal("forwardModal"); toast("Qrupa atıldı!");
}
async function forwardProblemToDm() {
  const u = el("fwdDmUser").value.trim(); if (!u) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(u)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ göndərdi:", shared_problem_id: forwardPid }) });
  closeModal("forwardModal"); toast(r.ok ? "Dosta göndərildi!" : "İstifadəçi tapılmadı", !r.ok);
  }
