import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading
import time
from collections import defaultdict
from functools import wraps

import requests
from flask import Flask, jsonify, make_response, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 512 * 1024  # 512 KB limit

if os.environ.get("TRUST_PROXY", "true").lower() == "true":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

DB_PATH = os.environ.get("DB_PATH", "azforces.db")

ALLOWED_LANGUAGES = {"python", "cpp", "c", "java", "javascript"}
ALLOWED_PROVIDERS = {"piston", "judge0", "local"}
ALLOWED_EMOJIS = {"👍", "🔥", "💡", "👏", "❤️"}
MAX_CODE_LENGTH = 65536
MAX_STDIN_LENGTH = 65536
MAX_LOCAL_OUTPUT = 65536

# Buludda təhlükəsizlik üçün susmaya görə bağlıdır (yalnız lokal testdə ALLOW_LOCAL_RUNNER=true)
ALLOW_LOCAL_RUNNER = os.environ.get("ALLOW_LOCAL_RUNNER", "false").lower() == "true"

SESSION_TTL = int(os.environ.get("SESSION_TTL", "86400"))
ADMIN_SESSION_TTL = int(os.environ.get("ADMIN_SESSION_TTL", "7200"))
CHALLENGE_TTL = 300
MAX_2FA_ATTEMPTS = 5
MAX_ADMIN_FAILS = 5
ADMIN_LOCKOUT_SECONDS = 900
MAX_ROOM_MEMBERS = 20
MAX_ACTIVE_ROOMS = 20
MAX_DAILY_MESSAGES = 50
MAX_DAILY_SUBMISSIONS = 40
MAX_DAILY_PROPOSALS = 2

_ENV_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
if not _ENV_PASSWORD_HASH and os.environ.get("ADMIN_PASSWORD", "").strip():
    _ENV_PASSWORD_HASH = generate_password_hash(os.environ["ADMIN_PASSWORD"].strip())

_db_init_lock = threading.Lock()
_db_initialized = False
_auth_lock = threading.Lock()
_admin_challenges = {}
_admin_fail_state = {"count": 0, "locked_until": 0.0}
_used_totp_steps = set()
_rate_lock = threading.Lock()
_rate_buckets = defaultdict(list)


def get_client_ip():
    return request.remote_addr or "unknown"


def rate_limit(max_requests=20, window_seconds=60, key_by_user=False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ident = get_client_ip()
            if key_by_user:
                u = getattr(request, "_az_username", "")
                if u:
                    ident = f"user:{u}"
            now = time.time()
            with _rate_lock:
                recent = [t for t in _rate_buckets[ident] if now - t < window_seconds]
                if len(recent) >= max_requests:
                    _rate_buckets[ident] = recent
                    return jsonify({"error": f"Çox tez-tez sorğu göndərirsiniz. {window_seconds} san gözləyin."}), 429
                recent.append(now)
                _rate_buckets[ident] = recent
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def get_setting(key, default=""):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key, value):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()


def get_admin_password_hash():
    return _ENV_PASSWORD_HASH or get_setting("admin_password_hash", "")


def get_totp_secret():
    return os.environ.get("ADMIN_TOTP_SECRET", "").strip() or get_setting("admin_totp_secret", "").strip()


def verify_totp_code(secret, code):
    clean = str(code or "").strip()
    if not clean.isdigit() or len(clean) != 6:
        return False
    try:
        norm = secret.strip().replace(" ", "").upper()
        key = base64.b32decode(norm + "=" * ((8 - len(norm) % 8) % 8), casefold=True)
    except Exception:
        return False
    step_now = int(time.time() // 30)
    for off in (-1, 0, 1):
        step = step_now + off
        if step in _used_totp_steps:
            continue
        digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
        pos = digest[-1] & 0x0F
        num = struct.unpack(">I", digest[pos:pos + 4])[0] & 0x7FFFFFFF
        if hmac.compare_digest(f"{num % 1000000:06d}", clean):
            _used_totp_steps.add(step)
            if len(_used_totp_steps) > 50:
                _used_totp_steps.clear()
            return True
    return False


def deliver_otp_code(otp_code, ip):
    tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    tg_chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if tg_token and tg_chat:
        try:
            requests.post(
                f"https://api.telegram.org/bot{tg_token}/sendMessage",
                json={"chat_id": tg_chat, "text": f"AzForces Admin 2FA kodu: {otp_code} (IP: {ip})"},
                timeout=8,
            )
            return "telegram"
        except requests.RequestException:
            pass
    print(f"\n[AzForces 2FA] IP={ip} üçün kod: {otp_code} (5 dəq etibarlıdır)\n", flush=True)
    return "console"


def xp_rank(xp):
    if xp >= 3000:
        return {"name": "Ustad", "color": "#ef4444"}
    if xp >= 1500:
        return {"name": "Ekspert", "color": "#a855f7"}
    if xp >= 600:
        return {"name": "Mütəxəssis", "color": "#38bdf8"}
    if xp >= 200:
        return {"name": "Şagird", "color": "#22c55e"}
    return {"name": "Yeni Başlayan", "color": "#8b949e"}


def get_current_session():
    user_tok = request.cookies.get("az_session", "").strip()
    admin_tok = request.cookies.get("az_admin_session", "").strip() or request.headers.get("X-Admin-Token", "").strip()
    now = time.time()
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    conn.commit()
    username, is_admin = None, False
    if user_tok:
        r = conn.execute("SELECT username FROM sessions WHERE token = ? AND is_admin = 0 AND expires_at > ?", (user_tok, now)).fetchone()
        if r:
            username = r["username"]
    if admin_tok:
        r = conn.execute("SELECT username FROM sessions WHERE token = ? AND is_admin = 1 AND expires_at > ?", (admin_tok, now)).fetchone()
        if r:
            is_admin = True
            if not username:
                username = r["username"]
    conn.close()
    return username, is_admin


def create_session(username, is_admin=False, ttl=SESSION_TTL):
    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (token, username, is_admin, expires_at) VALUES (?, ?, ?, ?)",
        (token, username, 1 if is_admin else 0, time.time() + ttl),
    )
    conn.commit()
    conn.close()
    return token


def set_secure_cookie(resp, name, value, max_age):
    is_https = request.is_secure or request.headers.get("X-Forwarded-Proto", "") == "https"
    resp.set_cookie(name, value, max_age=max_age, httponly=True, samesite="Lax", secure=is_https)


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        username, _ = get_current_session()
        if not username:
            return jsonify({"error": "Bu əməliyyat üçün hesabınıza daxil olun."}), 401
        request._az_username = username
        return fn(*args, **kwargs)
    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        username, is_admin = get_current_session()
        if not is_admin:
            return jsonify({"error": "İcazə yoxdur. Admin girişi tələb olunur."}), 401
        request._az_username = username or "Admin"
        return fn(*args, **kwargs)
    return wrapper


def ensure_admin_credentials(conn):
    if _ENV_PASSWORD_HASH:
        return
    row = conn.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'").fetchone()
    if not row or not row["value"]:
        pw = secrets.token_urlsafe(12)
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_hash', ?)", (generate_password_hash(pw),))
        print(f"\n[AzForces] İlk Admin Parolu: {pw}\n(Render-də ADMIN_PASSWORD dəyişənini təyin edin)\n", flush=True)


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        xp INTEGER DEFAULT 0, daily_msg_date TEXT DEFAULT '', daily_msg_count INTEGER DEFAULT 0,
        daily_submit_date TEXT DEFAULT '', daily_submit_count INTEGER DEFAULT 0,
        daily_proposal_date TEXT DEFAULT '', daily_proposal_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, is_admin INTEGER DEFAULT 0, expires_at REAL NOT NULL)")
    c.execute("""CREATE TABLE IF NOT EXISTS contests (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
        duration_min INTEGER DEFAULT 90, starts_at REAL NOT NULL, ends_at REAL NOT NULL,
        status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code_label TEXT DEFAULT '', title TEXT NOT NULL,
        rating INTEGER DEFAULT 800, tags TEXT DEFAULT 'math', time_limit REAL DEFAULT 2.0, memory_limit INTEGER DEFAULT 256,
        statement TEXT NOT NULL, input_spec TEXT DEFAULT '', output_spec TEXT DEFAULT '', note TEXT DEFAULT '',
        editorial TEXT DEFAULT '', starter_code TEXT DEFAULT '', author TEXT DEFAULT 'AzForces',
        visibility TEXT DEFAULT 'archive', contest_id INTEGER DEFAULT NULL, author_check_status TEXT DEFAULT '',
        reject_reason TEXT DEFAULT '', awarded_xp INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS test_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL, input_data TEXT NOT NULL,
        expected_output TEXT NOT NULL, is_sample INTEGER DEFAULT 1,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id INTEGER NOT NULL, problem_title TEXT NOT NULL,
        username TEXT NOT NULL, language TEXT NOT NULL, code TEXT NOT NULL, verdict TEXT NOT NULL,
        passed_tests INTEGER DEFAULT 0, total_tests INTEGER DEFAULT 0, exec_time TEXT DEFAULT '-',
        details TEXT DEFAULT '', room_id INTEGER DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        creator TEXT NOT NULL, voice_link TEXT DEFAULT '', problem_ids_json TEXT NOT NULL,
        duration_min INTEGER DEFAULT 60, max_members INTEGER DEFAULT 20, starts_at REAL NOT NULL,
        ends_at REAL NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS room_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, username TEXT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(room_id, username),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS room_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, username TEXT NOT NULL,
        message TEXT NOT NULL, shared_problem_id INTEGER DEFAULT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        post_type TEXT DEFAULT 'post', poll_options_json TEXT DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    c.execute("""CREATE TABLE IF NOT EXISTS poll_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, username TEXT NOT NULL,
        option_index INTEGER NOT NULL, UNIQUE(post_id, username),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS post_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, username TEXT NOT NULL,
        emoji TEXT NOT NULL, UNIQUE(post_id, username, emoji),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS post_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, parent_id INTEGER DEFAULT NULL,
        author TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)""")
    c.execute("""CREATE TABLE IF NOT EXISTS creative_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
        language TEXT NOT NULL, code TEXT NOT NULL, sample_input TEXT DEFAULT '',
        author TEXT DEFAULT 'AzForces', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")

    for k, v in {
        "provider": os.environ.get("JUDGE_PROVIDER", "piston"),
        "base_url": os.environ.get("JUDGE_BASE_URL", "https://api.onlinecompiler.io/api/v2/piston"),
        "api_key": os.environ.get("JUDGE_API_KEY", ""),
    }.items():
        c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

    ensure_admin_credentials(conn)

    if c.execute("SELECT COUNT(*) FROM problems").fetchone()[0] == 0:
        samples = [
            ("1A", "A + B Cəmi", 800, "math, implementation", 1.0, 256,
             "Sizə iki tam ədəd $a$ və $b$ verilir ($-10^9 \\le a, b \\le 10^9$). Onların cəmini ($a + b$) hesablayın.",
             "Tək sətirdə boşluqla ayrılmış iki tam ədəd $a$ və $b$ verilir.", "$a + b$ cəmini çap edin.",
             "Nümunədə $3 + 5 = 8$.", "`a, b = map(int, input().split()); print(a + b)`",
             "a, b = map(int, input().split())\nprint(a + b)", [("3 5", "8", 1), ("-10 25", "15", 1), ("1000000000 1000000000", "2000000000", 0)]),
            ("1B", "Sadə Ədəd Yoxlanışı", 1000, "number theory, math", 2.0, 256,
             "Verilmiş $n$ natural ədədinin ($1 \\le n \\le 10^9$) sadə olub-olmadığını yoxlayın.",
             "Bir tam ədəd $n$ verilir.", "Sadədirsə `YES`, əks halda `NO` çap edin.",
             "$1$ sadə ədəd sayılmır.", "$2$-dən $\\sqrt{n}$-ə qədər bölənləri yoxlayın.",
             "n = int(input())\n# Kodunuzu yazın\n", [("7", "YES", 1), ("1", "NO", 1), ("1000000007", "YES", 0), ("99999999", "NO", 0)]),
            ("1C", "Hədəf Cəm (Two Sum)", 1200, "hashing, arrays", 2.0, 256,
             "Sizə $n$ elementdən ibarət massiv və hədəf $k$ verilir ($2 \\le n \\le 10^5$). Cəmi $k$-ya bərabər olan $a_i + a_j = k$ ($i \\ne j$) cütlüyü varmı?",
             "1-ci sətirdə $n$ və $k$. 2-ci sətirdə $n$ ədəd.", "Varsa `YES`, yoxdursa `NO`.",
             "Eyni elementi iki dəfə götürmək olmaz.", "Gördüyünüz ədədləri `set()`-də saxlayın.",
             "n, k = map(int, input().split())\narr = list(map(int, input().split()))\n", [("4 9\n2 7 11 15", "YES", 1), ("3 6\n3 2 4", "YES", 1), ("3 10\n1 2 3", "NO", 0)]),
        ]
        for lbl, title, rating, tags, tl, ml, st, ins, outs, note, ed, sc, tests in samples:
            c.execute(
                """INSERT INTO problems (code_label, title, rating, tags, time_limit, memory_limit,
                   statement, input_spec, output_spec, note, editorial, starter_code, author, visibility)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AzForces', 'archive')""",
                (lbl, title, rating, tags, tl, ml, st, ins, outs, note, ed, sc),
            )
            pid = c.lastrowid
            for inp, out, is_s in tests:
                c.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, inp, out, is_s))

    if c.execute("SELECT COUNT(*) FROM creative_codes").fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("Almaz ASCII Art", "Simmetrik almaz fiquru çəkir.", "python",
                 "n = int(input() or 5)\nfor i in range(n):\n    print(' '*(n-i-1)+'*'*(2*i+1))\nfor i in range(n-2,-1,-1):\n    print(' '*(n-i-1)+'*'*(2*i+1))", "5", "AzForces"),
                ("Sierpinski Üçbucağı", "Bit əməliyyatları ilə fraktal naxışı.", "python",
                 "n = int(input() or 16)\nfor y in range(n-1,-1,-1):\n    print(' '*y+''.join('* ' if (x&y)==0 else '  ' for x in range(n-y)))", "16", "AzForces"),
            ],
        )

    if c.execute("SELECT COUNT(*) FROM posts").fetchone()[0] == 0:
        c.execute(
            "INSERT INTO posts (author, title, body, post_type, poll_options_json) VALUES (?, ?, ?, 'poll', ?)",
            ("AzForces", "Növbəti mini-yarışın mövzusu nə olsun?",
             "Səs verin və aşağıda fikrinizi yazın!",
             json.dumps(["Riyaziyyat", "Massivlər & Two Pointers", "Dinamik Proqramlaşdırma", "Qraflar"])),
        )

    conn.commit()
    conn.close()


@app.before_request
def ensure_initialized():
    global _db_initialized
    if not _db_initialized:
        with _db_init_lock:
            if not _db_initialized:
                init_db()
                _db_initialized = True


@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    return resp


def sync_finished_contests(conn):
    now = time.time()
    expired = conn.execute("SELECT id FROM contests WHERE status = 'active' AND ends_at <= ?", (now,)).fetchall()
    if expired:
        for r in expired:
            conn.execute("UPDATE contests SET status = 'finished' WHERE id = ?", (r["id"],))
            conn.execute("UPDATE problems SET visibility = 'gym' WHERE contest_id = ? AND visibility = 'contest'", (r["id"],))
        conn.commit()


def check_daily_limit(conn, username, kind, limit):
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not user:
        return True, limit
    today = time.strftime("%Y-%m-%d")
    dcol, ccol = f"daily_{kind}_date", f"daily_{kind}_count"
    count = user[ccol] if user[dcol] == today else 0
    if count >= limit:
        return False, 0
    conn.execute(f"UPDATE users SET {dcol} = ?, {ccol} = ? WHERE username = ?", (today, count + 1, username))
    return True, limit - (count + 1)


def normalize_output(text):
    if text is None:
        return ""
    return "\n".join(line.rstrip() for line in text.replace("\r\n", "\n").strip().splitlines())


def mask_api_key(key):
    return "" if not key else ("****" if len(key) <= 4 else "****" + key[-4:])


def get_api_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('provider', 'base_url', 'api_key')").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def run_code_local(language, code, stdin_data="", time_limit=2.0):
    if not ALLOW_LOCAL_RUNNER:
        return {"ok": False, "status": "API Error", "stderr": "Yerli icra deaktivdir (ALLOW_LOCAL_RUNNER=false)."}
    with tempfile.TemporaryDirectory(prefix="azforces_") as tmpdir:
        try:
            if language == "python":
                src = os.path.join(tmpdir, "main.py")
                with open(src, "w", encoding="utf-8") as f:
                    f.write(code)
                cmd = [sys.executable, "-I", src]
            elif language == "javascript":
                nb = shutil.which("node")
                if not nb:
                    return {"ok": False, "status": "Environment Error", "stderr": "Node.js tapılmadı."}
                src = os.path.join(tmpdir, "main.js")
                with open(src, "w", encoding="utf-8") as f:
                    f.write(code)
                cmd = [nb, src]
            elif language in ("c", "cpp"):
                comp_bin = shutil.which("g++" if language == "cpp" else "gcc")
                if not comp_bin:
                    return {"ok": False, "status": "Environment Error", "stderr": "Kompilyator tapılmadı."}
                src = os.path.join(tmpdir, f"main.{language}")
                exe = os.path.join(tmpdir, "main.exe" if os.name == "nt" else "main")
                with open(src, "w", encoding="utf-8") as f:
                    f.write(code)
                comp = subprocess.run([comp_bin, src, "-O2", "-o", exe], capture_output=True, text=True, timeout=15)
                if comp.returncode != 0:
                    return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": comp.stderr[:MAX_LOCAL_OUTPUT], "time": "0.00s"}
                cmd = [exe]
            else:
                return {"ok": False, "status": "Environment Error", "stderr": f"Yerli rejimdə '{language}' dəstəklənmir."}
            t0 = time.perf_counter()
            proc = subprocess.run(cmd, input=stdin_data, capture_output=True, text=True, timeout=time_limit, cwd=tmpdir)
            el = f"{time.perf_counter() - t0:.2f}s"
            out, err = (proc.stdout or "")[:MAX_LOCAL_OUTPUT], (proc.stderr or "")[:MAX_LOCAL_OUTPUT]
            if proc.returncode != 0:
                return {"ok": True, "status": "Runtime Error", "stdout": out, "stderr": err or f"Exit {proc.returncode}", "time": el}
            return {"ok": True, "status": "OK", "stdout": out, "stderr": err, "time": el}
        except subprocess.TimeoutExpired:
            return {"ok": True, "status": "Time Limit Exceeded", "stdout": "", "stderr": "Vaxt limiti aşıldı", "time": f"{time_limit:.2f}s"}
        except Exception as e:
            return {"ok": False, "status": "Local Error", "stderr": str(e)}


def run_code_sandbox(language, code, stdin_data="", time_limit=2.0):
    if language not in ALLOWED_LANGUAGES:
        return {"ok": False, "status": "Validation Error", "stderr": "Dəstəklənməyən dil."}
    if len(code) > MAX_CODE_LENGTH or len(stdin_data) > MAX_STDIN_LENGTH:
        return {"ok": False, "status": "Validation Error", "stderr": "Kod və ya giriş 64 KB limitini aşır."}
    try:
        t_limit = max(0.5, min(float(time_limit), 10.0))
    except (ValueError, TypeError):
        t_limit = 2.0

    cfg = get_api_settings()
    provider, base_url, api_key = cfg.get("provider", "piston"), cfg.get("base_url", "").strip().rstrip("/"), cfg.get("api_key", "").strip()
    if provider == "local":
        return run_code_local(language, code, stdin_data, t_limit)
    if not base_url:
        return {"ok": False, "status": "API Error", "stderr": "API Base URL təyin edilməyib."}

    try:
        if provider == "piston":
            lmap = {"python": ("python", "main.py"), "cpp": ("c++", "main.cpp"), "c": ("c", "main.c"), "java": ("java", "Main.java"), "javascript": ("javascript", "main.js")}
            pl, fn = lmap[language]
            hdrs = {"Content-Type": "application/json"}
            if api_key:
                hdrs["Authorization"] = api_key
            resp = requests.post(f"{base_url}/execute", json={"language": pl, "version": "*", "files": [{"name": fn, "content": code}], "stdin": stdin_data, "run_timeout": int(t_limit * 1000)}, headers=hdrs, timeout=25)
            if resp.status_code in (401, 403):
                return {"ok": False, "status": "API Auth Error", "stderr": f"API açarı yanlışdır (HTTP {resp.status_code})."}
            if resp.status_code >= 400:
                return {"ok": False, "status": "API Error", "stderr": f"HTTP {resp.status_code}: {resp.text}"}
            data = resp.json()
            comp = data.get("compile")
            if comp and comp.get("code", 0) != 0:
                return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": comp.get("stderr") or comp.get("output") or "Kompilyasiya xətası", "time": "0.00s"}
            run = data.get("run", {})
            ms = run.get("wall_time")
            ts = f"{ms / 1000:.2f}s" if isinstance(ms, (int, float)) else "-"
            if run.get("status") == "TO":
                return {"ok": True, "status": "Time Limit Exceeded", "stdout": run.get("stdout", ""), "stderr": "Vaxt limiti aşıldı", "time": ts}
            if run.get("code", 0) != 0 or run.get("status") in ("RE", "SG"):
                return {"ok": True, "status": "Runtime Error", "stdout": run.get("stdout", ""), "stderr": run.get("stderr") or run.get("message") or "İcra xətası", "time": ts}
            return {"ok": True, "status": "OK", "stdout": run.get("stdout", ""), "stderr": run.get("stderr", ""), "time": ts}

        elif provider == "judge0":
            lids = {"python": 71, "cpp": 54, "c": 50, "java": 62, "javascript": 63}
            hdrs = {"Content-Type": "application/json"}
            if api_key:
                if "rapidapi.com" in base_url:
                    hdrs["X-RapidAPI-Key"] = api_key
                    hdrs["X-RapidAPI-Host"] = base_url.split("//")[-1].split("/")[0]
                else:
                    hdrs["X-Auth-Token"] = api_key
                    hdrs["Authorization"] = api_key
            resp = requests.post(f"{base_url}/submissions?base64_encoded=false&wait=true", json={"language_id": lids[language], "source_code": code, "stdin": stdin_data, "cpu_time_limit": t_limit}, headers=hdrs, timeout=25)
            if resp.status_code in (401, 403):
                return {"ok": False, "status": "API Auth Error", "stderr": f"Judge0 API açarı yanlışdır (HTTP {resp.status_code})."}
            if resp.status_code >= 400:
                return {"ok": False, "status": "API Error", "stderr": f"HTTP {resp.status_code}: {resp.text}"}
            data = resp.json()
            if data.get("token") and data.get("status", {}).get("id") in (1, 2, None):
                for _ in range(12):
                    time.sleep(0.75)
                    poll = requests.get(f"{base_url}/submissions/{data['token']}?base64_encoded=false", headers=hdrs, timeout=15)
                    if poll.status_code == 200:
                        data = poll.json()
                        if data.get("status", {}).get("id", 0) not in (1, 2):
                            break
            sid, desc = data.get("status", {}).get("id", 0), data.get("status", {}).get("description", "Unknown")
            et = f"{data.get('time')}s" if data.get("time") else "-"
            if sid == 6:
                return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": data.get("compile_output") or desc, "time": et}
            if sid == 5:
                return {"ok": True, "status": "Time Limit Exceeded", "stdout": data.get("stdout") or "", "stderr": "Vaxt limiti aşıldı", "time": et}
            if sid >= 7:
                return {"ok": True, "status": "Runtime Error", "stdout": data.get("stdout") or "", "stderr": data.get("stderr") or data.get("message") or desc, "time": et}
            return {"ok": True, "status": "OK", "stdout": data.get("stdout") or "", "stderr": data.get("stderr") or "", "time": et}
        return {"ok": False, "status": "API Error", "stderr": "Naməlum provayder."}
    except requests.RequestException as e:
        return {"ok": False, "status": "Connection Error", "stderr": f"API bağlantısı uğursuz: {e}"}


@app.route("/")
def index():
    return render_template("azforces.html")


# --- Auth (İstifadəçi + Admin 2FA) ---
@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    username, is_admin = get_current_session()
    xp, limits = 0, {"msg_left": MAX_DAILY_MESSAGES, "submit_left": MAX_DAILY_SUBMISSIONS, "proposal_left": MAX_DAILY_PROPOSALS}
    if username:
        conn = get_db()
        u = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        if u:
            xp = u["xp"]
            today = time.strftime("%Y-%m-%d")
            limits = {
                "msg_left": MAX_DAILY_MESSAGES - (u["daily_msg_count"] if u["daily_msg_date"] == today else 0),
                "submit_left": MAX_DAILY_SUBMISSIONS - (u["daily_submit_count"] if u["daily_submit_date"] == today else 0),
                "proposal_left": MAX_DAILY_PROPOSALS - (u["daily_proposal_count"] if u["daily_proposal_date"] == today else 0),
            }
    return jsonify({
        "authenticated": bool(username),
        "username": username,
        "is_admin": is_admin,
        "xp": xp,
        "rank": xp_rank(xp),
        "limits": limits,
        "totp_enabled": bool(get_totp_secret()) if is_admin else False,
    })


@app.route("/api/auth/register", methods=["POST"])
@rate_limit(max_requests=10, window_seconds=60)
def auth_register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not (3 <= len(username) <= 24) or not all(ch.isalnum() or ch in "_-" for ch in username):
        return jsonify({"error": "İstifadəçi adı 3-24 simvol (hərf, rəqəm, _ -) olmalıdır."}), 400
    if len(password) < 6:
        return jsonify({"error": "Parol ən azı 6 simvol olmalıdır."}), 400
    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)", (username,)).fetchone():
        conn.close()
        return jsonify({"error": "Bu istifadəçi adı artıq tutulub."}), 400
    conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, generate_password_hash(password)))
    conn.commit()
    conn.close()
    tok = create_session(username, is_admin=False, ttl=SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": username, "message": "Hesab yaradıldı və giriş edildi!"}))
    set_secure_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/login", methods=["POST"])
@rate_limit(max_requests=15, window_seconds=60)
def auth_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    conn = get_db()
    u = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not u or not check_password_hash(u["password_hash"], password):
        return jsonify({"error": "İstifadəçi adı və ya parol səhvdir."}), 401
    tok = create_session(u["username"], is_admin=False, ttl=SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": u["username"], "message": "Xoş gəldiniz!"}))
    set_secure_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    user_tok = request.cookies.get("az_session", "").strip()
    admin_tok = request.cookies.get("az_admin_session", "").strip()
    conn = get_db()
    for t in (user_tok, admin_tok):
        if t:
            conn.execute("DELETE FROM sessions WHERE token = ?", (t,))
    conn.commit()
    conn.close()
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("az_session")
    resp.delete_cookie("az_admin_session")
    return resp


@app.route("/api/admin/login", methods=["POST"])
@rate_limit(max_requests=10, window_seconds=60)
def admin_login_step1():
    now = time.time()
    with _auth_lock:
        if _admin_fail_state["locked_until"] > now:
            rem = int(_admin_fail_state["locked_until"] - now)
            return jsonify({"error": f"Çox sayda səhv cəhd. {rem} saniyə sonra yoxlayın."}), 429

    data = request.get_json(silent=True) or {}
    password = str(data.get("password") or "")
    pw_hash = get_admin_password_hash()

    if not pw_hash or not password or not check_password_hash(pw_hash, password):
        with _auth_lock:
            _admin_fail_state["count"] += 1
            if _admin_fail_state["count"] >= MAX_ADMIN_FAILS:
                _admin_fail_state["locked_until"] = now + ADMIN_LOCKOUT_SECONDS
                _admin_fail_state["count"] = 0
        return jsonify({"error": "Admin parolu yanlışdır."}), 401

    with _auth_lock:
        _admin_fail_state["count"] = 0

    totp = get_totp_secret()
    cid = secrets.token_urlsafe(24)
    if totp:
        method, otp_hash, delivery = "totp", "", "authenticator"
    else:
        method = "otp"
        code = f"{secrets.randbelow(1_000_000):06d}"
        otp_hash = generate_password_hash(code)
        delivery = deliver_otp_code(code, get_client_ip())

    with _auth_lock:
        for k in [k for k, v in _admin_challenges.items() if v["expires_at"] <= now]:
            _admin_challenges.pop(k, None)
        _admin_challenges[cid] = {"method": method, "otp_hash": otp_hash, "attempts": 0, "expires_at": now + CHALLENGE_TTL}

    msg = "Authenticator-dakı 6 rəqəmli TOTP kodunu yazın." if method == "totp" else f"6 rəqəmli kod ({'Telegram' if delivery == 'telegram' else 'server konsolu'}) üzərindən göndərildi."
    return jsonify({"requires_2fa": True, "challenge_id": cid, "method": method, "message": msg})


@app.route("/api/admin/verify-2fa", methods=["POST"])
@rate_limit(max_requests=15, window_seconds=60)
def admin_login_step2():
    data = request.get_json(silent=True) or {}
    cid, code = str(data.get("challenge_id") or "").strip(), str(data.get("code") or "").strip()
    now = time.time()
    with _auth_lock:
        ch = _admin_challenges.get(cid)
        if not ch or ch["expires_at"] <= now:
            _admin_challenges.pop(cid, None)
            return jsonify({"error": "Müddət bitib, yenidən parol daxil edin."}), 401
        ch["attempts"] += 1
        if ch["attempts"] > MAX_2FA_ATTEMPTS:
            _admin_challenges.pop(cid, None)
            return jsonify({"error": "Çox sayda səhv cəhd."}), 401
        method, otp_hash = ch["method"], ch["otp_hash"]

    ok = verify_totp_code(get_totp_secret(), code) if method == "totp" else (bool(otp_hash) and check_password_hash(otp_hash, code))
    if not ok:
        return jsonify({"error": "2FA kodu yanlışdır."}), 401

    with _auth_lock:
        _admin_challenges.pop(cid, None)
    cur_user, _ = get_current_session()
    tok = create_session(cur_user or "Admin", is_admin=True, ttl=ADMIN_SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "message": "Admin rejimi aktivləşdi!"}))
    set_secure_cookie(resp, "az_admin_session", tok, ADMIN_SESSION_TTL)
    return resp


@app.route("/api/admin/totp-setup", methods=["POST"])
@require_admin
def admin_totp_setup():
    data = request.get_json(silent=True) or {}
    if data.get("disable"):
        set_setting("admin_totp_secret", "")
        return jsonify({"totp_enabled": False, "message": "TOTP deaktiv edildi."})
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    set_setting("admin_totp_secret", secret)
    return jsonify({"totp_enabled": True, "secret": secret, "otpauth_uri": f"otpauth://totp/AzForces:Admin?secret={secret}&issuer=AzForces", "message": "TOTP açarı yaradıldı."})


@app.route("/api/admin/change-password", methods=["POST"])
@require_admin
def admin_change_password():
    if _ENV_PASSWORD_HASH:
        return jsonify({"error": "Parol mühit dəyişəni ilə idarə olunur."}), 400
    new_pw = str((request.get_json(silent=True) or {}).get("new_password") or "")
    if len(new_pw) < 8:
        return jsonify({"error": "Parol ən azı 8 simvol olmalıdır."}), 400
    set_setting("admin_password_hash", generate_password_hash(new_pw))
    return jsonify({"message": "Admin parolu yeniləndi."})


# --- Settings ---
@app.route("/api/settings", methods=["GET"])
@require_admin
def get_settings():
    cfg = get_api_settings()
    return jsonify({"provider": cfg.get("provider", "piston"), "base_url": cfg.get("base_url", ""), "api_key_masked": mask_api_key(cfg.get("api_key", "")), "has_api_key": bool(cfg.get("api_key", "")), "allow_local_runner": ALLOW_LOCAL_RUNNER})


@app.route("/api/settings", methods=["POST"])
@require_admin
def update_settings():
    data = request.get_json(silent=True) or {}
    prov = str(data.get("provider", "")).strip()
    if prov and prov not in ALLOWED_PROVIDERS:
        return jsonify({"error": "Yanlış provayder."}), 400
    conn = get_db()
    if prov:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider', ?)", (prov,))
    if "base_url" in data:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('base_url', ?)", (str(data["base_url"]).strip(),))
    if data.get("clear_api_key"):
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', '')")
    elif "api_key" in data and str(data["api_key"]).strip() and not str(data["api_key"]).strip().startswith("****"):
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)", (str(data["api_key"]).strip(),))
    conn.commit()
    conn.close()
    return jsonify({"message": "Ayarlar yadda saxlanıldı!"})


@app.route("/api/test-connection", methods=["POST"])
@require_admin
def test_connection():
    return jsonify(run_code_sandbox("python", "print('AzForces API OK!')", "", 2.0))


# --- Problems, Contests & Gym ---
@app.route("/api/problems", methods=["GET"])
def list_problems():
    view = request.args.get("view", "archive")
    username, is_admin = get_current_session()
    conn = get_db()
    sync_finished_contests(conn)

    if view == "gym":
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author, contest_id FROM problems WHERE visibility = 'gym' ORDER BY contest_id DESC, rating ASC, id ASC").fetchall()
    elif view == "all" and is_admin:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author, visibility, contest_id FROM problems WHERE visibility IN ('archive','gym','contest') ORDER BY id ASC").fetchall()
    else:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author FROM problems WHERE visibility = 'archive' ORDER BY rating ASC, id ASC").fetchall()

    counts = {r["problem_id"]: r["cnt"] for r in conn.execute("SELECT problem_id, COUNT(DISTINCT username) AS cnt FROM submissions WHERE verdict = 'Accepted' GROUP BY problem_id").fetchall()}
    solved_ids = {r["problem_id"] for r in conn.execute("SELECT DISTINCT problem_id FROM submissions WHERE verdict = 'Accepted' AND username = ?", (username,)).fetchall()} if username else set()
    conn.close()

    return jsonify([dict(r) | {"solved": r["id"] in solved_ids, "solved_count": counts.get(r["id"], 0)} for r in rows])


@app.route("/api/problems/<int:pid>", methods=["GET"])
def problem_detail(pid):
    username, is_admin = get_current_session()
    conn = get_db()
    sync_finished_contests(conn)
    p = conn.execute("SELECT * FROM problems WHERE id = ?", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404
    if p["visibility"] in ("pending", "rejected") and not is_admin:
        conn.close()
        return jsonify({"error": "Bu məsələ hələ təsdiqlənməyib."}), 403
    if p["visibility"] == "contest" and not is_admin:
        c = conn.execute("SELECT status FROM contests WHERE id = ?", (p["contest_id"],)).fetchone()
        if not c or c["status"] != "active":
            conn.close()
            return jsonify({"error": "Bu məsələ hələ gizlidir."}), 403
    samples = conn.execute("SELECT id, input_data, expected_output FROM test_cases WHERE problem_id = ? AND is_sample = 1", (pid,)).fetchall()
    conn.close()
    res = dict(p)
    res["samples"] = [dict(s) for s in samples]
    return jsonify(res)


@app.route("/api/problems", methods=["POST"])
@require_admin
def create_problem():
    data = request.get_json(silent=True) or {}
    title, statement, tests = str(data.get("title") or "").strip(), str(data.get("statement") or "").strip(), data.get("tests") or []
    if not title or not statement or not isinstance(tests, list) or not tests:
        return jsonify({"error": "Başlıq, şərt və ən azı 1 test mütləqdir."}), 400
    try:
        rating, tl, ml = int(data.get("rating", 800)), float(data.get("time_limit", 2.0)), int(data.get("memory_limit", 256))
    except (ValueError, TypeError):
        return jsonify({"error": "Limitlər düzgün ədəd olmalıdır."}), 400
    vis = data.get("visibility", "archive")
    if vis not in ("archive", "gym", "contest"):
        vis = "archive"
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """INSERT INTO problems (code_label, title, rating, tags, time_limit, memory_limit, statement, input_spec, output_spec, note, editorial, starter_code, author, visibility, contest_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (str(data.get("code_label", "")).strip()[:10], title, rating, str(data.get("tags", "custom")).strip(),
         tl, ml, statement, str(data.get("input_spec", "")), str(data.get("output_spec", "")),
         str(data.get("note", "")), str(data.get("editorial", "")), str(data.get("starter_code", "")),
         "AzForces", vis, data.get("contest_id") or None),
    )
    pid = c.lastrowid
    for t in tests:
        if isinstance(t, dict):
            c.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)",
                      (pid, str(t.get("input", "")), str(t.get("output", "")), 1 if t.get("is_sample", True) else 0))
    conn.commit()
    conn.close()
    return jsonify({"id": pid, "message": "Məsələ yaradıldı!"})


@app.route("/api/problems/<int:pid>", methods=["DELETE"])
@require_admin
def delete_problem(pid):
    conn = get_db()
    cur = conn.execute("DELETE FROM problems WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Məsələ silindi."}) if cur.rowcount else (jsonify({"error": "Tapılmadı."}), 404)


@app.route("/api/contests", methods=["GET"])
def list_contests():
    conn = get_db()
    sync_finished_contests(conn)
    contests = [dict(c) for c in conn.execute("SELECT * FROM contests ORDER BY id DESC").fetchall()]
    for ct in contests:
        ct["problems"] = [dict(p) for p in conn.execute(
            "SELECT id, code_label, title, rating, time_limit, memory_limit, visibility FROM problems WHERE contest_id = ? ORDER BY rating ASC, id ASC",
            (ct["id"],),
        ).fetchall()]
    conn.close()
    return jsonify(contests)


@app.route("/api/contests", methods=["POST"])
@require_admin
def create_contest():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Yarış başlığı mütləqdir."}), 400
    dur = max(10, min(int(data.get("duration_min", 90)), 1440))
    now = time.time()
    conn = get_db()
    cur = conn.execute("INSERT INTO contests (title, description, duration_min, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'active')",
                       (title, str(data.get("description", "")), dur, now, now + dur * 60))
    cid = cur.lastrowid
    pids = data.get("problem_ids") or []
    for idx, pid in enumerate(pids):
        lbl = chr(65 + idx) if idx < 26 else f"P{idx+1}"
        conn.execute("UPDATE problems SET contest_id = ?, visibility = 'contest', code_label = ? WHERE id = ?", (cid, lbl, int(pid)))
    conn.commit()
    conn.close()
    return jsonify({"id": cid, "message": "Yarış başladıldı! Vaxtı bitdikdə suallar Gym-ə keçəcək."})


@app.route("/api/contests/<int:cid>/finish", methods=["POST"])
@require_admin
def finish_contest_now(cid):
    conn = get_db()
    conn.execute("UPDATE contests SET status = 'finished', ends_at = ? WHERE id = ?", (time.time(), cid))
    conn.execute("UPDATE problems SET visibility = 'gym' WHERE contest_id = ? AND visibility = 'contest'", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yarış bitirildi və suallar Gym zalına köçürüldü!"})


# --- Problem Proposals (XP Mənbəyi) ---
@app.route("/api/proposals", methods=["POST"])
@require_user
@rate_limit(max_requests=5, window_seconds=60, key_by_user=True)
def submit_proposal():
    username = request._az_username
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()
    statement = str(data.get("statement") or "").strip()
    tests = data.get("tests") or []
    author_code = str(data.get("author_code") or "")
    author_lang = str(data.get("author_lang") or "python").strip()

    if not title or not statement or not isinstance(tests, list) or not tests or not author_code.strip():
        return jsonify({"error": "Başlıq, şərt, testlər və öz işləyən həll kodunuz mütləqdir."}), 400
    if author_lang not in ALLOWED_LANGUAGES:
        return jsonify({"error": "Dəstəklənməyən dil."}), 400

    conn = get_db()
    pending_cnt = conn.execute("SELECT COUNT(*) FROM problems WHERE author = ? AND visibility = 'pending'", (username,)).fetchone()[0]
    if pending_cnt >= 2:
        conn.close()
        return jsonify({"error": "Eyni vaxtda gözləmədə maksimum 2 təklifiniz ola bilər."}), 400

    ok_lim, _ = check_daily_limit(conn, username, "proposal", MAX_DAILY_PROPOSALS)
    if not ok_lim:
        conn.close()
        return jsonify({"error": f"Gündəlik maksimum {MAX_DAILY_PROPOSALS} sual təklif edə bilərsiniz."}), 429

    # Müəllifin kodunu testlərində yoxlayaq (Admin üçün iş rahatlığı)
    passed = 0
    check_status = "Keçdi ✔"
    for t in tests[:5]:
        res = run_code_sandbox(author_lang, author_code, str(t.get("input", "")), 2.0)
        if not res.get("ok") or res.get("status") != "OK" or normalize_output(res.get("stdout", "")) != normalize_output(str(t.get("output", ""))):
            check_status = f"Xəta ({res.get('status', 'WA')})"
            break
        passed += 1

    c = conn.cursor()
    c.execute(
        """INSERT INTO problems (title, rating, tags, time_limit, memory_limit, statement, input_spec, output_spec, editorial, starter_code, author, visibility, author_check_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (title[:120], max(800, min(3500, int(data.get("rating", 800)))), str(data.get("tags", "custom"))[:100],
         2.0, 256, statement, str(data.get("input_spec", "")), str(data.get("output_spec", "")),
         str(data.get("editorial", "")), author_code, username, f"{check_status} ({passed}/{min(len(tests), 5)})"),
    )
    pid = c.lastrowid
    for t in tests[:15]:
        if isinstance(t, dict):
            c.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)",
                      (pid, str(t.get("input", "")), str(t.get("output", "")), 1 if t.get("is_sample", True) else 0))
    conn.commit()
    conn.close()
    return jsonify({"id": pid, "message": f"Təklifiniz Admin yoxlamasına göndərildi! (Həll yoxlaması: {check_status})"})


@app.route("/api/admin/proposals", methods=["GET"])
@require_admin
def list_proposals():
    conn = get_db()
    rows = [dict(r) for r in conn.execute("SELECT * FROM problems WHERE visibility = 'pending' ORDER BY id ASC").fetchall()]
    for r in rows:
        r["tests"] = [dict(t) for t in conn.execute("SELECT input_data, expected_output, is_sample FROM test_cases WHERE problem_id = ?", (r["id"],)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/admin/proposals/<int:pid>/review", methods=["POST"])
@require_admin
def review_proposal(pid):
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    conn = get_db()
    p = conn.execute("SELECT * FROM problems WHERE id = ? AND visibility = 'pending'", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Təklif tapılmadı."}), 404

    if action == "approve":
        xp_reward = max(0, min(2000, int(data.get("xp_reward", 150))))
        target_vis = data.get("visibility", "archive")
        if target_vis not in ("archive", "gym"):
            target_vis = "archive"
        code_lbl = str(data.get("code_label") or f"U{pid}").strip()[:10]
        conn.execute("UPDATE problems SET visibility = ?, awarded_xp = ?, code_label = ? WHERE id = ?", (target_vis, xp_reward, code_lbl, pid))
        conn.execute("UPDATE users SET xp = xp + ? WHERE username = ?", (xp_reward, p["author"]))
        conn.commit()
        conn.close()
        return jsonify({"message": f"Məsələ təsdiqləndi! {p['author']} +{xp_reward} XP qazandı."})
    else:
        reason = str(data.get("reason") or "Standartlara uyğun deyil.")[:300]
        conn.execute("UPDATE problems SET visibility = 'rejected', reject_reason = ? WHERE id = ?", (reason, pid))
        conn.commit()
        conn.close()
        return jsonify({"message": "Təklif rədd edildi."})


@app.route("/api/my-proposals", methods=["GET"])
@require_user
def my_proposals():
    conn = get_db()
    rows = [dict(r) for r in conn.execute("SELECT id, title, rating, visibility, awarded_xp, reject_reason, created_at FROM problems WHERE author = ? ORDER BY id DESC LIMIT 20", (request._az_username,)).fetchall()]
    conn.close()
    return jsonify(rows)


# --- Run & Submit ---
@app.route("/api/run", methods=["POST"])
@rate_limit(max_requests=20, window_seconds=60)
def run_custom():
    data = request.get_json(silent=True) or {}
    code = str(data.get("code", ""))
    if not code.strip():
        return jsonify({"ok": False, "status": "Validation Error", "stderr": "Kod boş ola bilməz."}), 400
    return jsonify(run_code_sandbox(str(data.get("language", "python")).strip(), code, str(data.get("stdin", "")), data.get("time_limit", 3.0)))


@app.route("/api/submit", methods=["POST"])
@require_user
@rate_limit(max_requests=20, window_seconds=60, key_by_user=True)
def submit_solution():
    username = request._az_username
    data = request.get_json(silent=True) or {}
    try:
        pid = int(data.get("problem_id"))
    except (ValueError, TypeError):
        return jsonify({"error": "Yanlış məsələ ID-si."}), 400

    lang = str(data.get("language", "python")).strip()
    code = str(data.get("code", ""))
    room_id = data.get("room_id")
    if lang not in ALLOWED_LANGUAGES or not code.strip() or len(code) > MAX_CODE_LENGTH:
        return jsonify({"error": "Dil yanlışdır və ya kod boş/çox böyükdür."}), 400

    conn = get_db()
    sync_finished_contests(conn)
    p = conn.execute("SELECT * FROM problems WHERE id = ?", (pid,)).fetchone()
    if not p or p["visibility"] in ("pending", "rejected"):
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404

    ok_lim, _ = check_daily_limit(conn, username, "submit", MAX_DAILY_SUBMISSIONS)
    if not ok_lim:
        conn.close()
        return jsonify({"error": f"Gündəlik {MAX_DAILY_SUBMISSIONS} göndəriş limitinə çatdınız."}), 429

    already_ac = conn.execute("SELECT 1 FROM submissions WHERE problem_id = ? AND username = ? AND verdict = 'Accepted' LIMIT 1", (pid, username)).fetchone()
    tests = conn.execute("SELECT * FROM test_cases WHERE problem_id = ? ORDER BY is_sample DESC, id ASC", (pid,)).fetchall()

    passed, total, verdict, details, max_t = 0, len(tests), "Accepted", "", "0.00s"
    for idx, t in enumerate(tests, 1):
        res = run_code_sandbox(lang, code, t["input_data"], p["time_limit"])
        if not res.get("ok"):
            verdict, details = res.get("status", "API Error"), res.get("stderr", "")
            break
        max_t = res.get("time", "-")
        if res["status"] != "OK":
            verdict, details = res["status"], f"Test #{idx}: {res.get('stderr', '')}"
            break
        actual, expected = normalize_output(res.get("stdout", "")), normalize_output(t["expected_output"])
        if actual == expected:
            passed += 1
        else:
            verdict = "Wrong Answer"
            details = f"Test #{idx} (Nümunə)\nGözlənilən:\n{expected}\n\nSizin çıxış:\n{actual}" if t["is_sample"] else f"Gizli Test #{idx} üzərində cavab yanlışdır."
            break

    xp_gained = 0
    if verdict == "Accepted" and not already_ac and p["author"] != username:
        xp_gained = 10 if p["rating"] < 1000 else (20 if p["rating"] < 1400 else 35)
        conn.execute("UPDATE users SET xp = xp + ? WHERE username = ?", (xp_gained, username))

    conn.execute(
        """INSERT INTO submissions (problem_id, problem_title, username, language, code, verdict, passed_tests, total_tests, exec_time, details, room_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (pid, p["title"], username, lang, code, verdict, passed, total, max_t, details, int(room_id) if room_id else None),
    )
    conn.commit()
    conn.close()
    return jsonify({"verdict": verdict, "passed": passed, "total": total, "time": max_t, "details": details, "xp_gained": xp_gained})


@app.route("/api/submissions", methods=["GET"])
def get_submissions():
    uname = (request.args.get("username") or "").strip()
    conn = get_db()
    sql = "SELECT id, problem_id, problem_title, username, language, verdict, passed_tests, total_tests, exec_time, details, created_at FROM submissions"
    rows = conn.execute(sql + (" WHERE username = ?" if uname else "") + " ORDER BY id DESC LIMIT 50", (uname,) if uname else ()).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():
    conn = get_db()
    users = conn.execute("SELECT username, xp FROM users").fetchall()
    sub_stats = {r["username"]: dict(r) for r in conn.execute("""
        SELECT username, COUNT(DISTINCT CASE WHEN verdict = 'Accepted' THEN problem_id END) AS solved_count,
               COUNT(id) AS total_submissions
        FROM submissions GROUP BY username
    """).fetchall()}
    solved_pairs = conn.execute("""
        SELECT DISTINCT s.username, s.problem_id, p.rating
        FROM submissions s JOIN problems p ON p.id = s.problem_id WHERE s.verdict = 'Accepted'
    """).fetchall()
    conn.close()

    score_map = defaultdict(int)
    for row in solved_pairs:
        score_map[row["username"]] += row["rating"] // 10

    result = []
    seen = set()
    for u in users:
        name = u["username"]
        seen.add(name)
        st = sub_stats.get(name, {"solved_count": 0, "total_submissions": 0})
        sc = (800 + score_map[name]) if st["solved_count"] > 0 else 0
        result.append({"username": name, "xp": u["xp"], "rank": xp_rank(u["xp"]), "solved_count": st["solved_count"], "score": sc, "total_submissions": st["total_submissions"]})

    result.sort(key=lambda x: (-x["xp"], -x["solved_count"], -x["score"], x["total_submissions"]))
    return jsonify(result[:50])


# --- 16 Rəqəmli Gizli Otaq + Canlı Söhbət ---
@app.route("/api/rooms", methods=["POST"])
@require_user
@rate_limit(max_requests=5, window_seconds=60, key_by_user=True)
def create_room():
    username = request._az_username
    data = request.get_json(silent=True) or {}
    title = str(data.get("title") or "").strip()[:80]
    pids = [int(x) for x in (data.get("problem_ids") or []) if str(x).isdigit()][:10]
    if not title or not pids:
        return jsonify({"error": "Otaq adı və ən azı 1 məsələ seçin."}), 400
    dur = max(10, min(int(data.get("duration_min", 60)), 360))
    voice = str(data.get("voice_link") or "").strip()[:250]

    conn = get_db()
    now = time.time()
    conn.execute("DELETE FROM rooms WHERE ends_at < ?", (now - 86400,))  # 24 saatdan köhnə bitmiş otaqları təmizlə
    if conn.execute("SELECT COUNT(*) FROM rooms WHERE ends_at > ?", (now,)).fetchone()[0] >= MAX_ACTIVE_ROOMS:
        conn.close()
        return jsonify({"error": "Hazırda maksimum aktiv otaq limitinə çatılıb. Bir az sonra yoxlayın."}), 429

    code16 = f"{secrets.randbelow(10**16):016d}"
    cur = conn.execute(
        "INSERT INTO rooms (room_code, title, creator, voice_link, problem_ids_json, duration_min, max_members, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (code16, title, username, voice, json.dumps(pids), dur, MAX_ROOM_MEMBERS, now, now + dur * 60),
    )
    rid = cur.lastrowid
    conn.execute("INSERT INTO room_members (room_id, username) VALUES (?, ?)", (rid, username))
    conn.commit()
    conn.close()
    return jsonify({"room_code": code16, "title": title, "message": "Gizli otaq yaradıldı!"})


@app.route("/api/rooms/join", methods=["POST"])
@require_user
@rate_limit(max_requests=15, window_seconds=60)
def join_room():
    username = request._az_username
    code = str((request.get_json(silent=True) or {}).get("room_code") or "").replace("-", "").replace(" ", "").strip()
    if len(code) != 16 or not code.isdigit():
        return jsonify({"error": "16 rəqəmli düzgün otaq kodu daxil edin."}), 400
    conn = get_db()
    room = conn.execute("SELECT * FROM rooms WHERE room_code = ?", (code,)).fetchone()
    if not room:
        conn.close()
        return jsonify({"error": "Belə 16 rəqəmli otaq tapılmadı."}), 404
    already = conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (room["id"], username)).fetchone()
    if not already:
        cnt = conn.execute("SELECT COUNT(*) FROM room_members WHERE room_id = ?", (room["id"],)).fetchone()[0]
        if cnt >= room["max_members"]:
            conn.close()
            return jsonify({"error": f"Otaq doludur (maksimum {room['max_members']} nəfər)."}), 403
        conn.execute("INSERT INTO room_members (room_id, username) VALUES (?, ?)", (room["id"], username))
        conn.commit()
    conn.close()
    return jsonify({"ok": True, "room_code": code, "title": room["title"]})


@app.route("/api/rooms/<room_code>/state", methods=["GET"])
@require_user
def room_state(room_code):
    username = request._az_username
    after_id = int(request.args.get("after_id", 0) or 0)
    conn = get_db()
    room = conn.execute("SELECT * FROM rooms WHERE room_code = ?", (room_code,)).fetchone()
    if not room:
        conn.close()
        return jsonify({"error": "Otaq tapılmadı."}), 404
    if not conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (room["id"], username)).fetchone():
        conn.close()
        return jsonify({"error": "Bu otağın üzvü deyilsiniz."}), 403

    pids = json.loads(room["problem_ids_json"])
    placeholders = ",".join("?" * len(pids))
    problems = [dict(p) for p in conn.execute(f"SELECT id, code_label, title, rating FROM problems WHERE id IN ({placeholders})", pids).fetchall()] if pids else []
    members = [r["username"] for r in conn.execute("SELECT username FROM room_members WHERE room_id = ? ORDER BY id ASC", (room["id"],)).fetchall()]
    msgs = [dict(m) for m in conn.execute(
        """SELECT m.id, m.username, m.message, m.shared_problem_id, p.title AS shared_problem_title, m.created_at
           FROM room_messages m LEFT JOIN problems p ON p.id = m.shared_problem_id
           WHERE m.room_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 80""",
        (room["id"], after_id),
    ).fetchall()]

    ac_rows = conn.execute(
        "SELECT username, problem_id, MIN(created_at) AS first_ac FROM submissions WHERE room_id = ? AND verdict = 'Accepted' GROUP BY username, problem_id",
        (room["id"],),
    ).fetchall()
    conn.close()

    standings = {m: {"username": m, "solved": 0, "solved_ids": []} for m in members}
    for r in ac_rows:
        if r["username"] in standings:
            standings[r["username"]]["solved"] += 1
            standings[r["username"]]["solved_ids"].append(r["problem_id"])
    board = sorted(standings.values(), key=lambda x: (-x["solved"], x["username"]))

    return jsonify({
        "room": dict(room) | {"remaining_sec": max(0, int(room["ends_at"] - time.time()))},
        "problems": problems,
        "members": members,
        "standings": board,
        "messages": msgs,
    })


@app.route("/api/rooms/<room_code>/chat", methods=["POST"])
@require_user
@rate_limit(max_requests=25, window_seconds=60, key_by_user=True)
def room_chat_send(room_code):
    username = request._az_username
    data = request.get_json(silent=True) or {}
    msg = str(data.get("message") or "").strip()[:500]
    shared_pid = data.get("shared_problem_id")
    if not msg and not shared_pid:
        return jsonify({"error": "Mesaj boş ola bilməz."}), 400
    conn = get_db()
    room = conn.execute("SELECT id FROM rooms WHERE room_code = ?", (room_code,)).fetchone()
    if not room or not conn.execute("SELECT 1 FROM room_members WHERE room_id = ? AND username = ?", (room["id"], username)).fetchone():
        conn.close()
        return jsonify({"error": "Otaq tapılmadı və ya üzv deyilsiniz."}), 403

    ok_lim, left = check_daily_limit(conn, username, "msg", MAX_DAILY_MESSAGES)
    if not ok_lim:
        conn.close()
        return jsonify({"error": f"Gündəlik {MAX_DAILY_MESSAGES} mesaj limitiniz bitib."}), 429

    conn.execute("INSERT INTO room_messages (room_id, username, message, shared_problem_id) VALUES (?, ?, ?, ?)",
                 (room["id"], username, msg or "Maraqlı məsələ paylaşdı:", int(shared_pid) if shared_pid else None))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "msg_left": left})


# --- Topluluq (Anket, Şərh/Reply, Emoji) ---
@app.route("/api/posts", methods=["GET"])
def list_posts():
    username, _ = get_current_session()
    conn = get_db()
    posts = [dict(p) for p in conn.execute("SELECT * FROM posts ORDER BY id DESC LIMIT 30").fetchall()]
    for p in posts:
        pid = p["id"]
        opts = json.loads(p["poll_options_json"] or "[]")
        votes = conn.execute("SELECT option_index, COUNT(*) AS cnt FROM poll_votes WHERE post_id = ? GROUP BY option_index", (pid,)).fetchall()
        vmap = {v["option_index"]: v["cnt"] for v in votes}
        my_v = conn.execute("SELECT option_index FROM poll_votes WHERE post_id = ? AND username = ?", (pid, username)).fetchone() if username else None
        p["poll_options"] = [{"text": txt, "votes": vmap.get(i, 0)} for i, txt in enumerate(opts)]
        p["my_vote"] = my_v["option_index"] if my_v else None
        p["total_votes"] = sum(vmap.values())

        reacts = conn.execute("SELECT emoji, COUNT(*) AS cnt FROM post_reactions WHERE post_id = ? GROUP BY emoji", (pid,)).fetchall()
        my_reacts = {r["emoji"] for r in conn.execute("SELECT emoji FROM post_reactions WHERE post_id = ? AND username = ?", (pid, username)).fetchall()} if username else set()
        rmap = {r["emoji"]: r["cnt"] for r in reacts}
        p["reactions"] = [{"emoji": e, "count": rmap.get(e, 0), "mine": e in my_reacts} for e in ALLOWED_EMOJIS]
        p["comments"] = [dict(c) for c in conn.execute("SELECT * FROM post_comments WHERE post_id = ? ORDER BY id ASC", (pid,)).fetchall()]
    conn.close()
    return jsonify(posts)


@app.route("/api/posts", methods=["POST"])
@require_user
@rate_limit(max_requests=5, window_seconds=60, key_by_user=True)
def create_post():
    username = request._az_username
    data = request.get_json(silent=True) or {}
    title, body = str(data.get("title") or "").strip()[:140], str(data.get("body") or "").strip()[:2000]
    options = [str(o).strip()[:80] for o in (data.get("poll_options") or []) if str(o).strip()][:6]
    if not title or not body:
        return jsonify({"error": "Başlıq və məzmun boş ola bilməz."}), 400
    if options and len(options) < 2:
        return jsonify({"error": "Anket üçün ən azı 2 variant yazın."}), 400

    conn = get_db()
    ok_lim, _ = check_daily_limit(conn, username, "msg", MAX_DAILY_MESSAGES)
    if not ok_lim:
        conn.close()
        return jsonify({"error": f"Gündəlik {MAX_DAILY_MESSAGES} mesaj/paylaşım limitiniz bitib."}), 429
    conn.execute("INSERT INTO posts (author, title, body, post_type, poll_options_json) VALUES (?, ?, ?, ?, ?)",
                 (username, title, body, "poll" if options else "post", json.dumps(options)))
    conn.commit()
    conn.close()
    return jsonify({"message": "Paylaşıldı!"})


@app.route("/api/posts/<int:pid>/vote", methods=["POST"])
@require_user
def vote_poll(pid):
    opt_idx = (request.get_json(silent=True) or {}).get("option_index")
    conn = get_db()
    p = conn.execute("SELECT poll_options_json FROM posts WHERE id = ?", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Paylaşım tapılmadı."}), 404
    opts = json.loads(p["poll_options_json"] or "[]")
    if not isinstance(opt_idx, int) or not (0 <= opt_idx < len(opts)):
        conn.close()
        return jsonify({"error": "Yanlış variant."}), 400
    conn.execute("INSERT OR REPLACE INTO poll_votes (post_id, username, option_index) VALUES (?, ?, ?)", (pid, request._az_username, opt_idx))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts/<int:pid>/react", methods=["POST"])
@require_user
def react_post(pid):
    emoji = str((request.get_json(silent=True) or {}).get("emoji") or "")
    if emoji not in ALLOWED_EMOJIS:
        return jsonify({"error": "İcazə verilməyən emoji."}), 400
    conn = get_db()
    exists = conn.execute("SELECT id FROM post_reactions WHERE post_id = ? AND username = ? AND emoji = ?", (pid, request._az_username, emoji)).fetchone()
    if exists:
        conn.execute("DELETE FROM post_reactions WHERE id = ?", (exists["id"],))
    else:
        conn.execute("INSERT INTO post_reactions (post_id, username, emoji) VALUES (?, ?, ?)", (pid, request._az_username, emoji))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/posts/<int:pid>/comment", methods=["POST"])
@require_user
@rate_limit(max_requests=20, window_seconds=60, key_by_user=True)
def comment_post(pid):
    username = request._az_username
    data = request.get_json(silent=True) or {}
    body = str(data.get("body") or "").strip()[:600]
    parent_id = data.get("parent_id")
    if not body:
        return jsonify({"error": "Şərh boş ola bilməz."}), 400
    conn = get_db()
    ok_lim, _ = check_daily_limit(conn, username, "msg", MAX_DAILY_MESSAGES)
    if not ok_lim:
        conn.close()
        return jsonify({"error": f"Gündəlik {MAX_DAILY_MESSAGES} mesaj limitiniz bitib."}), 429
    conn.execute("INSERT INTO post_comments (post_id, parent_id, author, body) VALUES (?, ?, ?, ?)",
                 (pid, int(parent_id) if parent_id else None, username, body))
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
    return jsonify({"message": "Paylaşım silindi."})


# --- Creative Codes ---
@app.route("/api/creative", methods=["GET"])
def list_creative():
    conn = get_db()
    rows = conn.execute("SELECT * FROM creative_codes ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/creative", methods=["POST"])
@require_user
@rate_limit(max_requests=10, window_seconds=60, key_by_user=True)
def add_creative():
    data = request.get_json(silent=True) or {}
    title, code, lang = str(data.get("title") or "").strip(), str(data.get("code") or ""), str(data.get("language", "python")).strip()
    if not title or not code.strip() or lang not in ALLOWED_LANGUAGES or len(code) > MAX_CODE_LENGTH:
        return jsonify({"error": "Başlıq, dil və ya kod yanlışdır."}), 400
    conn = get_db()
    conn.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES (?, ?, ?, ?, ?, ?)",
                 (title[:100], str(data.get("description", ""))[:400], lang, code, str(data.get("sample_input", ""))[:1000], request._az_username))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yaradıcı kod əlavə olundu!"})


@app.route("/api/creative/<int:cid>", methods=["DELETE"])
@require_admin
def delete_creative(cid):
    conn = get_db()
    conn.execute("DELETE FROM creative_codes WHERE id = ?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Silindi."})


if __name__ == "__main__":
    ensure_initialized()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true", threaded=True)