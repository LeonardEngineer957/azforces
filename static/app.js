let me = { authenticated: false, username: null, is_admin: false, human_verified: false, guest_remaining_sec: null };
let allProblems = [], currentProblem = null, solveCM = null, pgCM = null;
let submissionsCache = [], forwardPid = null, guestTimer = null;
let activeRoomCode = "", activeRoomData = null, roomPollTimer = null, lastRoomMsgId = 0, roomReplyId = null;
let activeDmPartner = "", dmPollTimer = null, lastDmMsgId = 0, dmReplyId = null;
let sprintState = { token: "", timer: null, left: 60, score: 0, ans: 0 };
let bullsGameId = "";

const TEMPLATES = {
  python: "# Kodunuzu bura yazın\n",
  cpp: "#include <iostream>\nusing namespace std;\nint main() {\n    return 0;\n}\n",
  c: "#include <stdio.h>\nint main() {\n    return 0;\n}\n",
  java: "import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n",
  javascript: "const fs = require('fs');\nconsole.log(fs.readFileSync(0, 'utf8').trim());\n"
};

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function fmtStmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function renderMath(el) { if (typeof renderMathInElement === "function") renderMathInElement(el, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false }); }
function cmMode(l) { return l === "python" ? "python" : l === "javascript" ? "javascript" : l === "cpp" ? "text/x-c++src" : l === "c" ? "text/x-csrc" : "text/x-java"; }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function copyText(txt, msg = "Kopyalandı!") { navigator.clipboard?.writeText(txt).then(() => toast(msg)).catch(() => toast("Kopyalama alınmadı", true)); }
function toast(msg, err = false) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.borderColor = err ? "var(--danger)" : "var(--primary)"; t.style.display = "block";
  clearTimeout(window._tt); window._tt = setTimeout(() => { t.style.display = "none"; }, 3400);
}
function renderName(name, isAdm) { return isAdm ? `<span class="admin-chromatic">${esc(name)}</span>` : `<strong>${esc(name)}</strong>`; }
function setAvatar(wrapId, imgId, txtId, sizeCls, u) {
  const w = document.getElementById(wrapId), im = document.getElementById(imgId), tx = document.getElementById(txtId);
  if (!w) return;
  w.className = `av-wrap ${sizeCls} frame-${u.avatar_frame || "none"}`;
  w.style.background = u.avatar_color || "#3b82f6";
  if (u.avatar_url) { im.src = u.avatar_url; im.style.display = "block"; tx.style.display = "none"; }
  else { im.style.display = "none"; tx.style.display = "inline"; tx.textContent = (u.username || "A")[0]; }
}

/* 1. İnsan Doğrulaması & Qonaq Rejimi */
function checkHumanGate() { document.getElementById("humanGate").style.display = me.human_verified ? "none" : "flex"; }
async function verifyHuman() {
  const ic = document.getElementById("humanBoxIcon"), st = document.getElementById("humanStatusText");
  ic.className = "human-square spinning"; st.textContent = "Yoxlanılır...";
  try {
    const cd = await (await fetch("/api/human-challenge")).json();
    await new Promise(r => setTimeout(r, 420));
    const vr = await fetch("/api/human-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_token: cd.challenge_token }) });
    if (!vr.ok) { ic.className = "human-square"; st.textContent = "Yenidən klikləyin"; return; }
    ic.className = "human-square checked"; ic.textContent = "✔"; st.textContent = "Təsdiqləndi!";
    setTimeout(() => { document.getElementById("humanGate").style.display = "none"; }, 300);
  } catch { ic.className = "human-square"; st.textContent = "Xəta oldu"; }
}
async function startGuestMode() {
  const r = await fetch("/api/guest/start", { method: "POST" }); const d = await r.json();
  if (d.guest_remaining_sec !== null) runGuestTimer(d.guest_remaining_sec);
  switchTab("announcements"); toast("5 dəqiqəlik qonaq rejimi başladı!");
}
function runGuestTimer(sec) {
  clearInterval(guestTimer);
  const pill = document.getElementById("hdrGuestPill");
  if (me.authenticated || sec === null || sec === undefined) { pill.style.display = "none"; return; }
  let left = sec;
  const tick = () => {
    if (me.authenticated) { pill.style.display = "none"; clearInterval(guestTimer); return; }
    if (left <= 0) {
      pill.style.display = "none"; clearInterval(guestTimer);
      switchTab("welcome"); openAuthModal(); toast("5 dəqiqəlik qonaq vaxtı bitdi — hesab açın!", true);
      return;
    }
    const m = String(Math.floor(left / 60)).padStart(2, "0"), s = String(left % 60).padStart(2, "0");
    pill.style.display = "inline-block"; pill.textContent = `Qonaq ${m}:${s}`;
    left--;
  };
  tick(); guestTimer = setInterval(tick, 1000);
}

/* Drawers & Navigation */
function toggleLeftDrawer(f) { const d = document.getElementById("leftDrawer"), b = document.getElementById("leftBackdrop"), o = f !== undefined ? f : !d.classList.contains("open"); d.classList.toggle("open", o); b.classList.toggle("open", o); }
function toggleProfileDrawer(f) { const d = document.getElementById("profileDrawer"), b = document.getElementById("rightBackdrop"), o = f !== undefined ? f : !d.classList.contains("open"); d.classList.toggle("open", o); b.classList.toggle("open", o); }
function togglePdSub(id) { const el = document.getElementById(id); el.style.display = el.style.display === "none" ? "block" : "none"; }

function switchTab(tab) {
  toggleLeftDrawer(false);
  const el = document.getElementById("tab-" + tab);
  if (!el) return;
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".drawer-item").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  document.querySelector(`.drawer-item[data-tab="${tab}"]`)?.classList.add("active");

  if (tab === "welcome") loadWelcomeReviews();
  if (tab === "announcements") loadPosts();
  if (tab === "problems") loadProblems("archive");
  if (tab === "submit" && solveCM) setTimeout(() => solveCM.refresh(), 50);
  if (tab === "gym") loadGym();
  if (tab === "contests") loadContests();
  if (tab === "chat") { loadMyRooms(); loadRoomProblemsPicker(); loadDmChats(); }
  if (tab === "shop") loadShop();
  if (tab === "propose") loadMyProposals();
  if (tab === "submissions") loadSubmissions();
  if (tab === "leaderboard") loadLeaderboard();
  if (tab === "creative") loadCreative();
  if (tab === "playground" && pgCM) setTimeout(() => pgCM.refresh(), 50);
  if (tab === "admin" && me.is_admin) loadAdminData();
}

/* 2. Auth, Welcome Reviews & Sağ Profil Menyusu */
async function syncMe() {
  me = await (await fetch("/api/auth/me")).json();
  const pb = document.getElementById("hdrProfileBtn"), ab = document.getElementById("hdrAuthBtn");
  if (me.authenticated) {
    pb.style.display = "inline-flex"; ab.style.display = "none";
    document.getElementById("hdrUserName").innerHTML = me.is_admin ? `<span class="admin-chromatic">${esc(me.username)}</span>` : esc(me.username);
    document.getElementById("hdrUserLvl").textContent = `Lv.${me.level} · 🪙${me.coins || 0}`;
    setAvatar("hdrAvatarWrap", "hdrAvatarImg", "hdrAvatarTxt", "", me);
    document.getElementById("hdrGuestPill").style.display = "none";
  } else {
    pb.style.display = "none"; ab.style.display = "inline-flex";
    if (me.guest_remaining_sec !== null) runGuestTimer(me.guest_remaining_sec);
  }
  document.getElementById("newPostBtn").style.display = me.is_admin ? "inline-flex" : "none";
  document.getElementById("deleteProblemBtn").style.display = me.is_admin ? "inline-flex" : "none";
  document.getElementById("reviewFormBox").style.display = me.authenticated ? "block" : "none";
}

async function loadWelcomeReviews() {
  const d = await (await fetch("/api/site-reviews")).json();
  document.getElementById("wStatUsers").textContent = d.stats.users;
  document.getElementById("wStatProbs").textContent = d.stats.problems;
  document.getElementById("wStatSubs").textContent = d.stats.submissions;
  document.getElementById("wStatRating").textContent = `${d.stats.avg_rating} ★`;
  document.getElementById("siteReviewsList").innerHTML = d.reviews.map(r => `
    <div class="card" style="margin:0;background:rgba(7,10,16,.65);">
      <div class="row" style="justify-content:space-between;font-size:.84rem;">
        <span>${renderName(r.username, r.is_admin_user)}</span>
        <span style="color:#fbbf24;">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
      </div>
      <p class="muted" style="margin:6px 0 0;font-size:.85rem;">${esc(r.comment)}</p>
    </div>`).join("");
}
async function submitSiteReview() {
  const r = await fetch("/api/site-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: document.getElementById("revStars").value, comment: document.getElementById("revComment").value }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) { document.getElementById("revComment").value = ""; loadWelcomeReviews(); }
}

function openAuthModal() { document.getElementById("authModal").classList.add("open"); }
function switchAuthTab(t) {
  document.getElementById("loginPane").style.display = t === "login" ? "block" : "none";
  document.getElementById("registerPane").style.display = t === "register" ? "block" : "none";
  document.getElementById("tabLoginBtn").className = t === "login" ? "btn btn-sm btn-primary" : "btn btn-sm";
  document.getElementById("tabRegBtn").className = t === "register" ? "btn btn-sm btn-primary" : "btn btn-sm";
}
async function doLogin() {
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: document.getElementById("liIdent").value, password: document.getElementById("liPass").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); document.getElementById("liPass").value = "";
  await syncMe(); switchTab("announcements"); toast(d.message);
}
async function sendRegCode() {
  const btn = document.getElementById("sendCodeBtn"); btn.disabled = true;
  const r = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: document.getElementById("rgUser").value, email: document.getElementById("rgEmail").value, password: document.getElementById("rgPass").value }) });
  btn.disabled = false; const d = await r.json(); if (!r.ok) return toast(d.error, true);
  document.getElementById("regCodeWrap").style.display = "block"; toast(d.dev_code ? `Kod: ${d.dev_code}` : d.message);
}
async function doRegister() {
  const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: document.getElementById("rgUser").value, email: document.getElementById("rgEmail").value, password: document.getElementById("rgPass").value, code: document.getElementById("rgCode").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); await syncMe(); switchTab("announcements"); toast(d.message);
}
async function logoutAll() { await fetch("/api/auth/logout", { method: "POST" }); toggleProfileDrawer(false); await syncMe(); switchTab("welcome"); toast("Çıxış edildi"); }

async function openProfileDrawer() {
  if (!me.authenticated) return openAuthModal();
  toggleProfileDrawer(true);
  const r = await fetch("/api/profile"); if (!r.ok) return;
  const p = await r.json();
  setAvatar("pdAvatarWrap", "pdAvatarImg", "pdAvatarTxt", "av-lg", p);
  document.getElementById("pdName").innerHTML = renderName(p.username, p.is_admin_user);
  document.getElementById("pdEmail").textContent = p.email;
  document.getElementById("pdLvlBadge").textContent = `Lv.${p.level}`;
  document.getElementById("pdCoins").textContent = p.coins;
  document.getElementById("pdRating").textContent = p.rating;
  document.getElementById("pdStreak").textContent = p.streak;
  document.getElementById("pdXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  document.getElementById("pdXpFill").style.width = `${p.progress_pct}%`;
  document.getElementById("profBioInput").value = p.bio || "";
  document.getElementById("profColorInput").value = p.avatar_color || "#3b82f6";
  document.getElementById("pdIncomingReqs").innerHTML = p.incoming_requests.map(u => `<div class="row" style="justify-content:space-between;font-size:.8rem;margin-bottom:4px;"><span>${esc(u)}</span><span><button class="btn btn-sm btn-success" onclick="respondFriend('${esc(u)}','accept')">✔</button><button class="btn btn-sm btn-danger" onclick="respondFriend('${esc(u)}','reject')">✕</button></span></div>`).join("");
  document.getElementById("pdFriendsList").innerHTML = p.friends.length ? p.friends.map(f => `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:.82rem;"><span style="cursor:pointer;" onclick="toggleProfileDrawer(false);openFullProfile('${esc(f.username)}')">${renderName(f.username, f.is_admin_user)} <span class="muted">Lv.${f.level}</span></span><button class="btn btn-sm btn-primary" onclick="toggleProfileDrawer(false);switchTab('chat');switchChatMode('dm');openDmWith('${esc(f.username)}')">💬</button></div>`).join("") : `<div class="muted" style="font-size:.8rem;">Dost yoxdur.</div>`;
}
async function uploadAvatar() {
  const f = document.getElementById("avatarFileInput").files[0]; if (!f) return toast("Şəkil seçin", true);
  const btn = document.getElementById("uploadAvBtn"); btn.disabled = true;
  const fd = new FormData(); fd.append("avatar", f);
  const r = await fetch("/api/profile/avatar", { method: "POST", body: fd });
  btn.disabled = false; const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { await syncMe(); openProfileDrawer(); }
}
async function saveProfileBio() {
  const r = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: document.getElementById("profBioInput").value, avatar_color: document.getElementById("profColorInput").value }) });
  if (r.ok) { await syncMe(); openProfileDrawer(); toast("Yadda saxlanıldı!"); }
}
async function sendFriendRequestTo(target) {
  const r = await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: target }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  return r.ok;
}
async function sendFriendRequest() { const i = document.getElementById("addFriendInput"); if (await sendFriendRequestTo(i.value)) i.value = ""; }
async function respondFriend(username, action) { await fetch("/api/friends/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, action }) }); openProfileDrawer(); }

/* 3. Tam Profil (Heatmap + Reytinq Qrafiki) */
async function openFullProfile(uname) {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch(`/api/users/${encodeURIComponent(uname)}`); if (!r.ok) return toast("Profil tapılmadı", true);
  const p = await r.json(); switchTab("profile");
  setAvatar("fpAvatarWrap", "fpAvatarImg", "fpAvatarTxt", "av-xl", p);
  document.getElementById("fpName").innerHTML = renderName(p.username, p.is_admin_user);
  document.getElementById("fpBio").textContent = p.bio || "Bio yazılmayıb.";
  document.getElementById("fpLvlBadge").textContent = `Səviyyə ${p.level}`;
  document.getElementById("fpRatingBadge").textContent = `Reytinq: ${p.rating}`;
  document.getElementById("fpStreakBadge").textContent = `🔥 ${p.streak} gün`;
  document.getElementById("fpSolvedBadge").textContent = `✔ ${p.solved_count} həll`;
  document.getElementById("fpXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  document.getElementById("fpXpFill").style.width = `${p.progress_pct}%`;
  document.getElementById("fpActions").innerHTML = p.username === me.username ? "" : `<button class="btn btn-primary btn-sm" onclick="switchTab('chat');switchChatMode('dm');openDmWith('${esc(p.username)}')">💬 Mesaj Yaz</button><button class="btn btn-sm" onclick="sendFriendRequestTo('${esc(p.username)}')">+ Dost Ol</button>`;
  document.getElementById("fpRecentSolved").innerHTML = p.recent_solved.length ? p.recent_solved.map(s => `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openProblem('${esc(s.code_label || s.id)}')">✔ <strong>${esc(s.code_label)}. ${esc(s.title)}</strong> <span class="muted">(${s.rating})</span></div>`).join("") : `<span class="muted">Hələ yoxdur.</span>`;
  renderHeatmap(p.heatmap || {});
  drawRatingChart(p.rating_history || [{ rating: p.rating }]);
}
function renderHeatmap(heat) {
  const grid = document.getElementById("profileHeatmap"); grid.innerHTML = "";
  const now = new Date();
  for (let i = 167; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 86400000), key = dt.toISOString().slice(0, 10), cnt = heat[key] || 0;
    const cell = document.createElement("div");
    cell.className = "hm-cell " + (cnt >= 5 ? "hm-4" : cnt >= 3 ? "hm-3" : cnt >= 2 ? "hm-2" : cnt >= 1 ? "hm-1" : "");
    cell.title = `${key}: ${cnt} göndəriş`;
    grid.appendChild(cell);
  }
}
function drawRatingChart(hist) {
  const c = document.getElementById("ratingChartCanvas"), ctx = c.getContext("2d"), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const bands = [[0, 1200, "rgba(148,163,184,.12)"], [1200, 1400, "rgba(34,197,94,.12)"], [1400, 1600, "rgba(6,182,212,.14)"], [1600, 1900, "rgba(59,130,246,.15)"], [1900, 3500, "rgba(168,85,247,.16)"]];
  const minR = 600, maxR = 2400, yOf = r => H - 18 - ((Math.min(maxR, Math.max(minR, r)) - minR) / (maxR - minR)) * (H - 36);
  bands.forEach(([a, b, col]) => { const y1 = yOf(b), y2 = yOf(a); ctx.fillStyle = col; ctx.fillRect(0, y1, W, y2 - y1); });
  if (!hist.length) return;
  ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5; ctx.beginPath();
  hist.forEach((pt, idx) => { const x = 22 + (hist.length === 1 ? (W - 44) / 2 : (idx * (W - 44)) / (hist.length - 1)), y = yOf(pt.rating); idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  hist.forEach((pt, idx) => { const x = 22 + (hist.length === 1 ? (W - 44) / 2 : (idx * (W - 44)) / (hist.length - 1)), y = yOf(pt.rating); ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
}

/* 4. Duyuru Panosu */
function togglePostForm() { const f = document.getElementById("postFormBox"); f.style.display = f.style.display === "none" ? "block" : "none"; }
async function createPost() {
  const opts = document.getElementById("postPollOpts").value.split(",").map(s => s.trim()).filter(Boolean);
  const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("postTitle").value, body: document.getElementById("postBody").value, poll_options: opts, is_pinned: document.getElementById("postPin").checked }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { document.getElementById("postTitle").value = ""; document.getElementById("postBody").value = ""; document.getElementById("postPollOpts").value = ""; togglePostForm(); loadPosts(); }
}
async function loadPosts() {
  const posts = await (await fetch("/api/posts")).json();
  document.getElementById("postsList").innerHTML = posts.map(p => `
    <div class="card post-card ${p.is_pinned ? 'pinned' : ''}">
      <div class="row" style="justify-content:space-between;">
        <strong>${p.is_pinned ? '📌 ' : ''}${esc(p.title)}</strong>
        <span class="muted" style="font-size:.8rem;">${renderName(p.author, p.is_admin_user)} · ${esc(p.created_at)} ${me.is_admin ? `<button class="btn btn-sm btn-danger" onclick="deletePost(${p.id})">Sil</button>` : ''}</span>
      </div>
      <p style="margin:8px 0;white-space:pre-wrap;">${esc(p.body)}</p>
      ${p.poll_options.map((o, i) => { const pct = p.total_votes ? Math.round(o.votes * 100 / p.total_votes) : 0; return `<div class="poll-opt ${p.my_vote === i ? 'voted' : ''}" onclick="votePoll(${p.id},${i})"><div class="poll-bar" style="width:${pct}%"></div><div class="poll-txt"><span>${esc(o.text)}</span><span>${o.votes} (${pct}%)</span></div></div>`; }).join("")}
      <div class="row" style="margin-top:10px;">${p.reactions.map(rx => `<button class="react-btn ${rx.mine ? 'mine' : ''}" onclick="reactPost(${p.id},'${rx.emoji}')">${rx.emoji} ${rx.count}</button>`).join("")}</div>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
        ${p.comments.map(c => `<div class="comment-item ${c.parent_id ? 'comment-reply' : ''}">${renderName(c.author, c.is_admin_user)}: ${esc(c.body)} <button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyComment(${p.id},${c.id},'${esc(c.author)}')">Cavabla</button></div>`).join("")}
        <div class="row" style="margin-top:8px;"><input id="cmtIn-${p.id}" placeholder="Şərh yaz..." style="flex:1;" /><input id="cmtPar-${p.id}" type="hidden" /><button class="btn btn-sm btn-primary" onclick="sendComment(${p.id})">Yaz</button></div>
      </div>
    </div>`).join("");
}
async function votePoll(pid, idx) { if (!me.authenticated) return openAuthModal(); await fetch(`/api/posts/${pid}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_index: idx }) }); loadPosts(); }
async function reactPost(pid, emoji) { if (!me.authenticated) return openAuthModal(); await fetch(`/api/posts/${pid}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }); loadPosts(); }
function replyComment(pid, cid, author) { document.getElementById(`cmtPar-${pid}`).value = cid; const i = document.getElementById(`cmtIn-${pid}`); i.placeholder = `@${author} cavab...`; i.focus(); }
async function sendComment(pid) { if (!me.authenticated) return openAuthModal(); const i = document.getElementById(`cmtIn-${pid}`), par = document.getElementById(`cmtPar-${pid}`).value; const r = await fetch(`/api/posts/${pid}/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: i.value, parent_id: par || null }) }); if (r.ok) loadPosts(); else toast((await r.json()).error, true); }
async function deletePost(pid) { await fetch(`/api/posts/${pid}`, { method: "DELETE" }); loadPosts(); }

/* 5. Geniş Məsələ Görünüşü + Sualı Kopyala + Vahid Submit */
async function loadProblems(v = "archive") { allProblems = await (await fetch(`/api/problems?view=${v}`)).json(); renderProblemsTable(); }
function renderProblemsTable() {
  const q = (document.getElementById("problemSearch").value || "").toLowerCase(), hide = document.getElementById("hideTagsToggle").checked;
  const rows = allProblems.filter(p => p.title.toLowerCase().includes(q) || (p.tags || "").toLowerCase().includes(q) || (p.code_label || "").toLowerCase().includes(q));
  document.getElementById("problemsTableBody").innerHTML = rows.length ? rows.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem('${esc(p.code_label || p.id)}')"><td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td><td>${hide ? '<span class="muted">gizli</span>' : (p.tags || "").split(",").map(t => `<span class="tag-pill">${esc(t.trim())}</span>`).join("")}</td><td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td><td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${JSON.stringify(p.title)})">🔗</button></td></tr>`).join("") : `<tr><td colspan="6" class="muted">Yoxdur.</td></tr>`;
}
async function loadGym() {
  const list = await (await fetch("/api/problems?view=gym")).json();
  document.getElementById("gymTableBody").innerHTML = list.length ? list.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem('${esc(p.code_label || p.id)}')"><td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td><td>${esc(p.tags)}</td><td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td><td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${JSON.stringify(p.title)})">🔗</button></td></tr>`).join("") : `<tr><td colspan="6" class="muted">Hələ bitmiş yarış məsələsi yoxdur.</td></tr>`;
}
async function openProblem(key) {
  const r = await fetch(`/api/problems/${encodeURIComponent(key)}`), p = await r.json(); if (!r.ok) return toast(p.error, true);
  currentProblem = p; switchTab("problems");
  document.getElementById("problemListView").style.display = "none"; document.getElementById("problemReadView").style.display = "block";
  document.getElementById("probTitle").textContent = `${p.code_label ? p.code_label + '. ' : ''}${p.title}`;
  document.getElementById("probLimits").textContent = `time limit per test: ${p.time_limit}s | memory limit per test: ${p.memory_limit} MB`;
  document.getElementById("probAuthorMeta").innerHTML = `Müəllif: ${renderName(p.author, p.author_is_admin)} | Reytinq: ${p.rating}`;
  const st = document.getElementById("probStatement"), ins = document.getElementById("probInputSpec"), out = document.getElementById("probOutputSpec");
  st.innerHTML = fmtStmt(p.statement); renderMath(st); ins.innerHTML = fmtStmt(p.input_spec || "—"); renderMath(ins); out.innerHTML = fmtStmt(p.output_spec || "—"); renderMath(out);
  document.getElementById("probNoteWrap").style.display = p.note ? "block" : "none"; if (p.note) { const n = document.getElementById("probNote"); n.innerHTML = fmtStmt(p.note); renderMath(n); }
  document.getElementById("probEditorialWrap").style.display = p.editorial ? "block" : "none"; if (p.editorial) { const e = document.getElementById("probEditorial"); e.innerHTML = fmtStmt(p.editorial); renderMath(e); }
  document.getElementById("probSamples").innerHTML = (p.samples || []).map((s, i) => `<div class="sample-box"><div class="sample-head"><span>Nümunə #${i + 1}</span><button class="btn btn-sm" onclick="copyText(currentProblem.samples[${i}].input_data,'Giriş kopyalandı')">Kopyala</button></div><div class="sample-grid"><pre>${esc(s.input_data)}</pre><pre>${esc(s.expected_output)}</pre></div></div>`).join("");
}
function backToProblemList() { document.getElementById("problemReadView").style.display = "none"; document.getElementById("problemListView").style.display = "block"; loadProblems("archive"); }
function copyWholeProblem() {
  if (!currentProblem) return;
  const p = currentProblem;
  const smps = (p.samples || []).map((s, i) => `Nümunə #${i + 1}\nInput:\n${s.input_data}\nOutput:\n${s.expected_output}`).join("\n\n");
  copyText(`${p.code_label}. ${p.title}\n\n${p.statement}\n\nInput:\n${p.input_spec}\n\nOutput:\n${p.output_spec}\n\n${smps}`, "Bütün sual mətni kopyalandı!");
}
function goSubmitForCurrent() {
  if (!currentProblem) return;
  document.getElementById("subProbCode").value = currentProblem.code_label || currentProblem.id;
  lookupSubmitProblem();
  switchTab("submit");
}
async function lookupSubmitProblem() {
  const code = document.getElementById("subProbCode").value.trim(), hint = document.getElementById("subProbHint");
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
  forwardPid = pid; document.getElementById("forwardModal").classList.add("open");
  const list = await (await fetch("/api/rooms/mine")).json();
  document.getElementById("fwdGroupsBox").innerHTML = list.length ? `<label class="muted" style="font-size:.82rem;">Qrupa at:</label>` + list.map(g => `<button class="btn btn-sm" style="margin:4px 4px 0 0;" onclick="forwardProblemToRoom('${g.room_code}')">👥 ${esc(g.title)}</button>`).join("") : `<span class="muted">Qrupunuz yoxdur.</span>`;
}
async function forwardProblemToRoom(code) { await fetch(`/api/rooms/${code}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ yönləndirdi:", shared_problem_id: forwardPid }) }); closeModal("forwardModal"); toast("Qrupa atıldı!"); }
async function forwardProblemToDm() { const u = document.getElementById("fwdDmUser").value.trim(); if (!u) return; const r = await fetch(`/api/dm/${encodeURIComponent(u)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ göndərdi:", shared_problem_id: forwardPid }) }); closeModal("forwardModal"); toast(r.ok ? "Dosta göndərildi!" : "İstifadəçi tapılmadı", !r.ok); }

/* CodeMirror & Run/Submit */
function initEditors() {
  if (typeof CodeMirror !== "undefined") {
    solveCM = CodeMirror.fromTextArea(document.getElementById("solveEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
    pgCM = CodeMirror.fromTextArea(document.getElementById("pgEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
    setSolveCode(TEMPLATES.python); setPgCode("print('Salam AzForces!')\n");
  }
}
function getSolveCode() { return solveCM ? solveCM.getValue() : document.getElementById("solveEditorTextarea").value; }
function setSolveCode(v) { if (solveCM) { solveCM.setValue(v); setTimeout(() => solveCM.refresh(), 40); } else document.getElementById("solveEditorTextarea").value = v; }
function getPgCode() { return pgCM ? pgCM.getValue() : document.getElementById("pgEditorTextarea").value; }
function setPgCode(v) { if (pgCM) { pgCM.setValue(v); setTimeout(() => pgCM.refresh(), 40); } else document.getElementById("pgEditorTextarea").value = v; }
function onSolveLangChange() { if (solveCM) solveCM.setOption("mode", cmMode(document.getElementById("solveLang").value)); }
function onPgLangChange() { if (pgCM) pgCM.setOption("mode", cmMode(document.getElementById("pgLang").value)); }

async function runSolveCode() {
  const b = document.getElementById("solveResultBox"); b.style.display = "block"; b.textContent = "Test edilir...";
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: document.getElementById("solveLang").value, code: getSolveCode(), stdin: document.getElementById("solveStdin").value }) });
  const d = await r.json(); b.textContent = !r.ok || d.ok === false ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`;
}
async function submitSolution() {
  if (!me.authenticated) return openAuthModal();
  const codeKey = document.getElementById("subProbCode").value.trim(); if (!codeKey) return toast("Məsələ kodunu yazın (məs: 1A)", true);
  const b = document.getElementById("solveResultBox"), btn = document.getElementById("submitSolveBtn");
  btn.disabled = true; b.style.display = "block"; b.textContent = "Yoxlanılır...";
  const r = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem_code: codeKey, language: document.getElementById("solveLang").value, code: getSolveCode(), room_id: window._activeRoomId || null }) });
  btn.disabled = false; const d = await r.json(); if (!r.ok) { b.textContent = d.error || "Xəta"; return; }
  b.textContent = `Nəticə: ${d.verdict} (${d.passed}/${d.total}) | Vaxt: ${d.time}\n${d.xp_gained ? `+${d.xp_gained} XP, +${d.coins_gained} AzCoin!\n` : ""}${d.details || ""}`;
  await syncMe(); toast(d.verdict === "Accepted" ? "Accepted!" : d.verdict, d.verdict !== "Accepted");
}
async function deleteCurrentProblem() { if (!confirm("Silinsin?")) return; if ((await fetch(`/api/problems/${currentProblem.id}`, { method: "DELETE" })).ok) { toast("Silindi"); backToProblemList(); } }

/* Contests */
async function loadContests() {
  const list = await (await fetch("/api/contests")).json();
  document.getElementById("contestsList").innerHTML = list.length ? list.map(c => `<div class="card" style="background:rgba(7,10,16,.6);"><div class="row" style="justify-content:space-between;"><strong>${esc(c.title)}</strong><span class="badge">${c.status === "active" ? "Aktiv" : "Bitib (Gym)"}</span></div><div style="margin-top:8px;">${c.problems.map(p => `<button class="btn btn-sm" style="margin:3px;" onclick="openProblem('${esc(p.code_label || p.id)}')">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div>${me.is_admin && c.status === "active" ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;" onclick="finishContest(${c.id})">Bitir & Gym-ə Köçür</button>` : ""}</div>`).join("") : `<p class="muted">Yarış yoxdur.</p>`;
}
async function finishContest(cid) { await fetch(`/api/contests/${cid}/finish`, { method: "POST" }); toast("Gym-ə köçürüldü!"); loadContests(); }

/* 6. Qruplar (WhatsApp Qrup Profili) & Telegram DM */
function switchChatMode(mode) {
  document.getElementById("chatGroupsPane").style.display = mode === "groups" ? "block" : "none";
  document.getElementById("chatDmPane").style.display = mode === "dm" ? "block" : "none";
  document.getElementById("subTabGroupsBtn").className = mode === "groups" ? "btn btn-primary btn-sm" : "btn btn-sm";
  document.getElementById("subTabDmBtn").className = mode === "dm" ? "btn btn-primary btn-sm" : "btn btn-sm";
  if (mode === "dm") loadDmChats();
}
async function loadMyRooms() {
  if (!me.authenticated) { document.getElementById("myRoomsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/rooms/mine")).json();
  document.getElementById("myRoomsList").innerHTML = list.length ? list.map(r => `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="enterRoom('${r.room_code}')"><div class="row"><div class="av-wrap" style="background:${esc(r.avatar_color)};">${r.avatar_url ? `<img src="${esc(r.avatar_url)}">` : esc(r.title[0])}</div><div><strong>${esc(r.title)}</strong><div class="muted" style="font-size:.76rem;">${esc(r.bio)}</div></div></div><span class="badge">${r.member_count}/20</span></div>`).join("") : `<div class="muted">Qrupunuz yoxdur.</div>`;
}
async function loadRoomProblemsPicker() {
  const list = await (await fetch("/api/problems?view=archive")).json();
  document.getElementById("crRoomProblemsList").innerHTML = list.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:.82rem;margin-bottom:4px;"><input type="checkbox" class="rm-pchk" value="${p.id}" style="width:auto;" /> ${esc(p.code_label || p.id)}. ${esc(p.title)}</label>`).join("");
}
async function createRoom() {
  if (!me.authenticated) return openAuthModal();
  const pids = [...document.querySelectorAll(".rm-pchk:checked")].map(x => Number(x.value));
  const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("crRoomTitle").value, bio: document.getElementById("crRoomBio").value, avatar_color: document.getElementById("crRoomColor").value, duration_min: document.getElementById("crRoomDur").value || 0, voice_link: document.getElementById("crRoomVoice").value, problem_ids: pids }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  document.getElementById("crRoomTitle").value = ""; document.getElementById("crRoomBio").value = ""; enterRoom(d.room_code);
}
async function joinRoom() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/rooms/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_code: document.getElementById("joinRoomCode").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  document.getElementById("joinRoomCode").value = ""; enterRoom(d.room_code);
}
function enterRoom(code) {
  activeRoomCode = code; lastRoomMsgId = 0; roomReplyId = null; document.getElementById("rmChatBox").innerHTML = "";
  document.getElementById("roomLobbyView").style.display = "none"; document.getElementById("roomActiveView").style.display = "block";
  pollRoom(); clearInterval(roomPollTimer); roomPollTimer = setInterval(() => { if (!document.hidden && activeRoomCode) pollRoom(); }, 3000);
}
function leaveRoomView() { activeRoomCode = ""; window._activeRoomId = null; clearInterval(roomPollTimer); document.getElementById("roomActiveView").style.display = "none"; document.getElementById("roomLobbyView").style.display = "grid"; loadMyRooms(); }
function copyRoomCode() { copyText(activeRoomCode, "16 rəqəmli kod kopyalandı!"); }
function replyRoomMsg(id, author, text) { roomReplyId = id; document.getElementById("rmReplyText").textContent = `↩ ${author}: ${text.slice(0, 45)}`; document.getElementById("rmReplyBanner").style.display = "flex"; document.getElementById("rmChatInput").focus(); }
function cancelRoomReply() { roomReplyId = null; document.getElementById("rmReplyBanner").style.display = "none"; }

async function pollRoom() {
  const r = await fetch(`/api/rooms/${activeRoomCode}/state?after_id=${lastRoomMsgId}`); if (!r.ok) return;
  const d = await r.json(); activeRoomData = d; window._activeRoomId = d.room.id;
  setAvatar("rmAvatarWrap", "rmAvatarImg", "rmAvatarTxt", "", { username: d.room.title, avatar_url: d.room.avatar_url, avatar_color: d.room.avatar_color, avatar_frame: "none" });
  document.getElementById("rmTitle").textContent = d.room.title;
  document.getElementById("rmBio").textContent = d.room.bio;
  document.getElementById("rmMemCount").textContent = d.members.length;
  document.getElementById("rmTimerWrap").textContent = d.room.remaining_sec >= 0 ? ` · ⏱ ${Math.floor(d.room.remaining_sec / 60)} dəq` : "";
  const vb = document.getElementById("rmVoiceBtn"); vb.style.display = d.room.voice_link ? "inline-flex" : "none"; if (d.room.voice_link) vb.href = d.room.voice_link;
  const pb = document.getElementById("rmProblemsBar");
  pb.style.display = d.problems.length ? "block" : "none";
  pb.innerHTML = d.problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="openProblem('${esc(p.code_label || p.id)}')">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("");

  const box = document.getElementById("rmChatBox");
  d.messages.forEach(m => {
    lastRoomMsgId = Math.max(lastRoomMsgId, m.id);
    const mine = m.username === me.username;
    const div = document.createElement("div"); div.className = `chat-bubble ${mine ? 'mine' : 'theirs'}`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") +
      `<div><span style="cursor:pointer;" onclick="openFullProfile('${esc(m.username)}')">${renderName(m.username, m.is_admin_user)}</span>: ${esc(m.message)}</div>` +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem('${esc(m.shared_code || m.shared_problem_id)}')">📘 ${esc(m.shared_code ? m.shared_code + '. ' : '')}${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
      `<div class="chat-meta"><span>${esc((m.created_at || "").slice(11, 16))}</span><button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyRoomMsg(${m.id},${JSON.stringify(m.username)},${JSON.stringify(m.message)})">↩ Cavabla</button></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  });
}
async function sendRoomChat() {
  const inp = document.getElementById("rmChatInput"); if (!inp.value.trim()) return;
  const r = await fetch(`/api/rooms/${activeRoomCode}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: inp.value, reply_to_id: roomReplyId }) });
  if (!r.ok) return toast((await r.json()).error, true);
  inp.value = ""; cancelRoomReply(); pollRoom();
}
function openGroupProfile() {
  if (!activeRoomData) return;
  const d = activeRoomData, rm = d.room, isCr = rm.creator === me.username;
  document.getElementById("groupProfileBody").innerHTML = `
    <div class="prof-top" style="margin-bottom:12px;">
      <div class="av-wrap av-lg" style="background:${esc(rm.avatar_color)};">${rm.avatar_url ? `<img src="${esc(rm.avatar_url)}">` : esc(rm.title[0])}</div>
      <div><h3 style="margin:0;">${esc(rm.title)}</h3><div class="muted" style="font-size:.82rem;">Yaradıcı: ${esc(rm.creator)} · Kod: ${rm.room_code.replace(/(.{4})/g,"$1-").slice(0,-1)}</div></div>
    </div>
    <p style="font-size:.88rem;margin:0 0 12px;">${esc(rm.bio)}</p>
    ${isCr ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Qrup Profilini Düzəlt</strong><input id="gpTitle" value="${esc(rm.title)}" style="margin-top:6px;" /><textarea id="gpBio" rows="2" style="margin-top:6px;">${esc(rm.bio)}</textarea><div class="row" style="margin-top:6px;"><input id="gpAvUrl" value="${esc(rm.avatar_url || '')}" placeholder="Qrup şəkil linki (URL)" style="flex:1;" /><input id="gpColor" type="color" value="${esc(rm.avatar_color)}" style="width:46px;height:34px;padding:2px;" /></div><button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="saveGroupProfile()">Yenilə</button></div>` : ""}
    ${d.shared_problems.length ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Qrupda Paylaşılan Suallar</strong><div style="margin-top:6px;">${d.shared_problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="closeModal('groupProfileModal');openProblem('${esc(p.code_label || p.id)}')">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div></div>` : ""}
    <div class="prof-box"><strong style="font-size:.84rem;">Üzvlər (${d.members.length}/20)</strong>
      ${d.members.map(m => `<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.84rem;"><span style="cursor:pointer;" onclick="closeModal('groupProfileModal');openFullProfile('${esc(m.username)}')">${renderName(m.username, m.is_admin_user)} <span class="muted">Lv.${m.level}</span> ${m.username === rm.creator ? '<span class="badge">Admin</span>' : ''}</span>${isCr && m.username !== rm.creator ? `<button class="btn btn-danger btn-sm" onclick="kickMember('${esc(m.username)}')">Çıxar</button>` : ""}</div>`).join("")}
    </div>
    <button class="btn btn-danger" style="width:100%;justify-content:center;margin-top:12px;" onclick="exitGroupPermanent()">Qrupdan Ayrıl</button>`;
  document.getElementById("groupProfileModal").classList.add("open");
}
async function saveGroupProfile() {
  const r = await fetch(`/api/rooms/${activeRoomCode}/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("gpTitle").value, bio: document.getElementById("gpBio").value, avatar_url: document.getElementById("gpAvUrl").value, avatar_color: document.getElementById("gpColor").value }) });
  toast((await r.json()).message || "Xəta", !r.ok); closeModal("groupProfileModal"); pollRoom();
}
async function kickMember(u) { await fetch(`/api/rooms/${activeRoomCode}/kick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u }) }); closeModal("groupProfileModal"); pollRoom(); }
async function exitGroupPermanent() { await fetch(`/api/rooms/${activeRoomCode}/leave`, { method: "POST" }); closeModal("groupProfileModal"); leaveRoomView(); }

/* Telegram DM */
async function loadDmChats() {
  if (!me.authenticated) { document.getElementById("dmChatsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/dm/chats")).json();
  document.getElementById("dmChatsList").innerHTML = list.length ? list.map(c => `<div style="padding:8px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openDmWith('${esc(c.username)}')">${renderName(c.username, c.is_admin_user)}<div class="muted" style="font-size:.76rem;">${esc(c.last_message)}</div></div>`).join("") : `<div class="muted" style="font-size:.82rem;">Söhbət yoxdur.</div>`;
}
function openDmWith(user) {
  const u = String(user || "").trim(); if (!u) return;
  activeDmPartner = u; lastDmMsgId = 0; dmReplyId = null; document.getElementById("dmChatBox").innerHTML = "";
  document.getElementById("dmPartnerTitle").textContent = `✈️ @${u}`;
  pollDm(); clearInterval(dmPollTimer); dmPollTimer = setInterval(() => { if (!document.hidden && activeDmPartner) pollDm(); }, 3000);
}
function replyDmMsg(id, author, text) { dmReplyId = id; document.getElementById("dmReplyText").textContent = `↩ ${author}: ${text.slice(0, 45)}`; document.getElementById("dmReplyBanner").style.display = "flex"; document.getElementById("dmChatInput").focus(); }
function cancelDmReply() { dmReplyId = null; document.getElementById("dmReplyBanner").style.display = "none"; }
async function pollDm() {
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}?after_id=${lastDmMsgId}`); if (!r.ok) return;
  const d = await r.json(), box = document.getElementById("dmChatBox");
  document.getElementById("dmPartnerTitle").innerHTML = `✈️ ${renderName(d.partner, d.partner_is_admin)}`;
  d.messages.forEach(m => {
    lastDmMsgId = Math.max(lastDmMsgId, m.id);
    const mine = m.sender === me.username;
    const div = document.createElement("div"); div.className = `chat-bubble ${mine ? 'mine' : 'theirs'}`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") +
      `<div>${esc(m.message)}</div>` +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem('${esc(m.shared_code || m.shared_problem_id)}')">📘 ${esc(m.shared_code ? m.shared_code + '. ' : '')}${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
      `<div class="chat-meta"><span>${esc((m.created_at || "").slice(11, 16))}</span><button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyDmMsg(${m.id},${JSON.stringify(m.sender)},${JSON.stringify(m.message)})">↩ Cavabla</button></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  });
}
async function sendDm() {
  if (!activeDmPartner) return toast("Söhbət seçin", true);
  const inp = document.getElementById("dmChatInput"); if (!inp.value.trim()) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: inp.value, reply_to_id: dmReplyId }) });
  if (!r.ok) return toast((await r.json()).error, true);
  inp.value = ""; cancelDmReply(); pollDm(); loadDmChats();
}

/* 7. Mağaza & Mini Oyunlar */
async function loadShop() {
  if (!me.authenticated) { document.getElementById("shopGrid").innerHTML = `<div class="card">Mağazadan istifadə üçün daxil olun.</div>`; return; }
  const d = await (await fetch("/api/shop")).json();
  document.getElementById("shopCoins").textContent = d.coins;
  document.getElementById("shopGrid").innerHTML = d.items.map(it => `
    <div class="card shop-card">
      <div class="av-wrap av-lg frame-${it.id}" style="background:var(--primary);">A</div>
      <strong>${esc(it.name)}</strong>
      <span class="muted" style="font-size:.8rem;">${esc(it.desc)}</span>
      ${it.equipped ? `<span class="badge" style="color:var(--success);border-color:var(--success);">✔ Taxılıb</span>` :
        it.owned ? `<button class="btn btn-sm btn-primary" onclick="equipItem('${it.id}')">Tax</button>` :
        `<button class="btn btn-sm btn-success" onclick="buyItem('${it.id}')">🪙 ${it.price} — Al</button>`}
    </div>`).join("");
}
async function buyItem(id) { const r = await fetch("/api/shop/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: id }) }); const d = await r.json(); toast(d.message || d.error, !r.ok); await syncMe(); loadShop(); }
async function equipItem(id) { const r = await fetch("/api/shop/equip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: id }) }); toast((await r.json()).message, !r.ok); await syncMe(); loadShop(); }

async function startSprintGame() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/games/sprint/start", { method: "POST" }); const d = await r.json();
  sprintState = { token: d.token, left: 60, score: 0, ans: 0 };
  clearInterval(sprintState.timer);
  document.getElementById("sprintArea").innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:8px;"><strong>⏱ <span id="spLeft">60</span>s</strong><strong>Xal: <span id="spScore">0</span></strong></div><div id="spQ" style="font-size:1.4rem;font-weight:800;margin:8px 0;"></div><div class="row"><input id="spIn" type="number" style="flex:1;" onkeydown="if(event.key==='Enter') checkSprint()" /><button class="btn btn-primary" onclick="checkSprint()">Cavabla</button></div>`;
  nextSprintQ();
  sprintState.timer = setInterval(() => {
    sprintState.left--; const el = document.getElementById("spLeft"); if (el) el.textContent = sprintState.left;
    if (sprintState.left <= 0) { clearInterval(sprintState.timer); finishSprint(); }
  }, 1000);
}
function nextSprintQ() {
  const a = 2 + Math.floor(Math.random() * 25), b = 2 + Math.floor(Math.random() * 20), op = Math.floor(Math.random() * 3);
  sprintState.ans = op === 0 ? a + b : op === 1 ? a * b : (a + 30) - b;
  document.getElementById("spQ").textContent = op === 0 ? `${a} + ${b} = ?` : op === 1 ? `${a} × ${b} = ?` : `${a + 30} − ${b} = ?`;
  const inp = document.getElementById("spIn"); inp.value = ""; inp.focus();
}
function checkSprint() { const v = Number(document.getElementById("spIn").value); if (v === sprintState.ans) { sprintState.score++; document.getElementById("spScore").textContent = sprintState.score; } nextSprintQ(); }
async function finishSprint() {
  const r = await fetch("/api/games/sprint/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: sprintState.token, score: sprintState.score }) });
  const d = await r.json(); document.getElementById("sprintArea").innerHTML = `<p><strong>${esc(d.message || d.error)}</strong></p><button class="btn btn-primary" onclick="startSprintGame()">Yenidən Oyna</button>`;
  await syncMe();
}

async function startBullsGame() {
  if (!me.authenticated) return openAuthModal();
  bullsGameId = (await (await fetch("/api/games/bulls/start", { method: "POST" })).json()).game_id;
  document.getElementById("bullsArea").innerHTML = `<div class="row" style="margin-bottom:8px;"><input id="bcIn" maxlength="4" placeholder="4 fərqli rəqəm (məs: 1482)" style="flex:1;" onkeydown="if(event.key==='Enter') guessBulls()" /><button class="btn btn-success" onclick="guessBulls()">Yoxla</button></div><div id="bcLog" class="console-out" style="margin-top:0;min-height:90px;">Təxminləriniz burada görünəcək...</div>`;
}
async function guessBulls() {
  const inp = document.getElementById("bcIn"), log = document.getElementById("bcLog");
  const r = await fetch("/api/games/bulls/guess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game_id: bullsGameId, guess: inp.value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  if (d.tries === 1) log.textContent = "";
  log.textContent += `#${d.tries}: ${inp.value} → 🐂 ${d.bulls} Bull, 🐄 ${d.cows} Cow\n`; inp.value = "";
  if (d.won) { log.textContent += `\n🎉 Tapdınız! +${d.xp_gained} XP, +${d.coins_gained} AzCoin!`; await syncMe(); }
  else if (d.lost) log.textContent += `\nBitdi! Gizli ədəd: ${d.answer}`;
}

/* Propose, Submissions, Leaderboard, Creative, Playground, Admin */
function addTestRow(cid) {
  const el = document.createElement("div"); el.className = "card"; el.style.padding = "8px";
  el.innerHTML = `<div class="grid-2"><textarea class="t-in" rows="2" placeholder="Giriş"></textarea><textarea class="t-out" rows="2" placeholder="Çıxış"></textarea></div><div class="row" style="justify-content:space-between;margin-top:4px;"><label style="font-size:.82rem;"><input type="checkbox" class="t-smp" checked style="width:auto;" /> Nümunə</label><button class="btn btn-danger btn-sm" onclick="this.closest('.card').remove()">Sil</button></div>`;
  document.getElementById(cid).appendChild(el);
}
function collectTests(cid) { return [...document.querySelectorAll(`#${cid}>.card`)].map(c => ({ input: c.querySelector(".t-in").value, output: c.querySelector(".t-out").value, is_sample: c.querySelector(".t-smp").checked })); }
async function submitProposal() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("prTitle").value, rating: document.getElementById("prRating").value, tags: document.getElementById("prTags").value, statement: document.getElementById("prStatement").value, input_spec: document.getElementById("prInputSpec").value, output_spec: document.getElementById("prOutputSpec").value, editorial: document.getElementById("prEditorial").value, author_lang: document.getElementById("prLang").value, author_code: document.getElementById("prCode").value, tests: collectTests("prTestsContainer") }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) loadMyProposals();
}
async function loadMyProposals() {
  if (!me.authenticated) { document.getElementById("myProposalsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/my-proposals")).json();
  document.getElementById("myProposalsList").innerHTML = list.length ? list.map(x => `<div style="padding:6px 0;border-bottom:1px solid var(--border);"><strong>${esc(x.title)}</strong> <span class="badge">${esc(x.visibility)}</span> ${x.awarded_xp ? `(+${x.awarded_xp} XP)` : ""} ${x.reject_reason ? `<span class="muted">(${esc(x.reject_reason)})</span>` : ""}</div>`).join("") : "Yoxdur.";
}
async function loadSubmissions() {
  const u = (document.getElementById("subFilter").value === "mine" && me.username) ? `?username=${encodeURIComponent(me.username)}` : "";
  submissionsCache = await (await fetch("/api/submissions" + u)).json();
  document.getElementById("submissionsTableBody").innerHTML = submissionsCache.length ? submissionsCache.map((s, i) => `<tr class="clickable" onclick="openSubModal(${i})"><td>#${s.id}</td><td>${renderName(s.username, s.is_admin_user)}</td><td>${esc(s.problem_title)}</td><td>${esc(s.language)}</td><td style="font-weight:700;color:${s.verdict === 'Accepted' ? 'var(--success)' : 'var(--danger)'}">${esc(s.verdict)}</td><td>${s.passed_tests}/${s.total_tests}</td><td>${esc(s.exec_time)}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">Yoxdur.</td></tr>`;
}
function openSubModal(i) { const s = submissionsCache[i]; document.getElementById("modalTitle").textContent = `#${s.id} — ${s.problem_title}`; document.getElementById("modalMeta").textContent = `${s.username} | ${s.verdict} | ${s.exec_time}`; document.getElementById("modalPre").textContent = s.details || "Əlavə məlumat yoxdur."; document.getElementById("detailModal").classList.add("open"); }
async function loadLeaderboard() {
  const rows = await (await fetch("/api/leaderboard")).json();
  document.getElementById("leaderboardBody").innerHTML = rows.map((u, i) => `<tr class="clickable" onclick="openFullProfile('${esc(u.username)}')"><td><strong>#${i + 1}</strong></td><td>${renderName(u.username, u.is_admin_user)}</td><td><span class="badge">Lv.${u.level}</span></td><td>${u.xp}/${u.needed_xp} (${u.total_xp})</td><td>${u.rating}</td><td>🔥 ${u.daily_streak}</td><td>${u.solved_count}</td></tr>`).join("");
}
async function loadCreative() {
  const list = await (await fetch("/api/creative")).json(); window._cr = list;
  document.getElementById("creativeGrid").innerHTML = list.map((c, i) => `<div class="card"><strong>${esc(c.title)}</strong> <span class="badge">${esc(c.language)}</span><div class="muted" style="font-size:.78rem;">${renderName(c.author, c.is_admin_user)}</div><p class="muted" style="font-size:.84rem;">${esc(c.description)}</p><pre class="console-out" style="max-height:110px;">${esc(c.code)}</pre><button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="runCr(${i})">▶ Playground</button></div>`).join("");
}
function runCr(i) { const c = window._cr[i]; switchTab("playground"); document.getElementById("pgLang").value = c.language; onPgLangChange(); setPgCode(c.code); document.getElementById("pgStdin").value = c.sample_input || ""; runPlayground(); }
async function createCreative() { if (!me.authenticated) return openAuthModal(); const r = await fetch("/api/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("crTitle").value, language: document.getElementById("crLang").value, description: document.getElementById("crDesc").value, code: document.getElementById("crCode").value, sample_input: document.getElementById("crStdin").value }) }); toast((await r.json()).message || "Xəta", !r.ok); if (r.ok) loadCreative(); }
async function runPlayground() { const o = document.getElementById("pgOutput"); o.textContent = "İşə salınır..."; const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: document.getElementById("pgLang").value, code: getPgCode(), stdin: document.getElementById("pgStdin").value }) }); const d = await r.json(); o.textContent = !r.ok || d.ok === false ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`; }

async function loadAdminData() {
  if (!window.__ADMIN_PORTAL__) return;
  const [pr, sr] = await Promise.all([fetch("/api/admin/proposals"), fetch("/api/settings")]);
  if (pr.ok) {
    const props = await pr.json();
    document.getElementById("adminProposalsBox").innerHTML = props.length ? props.map(p => `<div class="card" style="background:rgba(7,10,16,.7);"><strong>${esc(p.title)}</strong> (@${esc(p.author)} · ${p.rating} · ${esc(p.author_check_status)})<p style="font-size:.84rem;">${esc(p.statement)}</p><div class="row"><input id="xpV-${p.id}" type="number" value="150" style="width:100px;" /><select id="visV-${p.id}" style="width:120px;"><option value="archive">Arxiv</option><option value="gym">Gym</option></select><button class="btn btn-success btn-sm" onclick="reviewProp(${p.id},'approve')">Təsdiqlə</button><button class="btn btn-danger btn-sm" onclick="reviewProp(${p.id},'reject')">Rədd</button></div></div>`).join("") : "Gözləyən sual yoxdur.";
  }
  if (sr.ok) { const cfg = await sr.json(); document.getElementById("cfgProvider").value = cfg.provider; document.getElementById("cfgBaseUrl").value = cfg.base_url; }
}
async function reviewProp(pid, action) { const r = await fetch(`/api/admin/proposals/${pid}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, xp_reward: document.getElementById(`xpV-${pid}`).value, visibility: document.getElementById(`visV-${pid}`).value }) }); toast((await r.json()).message || "Xəta", !r.ok); loadAdminData(); }
async function adminCreateContest() { const pids = document.getElementById("adConPids").value.split(",").map(x => x.trim()).filter(Boolean); const r = await fetch("/api/contests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("adConTitle").value, duration_min: document.getElementById("adConDur").value, problem_ids: pids }) }); toast((await r.json()).message || "Xəta", !r.ok); }
async function saveSettings() { const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: document.getElementById("cfgProvider").value, base_url: document.getElementById("cfgBaseUrl").value, api_key: document.getElementById("cfgApiKey").value }) }); toast((await r.json()).message || "Xəta", !r.ok); }
async function testConnection() { const o = document.getElementById("testConnOut"); o.style.display = "block"; o.textContent = "Yoxlanılır..."; o.textContent = JSON.stringify(await (await fetch("/api/test-connection", { method: "POST" })).json(), null, 2); }
async function adminCreateProblem() { const r = await fetch("/api/problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("npTitle").value, code_label: document.getElementById("npCodeLbl").value, rating: document.getElementById("npRating").value, tags: document.getElementById("npTags").value, statement: document.getElementById("npStatement").value, input_spec: document.getElementById("npIn").value, output_spec: document.getElementById("npOut").value, tests: collectTests("npTestsContainer") }) }); toast((await r.json()).message || "Xəta", !r.ok); }

window.addEventListener("DOMContentLoaded", async () => {
  initEditors(); addTestRow("prTestsContainer"); if (document.getElementById("npTestsContainer")) addTestRow("npTestsContainer");
  await syncMe(); checkHumanGate();
  const pid = new URLSearchParams(location.search).get("problem");
  if (window.__ADMIN_PORTAL__) switchTab("admin");
  else if (pid) openProblem(pid);
  else if (!me.authenticated && me.guest_remaining_sec === null) switchTab("welcome");
  else switchTab("announcements");
});
