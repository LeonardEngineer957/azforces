let me = { authenticated: false, username: null, is_admin: false, human_verified: false };
let allProblems = [], currentProblem = null, solveCM = null, pgCM = null;
let submissionsCache = [], forwardPid = null;
let activeRoomCode = "", roomPollTimer = null, lastRoomMsgId = 0, roomReplyId = null;
let activeDmPartner = "", dmPollTimer = null, lastDmMsgId = 0, dmReplyId = null;

const TEMPLATES = {
  python: "# Kodunuzu bura yazın\n",
  cpp: "#include <iostream>\nusing namespace std;\nint main() {\n    return 0;\n}\n",
  c: "#include <stdio.h>\nint main() {\n    return 0;\n}\n",
  java: "import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n",
  javascript: "const fs = require('fs');\nconsole.log(fs.readFileSync(0, 'utf8').trim());\n"
};

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtStmt(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function renderMath(el) { if (typeof renderMathInElement === "function") renderMathInElement(el, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false }); }
function toast(msg, err = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.borderColor = err ? "var(--danger)" : "var(--primary)";
  t.style.display = "block";
  clearTimeout(window._tt);
  window._tt = setTimeout(() => { t.style.display = "none"; }, 3400);
}
function cmMode(l) { return l === "python" ? "python" : l === "javascript" ? "javascript" : l === "cpp" ? "text/x-c++src" : l === "c" ? "text/x-csrc" : "text/x-java"; }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function copyText(txt, msg = "Kopyalandı!") { navigator.clipboard?.writeText(txt).then(() => toast(msg)).catch(() => toast("Kopyalama alınmadı", true)); }

/* 1. İnsan Doğrulaması */
async function checkHumanGate() {
  if (me.human_verified) { document.getElementById("humanGate").style.display = "none"; return; }
  document.getElementById("humanGate").style.display = "flex";
}
async function verifyHuman() {
  const icon = document.getElementById("humanBoxIcon"), st = document.getElementById("humanStatusText");
  icon.className = "human-square spinning";
  st.textContent = "Yoxlanılır...";
  try {
    const cr = await fetch("/api/human-challenge");
    const cd = await cr.json();
    await new Promise(r => setTimeout(r, 450));
    const vr = await fetch("/api/human-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge_token: cd.challenge_token }) });
    if (!vr.ok) { icon.className = "human-square"; st.textContent = "Yenidən klikləyin"; return; }
    icon.className = "human-square checked"; icon.textContent = "✔"; st.textContent = "Təsdiqləndi!";
    setTimeout(() => { document.getElementById("humanGate").style.display = "none"; }, 350);
  } catch { icon.className = "human-square"; st.textContent = "Şəbəkə xətası"; }
}

/* Drawers */
function toggleLeftDrawer(force) {
  const d = document.getElementById("leftDrawer"), b = document.getElementById("leftBackdrop");
  const open = force !== undefined ? force : !d.classList.contains("open");
  d.classList.toggle("open", open); b.classList.toggle("open", open);
}
function toggleProfileDrawer(force) {
  const d = document.getElementById("profileDrawer"), b = document.getElementById("rightBackdrop");
  const open = force !== undefined ? force : !d.classList.contains("open");
  d.classList.toggle("open", open); b.classList.toggle("open", open);
}

function switchTab(tab) {
  toggleLeftDrawer(false);
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".drawer-item").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  const nav = document.querySelector(`.drawer-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add("active");

  if (tab === "announcements") loadPosts();
  if (tab === "problems") loadProblems("archive");
  if (tab === "gym") loadGym();
  if (tab === "contests") loadContests();
  if (tab === "chat") { loadMyRooms(); loadRoomProblemsPicker(); loadDmChats(); }
  if (tab === "propose") loadMyProposals();
  if (tab === "submissions") loadSubmissions();
  if (tab === "leaderboard") loadLeaderboard();
  if (tab === "creative") loadCreative();
  if (tab === "playground" && pgCM) setTimeout(() => pgCM.refresh(), 50);
  if (tab === "admin" && me.is_admin) loadAdminData();
}

/* 2. Auth & Profil */
async function syncMe() {
  const r = await fetch("/api/auth/me");
  me = await r.json();
  const pb = document.getElementById("hdrProfileBtn"), ab = document.getElementById("hdrAuthBtn");
  if (me.authenticated) {
    pb.style.display = "inline-flex"; ab.style.display = "none";
    document.getElementById("hdrUserName").textContent = me.username;
    document.getElementById("hdrUserLvl").textContent = `Səv. ${me.level} · ${me.xp}/${me.needed_xp} XP`;
    const c = document.getElementById("hdrAvatarCircle");
    c.textContent = me.username[0]; c.style.background = me.avatar_color || "#3b82f6";
  } else {
    pb.style.display = "none"; ab.style.display = "inline-flex";
  }
  document.getElementById("navAdminBtn").style.display = me.is_admin ? "block" : "none";
  document.getElementById("pinAnnWrap").style.display = me.is_admin ? "flex" : "none";
  document.getElementById("deleteProblemBtn").style.display = me.is_admin ? "inline-flex" : "none";
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
  const d = await r.json();
  if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); document.getElementById("liPass").value = "";
  await syncMe(); loadPosts(); toast(d.message);
}
async function sendRegCode() {
  const btn = document.getElementById("sendCodeBtn"); btn.disabled = true;
  const r = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: document.getElementById("rgUser").value, email: document.getElementById("rgEmail").value, password: document.getElementById("rgPass").value }) });
  btn.disabled = false;
  const d = await r.json();
  if (!r.ok) return toast(d.error, true);
  document.getElementById("regCodeWrap").style.display = "block";
  toast(d.dev_code ? `Test kodu: ${d.dev_code}` : d.message);
}
async function doRegister() {
  const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: document.getElementById("rgUser").value, email: document.getElementById("rgEmail").value, password: document.getElementById("rgPass").value, code: document.getElementById("rgCode").value }) });
  const d = await r.json();
  if (!r.ok) return toast(d.error, true);
  closeModal("authModal"); await syncMe(); toast(d.message);
}
async function logoutAll() {
  await fetch("/api/auth/logout", { method: "POST" });
  toggleProfileDrawer(false); await syncMe(); switchTab("announcements"); toast("Hesabdan çıxdınız");
}

async function openProfileDrawer() {
  if (!me.authenticated) return openAuthModal();
  toggleProfileDrawer(true);
  const r = await fetch("/api/profile");
  if (!r.ok) return;
  const p = await r.json();
  const av = document.getElementById("profAvatar");
  av.textContent = p.username[0]; av.style.background = p.avatar_color;
  document.getElementById("profName").textContent = p.username;
  document.getElementById("profEmail").textContent = p.email;
  document.getElementById("profLvlLabel").textContent = `Səviyyə ${p.level}`;
  document.getElementById("profXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  document.getElementById("profXpFill").style.width = `${p.progress_pct}%`;
  document.getElementById("profTotalXp").textContent = `Ümumi qazanılan: ${p.total_xp} XP (Növbəti səviyyədə XP sıfırlanır)`;
  document.getElementById("profStreak").textContent = p.streak;
  document.getElementById("profSolved").textContent = p.solved_count;
  document.getElementById("profBioInput").value = p.bio || "";
  document.getElementById("profColorInput").value = p.avatar_color || "#3b82f6";

  document.getElementById("profIncomingReqs").innerHTML = p.incoming_requests.map(u => `
    <div class="row" style="justify-content:space-between;font-size:.82rem;margin-bottom:4px;">
      <span><strong>${esc(u)}</strong> dostluq istəyir</span>
      <span class="row"><button class="btn btn-sm btn-success" onclick="respondFriend('${esc(u)}','accept')">✔</button><button class="btn btn-sm btn-danger" onclick="respondFriend('${esc(u)}','reject')">✕</button></span>
    </div>`).join("");

  document.getElementById("profFriendsList").innerHTML = p.friends.length ? p.friends.map(f => `
    <div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:.84rem;">
      <span><strong>${esc(f.username)}</strong> <span class="muted">· Səv.${f.level} · 🔥${f.streak}</span></span>
      <button class="btn btn-sm btn-primary" onclick="toggleProfileDrawer(false);switchTab('chat');switchChatMode('dm');openDmWith('${esc(f.username)}')">💬 Yaz</button>
    </div>`).join("") : `<div class="muted" style="font-size:.82rem;">Hələ dostunuz yoxdur.</div>`;

  document.getElementById("profRecentSolved").innerHTML = p.recent_solved.length ? p.recent_solved.map(s => `
    <div style="font-size:.82rem;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="toggleProfileDrawer(false);openProblem(${s.id})">
      ✔ <strong>${esc(s.code_label || s.id)}. ${esc(s.title)}</strong> <span class="muted">(${s.rating})</span>
    </div>`).join("") : `<div class="muted" style="font-size:.82rem;">Hələ həll edilmiş sual yoxdur.</div>`;
}
async function saveProfileBio() {
  const r = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: document.getElementById("profBioInput").value, avatar_color: document.getElementById("profColorInput").value }) });
  if (r.ok) { await syncMe(); openProfileDrawer(); toast("Profil yeniləndi!"); }
}
async function sendFriendRequest() {
  const inp = document.getElementById("addFriendInput");
  const r = await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: inp.value }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); if (r.ok) inp.value = "";
}
async function respondFriend(username, action) {
  await fetch("/api/friends/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, action }) });
  openProfileDrawer();
}

/* 3. Duyuru Panosu */
function togglePostForm() { if (!me.authenticated) return openAuthModal(); const f = document.getElementById("postFormBox"); f.style.display = f.style.display === "none" ? "block" : "none"; }
async function createPost() {
  const opts = document.getElementById("postPollOpts").value.split(",").map(s => s.trim()).filter(Boolean);
  const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("postTitle").value, body: document.getElementById("postBody").value, poll_options: opts, is_announcement: document.getElementById("postIsAnn")?.checked }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  document.getElementById("postTitle").value = ""; document.getElementById("postBody").value = ""; document.getElementById("postPollOpts").value = "";
  togglePostForm(); loadPosts();
}
async function loadPosts() {
  const r = await fetch("/api/posts"); const posts = await r.json();
  document.getElementById("postsList").innerHTML = posts.map(p => `
    <div class="card post-card ${p.is_pinned ? 'pinned' : ''}">
      <div class="row" style="justify-content:space-between;">
        <strong>${p.is_pinned ? '📌 ' : ''}${esc(p.title)}</strong>
        <span class="muted" style="font-size:.8rem;">@${esc(p.author)} · ${esc(p.created_at)} ${me.is_admin ? `<button class="btn btn-sm btn-danger" onclick="deletePost(${p.id})">Sil</button>` : ''}</span>
      </div>
      <p style="margin:8px 0;white-space:pre-wrap;">${esc(p.body)}</p>
      ${p.poll_options.map((o, i) => { const pct = p.total_votes ? Math.round(o.votes * 100 / p.total_votes) : 0; return `<div class="poll-opt ${p.my_vote === i ? 'voted' : ''}" onclick="votePoll(${p.id},${i})"><div class="poll-bar" style="width:${pct}%"></div><div class="poll-txt"><span>${esc(o.text)}</span><span>${o.votes} (${pct}%)</span></div></div>`; }).join("")}
      <div class="row" style="margin-top:10px;">${p.reactions.map(rx => `<button class="react-btn ${rx.mine ? 'mine' : ''}" onclick="reactPost(${p.id},'${rx.emoji}')">${rx.emoji} ${rx.count}</button>`).join("")}</div>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">
        ${p.comments.map(c => `<div class="comment-item ${c.parent_id ? 'comment-reply' : ''}"><strong>@${esc(c.author)}:</strong> ${esc(c.body)} <button class="btn btn-sm" style="padding:1px 6px;font-size:.72rem;" onclick="replyComment(${p.id},${c.id},'${esc(c.author)}')">Cavabla</button></div>`).join("")}
        <div class="row" style="margin-top:8px;"><input id="cmtIn-${p.id}" placeholder="Şərh yaz..." style="flex:1;" /><input id="cmtPar-${p.id}" type="hidden" /><button class="btn btn-sm btn-primary" onclick="sendComment(${p.id})">Yaz</button></div>
      </div>
    </div>`).join("");
}
async function votePoll(pid, idx) { if (!me.authenticated) return openAuthModal(); await fetch(`/api/posts/${pid}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_index: idx }) }); loadPosts(); }
async function reactPost(pid, emoji) { if (!me.authenticated) return openAuthModal(); await fetch(`/api/posts/${pid}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }); loadPosts(); }
function replyComment(pid, cid, author) { document.getElementById(`cmtPar-${pid}`).value = cid; const i = document.getElementById(`cmtIn-${pid}`); i.placeholder = `@${author} cavab...`; i.focus(); }
async function sendComment(pid) { if (!me.authenticated) return openAuthModal(); const i = document.getElementById(`cmtIn-${pid}`), par = document.getElementById(`cmtPar-${pid}`).value; const r = await fetch(`/api/posts/${pid}/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: i.value, parent_id: par || null }) }); if (r.ok) loadPosts(); else toast((await r.json()).error, true); }
async function deletePost(pid) { await fetch(`/api/posts/${pid}`, { method: "DELETE" }); loadPosts(); }

/* 4. Problems, Gym, Contests & Forward */
async function loadProblems(v = "archive") { allProblems = await (await fetch(`/api/problems?view=${v}`)).json(); renderProblemsTable(); }
function renderProblemsTable() {
  const q = (document.getElementById("problemSearch").value || "").toLowerCase(), hide = document.getElementById("hideTagsToggle").checked;
  const rows = allProblems.filter(p => p.title.toLowerCase().includes(q) || (p.tags || "").toLowerCase().includes(q) || (p.code_label || "").toLowerCase().includes(q));
  document.getElementById("problemsTableBody").innerHTML = rows.length ? rows.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem(${p.id})"><td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td><td>${hide ? '<span class="muted">gizli</span>' : (p.tags || "").split(",").map(t => `<span class="tag-pill">${esc(t.trim())}</span>`).join("")}</td><td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td><td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${JSON.stringify(p.title)})">🔗</button></td></tr>`).join("") : `<tr><td colspan="6" class="muted">Məsələ yoxdur.</td></tr>`;
}
async function loadGym() {
  const list = await (await fetch("/api/problems?view=gym")).json();
  document.getElementById("gymTableBody").innerHTML = list.length ? list.map(p => `<tr class="clickable ${p.solved ? 'solved-row' : ''}" onclick="openProblem(${p.id})"><td><strong>${esc(p.code_label || p.id)}</strong></td><td><strong>${esc(p.title)}</strong></td><td>${esc(p.tags)}</td><td><span class="badge">${p.rating}</span></td><td class="muted">👤 x${p.solved_count || 0}</td><td><button class="btn btn-sm" onclick="event.stopPropagation();shareProblemLink(${p.id},${JSON.stringify(p.title)})">🔗</button></td></tr>`).join("") : `<tr><td colspan="6" class="muted">Hələ bitmiş yarış məsələsi yoxdur.</td></tr>`;
}
async function openProblem(pid) {
  const r = await fetch(`/api/problems/${pid}`), p = await r.json(); if (!r.ok) return toast(p.error, true);
  currentProblem = p; switchTab("problems");
  document.getElementById("problemListView").style.display = "none"; document.getElementById("problemSolveView").style.display = "block";
  document.getElementById("solveResultBox").style.display = "none";
  document.getElementById("probTitle").textContent = `${p.code_label ? p.code_label + '. ' : ''}${p.title}`;
  document.getElementById("probLimits").textContent = `time limit: ${p.time_limit}s | memory limit: ${p.memory_limit} MB`;
  document.getElementById("probAuthorMeta").textContent = `Müəllif: ${p.author} | Reytinq: ${p.rating}`;
  const st = document.getElementById("probStatement"), ins = document.getElementById("probInputSpec"), out = document.getElementById("probOutputSpec");
  st.innerHTML = fmtStmt(p.statement); renderMath(st); ins.innerHTML = fmtStmt(p.input_spec || "—"); renderMath(ins); out.innerHTML = fmtStmt(p.output_spec || "—"); renderMath(out);
  document.getElementById("probNoteWrap").style.display = p.note ? "block" : "none"; if (p.note) { const n = document.getElementById("probNote"); n.innerHTML = fmtStmt(p.note); renderMath(n); }
  document.getElementById("probEditorialWrap").style.display = p.editorial ? "block" : "none"; if (p.editorial) { const e = document.getElementById("probEditorial"); e.innerHTML = fmtStmt(p.editorial); renderMath(e); }
  document.getElementById("probSamples").innerHTML = (p.samples || []).map((s, i) => `<div class="sample-box"><div class="sample-head"><span>Nümunə #${i + 1}</span><button class="btn btn-sm" onclick="copyText(currentProblem.samples[${i}].input_data,'Giriş kopyalandı')">Kopyala</button></div><div class="sample-grid"><pre>${esc(s.input_data)}</pre><pre>${esc(s.expected_output)}</pre></div></div>`).join("");
  document.getElementById("solveLang").value = "python"; if (solveCM) solveCM.setOption("mode", "python");
  setSolveCode(p.starter_code || TEMPLATES.python);
  document.getElementById("solveStdin").value = (p.samples && p.samples[0]) ? p.samples[0].input_data : "";
}
function backToProblemList() { document.getElementById("problemSolveView").style.display = "none"; document.getElementById("problemListView").style.display = "block"; loadProblems("archive"); }
function shareProblemLink(pid, title) {
  const url = `${location.origin}/?problem=${pid}`;
  if (navigator.share) navigator.share({ title: `AzForces: ${title}`, url }).catch(() => copyText(url, "Link kopyalandı!"));
  else copyText(url, "Məsələ linki kopyalandı!");
}
async function openForwardModal(pid) {
  if (!me.authenticated) return openAuthModal();
  forwardPid = pid; document.getElementById("forwardModal").classList.add("open");
  const list = await (await fetch("/api/rooms/mine")).json();
  document.getElementById("fwdGroupsBox").innerHTML = list.length ? `<label class="muted" style="font-size:.82rem;">Qrupa yönləndir:</label>` + list.map(g => `<button class="btn btn-sm" style="margin:4px 4px 0 0;" onclick="forwardProblemToRoom('${g.room_code}')">👥 ${esc(g.title)}</button>`).join("") : `<span class="muted" style="font-size:.82rem;">Qoşulduğunuz qrup yoxdur.</span>`;
}
async function forwardProblemToRoom(code) { await fetch(`/api/rooms/${code}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ yönləndirdi:", shared_problem_id: forwardPid }) }); closeModal("forwardModal"); toast("Qrupa göndərildi!"); }
async function forwardProblemToDm() { const u = document.getElementById("fwdDmUser").value.trim(); if (!u) return; const r = await fetch(`/api/dm/${encodeURIComponent(u)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Məsələ göndərdi:", shared_problem_id: forwardPid }) }); closeModal("forwardModal"); toast(r.ok ? "Dosta göndərildi!" : "İstifadəçi tapılmadı", !r.ok); }

/* CodeMirror & Run/Submit */
function initEditors() {
  if (typeof CodeMirror !== "undefined") {
    solveCM = CodeMirror.fromTextArea(document.getElementById("solveEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
    pgCM = CodeMirror.fromTextArea(document.getElementById("pgEditorTextarea"), { mode: "python", theme: "material-darker", lineNumbers: true });
    setPgCode("print('Salam AzForces!')\n");
  }
}
function getSolveCode() { return solveCM ? solveCM.getValue() : document.getElementById("solveEditorTextarea").value; }
function setSolveCode(v) { if (solveCM) { solveCM.setValue(v); setTimeout(() => solveCM.refresh(), 40); } else document.getElementById("solveEditorTextarea").value = v; }
function getPgCode() { return pgCM ? pgCM.getValue() : document.getElementById("pgEditorTextarea").value; }
function setPgCode(v) { if (pgCM) { pgCM.setValue(v); setTimeout(() => pgCM.refresh(), 40); } else document.getElementById("pgEditorTextarea").value = v; }
function onSolveLangChange() { if (solveCM) solveCM.setOption("mode", cmMode(document.getElementById("solveLang").value)); }
function onPgLangChange() { if (pgCM) pgCM.setOption("mode", cmMode(document.getElementById("pgLang").value)); }
function resetStarterCode() { const l = document.getElementById("solveLang").value; setSolveCode((l === "python" && currentProblem?.starter_code) ? currentProblem.starter_code : (TEMPLATES[l] || "")); }

async function runSolveCode() {
  const b = document.getElementById("solveResultBox"); b.style.display = "block"; b.textContent = "İşə salınır...";
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: document.getElementById("solveLang").value, code: getSolveCode(), stdin: document.getElementById("solveStdin").value, time_limit: currentProblem?.time_limit || 3 }) });
  const d = await r.json(); b.textContent = !r.ok || d.ok === false ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`;
}
async function submitSolution() {
  if (!me.authenticated) return openAuthModal();
  const b = document.getElementById("solveResultBox"); b.style.display = "block"; b.textContent = "Yoxlanılır...";
  const r = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ problem_id: currentProblem.id, language: document.getElementById("solveLang").value, code: getSolveCode(), room_id: window._activeRoomId || null }) });
  const d = await r.json(); if (!r.ok) { b.textContent = d.error || "Xəta"; return; }
  b.textContent = `Nəticə: ${d.verdict} (${d.passed}/${d.total}) | Vaxt: ${d.time}\n${d.xp_gained ? `+${d.xp_gained} XP qazandınız!\n` : ""}${d.details || ""}`;
  await syncMe(); toast(d.verdict === "Accepted" ? "Accepted!" : d.verdict, d.verdict !== "Accepted");
}
async function deleteCurrentProblem() { if (!confirm("Silinsin?")) return; if ((await fetch(`/api/problems/${currentProblem.id}`, { method: "DELETE" })).ok) { toast("Silindi"); backToProblemList(); } }

/* Contests */
async function loadContests() {
  const list = await (await fetch("/api/contests")).json();
  document.getElementById("contestsList").innerHTML = list.length ? list.map(c => `<div class="card" style="background:var(--bg);"><div class="row" style="justify-content:space-between;"><strong>${esc(c.title)}</strong><span class="badge">${c.status === "active" ? "Aktiv" : "Bitib (Gym)"}</span></div><div style="margin-top:8px;">${c.problems.map(p => `<button class="btn btn-sm" style="margin:3px;" onclick="openProblem(${p.id})">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div>${me.is_admin && c.status === "active" ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;" onclick="finishContest(${c.id})">Bitir & Gym-ə Köçür</button>` : ""}</div>`).join("") : `<p class="muted">Yarış yoxdur.</p>`;
}
async function finishContest(cid) { await fetch(`/api/contests/${cid}/finish`, { method: "POST" }); toast("Gym-ə köçürüldü!"); loadContests(); }

/* 5. WhatsApp Qruplar & Telegram DM */
function switchChatMode(mode) {
  document.getElementById("chatGroupsPane").style.display = mode === "groups" ? "block" : "none";
  document.getElementById("chatDmPane").style.display = mode === "dm" ? "block" : "none";
  document.getElementById("subTabGroupsBtn").className = mode === "groups" ? "btn btn-primary btn-sm" : "btn btn-sm";
  document.getElementById("subTabDmBtn").className = mode === "dm" ? "btn btn-primary btn-sm" : "btn btn-sm";
  if (mode === "dm") loadDmChats();
}
async function loadMyRooms() {
  if (!me.authenticated) { document.getElementById("myRoomsList").textContent = "Görmək üçün daxil olun."; return; }
  const list = await (await fetch("/api/rooms/mine")).json();
  document.getElementById("myRoomsList").innerHTML = list.length ? list.map(r => `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="enterRoom('${r.room_code}')"><div><strong>${esc(r.title)}</strong><div class="muted" style="font-size:.78rem;">${esc(r.bio)}</div></div><span class="badge">${r.member_count}/20</span></div>`).join("") : `<div class="muted">Hələ qrupunuz yoxdur.</div>`;
}
async function loadRoomProblemsPicker() {
  const list = await (await fetch("/api/problems?view=archive")).json();
  document.getElementById("crRoomProblemsList").innerHTML = list.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:.84rem;margin-bottom:4px;"><input type="checkbox" class="rm-pchk" value="${p.id}" style="width:auto;" /> ${esc(p.code_label || p.id)}. ${esc(p.title)}</label>`).join("");
}
async function createRoom() {
  if (!me.authenticated) return openAuthModal();
  const pids = [...document.querySelectorAll(".rm-pchk:checked")].map(x => Number(x.value));
  const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("crRoomTitle").value, bio: document.getElementById("crRoomBio").value, duration_min: document.getElementById("crRoomDur").value || 0, voice_link: document.getElementById("crRoomVoice").value, problem_ids: pids }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  enterRoom(d.room_code);
}
async function joinRoom() {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch("/api/rooms/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room_code: document.getElementById("joinRoomCode").value }) });
  const d = await r.json(); if (!r.ok) return toast(d.error, true);
  enterRoom(d.room_code);
}
function enterRoom(code) {
  activeRoomCode = code; lastRoomMsgId = 0; roomReplyId = null; document.getElementById("rmChatBox").innerHTML = "";
  document.getElementById("roomLobbyView").style.display = "none"; document.getElementById("roomActiveView").style.display = "block";
  pollRoom(); clearInterval(roomPollTimer); roomPollTimer = setInterval(() => { if (!document.hidden && activeRoomCode) pollRoom(); }, 3000);
}
function leaveRoomView() { activeRoomCode = ""; window._activeRoomId = null; clearInterval(roomPollTimer); document.getElementById("roomActiveView").style.display = "none"; document.getElementById("roomLobbyView").style.display = "grid"; loadMyRooms(); }
function copyRoomCode() { copyText(activeRoomCode, "16 rəqəmli kod kopyalandı!"); }
async function editRoomBio() { const b = prompt("Yeni qrup biosu:", document.getElementById("rmBio").textContent); if (b !== null) { await fetch(`/api/rooms/${activeRoomCode}/bio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: b }) }); pollRoom(); } }
function replyRoomMsg(id, author, text) { roomReplyId = id; document.getElementById("rmReplyText").textContent = `↩ ${author}: ${text.slice(0, 45)}`; document.getElementById("rmReplyBanner").style.display = "flex"; document.getElementById("rmChatInput").focus(); }
function cancelRoomReply() { roomReplyId = null; document.getElementById("rmReplyBanner").style.display = "none"; }
async function pollRoom() {
  const r = await fetch(`/api/rooms/${activeRoomCode}/state?after_id=${lastRoomMsgId}`); if (!r.ok) return;
  const d = await r.json(); window._activeRoomId = d.room.id;
  document.getElementById("rmTitle").textContent = d.room.title; document.getElementById("rmBio").textContent = d.room.bio;
  document.getElementById("rmCodeText").textContent = d.room.room_code.replace(/(.{4})/g, "$1-").slice(0, -1);
  document.getElementById("rmMemCount").textContent = d.members.length;
  document.getElementById("rmTimerWrap").textContent = d.room.remaining_sec >= 0 ? ` · ⏱ ${Math.floor(d.room.remaining_sec / 60)} dəq` : "";
  document.getElementById("rmEditBioBtn").style.display = d.room.creator === me.username ? "inline-flex" : "none";
  const vb = document.getElementById("rmVoiceBtn"); vb.style.display = d.room.voice_link ? "inline-flex" : "none"; if (d.room.voice_link) vb.href = d.room.voice_link;
  document.getElementById("rmProblemsCard").style.display = d.problems.length ? "block" : "none";
  document.getElementById("rmProblemsList").innerHTML = d.problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="openProblem(${p.id})">${esc(p.code_label || p.id)}. ${esc(p.title)}</button>`).join("");
  document.getElementById("rmStandingsBody").innerHTML = d.standings.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.username)}</td><td>${s.solved}</td></tr>`).join("");
  document.getElementById("rmMembersList").innerHTML = d.members.map(m => `<span class="badge">${esc(m)}</span>`).join("");
  const box = document.getElementById("rmChatBox");
  d.messages.forEach(m => {
    lastRoomMsgId = Math.max(lastRoomMsgId, m.id);
    const mine = m.username === me.username;
    const div = document.createElement("div"); div.className = `chat-bubble ${mine ? 'mine' : 'theirs'}`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") +
      `<div><strong>${esc(m.username)}:</strong> ${esc(m.message)}</div>` +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem(${m.shared_problem_id})">📘 ${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
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

/* Telegram DM */
async function loadDmChats() {
  if (!me.authenticated) { document.getElementById("dmChatsList").textContent = "Daxil olun."; return; }
  const list = await (await fetch("/api/dm/chats")).json();
  document.getElementById("dmChatsList").innerHTML = list.length ? list.map(c => `<div style="padding:8px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openDmWith('${esc(c.username)}')"><strong>${esc(c.username)}</strong><div class="muted" style="font-size:.78rem;">${esc(c.last_message)}</div></div>`).join("") : `<div class="muted" style="font-size:.84rem;">Hələ söhbət yoxdur.</div>`;
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
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}?after_id=${lastDmMsgId}`); if (!r.ok) return toast((await r.json()).error, true);
  const d = await r.json(), box = document.getElementById("dmChatBox");
  d.messages.forEach(m => {
    lastDmMsgId = Math.max(lastDmMsgId, m.id);
    const mine = m.sender === me.username;
    const div = document.createElement("div"); div.className = `chat-bubble ${mine ? 'mine' : 'theirs'}`;
    div.innerHTML = (m.reply_author ? `<div class="chat-reply-quote"><strong>${esc(m.reply_author)}:</strong> ${esc(m.reply_text || "")}</div>` : "") +
      `<div>${esc(m.message)}</div>` +
      (m.shared_problem_id ? `<button class="btn btn-sm btn-primary" style="margin-top:5px;" onclick="openProblem(${m.shared_problem_id})">📘 ${esc(m.shared_problem_title || "Məsələni aç")}</button>` : "") +
      `<div class="chat-meta"><span>${esc((m.created_at || "").slice(11, 16))}</span><button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyDmMsg(${m.id},${JSON.stringify(m.sender)},${JSON.stringify(m.message)})">↩ Cavabla</button></div>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
  });
}
async function sendDm() {
  if (!activeDmPartner) return toast("Əvvəlcə söhbət açın", true);
  const inp = document.getElementById("dmChatInput"); if (!inp.value.trim()) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: inp.value, reply_to_id: dmReplyId }) });
  if (!r.ok) return toast((await r.json()).error, true);
  inp.value = ""; cancelDmReply(); pollDm(); loadDmChats();
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
  document.getElementById("submissionsTableBody").innerHTML = submissionsCache.length ? submissionsCache.map((s, i) => `<tr class="clickable" onclick="openSubModal(${i})"><td>#${s.id}</td><td>${esc(s.username)}</td><td>${esc(s.problem_title)}</td><td>${esc(s.language)}</td><td style="font-weight:700;color:${s.verdict === 'Accepted' ? 'var(--success)' : 'var(--danger)'}">${esc(s.verdict)}</td><td>${s.passed_tests}/${s.total_tests}</td><td>${esc(s.exec_time)}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">Yoxdur.</td></tr>`;
}
function openSubModal(i) { const s = submissionsCache[i]; document.getElementById("modalTitle").textContent = `#${s.id} — ${s.problem_title}`; document.getElementById("modalMeta").textContent = `${s.username} | ${s.verdict} | ${s.exec_time}`; document.getElementById("modalPre").textContent = s.details || "Əlavə məlumat yoxdur."; document.getElementById("detailModal").classList.add("open"); }
async function loadLeaderboard() {
  const rows = await (await fetch("/api/leaderboard")).json();
  document.getElementById("leaderboardBody").innerHTML = rows.map((u, i) => `<tr><td><strong>#${i + 1}</strong></td><td><strong>${esc(u.username)}</strong></td><td><span class="badge">Səv. ${u.level}</span></td><td>${u.xp}/${u.needed_xp} (${u.total_xp})</td><td>🔥 ${u.daily_streak}</td><td>${u.solved_count}</td></tr>`).join("");
}
async function loadCreative() {
  const list = await (await fetch("/api/creative")).json(); window._cr = list;
  document.getElementById("creativeGrid").innerHTML = list.map((c, i) => `<div class="card"><strong>${esc(c.title)}</strong> <span class="badge">${esc(c.language)}</span><p class="muted" style="font-size:.84rem;">${esc(c.description)}</p><pre class="console-out" style="max-height:120px;">${esc(c.code)}</pre><button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="runCr(${i})">▶ Playground</button></div>`).join("");
}
function runCr(i) { const c = window._cr[i]; switchTab("playground"); document.getElementById("pgLang").value = c.language; onPgLangChange(); setPgCode(c.code); document.getElementById("pgStdin").value = c.sample_input || ""; runPlayground(); }
async function createCreative() { if (!me.authenticated) return openAuthModal(); const r = await fetch("/api/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("crTitle").value, language: document.getElementById("crLang").value, description: document.getElementById("crDesc").value, code: document.getElementById("crCode").value, sample_input: document.getElementById("crStdin").value }) }); toast((await r.json()).message || "Xəta", !r.ok); if (r.ok) loadCreative(); }
async function runPlayground() { const o = document.getElementById("pgOutput"); o.textContent = "İşə salınır..."; const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: document.getElementById("pgLang").value, code: getPgCode(), stdin: document.getElementById("pgStdin").value }) }); const d = await r.json(); o.textContent = !r.ok || d.ok === false ? (d.error || d.stderr) : `[${d.status} | ${d.time || "-"}]\n${d.stdout || ""}${d.stderr ? "\n--- Xəta ---\n" + d.stderr : ""}`; }

async function loadAdminData() {
  const [pr, sr] = await Promise.all([fetch("/api/admin/proposals"), fetch("/api/settings")]);
  if (pr.ok) {
    const props = await pr.json();
    document.getElementById("adminProposalsBox").innerHTML = props.length ? props.map(p => `<div class="card" style="background:var(--bg);"><strong>${esc(p.title)}</strong> (@${esc(p.author)} · ${p.rating} · ${esc(p.author_check_status)})<p style="font-size:.84rem;">${esc(p.statement)}</p><div class="row"><input id="xpV-${p.id}" type="number" value="150" style="width:100px;" /><select id="visV-${p.id}" style="width:120px;"><option value="archive">Arxiv</option><option value="gym">Gym</option></select><button class="btn btn-success btn-sm" onclick="reviewProp(${p.id},'approve')">Təsdiqlə (+XP)</button><button class="btn btn-danger btn-sm" onclick="reviewProp(${p.id},'reject')">Rədd</button></div></div>`).join("") : "Gözləyən sual yoxdur.";
  }
  if (sr.ok) { const cfg = await sr.json(); document.getElementById("cfgProvider").value = cfg.provider; document.getElementById("cfgBaseUrl").value = cfg.base_url; }
}
async function reviewProp(pid, action) { const r = await fetch(`/api/admin/proposals/${pid}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, xp_reward: document.getElementById(`xpV-${pid}`).value, visibility: document.getElementById(`visV-${pid}`).value }) }); toast((await r.json()).message || "Xəta", !r.ok); loadAdminData(); }
async function adminCreateContest() { const pids = document.getElementById("adConPids").value.split(",").map(x => x.trim()).filter(Boolean); const r = await fetch("/api/contests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("adConTitle").value, duration_min: document.getElementById("adConDur").value, problem_ids: pids }) }); toast((await r.json()).message || "Xəta", !r.ok); }
async function saveSettings() { const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: document.getElementById("cfgProvider").value, base_url: document.getElementById("cfgBaseUrl").value, api_key: document.getElementById("cfgApiKey").value }) }); toast((await r.json()).message || "Xəta", !r.ok); }
async function testConnection() { const o = document.getElementById("testConnOut"); o.style.display = "block"; o.textContent = "Yoxlanılır..."; o.textContent = JSON.stringify(await (await fetch("/api/test-connection", { method: "POST" })).json(), null, 2); }
async function adminCreateProblem() { const r = await fetch("/api/problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: document.getElementById("npTitle").value, code_label: document.getElementById("npCodeLbl").value, rating: document.getElementById("npRating").value, tags: document.getElementById("npTags").value, statement: document.getElementById("npStatement").value, input_spec: document.getElementById("npIn").value, output_spec: document.getElementById("npOut").value, tests: collectTests("npTestsContainer") }) }); toast((await r.json()).message || "Xəta", !r.ok); }

window.addEventListener("DOMContentLoaded", async () => {
  initEditors(); addTestRow("prTestsContainer"); addTestRow("npTestsContainer");
  await syncMe(); checkHumanGate(); await loadPosts();
  const pid = new URLSearchParams(location.search).get("problem");
  if (pid && /^\d+$/.test(pid)) openProblem(Number(pid));
});
