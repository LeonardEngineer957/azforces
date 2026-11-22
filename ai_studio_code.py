import base64
import json
import os
import re
import secrets
import smtplib
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from collections import defaultdict
from email.message import EmailMessage
from functools import wraps

import requests
from flask import Flask, jsonify, make_response, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 512 * 1024

if os.environ.get("TRUST_PROXY", "true").lower() == "true":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

DB_PATH = os.environ.get("DB_PATH", "azforces.db")
ALLOWED_LANGS = {"python", "cpp", "c", "java", "javascript"}
ALLOWED_PROVIDERS = {"judge0", "wandbox", "piston", "local"}
ALLOWED_EMOJIS = {"👍", "🔥", "💡", "👏", "❤️"}
ALLOW_LOCAL_RUNNER = os.environ.get("ALLOW_LOCAL_RUNNER", "false").lower() == "true"

# Admin məlumatları kodda açıq yazılmır — Render mühit dəyişənlərindən oxunur
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "Admin").strip() or "Admin"
_ENV_ADMIN_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
if not _ENV_ADMIN_HASH and os.environ.get("ADMIN_PASSWORD", "").strip():
    _ENV_ADMIN_HASH = generate_password_hash(os.environ["ADMIN_PASSWORD"].strip())

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
DEV_EMAIL_PREVIEW = os.environ.get("DEV_EMAIL_PREVIEW", "false").lower() == "true"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "").strip() or SMTP_USER or ADMIN_EMAIL

SESSION_TTL = 86400 * 7
ADMIN_TTL = 7200
MAX_ROOM_MEMBERS = 20
MAX_ACTIVE_ROOMS = 25
MAX_DAILY_MSGS = 80
MAX_DAILY_SUBS = 40
MAX_DAILY_PROPS = 2

_db_lock = threading.Lock()
_db_ready = False
_human_lock = threading.Lock()
_human_challenges = {}
_fail_lock = threading.Lock()
_admin_fails = {"count": 0, "until": 0.0}
_rate_lock = threading.Lock()
_rate_buckets = defaultdict(list)
_wandbox_cache = {"ts": 0.0, "compilers": {}}


def safe_int(val, default=0, min_v=None, max_v=None):
    try:
        n = int(val)
    except (ValueError, TypeError):
        n = default
    if min_v is not None:
        n = max(min_v, n)
    if max_v is not None:
        n = min(max_v, n)
    return n


def safe_float(val, default=2.0, min_v=0.5, max_v=10.0):
    try:
        n = float(val)
    except (ValueError, TypeError):
        n = default
    return max(min_v, min(max_v, n))


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def rate_limit(max_req=25, win=60, by_user=False):
    def dec(fn):
        @wraps(fn)
        def wrap(*a, **kw):
            key = f"u:{getattr(request, '_u', '')}" if (by_user and getattr(request, "_u", "")) else (request.remote_addr or "ip")
            now = time.time()
            with _rate_lock:
                arr = [t for t in _rate_buckets[key] if now - t < win]
                if len(arr) >= max_req:
                    _rate_buckets[key] = arr
                    return jsonify({"error": f"Çox tez sorğu göndərirsiniz. {win} san gözləyin."}), 429
                arr.append(now)
                _rate_buckets[key] = arr
            return fn(*a, **kw)
        return wrap
    return dec


def needed_xp_for_level(lvl):
    return 100 * (2 ** max(0, lvl - 1))


def award_xp(conn, username, amount):
    if amount <= 0:
        return
    u = conn.execute("SELECT level, xp, total_xp FROM users WHERE username = ?", (username,)).fetchone()
    if not u:
        return
    lvl, cur, tot = u["level"], u["xp"] + amount, u["total_xp"] + amount
    while True:
        need = needed_xp_for_level(lvl)
        if cur >= need:
            cur -= need
            lvl += 1
        else:
            break
    conn.execute("UPDATE users SET level = ?, xp = ?, total_xp = ? WHERE username = ?", (lvl, cur, tot, username))


def update_streak(conn, username):
    u = conn.execute("SELECT daily_streak, last_solve_date FROM users WHERE username = ?", (username,)).fetchone()
    if not u:
        return
    today = time.strftime("%Y-%m-%d")
    yesterday = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400))
    last = u["last_solve_date"] or ""
    if last == today:
        return
    new_streak = (u["daily_streak"] + 1) if last == yesterday else 1
    conn.execute("UPDATE users SET daily_streak = ?, last_solve_date = ? WHERE username = ?", (new_streak, today, username))


def send_gmail_code(to_email, code):
    text = f"Salam!\n\nAzForces hesabınızı təsdiqləmək üçün kodunuz: {code}\n(Bu kod 5 dəqiqə etibarlıdır.)"

    # 1) Brevo HTTPS API (Render Pulsuz Planda da 100% işləyir)
    if BREVO_API_KEY and BREVO_SENDER_EMAIL:
        try:
            r = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"accept": "application/json", "content-type": "application/json", "api-key": BREVO_API_KEY},
                json={"sender": {"name": "AzForces", "email": BREVO_SENDER_EMAIL}, "to": [{"email": to_email}], "subject": "AzForces — Qeydiyyat Təsdiq Kodu", "textContent": text},
                timeout=12,
            )
            if r.status_code in (200, 201, 202):
                return True, "sent"
            print(f"[Brevo Xəta] {r.status_code}: {r.text}", flush=True)
            return False, "Gmail təsdiq kodu göndərilə bilmədi."
        except Exception as e:
            print(f"[Brevo Bağlantı Xətası] {e}", flush=True)
            return False, "E-poçt servisinə qoşulmaq olmadı."

    # 2) Adi SMTP (Kompüter / VPS)
    if SMTP_USER and SMTP_PASS:
        try:
            msg = EmailMessage()
            msg["Subject"] = "AzForces — Qeydiyyat Təsdiq Kodu"
            msg["From"] = SMTP_USER
            msg["To"] = to_email
            msg.set_content(text)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as srv:
                srv.starttls()
                srv.login(SMTP_USER, SMTP_PASS)
                srv.send_message(msg)
            return True, "sent"
        except Exception as e:
            print(f"[SMTP Xəta] {e}", flush=True)
            return False, "Gmail göndərilərkən xəta baş verdi."

    print(f"\n[AzForces Gmail Kodu] {to_email} -> {code}\n", flush=True)
    return True, "console"


def get_session():
    utok = request.cookies.get("az_session", "").strip()
    atok = request.cookies.get("az_admin_session", "").strip()
    htok = request.cookies.get("az_human", "").strip()
    now = time.time()
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    conn.commit()
    username, is_admin, human_ok = None, False, False
    if utok:
        r = conn.execute("SELECT username FROM sessions WHERE token = ? AND kind = 'user' AND expires_at > ?", (utok, now)).fetchone()
        if r:
            username = r["username"]
    if atok:
        r = conn.execute("SELECT username FROM sessions WHERE token = ? AND kind = 'admin' AND expires_at > ?", (atok, now)).fetchone()
        if r:
            is_admin = True
            username = username or r["username"]
    if htok:
        r = conn.execute("SELECT 1 FROM sessions WHERE token = ? AND kind = 'human' AND expires_at > ?", (htok, now)).fetchone()
        if r:
            human_ok = True
    conn.close()
    return username, is_admin, human_ok


def create_session(username, kind="user", ttl=SESSION_TTL):
    tok = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute("INSERT INTO sessions (token, username, kind, expires_at) VALUES (?, ?, ?, ?)", (tok, username, kind, time.time() + ttl))
    conn.commit()
    conn.close()
    return tok


def set_cookie(resp, name, val, max_age):
    sec = request.is_secure or request.headers.get("X-Forwarded-Proto", "") == "https"
    resp.set_cookie(name, val, max_age=max_age, httponly=True, samesite="Lax", secure=sec)


def require_user(fn):
    @wraps(fn)
    def wrap(*a, **kw):
        u, _, _ = get_session()
        if not u:
            return jsonify({"error": "Hesabınıza daxil olun."}), 401
        request._u = u
        return fn(*a, **kw)
    return wrap


def require_admin(fn):
    @wraps(fn)
    def wrap(*a, **kw):
        u, adm, _ = get_session()
        if not adm:
            return jsonify({"error": "İcazə yoxdur."}), 403
        request._u = u or ADMIN_USERNAME
        return fn(*a, **kw)
    return wrap


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE COLLATE NOCASE NOT NULL,
        email TEXT UNIQUE COLLATE NOCASE NOT NULL, password_hash TEXT NOT NULL,
        bio TEXT DEFAULT '', avatar_color TEXT DEFAULT '#3b82f6',
        level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0, total_xp INTEGER DEFAULT 0,
        daily_streak INTEGER DEFAULT 0, last_solve_date TEXT DEFAULT '',
        d_msg_date TEXT DEFAULT '', d_msg_cnt INTEGER DEFAULT 0,
        d_sub_date TEXT DEFAULT '', d_sub_cnt INTEGER DEFAULT 0,
        d_prop_date TEXT DEFAULT '', d_prop_cnt INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("CREATE TABLE IF NOT EXISTS email_codes (email TEXT PRIMARY KEY COLLATE NOCASE, code_hash TEXT NOT NULL, attempts INTEGER DEFAULT 0, expires_at REAL NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, kind TEXT DEFAULT 'user', expires_at REAL NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS friendships (id INTEGER PRIMARY KEY AUTOINCREMENT, user_a TEXT NOT NULL, user_b TEXT NOT NULL, status TEXT DEFAULT 'pending', action_by TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_a, user_b))")
    c.execute("CREATE TABLE IF NOT EXISTS contests (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, duration_min INTEGER DEFAULT 90, starts_at REAL NOT NULL, ends_at REAL NOT NULL, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("""CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code_label TEXT DEFAULT '', title TEXT NOT NULL,
        rating INTEGER DEFAULT 800, tags TEXT DEFAULT 'math', time_limit REAL DEFAULT 2.0, memory_limit INTEGER DEFAULT 256,
        statement TEXT NOT NULL, input_spec TEXT DEFAULT '', output_spec TEXT DEFAULT '', note TEXT DEFAULT '',
        editorial TEXT DEFAULT '', starter_code TEXT DEFAULT '', author TEXT DEFAULT 'AzForces',
        visibility TEXT DEFAULT 'archive', contest_id INTEGER DEFAULT NULL, author_check_status TEXT DEFAULT '',
        reject_reason TEXT DEFAULT '', awarded_xp INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("CREATE TABLE IF NOT EXISTS test_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL, input_data TEXT NOT NULL, expected_output TEXT NOT NULL, is_sample INTEGER DEFAULT 1, FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL, problem_title TEXT NOT NULL, username TEXT NOT NULL, language TEXT NOT NULL, code TEXT NOT NULL, verdict TEXT NOT NULL, passed_tests INTEGER DEFAULT 0, total_tests INTEGER DEFAULT 0, exec_time TEXT DEFAULT '-', details TEXT DEFAULT '', room_id INTEGER DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, bio TEXT DEFAULT 'Kodlaşdırma və söhbət qrupu', creator TEXT NOT NULL, voice_link TEXT DEFAULT '', problem_ids_json TEXT DEFAULT '[]', duration_min INTEGER DEFAULT 0, max_members INTEGER DEFAULT 20, starts_at REAL NOT NULL, ends_at REAL NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("CREATE TABLE IF NOT EXISTS room_members (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, username TEXT NOT NULL, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(room_id, username), FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS room_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, username TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS direct_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, receiver TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, post_type TEXT DEFAULT 'post', is_pinned INTEGER DEFAULT 0, poll_options_json TEXT DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    c.execute("CREATE TABLE IF NOT EXISTS poll_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, username TEXT NOT NULL, option_index INTEGER NOT NULL, UNIQUE(post_id, username), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS post_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, username TEXT NOT NULL, emoji TEXT NOT NULL, UNIQUE(post_id, username, emoji), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, parent_id INTEGER DEFAULT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)")
    c.execute("CREATE TABLE IF NOT EXISTS creative_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', language TEXT NOT NULL, code TEXT NOT NULL, sample_input TEXT DEFAULT '', author TEXT DEFAULT 'AzForces', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")

    for k, v in {
        "provider": os.environ.get("JUDGE_PROVIDER", "judge0"),
        "base_url": os.environ.get("JUDGE_BASE_URL", "https://ce.judge0.com"),
        "api_key": os.environ.get("JUDGE_API_KEY", ""),
    }.items():
        c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    if not _ENV_ADMIN_HASH:
        row = c.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'").fetchone()
        if not row or not row["value"]:
            gen = secrets.token_urlsafe(12)
            c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_hash', ?)", (generate_password_hash(gen),))
            print(f"\n[AzForces] İlk Admin parolu: {gen}\n(Render-də ADMIN_EMAIL və ADMIN_PASSWORD təyin edin)\n", flush=True)

    if c.execute("SELECT COUNT(*) FROM problems").fetchone()[0] == 0:
        samples = [
            ("1A", "A + B Cəmi", 800, "math, implementation", 1.0, 256,
             "Sizə iki tam ədəd $a$ və $b$ verilir ($-10^9 \\le a, b \\le 10^9$). Onların cəmini ($a + b$) hesablayın.",
             "Tək sətirdə $a$ və $b$ verilir.", "$a + b$ cəmini çap edin.", "Nümunədə $3 + 5 = 8$.",
             "`a, b = map(int, input().split()); print(a + b)`", "a, b = map(int, input().split())\nprint(a + b)",
             [("3 5", "8", 1), ("-10 25", "15", 1), ("1000000000 1000000000", "2000000000", 0)]),
            ("1B", "Sadə Ədəd", 1000, "number theory, math", 2.0, 256,
             "Verilmiş $n$ natural ədədinin ($1 \\le n \\le 10^9$) sadə olub-olmadığını yoxlayın.",
             "Bir tam ədəd $n$.", "Sadədirsə `YES`, yoxsa `NO`.", "$1$ sadə sayılmır.",
             "$2$-dən $\\sqrt{n}$-ə qədər bölənləri yoxlayın.", "n = int(input())\n",
             [("7", "YES", 1), ("1", "NO", 1), ("1000000007", "YES", 0)]),
            ("1C", "Hədəf Cəm (Two Sum)", 1200, "hashing, arrays", 2.0, 256,
             "Massivdə cəmi $k$-ya bərabər olan $a_i + a_j = k$ ($i \\ne j$) iki element varmı?",
             "1-ci sətirdə $n, k$. 2-ci sətirdə $n$ ədəd.", "Varsa `YES`, yoxdursa `NO`.", "",
             "Gördüyünüz ədədləri `set()`-də saxlayın.", "n, k = map(int, input().split())\narr = list(map(int, input().split()))\n",
             [("4 9\n2 7 11 15", "YES", 1), ("3 10\n1 2 3", "NO", 0)]),
        ]
        for lbl, t, rt, tg, tl, ml, st, ins, outs, nt, ed, sc, tests in samples:
            c.execute("INSERT INTO problems (code_label,title,rating,tags,time_limit,memory_limit,statement,input_spec,output_spec,note,editorial,starter_code,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'AzForces','archive')",
                      (lbl, t, rt, tg, tl, ml, st, ins, outs, nt, ed, sc))
            pid = c.lastrowid
            for i_d, o_d, smp in tests:
                c.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, i_d, o_d, smp))

    if c.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 0:
        c.execute("INSERT INTO posts (author, title, body, post_type, is_pinned) VALUES ('AzForces', 'AzForces-ə Xoş Gəldiniz! (Rəsmi Duyuru Panosu)', 'Burada yeni yarış elanları, icma anketləri və müzakirələr paylaşılır. Sual təklif edərək böyük XP qazana, dostlarınızla 16 rəqəmli kodla qrup açıb söhbət edə bilərsiniz!', 'announcement', 1)")
        c.execute("INSERT INTO posts (author, title, body, post_type, poll_options_json) VALUES ('AzForces', 'Növbəti yarışın mövzusu nə olsun?', 'Aşağıdan səs verin və fikrinizi yazın!', 'poll', ?)",
                  (json.dumps(["Riyaziyyat", "Massivlər", "DP", "Qraflar"]),))

    if c.execute("SELECT COUNT(*) FROM creative_codes").fetchone()[0] == 0:
        c.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES ('Almaz ASCII', 'Simmetrik almaz fiquru.', 'python', ?, '5', 'AzForces')",
                  ("n = int(input() or 5)\nfor i in range(n): print(' '*(n-i-1)+'*'*(2*i+1))\nfor i in range(n-2,-1,-1): print(' '*(n-i-1)+'*'*(2*i+1))",))

    conn.commit()
    conn.close()


@app.before_request
def _boot():
    global _db_ready
    if not _db_ready:
        with _db_lock:
            if not _db_ready:
                init_db()
                _db_ready = True


@app.after_request
def _sec_hdrs(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    return resp


def sync_contests(conn):
    now = time.time()
    for r in conn.execute("SELECT id FROM contests WHERE status = 'active' AND ends_at <= ?", (now,)).fetchall():
        conn.execute("UPDATE contests SET status = 'finished' WHERE id = ?", (r["id"],))
        conn.execute("UPDATE problems SET visibility = 'gym' WHERE contest_id = ? AND visibility = 'contest'", (r["id"],))
    conn.commit()


def check_daily(conn, username, kind, limit):
    u = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not u:
        return True
    today = time.strftime("%Y-%m-%d")
    dc, cc = f"d_{kind}_date", f"d_{kind}_cnt"
    cnt = u[cc] if u[dc] == today else 0
    if cnt >= limit:
        return False
    conn.execute(f"UPDATE users SET {dc} = ?, {cc} = ? WHERE username = ?", (today, cnt + 1, username))
    return True


def norm_out(txt):
    return "\n".join(l.rstrip() for l in (txt or "").replace("\r\n", "\n").strip().splitlines())


def _get_wandbox_compilers():
    now = time.time()
    if now - _wandbox_cache["ts"] < 3600 and _wandbox_cache["compilers"]:
        return _wandbox_cache["compilers"]
    try:
        r = requests.get("https://wandbox.org/api/list.json", timeout=10)
        if r.status_code == 200:
            found = {}
            for item in r.json():
                lang, name = item.get("language", "").lower(), item.get("name", "")
                if lang == "python" and "cpython" in name and "python" not in found:
                    found["python"] = name
                elif lang == "c++" and "gcc" in name and "head" not in name and "cpp" not in found:
                    found["cpp"] = name
                elif lang == "c" and "gcc" in name and "head" not in name and "c" not in found:
                    found["c"] = name
                elif lang == "javascript" and "nodejs" in name and "javascript" not in found:
                    found["javascript"] = name
                elif lang == "java" and "openjdk" in name and "java" not in found:
                    found["java"] = name
            if found:
                _wandbox_cache["compilers"] = found
                _wandbox_cache["ts"] = now
    except Exception:
        pass
    return _wandbox_cache["compilers"] or {"python": "cpython-3.12.7", "cpp": "gcc-13.2.0", "c": "gcc-13.2.0-c", "javascript": "nodejs-20.17.0", "java": "openjdk-jdk-22+36"}


def _run_wandbox(lang, code, stdin_data):
    comp = _get_wandbox_compilers().get(lang)
    if not comp:
        return {"ok": False, "status": "API Error", "stderr": f"Wandbox-da {lang} tapılmadı."}
    try:
        t0 = time.perf_counter()
        r = requests.post("https://wandbox.org/api/compile.json", json={"compiler": comp, "code": code, "stdin": stdin_data}, timeout=25)
        el = f"{time.perf_counter() - t0:.2f}s"
        if r.status_code >= 400:
            return {"ok": False, "status": "API Error", "stderr": f"Wandbox HTTP {r.status_code}"}
        d = r.json()
        if d.get("compiler_error"):
            return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": d["compiler_error"], "time": "0.00s"}
        st = str(d.get("status", "0"))
        if st != "0":
            return {"ok": True, "status": "Runtime Error", "stdout": d.get("program_output", ""), "stderr": d.get("program_error") or f"Exit {st}", "time": el}
        return {"ok": True, "status": "OK", "stdout": d.get("program_output", ""), "stderr": d.get("program_error", ""), "time": el}
    except requests.RequestException as e:
        return {"ok": False, "status": "Connection Error", "stderr": f"Wandbox xətası: {e}"}


def _run_judge0(base_url, api_key, lang, code, stdin_data, t_limit):
    lids = {"python": 71, "cpp": 54, "c": 50, "java": 62, "javascript": 63}
    hdrs = {"Content-Type": "application/json"}
    if api_key:
        if "rapidapi.com" in base_url:
            hdrs["X-RapidAPI-Key"] = api_key
            hdrs["X-RapidAPI-Host"] = base_url.split("//")[-1].split("/")[0]
        else:
            hdrs["X-Auth-Token"] = api_key
    b64 = lambda s: base64.b64encode((s or "").encode("utf-8")).decode("ascii")
    deb64 = lambda s: base64.b64decode(s).decode("utf-8", errors="replace") if s else ""
    try:
        r = requests.post(
            f"{base_url}/submissions?base64_encoded=true&wait=true",
            json={"language_id": lids[lang], "source_code": b64(code), "stdin": b64(stdin_data), "cpu_time_limit": t_limit},
            headers=hdrs, timeout=22,
        )
        if r.status_code >= 400:
            return {"ok": False, "status": "API Error", "stderr": f"HTTP {r.status_code}"}
        d = r.json()
        if d.get("token") and d.get("status", {}).get("id") in (1, 2, None):
            for _ in range(10):
                time.sleep(0.6)
                pr = requests.get(f"{base_url}/submissions/{d['token']}?base64_encoded=true", headers=hdrs, timeout=12)
                if pr.status_code == 200:
                    d = pr.json()
                    if d.get("status", {}).get("id", 0) not in (1, 2):
                        break
        sid = d.get("status", {}).get("id", 0)
        et = f"{d.get('time')}s" if d.get("time") else "-"
        out, err, comp = deb64(d.get("stdout")), deb64(d.get("stderr")), deb64(d.get("compile_output"))
        if sid == 6:
            return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": comp or "Kompilyasiya xətası", "time": et}
        if sid == 5:
            return {"ok": True, "status": "Time Limit Exceeded", "stdout": out, "stderr": "Vaxt limiti aşıldı", "time": et}
        if sid >= 7:
            return {"ok": True, "status": "Runtime Error", "stdout": out, "stderr": err or d.get("status", {}).get("description", "Runtime Error"), "time": et}
        return {"ok": True, "status": "OK", "stdout": out, "stderr": err, "time": et}
    except requests.RequestException as e:
        return {"ok": False, "status": "Connection Error", "stderr": str(e)}


def run_code_sandbox(lang, code, stdin_data="", time_limit=2.0):
    if lang not in ALLOWED_LANGS or len(code) > 65536 or len(stdin_data) > 65536:
        return {"ok": False, "status": "Validation Error", "stderr": "Dil yanlışdır və ya kod 64 KB-dan böyükdür."}
    t_limit = safe_float(time_limit, 2.0, 0.5, 10.0)
    conn = get_db()
    cfg = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings WHERE key IN ('provider','base_url','api_key')").fetchall()}
    conn.close()
    prov, url, key = cfg.get("provider", "judge0"), cfg.get("base_url", "https://ce.judge0.com").strip().rstrip("/"), cfg.get("api_key", "").strip()

    if prov == "local" and ALLOW_LOCAL_RUNNER and lang == "python":
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "m.py")
            open(src, "w", encoding="utf-8").write(code)
            try:
                t0 = time.perf_counter()
                p = subprocess.run([sys.executable, "-I", src], input=stdin_data, capture_output=True, text=True, timeout=t_limit, cwd=td)
                return {"ok": True, "status": "OK" if p.returncode == 0 else "Runtime Error", "stdout": p.stdout[:65536], "stderr": p.stderr[:65536], "time": f"{time.perf_counter()-t0:.2f}s"}
            except subprocess.TimeoutExpired:
                return {"ok": True, "status": "Time Limit Exceeded", "stdout": "", "stderr": "Vaxt limiti aşıldı", "time": f"{t_limit:.2f}s"}

    if prov == "wandbox":
        return _run_wandbox(lang, code, stdin_data)

    if prov == "piston" and url:
        lmap = {"python": ("python", "main.py"), "cpp": ("c++", "main.cpp"), "c": ("c", "main.c"), "java": ("java", "Main.java"), "javascript": ("javascript", "main.js")}
        pl, fn = lmap[lang]
        hdrs = {"Content-Type": "application/json", **({"Authorization": key} if key else {})}
        try:
            r = requests.post(f"{url}/execute", json={"language": pl, "version": "*", "files": [{"name": fn, "content": code}], "stdin": stdin_data, "run_timeout": int(t_limit * 1000)}, headers=hdrs, timeout=20)
            if r.status_code < 400:
                d = r.json()
                if d.get("compile", {}).get("code", 0) != 0:
                    return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": d["compile"].get("stderr") or "Xəta", "time": "0.00s"}
                rn = d.get("run", {})
                return {"ok": True, "status": "OK" if rn.get("code", 0) == 0 else "Runtime Error", "stdout": rn.get("stdout", ""), "stderr": rn.get("stderr", ""), "time": "-"}
        except Exception:
            pass

    res = _run_judge0(url or "https://ce.judge0.com", key, lang, code, stdin_data, t_limit)
    if not res.get("ok"):
        wb = _run_wandbox(lang, code, stdin_data)
        if wb.get("ok"):
            return wb
    return res


@app.route("/")
def index():
    return render_template("azforces.html")


@app.route("/api/human-challenge", methods=["GET"])
def human_challenge():
    tok = secrets.token_urlsafe(20)
    with _human_lock:
        now = time.time()
        for k in [k for k, v in _human_challenges.items() if now - v > 300]:
            _human_challenges.pop(k, None)
        _human_challenges[tok] = now
    return jsonify({"challenge_token": tok})


@app.route("/api/human-verify", methods=["POST"])
def human_verify():
    tok = str((request.get_json(silent=True) or {}).get("challenge_token") or "")
    with _human_lock:
        ts = _human_challenges.pop(tok, None)
    if not ts or (time.time() - ts) < 0.35:
        return jsonify({"error": "Doğrulama alınmadı, yenidən klikləyin."}), 400
    st = create_session("human", kind="human", ttl=86400)
    resp = make_response(jsonify({"ok": True}))
    set_cookie(resp, "az_human", st, 86400)
    return resp


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    u, adm, hum = get_session()
    info = {"authenticated": bool(u), "username": u, "is_admin": adm, "human_verified": hum, "level": 1, "xp": 0, "needed_xp": 100}
    if u:
        conn = get_db()
        row = conn.execute("SELECT level, xp, total_xp, daily_streak, avatar_color FROM users WHERE username = ?", (u,)).fetchone()
        conn.close()
        if row:
            info.update({"level": row["level"], "xp": row["xp"], "needed_xp": needed_xp_for_level(row["level"]), "total_xp": row["total_xp"], "streak": row["daily_streak"], "avatar_color": row["avatar_color"]})
    return jsonify(info)


@app.route("/api/auth/send-code", methods=["POST"])
@rate_limit(5, 60)
def send_reg_code():
    d = request.get_json(silent=True) or {}
    email, uname, pw = str(d.get("email") or "").strip().lower(), str(d.get("username") or "").strip(), str(d.get("password") or "")
    if not re.match(r"^[a-z0-9._%+-]+@gmail\.com$", email):
        return jsonify({"error": "Yalnız etibarlı @gmail.com ünvanı daxil edin."}), 400
    if ADMIN_EMAIL and email == ADMIN_EMAIL:
        return jsonify({"error": "Bu e-poçt sistemə aiddir."}), 400
    if not (3 <= len(uname) <= 22) or not re.match(r"^[a-zA-Z0-9_-]+$", uname) or uname.lower() == ADMIN_USERNAME.lower():
        return jsonify({"error": "İstifadəçi adı 3-22 simvol (hərf, rəqəm, _ -) olmalı və unikal olmalıdır."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Parol ən azı 6 simvol olmalıdır."}), 400

    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE username = ? OR email = ?", (uname, email)).fetchone():
        conn.close()
        return jsonify({"error": "Bu istifadəçi adı və ya Gmail artıq qeydiyyatdan keçib."}), 400

    code = f"{secrets.randbelow(1_000_000):06d}"
    conn.execute("INSERT OR REPLACE INTO email_codes (email, code_hash, attempts, expires_at) VALUES (?, ?, 0, ?)", (email, generate_password_hash(code), time.time() + 300))
    conn.commit()
    conn.close()

    ok, mode = send_gmail_code(email, code)
    if not ok:
        return jsonify({"error": mode}), 500
    payload = {"ok": True, "message": "6 rəqəmli təsdiq kodu Gmail ünvanınıza göndərildi."}
    if mode == "console" and DEV_EMAIL_PREVIEW:
        payload["dev_code"] = code
    return jsonify(payload)


@app.route("/api/auth/register", methods=["POST"])
@rate_limit(10, 60)
def auth_register():
    d = request.get_json(silent=True) or {}
    email, uname, pw, code = str(d.get("email") or "").strip().lower(), str(d.get("username") or "").strip(), str(d.get("password") or ""), str(d.get("code") or "").strip()

    conn = get_db()
    ec = conn.execute("SELECT * FROM email_codes WHERE email = ?", (email,)).fetchone()
    if not ec or ec["expires_at"] < time.time():
        conn.close()
        return jsonify({"error": "Təsdiq kodunun müddəti bitib."}), 400
    if ec["attempts"] >= 5:
        conn.close()
        return jsonify({"error": "Çox sayda səhv kod cəhdi."}), 429
    if not check_password_hash(ec["code_hash"], code):
        conn.execute("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?", (email,))
        conn.commit()
        conn.close()
        return jsonify({"error": "Gmail təsdiq kodu yanlışdır."}), 400
    if conn.execute("SELECT 1 FROM users WHERE username = ? OR email = ?", (uname, email)).fetchone():
        conn.close()
        return jsonify({"error": "İstifadəçi adı və ya Gmail artıq tutulub."}), 400

    conn.execute("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)", (uname, email, generate_password_hash(pw)))
    conn.execute("DELETE FROM email_codes WHERE email = ?", (email,))
    conn.commit()
    conn.close()

    tok = create_session(uname, "user", SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": uname, "message": "Hesabınız açıldı!"}))
    set_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/login", methods=["POST"])
@rate_limit(15, 60)
def auth_login():
    d = request.get_json(silent=True) or {}
    ident, pw = str(d.get("identifier") or "").strip(), str(d.get("password") or "")
    if not ident or not pw:
        return jsonify({"error": "Gmail (və ya ad) və parol yazın."}), 400

    conn = get_db()
    adm_hash = _ENV_ADMIN_HASH or (conn.execute("SELECT value FROM settings WHERE key='admin_password_hash'").fetchone() or {"value": ""})["value"]
    is_admin_ident = (ADMIN_EMAIL and ident.lower() == ADMIN_EMAIL) or (not ADMIN_EMAIL and ident.lower() == ADMIN_USERNAME.lower())

    if is_admin_ident:
        now = time.time()
        with _fail_lock:
            if _admin_fails["until"] > now:
                conn.close()
                return jsonify({"error": f"Təhlükəsizlik kilidi aktivdir ({int(_admin_fails['until']-now)}s)."}), 429
        if adm_hash and check_password_hash(adm_hash, pw):
            with _fail_lock:
                _admin_fails["count"] = 0
            if not conn.execute("SELECT 1 FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone():
                conn.execute("INSERT OR IGNORE INTO users (username, email, password_hash) VALUES (?, ?, ?)", (ADMIN_USERNAME, ADMIN_EMAIL or "admin@azforces.local", adm_hash))
                conn.commit()
            conn.close()
            utok, atok = create_session(ADMIN_USERNAME, "user", SESSION_TTL), create_session(ADMIN_USERNAME, "admin", ADMIN_TTL)
            resp = make_response(jsonify({"ok": True, "username": ADMIN_USERNAME, "is_admin": True, "message": "Xoş gəldiniz!"}))
            set_cookie(resp, "az_session", utok, SESSION_TTL)
            set_cookie(resp, "az_admin_session", atok, ADMIN_TTL)
            return resp
        with _fail_lock:
            _admin_fails["count"] += 1
            if _admin_fails["count"] >= 5:
                _admin_fails["until"] = now + 900
                _admin_fails["count"] = 0
        conn.close()
        return jsonify({"error": "Giriş məlumatları yanlışdır."}), 401

    u = conn.execute("SELECT * FROM users WHERE email = ? OR username = ?", (ident.lower(), ident)).fetchone()
    conn.close()
    if not u or not check_password_hash(u["password_hash"], pw):
        return jsonify({"error": "Giriş məlumatları yanlışdır."}), 401
    tok = create_session(u["username"], "user", SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": u["username"], "is_admin": False, "message": "Xoş gəldiniz!"}))
    set_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    conn = get_db()
    for c_name in ("az_session", "az_admin_session"):
        t = request.cookies.get(c_name, "").strip()
        if t:
            conn.execute("DELETE FROM sessions WHERE token = ?", (t,))
    conn.commit()
    conn.close()
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("az_session")
    resp.delete_cookie("az_admin_session")
    return resp


@app.route("/api/profile", methods=["GET"])
@require_user
def my_profile():
    me = request._u
    conn = get_db()
    u = conn.execute("SELECT username, email, bio, avatar_color, level, xp, total_xp, daily_streak, created_at FROM users WHERE username = ?", (me,)).fetchone()
    solved_cnt = conn.execute("SELECT COUNT(DISTINCT problem_id) FROM submissions WHERE username = ? AND verdict = 'Accepted'", (me,)).fetchone()[0]
    recent = [dict(r) for r in conn.execute("SELECT p.id, p.code_label, p.title, p.rating, MAX(s.created_at) AS solved_at FROM submissions s JOIN problems p ON p.id = s.problem_id WHERE s.username = ? AND s.verdict = 'Accepted' GROUP BY p.id ORDER BY solved_at DESC LIMIT 8", (me,)).fetchall()]
    fr_rows = conn.execute("SELECT * FROM friendships WHERE user_a = ? OR user_b = ?", (me, me)).fetchall()
    friends, incoming, outgoing = [], [], []
    for f in fr_rows:
        other = f["user_b"] if f["user_a"].lower() == me.lower() else f["user_a"]
        if f["status"] == "accepted":
            fu = conn.execute("SELECT level, daily_streak, avatar_color FROM users WHERE username = ?", (other,)).fetchone()
            friends.append({"username": other, "level": fu["level"] if fu else 1, "streak": fu["daily_streak"] if fu else 0, "avatar_color": fu["avatar_color"] if fu else "#3b82f6"})
        elif f["status"] == "pending":
            (outgoing if f["action_by"].lower() == me.lower() else incoming).append(other)
    conn.close()
    need = needed_xp_for_level(u["level"])
    return jsonify({"username": u["username"], "email": u["email"], "bio": u["bio"], "avatar_color": u["avatar_color"], "level": u["level"], "xp": u["xp"], "needed_xp": need, "progress_pct": min(100, int(u["xp"] * 100 / need)), "total_xp": u["total_xp"], "streak": u["daily_streak"], "solved_count": solved_cnt, "recent_solved": recent, "friends": friends, "incoming_requests": incoming, "outgoing_requests": outgoing})


@app.route("/api/profile/update", methods=["POST"])
@require_user
def update_profile():
    d = request.get_json(silent=True) or {}
    bio, color = str(d.get("bio") or "").strip()[:200], str(d.get("avatar_color") or "#3b82f6").strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = "#3b82f6"
    conn = get_db()
    conn.execute("UPDATE users SET bio = ?, avatar_color = ? WHERE username = ?", (bio, color, request._u))
    conn.commit()
    conn.close()
    return jsonify({"message": "Profil yeniləndi!"})


@app.route("/api/friends/request", methods=["POST"])
@require_user
def friend_request():
    me, target = request._u, str((request.get_json(silent=True) or {}).get("username") or "").strip()
    if not target or target.lower() == me.lower():
        return jsonify({"error": "Düzgün istifadəçi adı yazın."}), 400
    conn = get_db()
    tu = conn.execute("SELECT username FROM users WHERE username = ?", (target,)).fetchone()
    if not tu:
        conn.close()
        return jsonify({"error": "Belə istifadəçi tapılmadı."}), 404
    tname = tu["username"]
    a, b = sorted([me, tname], key=str.lower)
    if conn.execute("SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?", (a, b)).fetchone():
        conn.close()
        return jsonify({"error": "Artıq dostsunuz və ya sorğu gözləmədədir."}), 400
    conn.execute("INSERT INTO friendships (user_a, user_b, status, action_by) VALUES (?, ?, 'pending', ?)", (a, b, me))
    conn.commit()
    conn.close()
    return jsonify({"message": f"{tname} istifadəçisinə dostluq sorğusu göndərildi!"})


@app.route("/api/friends/respond", methods=["POST"])
@require_user
def friend_respond():
    me, d = request._u, request.get_json(silent=True) or {}
    a, b = sorted([me, str(d.get("username") or "").strip()], key=str.lower)
    conn = get_db()
    if d.get("action") == "accept":
        conn.execute("UPDATE friendships SET status = 'accepted', action_by = ? WHERE user_a = ? AND user_b = ? AND status = 'pending'", (me, a, b))
    else:
        conn.execute("DELETE FROM friendships WHERE user_a = ? AND user_b = ?", (a, b))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/problems", methods=["GET"])
def list_problems():
    view = request.args.get("view", "archive")
    u, adm, _ = get_session()
    conn = get_db()
    sync_contests(conn)
    if view == "gym":
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author FROM problems WHERE visibility = 'gym' ORDER BY contest_id DESC, rating ASC").fetchall()
    elif view == "all" and adm:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author, visibility FROM problems WHERE visibility IN ('archive','gym','contest') ORDER BY id ASC").fetchall()
    else:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author FROM problems WHERE visibility = 'archive' ORDER BY rating ASC, id ASC").fetchall()
    cnts = {r["problem_id"]: r["cnt"] for r in conn.execute("SELECT problem_id, COUNT(DISTINCT username) AS cnt FROM submissions WHERE verdict = 'Accepted' GROUP BY problem_id").fetchall()}
    solved = {r["problem_id"] for r in conn.execute("SELECT DISTINCT problem_id FROM submissions WHERE verdict = 'Accepted' AND username = ?", (u,)).fetchall()} if u else set()
    conn.close()
    return jsonify([dict(r) | {"solved": r["id"] in solved, "solved_count": cnts.get(r["id"], 0)} for r in rows])


@app.route("/api/problems/<int:pid>", methods=["GET"])
def problem_detail(pid):
    _, adm, _ = get_session()
    conn = get_db()
    sync_contests(conn)
    p = conn.execute("SELECT * FROM problems WHERE id = ?", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404
    if p["visibility"] in ("pending", "rejected") and not adm:
        conn.close()
        return jsonify({"error": "Bu məsələ əlçatan deyil."}), 403
    samples = [dict(s) for s in conn.execute("SELECT id, input_data, expected_output FROM test_cases WHERE problem_id = ? AND is_sample = 1", (pid,)).fetchall()]
    conn.close()
    return jsonify(dict(p) | {"samples": samples})


@app.route("/api/problems", methods=["POST"])
@require_admin
def create_problem():
    d = request.get_json(silent=True) or {}
    t, st, tests = str(d.get("title") or "").strip(), str(d.get("statement") or "").strip(), d.get("tests") or []
    if not t or not st or not tests:
        return jsonify({"error": "Başlıq, şərt və test mütləqdir."}), 400
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO problems (code_label,title,rating,tags,time_limit,memory_limit,statement,input_spec,output_spec,note,editorial,starter_code,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (str(d.get("code_label", "")).strip()[:10], t, safe_int(d.get("rating"), 800, 100, 4000), str(d.get("tags", "custom")), safe_float(d.get("time_limit"), 2.0, 0.5, 10.0), safe_int(d.get("memory_limit"), 256, 16, 1024),
               st, str(d.get("input_spec", "")), str(d.get("output_spec", "")), str(d.get("note", "")), str(d.get("editorial", "")), str(d.get("starter_code", "")), ADMIN_USERNAME, d.get("visibility", "archive")))
    pid = c.lastrowid
    for tc in tests:
        if isinstance(tc, dict):
            c.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, str(tc.get("input", "")), str(tc.get("output", "")), 1 if tc.get("is_sample", True) else 0))
    conn.commit()
    conn.close()
    return jsonify({"id": pid, "message": "Məsələ yaradıldı!"})


@app.route("/api/problems/<int:pid>", methods=["DELETE"])
@require_admin
def delete_problem(pid):
    conn = get_db()
    conn.execute("DELETE FROM problems WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Silindi."})


@app.route("/api/contests", methods=["GET", "POST"])
def contests_handler():
    conn = get_db()
    sync_contests(conn)
    if request.method == "GET":
        res = []
        for ct in conn.execute("SELECT * FROM contests ORDER BY id DESC").fetchall():
            item = dict(ct)
            item["problems"] = [dict(p) for p in conn.execute("SELECT id, code_label, title, rating FROM problems WHERE contest_id = ? ORDER BY rating ASC", (ct["id"],)).fetchall()]
            res.append(item)
        conn.close()
        return jsonify(res)
    _, adm, _ = get_session()
    if not adm:
        conn.close()
        return jsonify({"error": "İcazə yoxdur."}), 403
    d = request.get_json(silent=True) or {}
    title = str(d.get("title") or "").strip()
    if not title:
        conn.close()
        return jsonify({"error": "Yarış adı yazın."}), 400
    dur, now = safe_int(d.get("duration_min"), 90, 10, 1440), time.time()
    cid = conn.execute("INSERT INTO contests (title, duration_min, starts_at, ends_at, status) VALUES (?, ?, ?, ?, 'active')", (title, dur, now, now + dur * 60)).lastrowid
    for i, raw_pid in enumerate(d.get("problem_ids") or []):
        pid = safe_int(raw_pid, 0)
        if pid > 0:
            conn.execute("UPDATE problems SET contest_id = ?, visibility = 'contest', code_label = ? WHERE id = ?", (cid, chr(65 + i) if i < 26 else f"P{i+1}", pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yarış başladıldı!"})


@app.route("/api/contests/<int:cid>/finish", methods=["POST"])
@require_admin
def finish_contest(cid):
    conn = get_db()
    conn.execute("UPDATE contests SET status = 'finished', ends_at = ? WHERE id = ?", (time.time(), cid))
    conn.execute("UPDATE problems SET visibility = 'gym' WHERE contest_id = ? AND visibility = 'contest'", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yarış bitirildi, suallar Gym-ə köçürüldü!"})


@app.route("/api/proposals", methods=["POST"])
@require_user
@rate_limit(5, 60, by_user=True)
def submit_proposal():
    me, d = request._u, request.get_json(silent=True) or {}
    t, st, tests, code, lang = str(d.get("title") or "").strip(), str(d.get("statement") or "").strip(), d.get("tests") or [], str(d.get("author_code") or ""), str(d.get("author_lang") or "python")
    if not t or not st or not tests or not code.strip():
        return jsonify({"error": "Bütün vacib xanaları doldurun."}), 400
    conn = get_db()
    if conn.execute("SELECT COUNT(*) FROM problems WHERE author = ? AND visibility = 'pending'", (me,)).fetchone()[0] >= 2:
        conn.close()
        return jsonify({"error": "Gözləmədə maks. 2 təklifiniz ola bilər."}), 400
    if not check_daily(conn, me, "prop", MAX_DAILY_PROPS):
        conn.close()
        return jsonify({"error": "Gündəlik sual təklifi limitiniz bitib."}), 429

    ok_cnt, status_txt = 0, "Keçdi ✔"
    for tc in tests[:4]:
        res = run_code_sandbox(lang, code, str(tc.get("input", "")), 2.0)
        if not res.get("ok") or res.get("status") != "OK" or norm_out(res.get("stdout")) != norm_out(str(tc.get("output", ""))):
            status_txt = f"Xəta ({res.get('status', 'WA')})"
            break
        ok_cnt += 1

    pid = conn.execute("INSERT INTO problems (title,rating,tags,statement,input_spec,output_spec,editorial,starter_code,author,visibility,author_check_status) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)",
                       (t[:120], safe_int(d.get("rating"), 800, 800, 3500), str(d.get("tags", "custom")), st, str(d.get("input_spec", "")), str(d.get("output_spec", "")), str(d.get("editorial", "")), code, me, f"{status_txt} ({ok_cnt}/{min(len(tests),4)})")).lastrowid
    for tc in tests[:12]:
        if isinstance(tc, dict):
            conn.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, str(tc.get("input", "")), str(tc.get("output", "")), 1 if tc.get("is_sample", True) else 0))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Təklif Adminə göndərildi! ({status_txt})"})


@app.route("/api/my-proposals", methods=["GET"])
@require_user
def my_proposals():
    conn = get_db()
    rows = [dict(r) for r in conn.execute("SELECT id, title, rating, visibility, awarded_xp, reject_reason FROM problems WHERE author = ? ORDER BY id DESC LIMIT 20", (request._u,)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/admin/proposals", methods=["GET"])
@require_admin
def admin_proposals():
    conn = get_db()
    rows = [dict(r) for r in conn.execute("SELECT * FROM problems WHERE visibility = 'pending' ORDER BY id ASC").fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/admin/proposals/<int:pid>/review", methods=["POST"])
@require_admin
def review_proposal(pid):
    d = request.get_json(silent=True) or {}
    conn = get_db()
    p = conn.execute("SELECT * FROM problems WHERE id = ? AND visibility = 'pending'", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Tapılmadı."}), 404
    if d.get("action") == "approve":
        xp = safe_int(d.get("xp_reward"), 150, 0, 2000)
        vis = d.get("visibility", "archive") if d.get("visibility") in ("archive", "gym") else "archive"
        conn.execute("UPDATE problems SET visibility = ?, awarded_xp = ?, code_label = ? WHERE id = ?", (vis, xp, f"U{pid}", pid))
        award_xp(conn, p["author"], xp)
        conn.commit()
        conn.close()
        return jsonify({"message": f"Təsdiqləndi! {p['author']} +{xp} XP qazandı."})
    conn.execute("UPDATE problems SET visibility = 'rejected', reject_reason = ? WHERE id = ?", (str(d.get("reason") or "Uyğun deyil."), pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Rədd edildi."})


@app.route("/api/run", methods=["POST"])
@rate_limit(25, 60)
def run_custom():
    d = request.get_json(silent=True) or {}
    if not str(d.get("code", "")).strip():
        return jsonify({"ok": False, "status": "Validation Error", "stderr": "Kod boş ola bilməz."}), 400
    return jsonify(run_code_sandbox(str(d.get("language", "python")), str(d.get("code", "")), str(d.get("stdin", "")), d.get("time_limit", 3.0)))


@app.route("/api/submit", methods=["POST"])
@require_user
@rate_limit(20, 60, by_user=True)
def submit_solution():
    me, d = request._u, request.get_json(silent=True) or {}
    pid = safe_int(d.get("problem_id"), 0)
    lang, code, room_id = str(d.get("language", "python")), str(d.get("code", "")), safe_int(d.get("room_id"), 0)
    if pid <= 0 or not code.strip():
        return jsonify({"error": "Məsələ və ya kod boşdur."}), 400
    conn = get_db()
    p = conn.execute("SELECT * FROM problems WHERE id = ?", (pid,)).fetchone()
    if not p or p["visibility"] in ("pending", "rejected"):
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404
    if not check_daily(conn, me, "sub", MAX_DAILY_SUBS):
        conn.close()
        return jsonify({"error": "Gündəlik göndəriş limitiniz bitib."}), 429

    already = conn.execute("SELECT 1 FROM submissions WHERE problem_id = ? AND username = ? AND verdict = 'Accepted' LIMIT 1", (pid, me)).fetchone()
    tests = conn.execute("SELECT * FROM test_cases WHERE problem_id = ? ORDER BY is_sample DESC, id ASC", (pid,)).fetchall()
    passed, total, verdict, details, mtime = 0, len(tests), "Accepted", "", "0.00s"
    for idx, t in enumerate(tests, 1):
        res = run_code_sandbox(lang, code, t["input_data"], p["time_limit"])
        if not res.get("ok"):
            verdict, details = res.get("status", "API Error"), res.get("stderr", "")
            break
        mtime = res.get("time", "-")
        if res["status"] != "OK":
            verdict, details = res["status"], f"Test #{idx}: {res.get('stderr', '')}"
            break
        act, exp = norm_out(res.get("stdout")), norm_out(t["expected_output"])
        if act == exp:
            passed += 1
        else:
            verdict = "Wrong Answer"
            details = f"Test #{idx} — Gözlənilən:\n{exp}\n\nSizin çıxış:\n{act}" if t["is_sample"] else f"Gizli Test #{idx} yanlışdır."
            break

    xp_gain = 0
    if verdict == "Accepted":
        update_streak(conn, me)
        if not already and p["author"] != me:
            xp_gain = 15 if p["rating"] < 1000 else (25 if p["rating"] < 1400 else 40)
            award_xp(conn, me, xp_gain)

    conn.execute("INSERT INTO submissions (problem_id,problem_title,username,language,code,verdict,passed_tests,total_tests,exec_time,details,room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                 (pid, p["title"], me, lang, code, verdict, passed, total, mtime, details, room_id if room_id > 0 else None))
    conn.commit()
    conn.close()
    return jsonify({"verdict": verdict, "passed": passed, "total": total, "time": mtime, "details": details, "xp_gained": xp_gain})


@app.route("/api/submissions", methods=["GET"])
def get_submissions():
    u = (request.args.get("username") or "").strip()
    conn = get_db()
    rows = conn.execute("SELECT id, problem_id, problem_title, username, language, verdict, passed_tests, total_tests, exec_time, details, created_at FROM submissions" + (" WHERE username = ?" if u else "") + " ORDER BY id DESC LIMIT 50", (u,) if u else ()).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    conn = get_db()
    users = conn.execute("SELECT username, level, xp, total_xp, daily_streak FROM users ORDER BY level DESC, total_xp DESC LIMIT 50").fetchall()
    solved = {r["username"]: r["cnt"] for r in conn.execute("SELECT username, COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE verdict='Accepted' GROUP BY username").fetchall()}
    conn.close()
    return jsonify([dict(u) | {"solved_count": solved.get(u["username"], 0), "needed_xp": needed_xp_for_level(u["level"])} for u in users])


@app.route("/api/rooms/mine", methods=["GET"])
@require_user
def my_rooms():
    conn = get_db()
    rows = [dict(r) for r in conn.execute("SELECT r.*, (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count FROM rooms r JOIN room_members rm ON rm.room_id = r.id WHERE rm.username = ? ORDER BY r.id DESC", (request._u,)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/rooms", methods=["POST"])
@require_user
@rate_limit(5, 60, by_user=True)
def create_room():
    me, d = request._u, request.get_json(silent=True) or {}
    title, bio = str(d.get("title") or "").strip()[:70], str(d.get("bio") or "Dostlarla söhbət və kodlaşdırma qrupu").strip()[:220]
    pids = [int(x) for x in (d.get("problem_ids") or []) if str(x).isdigit()][:10]
    if not title:
        return jsonify({"error": "Qrup adı yazın."}), 400
    dur, now = safe_int(d.get("duration_min"), 0, 0, 1440), time.time()
    ends = (now + dur * 60) if dur > 0 else (now + 86400 * 30)
    code16 = f"{secrets.randbelow(10**16):016d}"
    conn = get_db()
    conn.execute("DELETE FROM rooms WHERE ends_at < ?", (now - 86400,))
    if conn.execute("SELECT COUNT(*) FROM rooms WHERE ends_at > ?", (now,)).fetchone()[0] >= MAX_ACTIVE_ROOMS:
        conn.close()
        return jsonify({"error": "Aktiv qrup limitinə çatılıb."}), 429
    rid = conn.execute("INSERT INTO rooms (room_code,title,bio,creator,voice_link,problem_ids_json,duration_min,max_members,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                       (code16, title, bio, me, str(d.get("voice_link") or "").strip()[:240], json.dumps(pids), dur, MAX_ROOM_MEMBERS, now, ends)).lastrowid
    conn.execute("INSERT INTO room_members (room_id, username) VALUES (?, ?)", (rid, me))
    conn.commit()
    conn.close()
    return jsonify({"room_code": code16, "title": title})


@app.route("/api/rooms/join", methods=["POST"])
@require_user
@rate_limit(15, 60)
def join_room():
    me = request._u
    code = re.sub(r"\D", "", str((request.get_json(silent=True) or {}).get("room_code") or ""))
    if len(code) != 16:
        return jsonify({"error": "16 rəqəmli kod daxil edin."}), 400
    conn = get_db()
    rm = conn.execute("SELECT * FROM rooms WHERE room_code = ?", (code,)).fetchone()
    if not rm:
        conn.close()
        return jsonify({"error": "Qrup tapılmadı."}), 404
    if not conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (rm["id"], me)).fetchone():
        if conn.execute("SELECT COUNT(*) FROM room_members WHERE room_id = ?", (rm["id"],)).fetchone()[0] >= rm["max_members"]:
            conn.close()
            return jsonify({"error": "Qrup doludur (maks. 20 nəfər)."}), 403
        conn.execute("INSERT INTO room_members (room_id, username) VALUES (?, ?)", (rm["id"], me))
        conn.commit()
    conn.close()
    return jsonify({"ok": True, "room_code": code})


@app.route("/api/rooms/<code>/bio", methods=["POST"])
@require_user
def update_room_bio(code):
    bio = str((request.get_json(silent=True) or {}).get("bio") or "").strip()[:220]
    conn = get_db()
    rm = conn.execute("SELECT id, creator FROM rooms WHERE room_code = ?", (code,)).fetchone()
    if not rm or rm["creator"].lower() != request._u.lower():
        conn.close()
        return jsonify({"error": "Yalnız qrup yaradıcısı bio-nu dəyişə bilər."}), 403
    conn.execute("UPDATE rooms SET bio = ? WHERE id = ?", (bio, rm["id"]))
    conn.commit()
    conn.close()
    return jsonify({"message": "Qrup biosu yeniləndi!"})


@app.route("/api/rooms/<code>/state", methods=["GET"])
@require_user
def room_state(code):
    me, after_id = request._u, safe_int(request.args.get("after_id"), 0, 0)
    conn = get_db()
    rm = conn.execute("SELECT * FROM rooms WHERE room_code = ?", (code,)).fetchone()
    if not rm or not conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (rm["id"], me)).fetchone():
        conn.close()
        return jsonify({"error": "İcazə yoxdur."}), 403
    pids = json.loads(rm["problem_ids_json"] or "[]")
    probs = [dict(p) for p in conn.execute(f"SELECT id, code_label, title, rating FROM problems WHERE id IN ({','.join('?'*len(pids))})", pids).fetchall()] if pids else []
    members = [r["username"] for r in conn.execute("SELECT username FROM room_members WHERE room_id = ?", (rm["id"],)).fetchall()]
    msgs = [dict(m) for m in conn.execute("SELECT m.*, p.title AS shared_problem_title, r.username AS reply_author, r.message AS reply_text FROM room_messages m LEFT JOIN problems p ON p.id = m.shared_problem_id LEFT JOIN room_messages r ON r.id = m.reply_to_id WHERE m.room_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 80", (rm["id"], after_id)).fetchall()]
    ac = conn.execute("SELECT username, COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE room_id = ? AND verdict = 'Accepted' GROUP BY username", (rm["id"],)).fetchall()
    conn.close()
    ac_map = {x["username"]: x["cnt"] for x in ac}
    board = sorted([{"username": m, "solved": ac_map.get(m, 0)} for m in members], key=lambda x: (-x["solved"], x["username"]))
    rem = max(0, int(rm["ends_at"] - time.time())) if rm["duration_min"] > 0 else -1
    return jsonify({"room": dict(rm) | {"remaining_sec": rem}, "problems": probs, "members": members, "standings": board, "messages": msgs})


@app.route("/api/rooms/<code>/chat", methods=["POST"])
@require_user
@rate_limit(30, 60, by_user=True)
def room_chat(code):
    me, d = request._u, request.get_json(silent=True) or {}
    msg, r_id, spid = str(d.get("message") or "").strip()[:500], safe_int(d.get("reply_to_id"), 0), safe_int(d.get("shared_problem_id"), 0)
    if not msg and spid <= 0:
        return jsonify({"error": "Mesaj boşdur."}), 400
    conn = get_db()
    rm = conn.execute("SELECT id FROM rooms WHERE room_code = ?", (code,)).fetchone()
    if not rm or not conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (rm["id"], me)).fetchone():
        conn.close()
        return jsonify({"error": "Üzv deyilsiniz."}), 403
    if not check_daily(conn, me, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Gündəlik mesaj limitiniz bitib."}), 429
    conn.execute("INSERT INTO room_messages (room_id, username, message, reply_to_id, shared_problem_id) VALUES (?, ?, ?, ?, ?)",
                 (rm["id"], me, msg or "Məsələ yönləndirdi:", r_id if r_id > 0 else None, spid if spid > 0 else None))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/dm/chats", methods=["GET"])
@require_user
def dm_chats():
    me = request._u
    conn = get_db()
    rows = conn.execute("SELECT CASE WHEN sender = ? THEN receiver ELSE sender END AS partner, message, created_at FROM direct_messages WHERE sender = ? OR receiver = ? ORDER BY id DESC", (me, me, me)).fetchall()
    seen, chats = set(), []
    for r in rows:
        if r["partner"] not in seen:
            seen.add(r["partner"])
            chats.append({"username": r["partner"], "last_message": r["message"][:50], "created_at": r["created_at"]})
    conn.close()
    return jsonify(chats)


@app.route("/api/dm/<other>", methods=["GET", "POST"])
@require_user
def dm_thread(other):
    me = request._u
    conn = get_db()
    tu = conn.execute("SELECT username FROM users WHERE username = ?", (other,)).fetchone()
    if not tu:
        conn.close()
        return jsonify({"error": "İstifadəçi tapılmadı."}), 404
    partner = tu["username"]
    if request.method == "GET":
        after_id = safe_int(request.args.get("after_id"), 0, 0)
        msgs = [dict(m) for m in conn.execute("SELECT d.*, p.title AS shared_problem_title, r.sender AS reply_author, r.message AS reply_text FROM direct_messages d LEFT JOIN problems p ON p.id = d.shared_problem_id LEFT JOIN direct_messages r ON r.id = d.reply_to_id WHERE ((d.sender = ? AND d.receiver = ?) OR (d.sender = ? AND d.receiver = ?)) AND d.id > ? ORDER BY d.id ASC LIMIT 100", (me, partner, partner, me, after_id)).fetchall()]
        conn.close()
        return jsonify({"partner": partner, "messages": msgs})

    d = request.get_json(silent=True) or {}
    msg, r_id, spid = str(d.get("message") or "").strip()[:600], safe_int(d.get("reply_to_id"), 0), safe_int(d.get("shared_problem_id"), 0)
    if not msg and spid <= 0:
        conn.close()
        return jsonify({"error": "Mesaj boşdur."}), 400
    if not check_daily(conn, me, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Gündəlik mesaj limitiniz bitib."}), 429
    conn.execute("INSERT INTO direct_messages (sender, receiver, message, reply_to_id, shared_problem_id) VALUES (?, ?, ?, ?, ?)",
                 (me, partner, msg or "Məsələ göndərdi:", r_id if r_id > 0 else None, spid if spid > 0 else None))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts", methods=["GET", "POST"])
def posts_handler():
    u, adm, _ = get_session()
    conn = get_db()
    if request.method == "GET":
        posts = [dict(p) for p in conn.execute("SELECT * FROM posts ORDER BY is_pinned DESC, id DESC LIMIT 35").fetchall()]
        for p in posts:
            pid, opts = p["id"], json.loads(p["poll_options_json"] or "[]")
            vmap = {r["option_index"]: r["cnt"] for r in conn.execute("SELECT option_index, COUNT(*) AS cnt FROM poll_votes WHERE post_id = ? GROUP BY option_index", (pid,)).fetchall()}
            mv = conn.execute("SELECT option_index FROM poll_votes WHERE post_id = ? AND username = ?", (pid, u)).fetchone() if u else None
            p["poll_options"] = [{"text": t, "votes": vmap.get(i, 0)} for i, t in enumerate(opts)]
            p["my_vote"] = mv["option_index"] if mv else None
            p["total_votes"] = sum(vmap.values())
            rmap = {r["emoji"]: r["cnt"] for r in conn.execute("SELECT emoji, COUNT(*) AS cnt FROM post_reactions WHERE post_id = ? GROUP BY emoji", (pid,)).fetchall()}
            mr = {r["emoji"] for r in conn.execute("SELECT emoji FROM post_reactions WHERE post_id = ? AND username = ?", (pid, u)).fetchall()} if u else set()
            p["reactions"] = [{"emoji": e, "count": rmap.get(e, 0), "mine": e in mr} for e in ALLOWED_EMOJIS]
            p["comments"] = [dict(c) for c in conn.execute("SELECT * FROM post_comments WHERE post_id = ? ORDER BY id ASC", (pid,)).fetchall()]
        conn.close()
        return jsonify(posts)

    if not u:
        conn.close()
        return jsonify({"error": "Daxil olun."}), 401
    d = request.get_json(silent=True) or {}
    t, b = str(d.get("title") or "").strip()[:140], str(d.get("body") or "").strip()[:2000]
    opts = [str(o).strip()[:80] for o in (d.get("poll_options") or []) if str(o).strip()][:6]
    is_ann = adm and bool(d.get("is_announcement"))
    if not t or not b:
        conn.close()
        return jsonify({"error": "Başlıq və məzmun yazın."}), 400
    if not check_daily(conn, u, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Gündəlik limit bitib."}), 429
    conn.execute("INSERT INTO posts (author, title, body, post_type, is_pinned, poll_options_json) VALUES (?, ?, ?, ?, ?, ?)",
                 (u, t, b, "announcement" if is_ann else ("poll" if opts else "post"), 1 if is_ann else 0, json.dumps(opts)))
    conn.commit()
    conn.close()
    return jsonify({"message": "Duyuru panosunda paylaşıldı!"})


@app.route("/api/posts/<int:pid>/vote", methods=["POST"])
@require_user
def vote_poll(pid):
    idx = (request.get_json(silent=True) or {}).get("option_index")
    conn = get_db()
    p = conn.execute("SELECT poll_options_json FROM posts WHERE id = ?", (pid,)).fetchone()
    if not p or not isinstance(idx, int) or not (0 <= idx < len(json.loads(p["poll_options_json"] or "[]"))):
        conn.close()
        return jsonify({"error": "Yanlış variant."}), 400
    conn.execute("INSERT OR REPLACE INTO poll_votes (post_id, username, option_index) VALUES (?, ?, ?)", (pid, request._u, idx))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts/<int:pid>/react", methods=["POST"])
@require_user
def react_post(pid):
    em = str((request.get_json(silent=True) or {}).get("emoji") or "")
    if em not in ALLOWED_EMOJIS:
        return jsonify({"error": "Yanlış emoji."}), 400
    conn = get_db()
    ex = conn.execute("SELECT id FROM post_reactions WHERE post_id = ? AND username = ? AND emoji = ?", (pid, request._u, em)).fetchone()
    conn.execute("DELETE FROM post_reactions WHERE id = ?" if ex else "INSERT INTO post_reactions (post_id, username, emoji) VALUES (?, ?, ?)", (ex["id"],) if ex else (pid, request._u, em))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts/<int:pid>/comment", methods=["POST"])
@require_user
def comment_post(pid):
    d = request.get_json(silent=True) or {}
    body, par = str(d.get("body") or "").strip()[:600], safe_int(d.get("parent_id"), 0)
    if not body:
        return jsonify({"error": "Şərh boşdur."}), 400
    conn = get_db()
    if not check_daily(conn, request._u, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Limit bitib."}), 429
    conn.execute("INSERT INTO post_comments (post_id, parent_id, author, body) VALUES (?, ?, ?, ?)", (pid, par if par > 0 else None, request._u, body))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts/<int:pid>", methods=["DELETE"])
@require_admin
def delete_post(pid):
    conn = get_db()
    conn.execute("DELETE FROM posts WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/creative", methods=["GET", "POST"])
def creative_handler():
    conn = get_db()
    if request.method == "GET":
        rows = [dict(r) for r in conn.execute("SELECT * FROM creative_codes ORDER BY id DESC").fetchall()]
        conn.close()
        return jsonify(rows)
    u, _, _ = get_session()
    if not u:
        conn.close()
        return jsonify({"error": "Daxil olun."}), 401
    d = request.get_json(silent=True) or {}
    t, code, lang = str(d.get("title") or "").strip(), str(d.get("code") or ""), str(d.get("language", "python"))
    if not t or not code.strip() or lang not in ALLOWED_LANGS:
        conn.close()
        return jsonify({"error": "Məlumatlar natamamdır."}), 400
    conn.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES (?, ?, ?, ?, ?, ?)",
                 (t[:100], str(d.get("description", ""))[:400], lang, code, str(d.get("sample_input", ""))[:1000], u))
    conn.commit()
    conn.close()
    return jsonify({"message": "Paylaşıldı!"})


@app.route("/api/settings", methods=["GET", "POST"])
@require_admin
def settings_handler():
    conn = get_db()
    if request.method == "GET":
        cfg = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings WHERE key IN ('provider','base_url','api_key')").fetchall()}
        conn.close()
        return jsonify({"provider": cfg.get("provider", "judge0"), "base_url": cfg.get("base_url", "https://ce.judge0.com"), "has_api_key": bool(cfg.get("api_key"))})
    d = request.get_json(silent=True) or {}
    if d.get("provider") in ALLOWED_PROVIDERS:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider', ?)", (d["provider"],))
    if "base_url" in d:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('base_url', ?)", (str(d["base_url"]).strip(),))
    if str(d.get("api_key") or "").strip():
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)", (str(d["api_key"]).strip(),))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ayarlar yadda saxlanıldı!"})


@app.route("/api/test-connection", methods=["POST"])
@require_admin
def test_conn():
    return jsonify(run_code_sandbox("python", "print('AzForces OK!')", "", 2.0))


if __name__ == "__main__":
    _boot()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true", threaded=True)