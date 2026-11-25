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

function injectSvgFrame(w, frameId) {
  if (!w) return;
  w.querySelectorAll(".fx-svg, .fx-img").forEach(n => n.remove());
  if (SVG_FRAMES[frameId]) w.insertAdjacentHTML("beforeend", SVG_FRAMES[frameId]);
  else if (customFramesMap[frameId]) {
    const cf = customFramesMap[frameId];
    w.insertAdjacentHTML("beforeend", `<img class="fx-img ${esc(cf.anim_class || 'fx-float')}" src="${esc(cf.image_url)}" alt="">`);
  }
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

/* ── CODEMIRROR & SUBMIT ── */
function initEditors() {
  if (typeof CodeMirror === "undefined") return;
  if (el("solveEditorTextarea")) solveCM = CodeMirror.fromTextArea(el("solveEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
  if (el("pgEditorTextarea")) pgCM = CodeMirror.fromTextArea(el("pgEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
  setSolveCode(TEMPLATES.python); setPgCode("print('Salam AzForces!')\n");
}
function getSolveCode() { return solveCM ? solveCM.getValue() : el("solveEditorTextarea").value; }
function setSolveCode(v) { if (solveCM) { solveCM.setValue(v); setTimeout(() => solveCM.refresh(), 40); } else el("solveEditorTextarea").value = v; }
function getPgCode() { return pgCM ? pgCM.getValue() : el("pgEditorTextarea").value; }
function setPgCode(v) { if (pgCM) { pgCM.setValue(v); setTimeout(() => pgCM.refresh(), 40); } else el("pgEditorTextarea").value = v; }
function onSolveLangChange() { if (solveCM) solveCM.setOption("mode", cmMode(el("solveLang").value)); }
function onPgLangChange() { if (pgCM) pgCM.setOption("mode", cmMode(el("pgLang").value)); }
async function runSolveCode() {
  const b = el("solveResultBox"); b.style.display = "block"; b.textContent = "Test edilir...";
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: el("solveLang").value, code: getSolveCode(), stdin: el("solveStdin").value }) });
  const d = await r.json();
  b.textContent = (!r.ok || d.ok === false) ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`;
}
function showQualityBar(pct, breakdown) {
  const wrap = el("solvePctWrap"), fill = el("solvePctFill"), txt = el("solvePctTxt"); if (!wrap || !fill || !txt) return;
  wrap.style.display = "block"; txt.textContent = `${pct}%`; fill.style.width = "0%";
  fill.style.background = pct >= 80 ? "linear-gradient(90deg,#22c55e,#4ade80)" : pct >= 50 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#ef4444,#f87171)";
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  const bk = el("solvePctBreak");
  if (bk) bk.innerHTML = breakdown ? `<span>Test: <b>${breakdown.tests_pct}%</b></span><span>Sürət: <b>${breakdown.speed_pct}%</b></span><span>Stil: <b>${breakdown.style_pct}%</b></span>` : "";
}
async function submitSolution() {
  if (!me.authenticated) return openAuthModal();
  const codeKey = el("subProbCode").value.trim(); if (!codeKey) return toast("Məsələ kodunu yazın (məs: 1A)", true);
  const b = el("solveResultBox"), btn = el("submitSolveBtn"), pctWrap = el("solvePctWrap");
  btn.disabled = true; b.style.display = "block"; b.textContent = "Yoxlanılır..."; if (pctWrap) pctWrap.style.display = "none";
  const r = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem_code: codeKey, language: el("solveLang").value, code: getSolveCode(), room_id: window._activeRoomId || null }) });
  btn.disabled = false; const d = await r.json();
  if (!r.ok) { b.textContent = d.error || "Xəta"; return; }
  const pct = (d.quality_pct !== undefined && d.quality_pct !== null) ? d.quality_pct : (d.total > 0 ? Math.round((d.passed / d.total) * 100) : 0);
  showQualityBar(pct, d.quality_breakdown);
  b.textContent = `Nəticə: ${d.verdict} (${d.passed}/${d.total}) | Keyfiyyət: ${pct}% | Vaxt: ${d.time}\n` + (d.daily_msg ? d.daily_msg + "\n" : "") + (d.xp_gained ? `+${d.xp_gained} XP, +${d.coins_gained} AzCoin!\n` : "") + (d.details || "");
  await syncMe(); toast(d.verdict === "Accepted" ? `Accepted! ${pct}%` : `${d.verdict} — ${pct}%`, d.verdict !== "Accepted");
}
async function deleteCurrentProblem() {
  if (!currentProblem || !confirm("Silinsin?")) return;
  if ((await fetch(`/api/problems/${currentProblem.id}`, { method: "DELETE" })).ok) { toast("Silindi"); backToProblemList(); }
}

/* ── YARIŞLAR & GÜNLÜK SUAL ── */
async function loadContests() {
  const list = await (await fetch("/api/contests")).json();
  el("contestsList").innerHTML = list.length
    ? list.map(c => `<div class="card" style="background:rgba(7,10,16,.6);">
        <div class="row" style="justify-content:space-between;"><strong>${esc(c.title)}</strong><span class="badge">${c.status === "active" ? "Aktiv" : "Bitib (Gym)"}</span></div>
        <div style="margin-top:8px;">${(c.problems || []).map(p => `<button class="btn btn-sm" style="margin:3px;" onclick="openProblem(${q(p.code_label || p.id)})">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div>
        ${me.is_admin && c.status === "active" ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;" onclick="finishContest(${c.id})">Bitir & Gym-ə Köçür</button>` : ""}
      </div>`).join("")
    : `<p class="muted">Yarış yoxdur.</p>`;
}
async function finishContest(cid) { await fetch(`/api/contests/${cid}/finish`, { method: "POST" }); toast("Gym-ə köçürüldü!"); loadContests(); }

async function loadDailyChallenge() {
  try {
    const r = await fetch("/api/daily"); if (!r.ok) return;
    const d = await r.json();
    el("dailyStreakNum").textContent = d.streak || 0;
    el("dailyXpMult").textContent = d.streak >= 7 ? "×3" : d.streak >= 3 ? "×2" : "×1";
    renderStreakMap(d.heatmap || {});
    const titleEl = el("dailyQTitle"), metaEl = el("dailyQMeta"), solveBtn = el("dailySolveBtn"), banner = el("dailySolvedBanner");
    if (d.problem) {
      dailyProblemKey = d.problem.code_label || d.problem.id;
      titleEl.textContent = `${d.problem.code_label}. ${d.problem.title}`;
      metaEl.textContent = `Reytinq: ${d.problem.rating} · Mükafat: +${d.reward_xp} XP, +${d.reward_coins} AzCoin · Hər 7 gündə +${d.chest_7day_coins} 🪙 sandıq!`;
      solveBtn.style.display = "inline-flex"; solveBtn.textContent = d.solved_today ? "✔ Yenidən Bax" : "📘 Sualı Aç & Həll Et";
      banner.style.display = d.solved_today ? "block" : "none";
    } else {
      dailyProblemKey = null; titleEl.textContent = "Hələ məsələ yoxdur"; metaEl.textContent = "Admin tezliklə günün sualını əlavə edəcək.";
      solveBtn.style.display = "none"; banner.style.display = "none";
    }
    renderDailyBoard(d.streak_board || [], d.top_solvers || []);
    startDailyTimer(d.seconds_left);
  } catch (e) {}
}
function openDailyProblem() { if (dailyProblemKey) openProblem(dailyProblemKey); }
function renderStreakMap(heatmap) {
  const map = el("dailyStreakMap"); if (!map) return; map.innerHTML = "";
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const key = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10), count = heatmap[key] || 0;
    const day = document.createElement("div");
    day.className = "streak-day" + (count >= 4 ? " s3" : count >= 2 ? " s2" : count >= 1 ? " s1" : "") + (i === 0 ? " today" : "");
    day.title = `${key}: ${count ? "həll edildi ✔" : "həll yoxdur"}`; map.appendChild(day);
  }
}
function renderDailyBoard(streakBoard, topSolvers) {
  const body = el("dailyStreakBoard"); if (!body) return;
  const solvedSet = new Set(topSolvers.map(t => t.username.toLowerCase()));
  body.innerHTML = streakBoard.length
    ? streakBoard.map((u, i) => `<tr class="clickable" onclick="openFullProfile(${q(u.username)})">
        <td><strong>#${i + 1}</strong></td><td>${renderNameWithRank(u.username, u.is_admin_user, u.rating)}</td>
        <td>🔥 ${u.daily_streak} gün</td>
        <td>${solvedSet.has(u.username.toLowerCase()) ? '<span style="color:var(--success);font-weight:700;">✔ Bəli</span>' : '<span class="muted">— Xeyr</span>'}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Hələ seriya yoxdur — birinci olun!</td></tr>`;
}
function startDailyTimer(secondsLeft) {
  clearInterval(dailyTimerInterval); const timerEl = el("dailyTimerTxt"); if (!timerEl) return;
  let left = (typeof secondsLeft === "number") ? secondsLeft : 86400;
  const tick = () => {
    if (left <= 0) { clearInterval(dailyTimerInterval); loadDailyChallenge(); return; }
    timerEl.textContent = `${String(Math.floor(left / 3600)).padStart(2, "0")}:${String(Math.floor((left % 3600) / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    left--;
  };
  tick(); dailyTimerInterval = setInterval(tick, 1000);
}
async function adminSetDaily() { const key = prompt("Günün məsələsi üçün kod yazın (məs: 1A):"); if (key) await postDaily({ problem_code: key.trim() }); }
async function adminSetDailyFromInput() { const i = el("adDailyCode"); if (i && i.value.trim()) await postDaily({ problem_code: i.value.trim() }); }
async function adminSubmitNewDaily() {
  const payload = {
    title: el("dqTitle").value, code_label: el("dqCodeLbl").value, rating: el("dqRating").value,
    tags: el("dqTags").value, statement: el("dqStatement").value, input_spec: el("dqIn").value,
    output_spec: el("dqOut").value, tests: collectTests("dqTestsContainer")
  };
  if (await postDaily(payload)) {
    el("dqTitle").value = ""; el("dqStatement").value = "";
    togglePdSub("dailyAdminCreateBox"); loadProblems("archive");
  }
}
async function postDaily(payload) {
  const r = await fetch("/api/admin/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { loadDailyChallenge(); return true; }
  return false;
}

/* ── CHAT (QRUP + DM + SƏS) ── */
function switchChatMode(mode) {
  el("chatGroupsPane").style.display = mode === "groups" ? "block" : "none";
  el("chatDmPane").style.display = mode === "dm" ? "block" : "none";
  el("subTabGroupsBtn").className = mode === "groups" ? "btn btn-primary btn-sm" : "btn btn-sm";
  el("subTabDmBtn").className = mode === "dm" ? "btn btn-primary btn-sm" : "btn btn-sm";
  if (mode === "dm") loadDmChats();
}
async function loadMyRooms() {
  if (!me.authenticated) { el("myRoomsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/rooms/mine")).json();
  el("myRoomsList").innerHTML = list.length
    ? list.map(r => `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="enterRoom('${r.room_code}')">
        <div class="row"><div class="av-wrap" style="background:${esc(r.avatar_color)};">${r.avatar_url ? `<img src="${esc(r.avatar_url)}">` : esc(r.title[0])}</div>
          <div><strong>${esc(r.title)}</strong><div class="muted" style="font-size:.76rem;">${esc(r.bio)}</div></div></div>
        <span class="badge">${r.member_count}/20</span></div>`).join("")
    : `<div class="muted">Qrupunuz yoxdur.</div>`;
}
async function loadRoomProblemsPicker() {
  const list = await (await fetch("/api/problems?view=archive")).json(), box = el("crRoomProblemsList"); if (!box) return;
  box.innerHTML = list.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;margin-bottom:4px;"><input type="checkbox" class="rm-pchk" value="${p.id}" style="width:auto;"> ${esc(p.code_label || p.id)}. ${esc(p.title)}</label>`).join("");
}
async function createRoom() {
  if (!me.authenticated) return openAuthModal();
  const pids = [...document.querySelectorAll(".rm-pchk:checked")].map(x => Number(x.value));
  const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: el("crRoomTitle").value, bio: el("crRoomBio").value, avatar_color: el("crRoomColor").value, duration_min: el("crRoomDur").value || 0, voice_link: el("crRoomVoice").value, problem_ids: pids }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  el("crRoomTitle").value = ""; el("crRoomBio").value = ""; enterRoom(d.room_code);
}
async function joinRoom() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/rooms/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_code: el("joinRoomCode").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  el("joinRoomCode").value = ""; enterRoom(d.room_code);
}
function enterRoom(code) {
  activeRoomCode = code; lastRoomMsgId = 0; roomReplyId = null; el("rmChatBox").innerHTML = "";
  el("roomLobbyView").style.display = "none"; el("roomActiveView").style.display = "block";
  pollRoom(); clearInterval(roomPollTimer);
  roomPollTimer = setInterval(() => { if (!document.hidden && activeRoomCode) pollRoom(); }, 3000);
}
function leaveRoomView() { activeRoomCode = ""; window._activeRoomId = null; clearInterval(roomPollTimer); el("roomActiveView").style.display = "none"; el("roomLobbyView").style.display = "grid"; loadMyRooms(); }
function copyRoomCode() { copyText(activeRoomCode, "16 rəqəmli kod kopyalandı!"); }
function replyRoomMsg(id, author, text) { roomReplyId = id; el("rmReplyText").textContent = `↩ ${author}: ${String(text).slice(0, 45)}`; el("rmReplyBanner").style.display = "flex"; el("rmChatInput").focus(); }
function cancelRoomReply() { roomReplyId = null; el("rmReplyBanner").style.display = "none"; }
function voiceBubbleHtml(m) {
  const dur = m.audio_duration ? `${Math.floor(m.audio_duration / 60)}:${String(m.audio_duration % 60).padStart(2, "0")}` : "🎤";
  return m.audio_url
    ? `<div class="voice-bubble"><audio controls preload="none" src="${esc(m.audio_url)}"></audio><span class="muted" style="font-size:.72rem;">${dur}</span></div>`
    : `<div class="voice-bubble"><button class="voice-play-btn" onclick="toast('Səs faylı saxlama servisinə qoşulmayıb',true)">▶</button><div class="voice-wave"><span></span><span></span><span></span><span></span><span></span></div><span class="muted" style="font-size:.75rem;">Səs mesajı ${dur}</span></div>`;
}
async function pollRoom() {
  if (!activeRoomCode) return;
  const r = await fetch(`/api/rooms/${activeRoomCode}/state?after_id=${lastRoomMsgId}`); if (!r.ok) return;
  const d = await r.json(); activeRoomData = d; window._activeRoomId = d.room.id;
  setAvatar("rmAvatarWrap", "rmAvatarImg", "rmAvatarTxt", "", { username: d.room.title, avatar_url: d.room.avatar_url, avatar_color: d.room.avatar_color, avatar_frame: "none" });
  el("rmTitle").textContent = d.room.title; el("rmBio").textContent = d.room.bio; el("rmMemCount").textContent = d.members.length;
  el("rmTimerWrap").textContent = d.room.remaining_sec >= 0 ? `· ⏱ ${Math.floor(d.room.remaining_sec / 60)} dəq` : "";
  const vb = el("rmVoiceBtn"); vb.style.display = d.room.voice_link ? "inline-flex" : "none"; if (d.room.voice_link) vb.href = d.room.voice_link;
  const pb = el("rmProblemsBar"); pb.style.display = d.problems.length ? "block" : "none";
  pb.innerHTML = d.problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="openProblem(${q(p.code_label || p.id)})">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("");
  const box = el("rmChatBox");
  d.messages.forEach(m => {
    lastRoomMsgId = Math.max(lastRoomMsgId, m.id);
    const div = document.createElement("div"); div.className = `chat-bubble ${m.username === me.username ? 'mine' : 'theirs'}`;
    const bodyHtml = m.audio_url ? voiceBubbleHtml(m) : `<div><span style="cursor:pointer;" onclick="openFullProfile(${q(m.username)})">${renderName(m.username, m.is_admin_user)}</span>: ${esc(m.message)}</div>`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") + bodyHtml +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem(${q(m.shared_code || m.shared_problem_id)})">📘 ${esc(m.shared_code ? m.shared_code + '. ' : '')}${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
      `<div class="chat-meta"><span>${esc((m.created_at || "").slice(11, 16))}</span><button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyRoomMsg(${m.id},${q(m.username)},${q(m.message)})">↩ Cavabla</button></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  });
}
async function sendRoomChat() {
  const inp = el("rmChatInput"); if (!inp.value.trim()) return;
  const r = await fetch(`/api/rooms/${activeRoomCode}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: inp.value, reply_to_id: roomReplyId }) });
  if (!r.ok) return toast((await r.json()).error, true);
  inp.value = ""; cancelRoomReply(); pollRoom();
}
function openGroupProfile() {
  if (!activeRoomData) return;
  const d = activeRoomData, rm = d.room, isCr = rm.creator === me.username;
  el("groupProfileBody").innerHTML = `
    <div class="prof-top" style="margin-bottom:12px;"><div class="av-wrap av-lg" style="background:${esc(rm.avatar_color)};">${rm.avatar_url ? `<img src="${esc(rm.avatar_url)}">` : esc(rm.title[0])}</div>
      <div><h3 style="margin:0;">${esc(rm.title)}</h3><div class="muted" style="font-size:.82rem;">Yaradıcı: ${esc(rm.creator)} · Kod: ${rm.room_code.replace(/(.{4})/g, "$1-").slice(0, -1)}</div></div></div>
    <p style="font-size:.88rem;margin:0 0 12px;">${esc(rm.bio)}</p>
    ${isCr ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Qrup Profilini Düzəlt</strong>
      <input id="gpTitle" value="${esc(rm.title)}" style="margin-top:6px;"><textarea id="gpBio" rows="2" style="margin-top:6px;">${esc(rm.bio)}</textarea>
      <div class="row" style="margin-top:6px;"><input id="gpAvUrl" value="${esc(rm.avatar_url || '')}" placeholder="Şəkil linki" style="flex:1;"><input id="gpColor" type="color" value="${esc(rm.avatar_color)}" style="width:46px;height:34px;padding:2px;"></div>
      <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="saveGroupProfile()">Yenilə</button></div>` : ""}
    ${(d.shared_problems || []).length ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Paylaşılan Suallar</strong><div style="margin-top:6px;">${d.shared_problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="closeModal('groupProfileModal');openProblem(${q(p.code_label || p.id)})">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div></div>` : ""}
    <div class="prof-box"><strong style="font-size:.84rem;">Üzvlər (${d.members.length}/20)</strong>
      ${d.members.map(m => `<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.84rem;">
        <span style="cursor:pointer;" onclick="closeModal('groupProfileModal');openFullProfile(${q(m.username)})">${renderName(m.username, m.is_admin_user)} <span class="muted">Lv.${m.level}</span> ${m.username === rm.creator ? '<span class="badge">Admin</span>' : ''}</span>
        ${isCr && m.username !== rm.creator ? `<button class="btn btn-danger btn-sm" onclick="kickMember(${q(m.username)})">Çıxar</button>` : ""}</div>`).join("")}</div>
    <button class="btn btn-danger" style="width:100%;justify-content:center;margin-top:12px;" onclick="exitGroupPermanent()">Qrupdan Ayrıl</button>`;
  el("groupProfileModal").classList.add("open");
}
async function saveGroupProfile() {
  const r = await fetch(`/api/rooms/${activeRoomCode}/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: el("gpTitle").value, bio: el("gpBio").value, avatar_url: el("gpAvUrl").value, avatar_color: el("gpColor").value }) });
  toast((await r.json()).message || "Xəta", !r.ok); closeModal("groupProfileModal"); pollRoom();
}
async function kickMember(u) { await fetch(`/api/rooms/${activeRoomCode}/kick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u }) }); closeModal("groupProfileModal"); pollRoom(); }
async function exitGroupPermanent() { await fetch(`/api/rooms/${activeRoomCode}/leave`, { method: "POST" }); closeModal("groupProfileModal"); leaveRoomView(); }

async function loadDmChats() {
  if (!me.authenticated) { el("dmChatsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/dm/chats")).json();
  el("dmChatsList").innerHTML = list.length
    ? list.map(c => `<div style="padding:8px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openDmWith(${q(c.username)})">
        <div class="row"><div class="av-wrap frame-${c.avatar_frame || 'none'}" style="background:${esc(c.avatar_color || '#3b82f6')};width:28px;height:28px;font-size:.75rem;">${c.avatar_url ? `<img src="${esc(c.avatar_url)}">` : esc(c.username[0])}</div>
          <div>${renderName(c.username, c.is_admin_user)}<div class="muted" style="font-size:.76rem;">${esc(c.last_message)}</div></div></div></div>`).join("")
    : `<div class="muted" style="font-size:.82rem;">Söhbət yoxdur.</div>`;
}
function openDmWith(user) {
  const u = String(user || "").trim(); if (!u) return;
  activeDmPartner = u; lastDmMsgId = 0; dmReplyId = null; el("dmChatBox").innerHTML = ""; el("dmPartnerTitle").textContent = `✈️ @${u}`;
  pollDm(); clearInterval(dmPollTimer); dmPollTimer = setInterval(() => { if (!document.hidden && activeDmPartner) pollDm(); }, 3000);
}
function closeDm() { activeDmPartner = ""; clearInterval(dmPollTimer); el("dmChatBox").innerHTML = ""; el("dmPartnerTitle").textContent = "✈️ —"; }
function replyDmMsg(id, author, text) { dmReplyId = id; el("dmReplyText").textContent = `↩ ${author}: ${String(text).slice(0, 45)}`; el("dmReplyBanner").style.display = "flex"; el("dmChatInput").focus(); }
function cancelDmReply() { dmReplyId = null; el("dmReplyBanner").style.display = "none"; }
async function pollDm() {
  if (!activeDmPartner) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}?after_id=${lastDmMsgId}`); if (!r.ok) return;
  const d = await r.json(), box = el("dmChatBox");
  el("dmPartnerTitle").innerHTML = `✈️ ${renderName(d.partner, d.partner_is_admin)}`;
  d.messages.forEach(m => {
    lastDmMsgId = Math.max(lastDmMsgId, m.id);
    const div = document.createElement("div"); div.className = `chat-bubble ${m.sender === me.username ? 'mine' : 'theirs'}`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") +
      (m.audio_url ? voiceBubbleHtml(m) : `<div>${esc(m.message)}</div>`) +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem(${q(m.shared_code || m.shared_problem_id)})">📘 ${esc(m.shared_code ? m.shared_code + '. ' : '')}${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
      `<div class="chat-meta"><span>${esc((m.created_at || "").slice(11, 16))}</span><button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyDmMsg(${m.id},${q(m.sender)},${q(m.message)})">↩ Cavabla</button></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  });
}
async function sendDm() {
  if (!activeDmPartner) return toast("Söhbət seçin", true);
  const inp = el("dmChatInput"); if (!inp.value.trim()) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: inp.value, reply_to_id: dmReplyId }) });
  if (!r.ok) return toast((await r.json()).error, true);
  inp.value = ""; cancelDmReply(); pollDm(); loadDmChats();
}

function voiceEls(m) { return { mic: el(m === "room" ? "rmVoiceBtn2" : "dmVoiceBtn"), panel: el(m === "room" ? "rmVoicePanel" : "dmVoicePanel"), timer: el(m === "room" ? "rmVoiceTimer" : "dmVoiceTimer") }; }
function stopVoiceStream() { clearInterval(voiceTimerInt); if (voiceStream) { voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; } }
async function toggleVoiceRecord(mode) {
  if (!me.authenticated) return openAuthModal();
  if (voiceRecorder && voiceRecorder.state === "recording") { sendVoiceRecord(voiceActiveMode); return; }
  if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") return toast("Brauzeriniz səs yazmağı dəstəkləmir.", true);
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true }); voiceChunks = []; voiceActiveMode = mode;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    voiceRecorder = mime ? new MediaRecorder(voiceStream, { mimeType: mime }) : new MediaRecorder(voiceStream);
    voiceRecorder.ondataavailable = e => { if (e.data.size > 0) voiceChunks.push(e.data); };
    voiceRecorder.start(); voiceStartTs = Date.now();
    const E = voiceEls(mode); if (E.mic) E.mic.classList.add("recording"); if (E.panel) E.panel.style.display = "flex";
    voiceTimerInt = setInterval(() => {
      const s = Math.floor((Date.now() - voiceStartTs) / 1000);
      if (E.timer) E.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (s >= 120) sendVoiceRecord(mode);
    }, 500);
  } catch (e) { toast("Mikrofona icazə verilmədi!", true); stopVoiceStream(); }
}
function cancelVoiceRecord(mode) {
  if (voiceRecorder && voiceRecorder.state === "recording") { voiceRecorder.onstop = null; voiceRecorder.stop(); }
  stopVoiceStream(); voiceChunks = []; voiceRecorder = null;
  const E = voiceEls(mode || voiceActiveMode); if (E.mic) E.mic.classList.remove("recording"); if (E.panel) E.panel.style.display = "none"; if (E.timer) E.timer.textContent = "0:00";
}
async function sendVoiceRecord(mode) {
  if (!voiceRecorder || voiceRecorder.state !== "recording") return;
  const dur = Math.max(1, Math.round((Date.now() - voiceStartTs) / 1000)), E = voiceEls(mode);
  const blob = await new Promise(res => { voiceRecorder.onstop = () => res(new Blob(voiceChunks, { type: voiceRecorder.mimeType || "audio/webm" })); voiceRecorder.stop(); });
  stopVoiceStream(); voiceRecorder = null; voiceChunks = [];
  if (E.mic) E.mic.classList.remove("recording"); if (E.panel) E.panel.style.display = "none"; if (E.timer) E.timer.textContent = "0:00";
  if (blob.size < 200) return toast("Səs çox qısa oldu.", true);
  toast("Səs yüklənir..."); let audioUrl = "";
  try {
    const fd = new FormData(); fd.append("audio", blob, "voice.webm");
    const up = await fetch("/api/media/upload-voice", { method: "POST", body: fd }), ud = await up.json();
    if (up.ok && ud.audio_url) audioUrl = ud.audio_url; else toast(ud.error || "Səs servisi qoşulmayıb.", true);
  } catch (e) { toast("Səs yüklənmədi.", true); }
  const payload = { message: "🎤 Səsli mesaj", audio_url: audioUrl, audio_duration: dur };
  if (mode === "room" && activeRoomCode) {
    payload.reply_to_id = roomReplyId;
    const r = await fetch(`/api/rooms/${activeRoomCode}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { cancelRoomReply(); pollRoom(); toast("Səs mesajı göndərildi 🎤"); } else toast((await r.json()).error, true);
  } else if (mode === "dm" && activeDmPartner) {
    payload.reply_to_id = dmReplyId;
    const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { cancelDmReply(); pollDm(); loadDmChats(); toast("Səs mesajı göndərildi 🎤"); } else toast((await r.json()).error, true);
  }
}

/* ── MAĞAZA ── */
async function loadShop() {
  if (!me.authenticated) { el("shopGrid").innerHTML = `<div class="card">Mağazadan istifadə üçün daxil olun.</div>`; return; }
  shopCache = await (await fetch("/api/shop")).json();
  el("shopCoins").textContent = (shopCache.infinite_coins || me.is_admin) ? "∞" : shopCache.coins;
  renderShopItems();
}
function renderShopItems() {
  if (!shopCache) return;
  const items = shopCache.items.map(it => ({ ...it, tier: it.tier || frameTier(it.id) }));
  const list = shopFilterCategory === "all" ? items : items.filter(i => i.tier === shopFilterCategory);
  const isAdmin = shopCache.infinite_coins || me.is_admin;
  el("shopGrid").innerHTML = list.length ? list.map(it => {
    const tierCls = it.tier !== "classic" ? ` ${it.tier}-card` : "", canBuy = isAdmin || shopCache.coins >= it.price;
    const fxHtml = SVG_FRAMES[it.id] || (it.image_url ? fxMediaHtml(it.image_url, it.anim_class) : "");
    const action = it.equipped ? `<span class="badge" style="color:var(--success);border-color:var(--success);">✔ Taxılıb</span>`
      : (it.owned || isAdmin) ? `<button class="btn btn-sm btn-primary" onclick="equipItem('${it.id}')">Tax</button>`
      : `<button class="btn btn-sm btn-success" onclick="buyItem('${it.id}')" ${!canBuy ? 'disabled style="opacity:.5;"' : ''}>🪙 ${it.price.toLocaleString()} — Al</button>`;
    const tierBadge = it.tier === "fantasy" ? `<span class="badge" style="border-color:#a855f7;color:#c084fc;">🐉 Fantaziya</span>`
      : it.tier === "nature" ? `<span class="badge" style="border-color:#22c55e;color:#4ade80;">🌿 Təbiət</span>`
      : it.tier === "legendary" ? `<span class="badge" style="border-color:#fbbf24;color:#fde047;">👑 Əfsanəvi</span>` : "";
    const delBtn = (isAdmin && it.fx_type === "img") ? `<button class="btn btn-danger btn-sm" onclick="adminDeleteCustomFrame('${it.id}')">Sil</button>` : "";
    return `<div class="card shop-card${tierCls}">
      <div class="av-wrap av-lg frame-${it.id}" style="background:var(--primary);">A${fxHtml}</div>
      <strong>${esc(it.name)}</strong>${tierBadge}
      <span class="muted" style="font-size:.8rem;">${esc(it.desc)}</span>
      <div class="row">${action}${delBtn}</div></div>`;
  }).join("") : `<div class="card muted">Bu kateqoriyada məhsul yoxdur.</div>`;
}
function filterShop(cat) {
  shopFilterCategory = cat; document.querySelectorAll(".shop-filter-btn").forEach(b => b.classList.remove("active"));
  const act = [...document.querySelectorAll(".shop-filter-btn")].find(b => (b.getAttribute("onclick") || "").includes(`'${cat}'`));
  if (act) act.classList.add("active"); renderShopItems();
}
async function buyItem(id) {
  const r = await fetch("/api/shop/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: id }) }), d = await r.json();
  toast(d.message || d.error, !r.ok); await syncMe(); loadShop();
}
async function equipItem(id) {
  const r = await fetch("/api/shop/equip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: id }) }), d = await r.json();
  toast(d.message || d.error, !r.ok); await syncMe(); loadShop();
  if (el("profileDrawer").classList.contains("open")) openProfileDrawer();
}
async function adminAddCustomFrame() {
  const file = el("cfFile")?.files[0];
  let r;
  if (file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", el("cfName").value || "Xüsusi Çərçivə");
    fd.append("price", el("cfPrice").value);
    fd.append("tier", el("cfTier").value);
    fd.append("anim_class", el("cfAnim").value);
    fd.append("description", el("cfDesc").value);
    r = await fetch("/api/admin/frames/upload", { method: "POST", body: fd });
  } else {
    r = await fetch("/api/admin/frames", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: el("cfName").value, image_url: el("cfUrl").value, price: el("cfPrice").value, tier: el("cfTier").value, anim_class: el("cfAnim").value, description: el("cfDesc").value }) });
  }
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { el("cfName").value = ""; el("cfUrl").value = ""; if (el("cfFile")) el("cfFile").value = ""; togglePdSub("shopAddCustomBox"); await syncMe(); loadShop(); }
}
async function adminDeleteCustomFrame(fid) {
  if (!confirm("Bu çərçivə mağazadan silinsin?")) return;
  const r = await fetch(`/api/admin/frames/${encodeURIComponent(fid)}`, { method: "DELETE" });
  if (r.ok) { toast("Silindi"); await syncMe(); loadShop(); }
}

/* ── 5 DƏQİQƏLİK ÇƏTİN RİYAZİ OYUN + BULLS & COWS ── */
async function startCalculusGame() {
  if (!me.authenticated) return openAuthModal();
  clearInterval(calcTimerInt);
  const cat = el("calcCategory") ? el("calcCategory").value : "all";
  const r = await fetch("/api/games/calculus/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: cat, exclude_id: lastCalcQid }) });
  const d = await r.json(); if (!r.ok) return toast(d.error || "Xəta", true);
  calcGameId = d.game_id; lastCalcQid = d.question_id;
  let left = d.time_limit || 300;
  el("calculusArea").innerHTML = `
    <div class="row" style="justify-content:space-between;margin-top:6px;">
      <span class="badge" style="border-color:var(--accent);color:var(--accent);">${esc(d.category)} · ${esc(d.title)}</span>
      <span id="calcTimerPill" class="calc-timer-pill">⏱ 05:00</span>
    </div>
    <div id="calcPromptBox" class="calc-prompt-box">${esc(d.prompt)}</div>
    <div class="row">
      <input id="calcAnsInput" placeholder="Cavab (məs: 18 və ya -13/5)" style="flex:1;" onkeydown="if(event.key==='Enter')submitCalculusAnswer(false)">
      <button id="calcSubmitBtn" class="btn btn-primary" onclick="submitCalculusAnswer(false)">Cavabla</button>
    </div>
    <div id="calcFeedbackBox"></div>`;
  renderMath(el("calcPromptBox"));
  const inp = el("calcAnsInput"); if (inp) inp.focus();
  calcTimerInt = setInterval(() => {
    left--;
    const tp = el("calcTimerPill");
    if (tp) {
      tp.textContent = `⏱ ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      if (left <= 30) tp.classList.add("danger");
    }
    if (left <= 0) { clearInterval(calcTimerInt); submitCalculusAnswer(true); }
  }, 1000);
}
async function submitCalculusAnswer(isTimeout) {
  if (!calcGameId) return;
  const inp = el("calcAnsInput"), btn = el("calcSubmitBtn");
  const ans = inp ? inp.value.trim() : "";
  if (!isTimeout && !ans) return toast("Cavab yazın!", true);
  if (btn) btn.disabled = true;
  const r = await fetch("/api/games/calculus/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: calcGameId, answer: ans, timeout: !!isTimeout }) });
  const d = await r.json();
  if (!r.ok) { if (btn) btn.disabled = false; return toast(d.error || "Xəta", true); }
  clearInterval(calcTimerInt); calcGameId = "";
  const fb = el("calcFeedbackBox");
  if (fb) {
    fb.innerHTML = `<div class="calc-solution-box" style="border-color:${d.correct ? 'var(--success)' : 'var(--danger)'};background:${d.correct ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)'};">
      <strong>${esc(d.message)}</strong>
      <div style="margin-top:6px;"><strong>İzah:</strong> ${esc(d.solution || "")}</div>
      <button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="startCalculusGame()">Növbəti Sual →</button>
    </div>`;
    renderMath(fb);
  }
  await syncMe();
}

async function startBullsGame() {
  if (!me.authenticated) return openAuthModal();
  bullsGameId = (await (await fetch("/api/games/bulls/start", { method: "POST" })).json()).game_id;
  el("bullsArea").innerHTML = `<div class="row" style="margin-bottom:8px;"><input id="bcIn" maxlength="4" placeholder="4 fərqli rəqəm (məs: 1482)" style="flex:1;" onkeydown="if(event.key==='Enter')guessBulls()"><button class="btn btn-success" onclick="guessBulls()">Yoxla</button></div><div id="bcLog" class="console-out" style="margin-top:0;min-height:90px;">Təxminləriniz burada görünəcək...</div>`;
}
async function guessBulls() {
  const inp = el("bcIn"), log = el("bcLog");
  const r = await fetch("/api/games/bulls/guess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: bullsGameId, guess: inp.value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  if (d.tries === 1) log.textContent = "";
  log.textContent += `#${d.tries}: ${inp.value} → 🐂 ${d.bulls} Bull, 🐄 ${d.cows} Cow\n`; inp.value = "";
  if (d.won) { log.textContent += `\n🎉 Tapdınız! +${d.xp_gained} XP, +${d.coins_gained} AzCoin!`; await syncMe(); }
  else if (d.lost) log.textContent += `\nBitdi! Gizli ədəd: ${d.answer}`;
}

/* ── TƏKLİFLƏR & ADMİN SORĞULARI ── */
function addTestRow(cid) {
  const box = el(cid); if (!box) return;
  const node = document.createElement("div"); node.className = "card"; node.style.padding = "8px";
  node.innerHTML = `<div class="grid-2"><textarea class="t-in" rows="2" placeholder="Giriş"></textarea><textarea class="t-out" rows="2" placeholder="Çıxış"></textarea></div>
    <div class="row" style="justify-content:space-between;margin-top:4px;"><label style="font-size:.82rem;"><input type="checkbox" class="t-smp" checked style="width:auto;"> Nümunə</label><button class="btn btn-danger btn-sm" onclick="this.closest('.card').remove()">Sil</button></div>`;
  box.appendChild(node);
}
function collectTests(cid) { return [...document.querySelectorAll(`#${cid} > .card`)].map(c => ({ input: c.querySelector(".t-in").value, output: c.querySelector(".t-out").value, is_sample: c.querySelector(".t-smp").checked })); }
async function submitProposal() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code_label: el("prCodeLbl").value, title: el("prTitle").value, plan: el("prPlan").value, rating: el("prRating").value, tags: el("prTags").value, statement: el("prStatement").value, input_spec: el("prInputSpec").value, output_spec: el("prOutputSpec").value, editorial: el("prEditorial").value, author_lang: el("prLang").value, author_code: el("prCode").value, tests: collectTests("prTestsContainer") }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { loadMyProposals(); if (me.is_admin) { loadAdminPendingBar(); loadProblems("archive"); } await syncMe(); }
}
async function loadMyProposals() {
  if (!me.authenticated) { el("myProposalsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/my-proposals")).json();
  el("myProposalsList").innerHTML = list.length
    ? list.map(x => `<div style="padding:6px 0;border-bottom:1px solid var(--border);"><strong>${esc(x.code_label || "")}. ${esc(x.title)}</strong> <span class="muted" style="font-size:.8rem;">(${esc(x.plan || "")})</span> <span class="badge">${esc(x.visibility)}</span> ${x.awarded_xp ? `(+${x.awarded_xp} XP)` : ""} ${x.reject_reason ? `<span class="muted">(${esc(x.reject_reason)})</span>` : ""}</div>`).join("")
    : "Yoxdur.";
}
function renderPendingPropCard(p, prefix) {
  return `<div class="pending-slim-item" onclick="togglePendingDetail('${prefix}',${p.id})">
    <span class="psi-code">${esc(p.code_label || "U" + p.id)}</span>
    <span class="psi-title">${esc(p.title)}</span>
    <span class="psi-plan">📋 ${esc(p.plan || p.tags || "Standart")}</span>
    <span class="psi-rating">⭐ ${p.rating}</span>
  </div>
  <div id="${prefix}Detail-${p.id}" class="pending-detail-expand" style="display:none;">
    <p style="margin:0 0 6px;"><strong>Müəllif:</strong> ${esc(p.author)} · <strong>Kod yoxlaması:</strong> ${esc(p.author_check_status || "—")} · <strong>Teqlər:</strong> ${esc(p.tags)}</p>
    <p style="margin:0 0 6px;"><strong>Plan:</strong> ${esc(p.plan || "—")}</p>
    <div style="background:rgba(13,20,32,.9);border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:6px;white-space:pre-wrap;max-height:150px;overflow-y:auto;">${esc(p.statement)}</div>
    ${p.input_spec ? `<div class="muted" style="font-size:.78rem;"><b>Input:</b> ${esc(p.input_spec)}</div>` : ""}
    ${p.output_spec ? `<div class="muted" style="font-size:.78rem;margin-bottom:6px;"><b>Output:</b> ${esc(p.output_spec)}</div>` : ""}
    ${(p.tests || []).slice(0, 3).map((t, i) => `<div class="sample-box" style="margin-top:4px;"><div class="sample-head">Test #${i + 1}</div><div class="sample-grid"><pre>${esc(t.input_data)}</pre><pre>${esc(t.expected_output)}</pre></div></div>`).join("")}
    <div class="row" style="margin-top:8px;">
      <input id="${prefix}Code-${p.id}" value="${esc(p.code_label || 'U' + p.id)}" style="width:76px;" title="Kod">
      <input id="${prefix}Xp-${p.id}" type="number" value="150" style="width:88px;" title="XP">
      <select id="${prefix}Vis-${p.id}" style="width:110px;"><option value="archive">Məsələlər</option><option value="gym">Gym</option></select>
      <button class="btn btn-success btn-sm" onclick="event.stopPropagation();reviewProp(${p.id},'approve','${prefix}')">✔ Təsdiqlə</button>
      <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();reviewProp(${p.id},'reject','${prefix}')">✕ Rədd</button>
    </div>
  </div>`;
}
async function loadAdminPendingBar() {
  if (!me.is_admin) return;
  const bar = el("adminPendingBar"); if (!bar) return;
  const r = await fetch("/api/admin/proposals"); if (!r.ok) { bar.style.display = "none"; return; }
  const props = await r.json();
  if (!props.length) { bar.style.display = "none"; return; }
  bar.style.display = "block"; el("pendingCount").textContent = props.length;
  el("pendingSlimList").innerHTML = props.map(p => renderPendingPropCard(p, "bar")).join("");
  if (pendingExpanded) el("pendingSlimList").classList.add("expanded");
}
async function openAdminProposalsModal() {
  if (!me.is_admin) return;
  el("adminProposalsModal").classList.add("open");
  const body = el("adminProposalsModalBody"); body.innerHTML = "Yüklənir...";
  const r = await fetch("/api/admin/proposals");
  if (!r.ok) { body.innerHTML = "Xəta oldu."; return; }
  const props = await r.json();
  body.innerHTML = props.length ? props.map(p => renderPendingPropCard(p, "mod")).join("") : `<p class="muted">Hazırda təsdiq gözləyən sual sorğusu yoxdur.</p>`;
}
function togglePendingExpand() { pendingExpanded = !pendingExpanded; el("pendingSlimList").classList.toggle("expanded", pendingExpanded); el("pendingArrow").textContent = pendingExpanded ? "▼" : "▲"; }
function togglePendingDetail(prefix, pid) { const d = el(`${prefix}Detail-${pid}`); if (d) d.style.display = d.style.display === "none" ? "block" : "none"; }
async function reviewProp(pid, action, prefix) {
  const pfx = prefix || "bar";
  const r = await fetch(`/api/admin/proposals/${pid}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code_label: el(`${pfx}Code-${pid}`)?.value, xp_reward: el(`${pfx}Xp-${pid}`)?.value || 150, visibility: el(`${pfx}Vis-${pid}`)?.value || "archive" }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  await syncMe(); loadAdminPendingBar(); loadProblems("archive");
  if (el("adminProposalsModal").classList.contains("open")) openAdminProposalsModal();
  if (el("tab-admin") && el("tab-admin").classList.contains("active")) loadAdminData();
}

/* ── GÖNDƏRİŞLƏR / LİDER LÖVHƏSİ / CREATIVE / PLAYGROUND ── */
async function loadSubmissions() {
  const u = (el("subFilter").value === "mine" && me.username) ? `?username=${encodeURIComponent(me.username)}` : "";
  submissionsCache = await (await fetch("/api/submissions" + u)).json();

  el("submissionsTableBody").innerHTML = submissionsCache.length
    ? submissionsCache.map((s, i) => {
      const pct = (s.quality_pct !== undefined && s.quality_pct !== null) ? s.quality_pct : (s.total_tests ? Math.round(s.passed_tests * 100 / s.total_tests) : 0);
      return `<tr class="clickable" onclick="openSubModal(${i})"><td>#${s.id}</td><td>${renderName(s.username, s.is_admin_user)}</td><td>${esc(s.problem_title)}</td><td>${esc(s.language)}</td>
        <td style="font-weight:700;color:${s.verdict === 'Accepted' ? 'var(--success)' : 'var(--danger)'}">${esc(s.verdict)}</td>
        <td>${s.passed_tests}/${s.total_tests} <span class="muted">(${pct}%)</span></td><td>${esc(s.exec_time)}</td></tr>`;
    }).join("") : `<tr><td colspan="7" class="muted">Yoxdur.</td></tr>`;
}
function openSubModal(i) {
  const s = submissionsCache[i]; el("modalTitle").textContent = `#${s.id} — ${s.problem_title}`;
  el("modalMeta").textContent = `${s.username} | ${s.verdict} | ${s.exec_time} | Keyfiyyət: ${s.quality_pct ?? "—"}%`;
  el("modalPre").textContent = s.details || "Əlavə məlumat yoxdur."; el("detailModal").classList.add("open");
}
async function loadLeaderboard() {
  const rows = await (await fetch("/api/leaderboard")).json();
  el("leaderboardBody").innerHTML = rows.map((u, i) => `<tr class="clickable" onclick="openFullProfile(${q(u.username)})">
    <td><strong>#${i + 1}</strong></td><td>${renderNameWithRank(u.username, u.is_admin_user, u.rating)}</td>
    <td><span class="badge">Lv.${u.level}</span></td><td>${u.xp}/${u.needed_xp} (${u.total_xp})</td>
    <td>${u.rating}</td><td>🔥 ${u.daily_streak}</td><td>${u.solved_count}</td></tr>`).join("");
}
async function loadCreative() {
  const list = await (await fetch("/api/creative")).json(); creativeCache = list;
  el("creativeGrid").innerHTML = list.map((c, i) => `<div class="card"><strong>${esc(c.title)}</strong> <span class="badge">${esc(c.language)}</span>
    <div class="muted" style="font-size:.78rem;">${renderName(c.author, c.is_admin_user)}</div><p class="muted" style="font-size:.84rem;">${esc(c.description)}</p>
    <pre class="console-out" style="max-height:110px;">${esc(c.code)}</pre>
    <button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="runCr(${i})">▶ Playground</button></div>`).join("");
}
function runCr(i) {
  const c = creativeCache[i]; switchTab("playground"); el("pgLang").value = c.language; onPgLangChange();
  setPgCode(c.code); el("pgStdin").value = c.sample_input || ""; runPlayground();
}
async function createCreative() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: el("crTitle").value, language: el("crLang").value, description: el("crDesc").value, code: el("crCode").value, sample_input: el("crStdin").value }) });
  const d = await r.json(); toast(d.message || d.error || "Xəta", !r.ok); if (r.ok) loadCreative();
}
async function runPlayground() {
  const o = el("pgOutput"); o.textContent = "İşə salınır...";
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: el("pgLang").value, code: getPgCode(), stdin: el("pgStdin").value }) });
  const d = await r.json();
  o.textContent = (!r.ok || d.ok === false) ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`;
}

/* ── GİZLİ ADMİN PANELİ ── */
async function loadAdminUsers() {
  if (!window.ADMIN_PORTAL) return;
  const qy = encodeURIComponent(el("adUserSearch")?.value || ""), pr = encodeURIComponent(el("adUserPeriod")?.value || "all");
  const r = await fetch(`/api/admin/users?q=${qy}&period=${pr}`); if (!r.ok) return;
  adminUsersCache = await r.json();
  el("adminUsersBody").innerHTML = adminUsersCache.length ? adminUsersCache.map((u, i) => `
    <tr><td>${renderNameWithRank(u.username, u.is_admin_user, u.rating)}
        <div style="font-size:.7rem;" class="${u.is_online ? '' : 'muted'}">${u.is_online ? '<span class="online-dot on"></span>Onlayn' : `<span class="online-dot off"></span>Oflayn (${esc(u.last_seen || "—")})`}</div></td>
      <td class="muted">${esc(u.email)}<div style="font-size:.7rem;">📅 ${esc(String(u.created_at || "").slice(0, 16))}</div></td>
      <td>Lv.${u.level} (${u.xp})</td><td>🪙 ${u.infinite_coins ? "∞" : u.coins}</td><td>${u.solved_count}</td>
      <td><div class="row" style="flex-wrap:nowrap;"><input id="adGiftC-${i}" type="number" value="100" style="width:72px;padding:4px;"><input id="adGiftX-${i}" type="number" value="0" style="width:65px;padding:4px;"><button class="btn btn-success btn-sm" onclick="adminGiftUser(${i})">Ver</button></div></td>
      <td>${u.is_admin_user ? "" : `<button class="btn btn-danger btn-sm" onclick="adminDeleteUser(${i})">Sil</button>`}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">Tapılmadı.</td></tr>`;
}
async function adminGiftUser(i) {
  const u = adminUsersCache[i]; if (!u) return;
  const r = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}/gift`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coins: el(`adGiftC-${i}`).value, xp: el(`adGiftX-${i}`).value }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) loadAdminUsers();
}
async function adminDeleteUser(i) {
  const u = adminUsersCache[i]; if (!u || !confirm(`${u.username} silinsin?`)) return;
  const r = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}`, { method: "DELETE" });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) loadAdminUsers();
}
async function loadAdminData() {
  if (!window.ADMIN_PORTAL) return;
  loadAdminUsers();
  const [pr, sr] = await Promise.all([fetch("/api/admin/proposals"), fetch("/api/settings")]);
  if (pr.ok) {
    const props = await pr.json();
    el("adminProposalsBox").innerHTML = props.length ? props.map(p => renderPendingPropCard(p, "adm")).join("") : "Gözləyən sual yoxdur.";
  }
  if (sr.ok) { const cfg = await sr.json(); el("cfgProvider").value = cfg.provider; el("cfgBaseUrl").value = cfg.base_url; }
  loadAdminPendingBar();
}
async function adminCreateContest() {
  const pids = el("adConPids").value.split(",").map(x => x.trim()).filter(Boolean);
  const r = await fetch("/api/contests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: el("adConTitle").value, duration_min: el("adConDur").value, problem_ids: pids }) });
  toast((await r.json()).message || "Xəta", !r.ok);
}
async function saveSettings() {
  const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: el("cfgProvider").value, base_url: el("cfgBaseUrl").value, api_key: el("cfgApiKey").value }) });
  toast((await r.json()).message || "Xəta", !r.ok);
}
async function testConnection() {
  const o = el("testConnOut"); o.style.display = "block"; o.textContent = "Yoxlanılır...";
  o.textContent = JSON.stringify(await (await fetch("/api/test-connection", { method: "POST" })).json(), null, 2);
}
async function adminCreateProblem() {
  const r = await fetch("/api/problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: el("npTitle").value, code_label: el("npCodeLbl").value, rating: el("npRating").value, tags: el("npTags").value, statement: el("npStatement").value, input_spec: el("npIn").value, output_spec: el("npOut").value, tests: collectTests("npTestsContainer") }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) loadProblems("archive");
}

/* ── INIT ── */
window.addEventListener("DOMContentLoaded", async () => {
  if (window.ADMIN_PORTAL === undefined) window.ADMIN_PORTAL = !!el("tab-admin");
  initEditors();
  addTestRow("prTestsContainer");
  if (el("dqTestsContainer")) addTestRow("dqTestsContainer");
  if (el("npTestsContainer")) addTestRow("npTestsContainer");
  if (el("rgPass")) el("rgPass").addEventListener("input", validatePasswordConfirm);
  if (el("rgPassConfirm")) el("rgPassConfirm").addEventListener("input", validatePasswordConfirm);

  await syncMe();
  checkHumanGate();

  const pid = new URLSearchParams(location.search).get("problem");
  if (window.ADMIN_PORTAL && me.is_admin) switchTab("admin");
  else if (pid) openProblem(pid);
  else if (!me.authenticated && (me.guest_remaining_sec === null || me.guest_remaining_sec === undefined)) switchTab("welcome");
  else switchTab("announcements");
});
