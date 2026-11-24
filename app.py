import base64
import datetime
import hashlib
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
from flask import Flask, abort, jsonify, make_response, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # 4 MB (şəkil / səs üçün)

if os.environ.get("TRUST_PROXY", "true").lower() == "true":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
IS_PG = bool(DATABASE_URL and DATABASE_URL.startswith("postgresql://"))
DB_PATH = os.environ.get("DB_PATH", "azforces.db")

ALLOWED_LANGS = {"python", "cpp", "c", "java", "javascript"}
ALLOWED_PROVIDERS = {"judge0", "wandbox", "piston", "local"}
ALLOWED_EMOJIS = {"👍", "🔥", "💡", "👏", "❤️"}
ALLOW_LOCAL_RUNNER = os.environ.get("ALLOW_LOCAL_RUNNER", "false").lower() == "true"

# Admin və gizli panel (Render mühit dəyişənlərindən oxunur)
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "Mr.Leonard").strip() or "Mr.Leonard"
ADMIN_SECRET_PATH = os.environ.get("ADMIN_SECRET_PATH", "azf-panel-9482").strip("/")
_ENV_ADMIN_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
if not _ENV_ADMIN_HASH and os.environ.get("ADMIN_PASSWORD", "").strip():
    _ENV_ADMIN_HASH = generate_password_hash(os.environ["ADMIN_PASSWORD"].strip())

# E-poçt (Brevo / SMTP)
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
DEV_EMAIL_PREVIEW = os.environ.get("DEV_EMAIL_PREVIEW", "false").lower() == "true"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "").strip() or SMTP_USER or ADMIN_EMAIL

# Cloudinary & Xarici Səs Saxlama (sonradan başqa yerə bağlamaq üçün VOICE_UPLOAD_WEBHOOK)
CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUD_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUD_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
VOICE_UPLOAD_WEBHOOK = os.environ.get("VOICE_UPLOAD_WEBHOOK", "").strip()

SESSION_TTL = 86400 * 7
ADMIN_TTL = 7200
GUEST_TTL = 300
MAX_ROOM_MEMBERS = 20
MAX_DAILY_MSGS = 80
MAX_DAILY_SUBS = 40
MAX_DAILY_PROPS = 2

SHOP_ITEMS = [
    {"id": "none", "name": "Çərçivəsiz", "tier": "classic", "price": 0, "desc": "Sadə görünüş"},
    {"id": "neon-blue", "name": "Kiber Mavi", "tier": "classic", "price": 150, "desc": "Parlayan mavi halqa"},
    {"id": "aqua-frost", "name": "Buz Kristalı", "tier": "classic", "price": 300, "desc": "Sərin su parıltısı"},
    {"id": "emerald-matrix", "name": "Matris Yaşılı", "tier": "classic", "price": 500, "desc": "Alqoritmçi yaşıl enerji"},
    {"id": "gold-crown", "name": "Ustad Qızılı", "tier": "classic", "price": 1200, "desc": "Elit qızılı halqa"},
    {"id": "dragon-flame", "name": "🐉 Alovlu Əjdaha", "tier": "fantasy", "price": 2500, "desc": "Fırlanan əjdaha alovu və qığılcımlar"},
    {"id": "forest-vine", "name": "🌿 Canlı Meşə Sarmaşığı", "tier": "nature", "price": 3200, "desc": "Nəfəs alan zümrüd yarpaqlar və təbiət aurası"},
    {"id": "ocean-leviathan", "name": "🌊 Okean Leviatanı", "tier": "nature", "price": 4000, "desc": "Axıcı dərin dəniz dalğası və enerji halqası"},
    {"id": "storm-simurgh", "name": "🦅 Fırtına Simurqu", "tier": "fantasy", "price": 5500, "desc": "Qızmar qanadlı dönən mifik işıq"},
    {"id": "cosmic-portal", "name": "🌌 Kosmik Portal", "tier": "fantasy", "price": 8000, "desc": "Fırlanan ulduzlu qalaktika vorteksi"},
]

_db_lock = threading.Lock()
_db_ready = False
_human_lock = threading.Lock()
_human_challenges = {}
_fail_lock = threading.Lock()
_admin_fails = {"count": 0, "until": 0.0}
_rate_lock = threading.Lock()
_rate_buckets = defaultdict(list)
_wandbox_cache = {"ts": 0.0, "compilers": {}}
_game_lock = threading.Lock()
_bulls_games = {}
_sprint_tokens = {}
_seen_cache = {}


def safe_int(v, default=0, lo=None, hi=None):
    try:
        n = int(v)
    except (ValueError, TypeError):
        n = default
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def safe_float(v, default=2.0, lo=0.5, hi=10.0):
    try:
        n = float(v)
    except (ValueError, TypeError):
        n = default
    return max(lo, min(hi, n))


def clean_row(r):
    if r is None:
        return None
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            d[k] = v.strftime("%Y-%m-%d %H:%M:%S") if isinstance(v, datetime.datetime) else v.strftime("%Y-%m-%d")
    return d


class _DualCursor:
    def __init__(self, raw_cur, is_pg=False):
        self._cur = raw_cur
        self._is_pg = is_pg
        self.lastrowid = getattr(raw_cur, "lastrowid", None)
        self.rowcount = getattr(raw_cur, "rowcount", 0)

    def execute(self, sql, params=()):
        if not self._is_pg:
            self._cur.execute(sql, params)
            self.lastrowid = self._cur.lastrowid
            self.rowcount = self._cur.rowcount
            return self
        pg_sql = sql.replace("?", "%s")
        s_up = pg_sql.lstrip().upper()
        needs_ret = s_up.startswith("INSERT INTO ") and "RETURNING" not in s_up and any(
            t in s_up.split("(", 1)[0] for t in ("PROBLEMS", "CONTESTS", "ROOMS", "POSTS", "USERS", "SUBMISSIONS")
        )
        if needs_ret:
            pg_sql = pg_sql.rstrip().rstrip(";") + " RETURNING id"
        self._cur.execute(pg_sql, params)
        self.rowcount = self._cur.rowcount
        if needs_ret:
            row = self._cur.fetchone()
            self.lastrowid = row["id"] if row else None
        return self

    def fetchone(self):
        return clean_row(self._cur.fetchone())

    def fetchall(self):
        return [clean_row(r) for r in self._cur.fetchall()]


class _DualConn:
    def __init__(self, raw, is_pg=False):
        self._raw = raw
        self._is_pg = is_pg

    def cursor(self):
        return _DualCursor(self._raw.cursor(cursor_factory=RealDictCursor) if self._is_pg else self._raw.cursor(), self._is_pg)

    def execute(self, sql, params=()):
        return self.cursor().execute(sql, params)

    def commit(self):
        self._raw.commit()

    def rollback(self):
        self._raw.rollback()

    def close(self):
        self._raw.close()


def get_db():
    if IS_PG:
        if psycopg2 is None:
            raise RuntimeError("psycopg2-binary paketi qurulmayıb.")
        return _DualConn(psycopg2.connect(DATABASE_URL), is_pg=True)
    raw = sqlite3.connect(DB_PATH, timeout=15)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    raw.execute("PRAGMA journal_mode = WAL")
    raw.execute("PRAGMA synchronous = NORMAL")
    return _DualConn(raw, is_pg=False)


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


def needed_xp(lvl):
    return 100 * (2 ** max(0, lvl - 1))


def award_rewards(conn, username, xp_amt=0, coin_amt=0):
    u = conn.execute("SELECT level, xp, total_xp, coins FROM users WHERE LOWER(username)=LOWER(?)", (username,)).fetchone()
    if not u:
        return
    lvl, cur, tot, coins = u["level"], u["xp"] + max(0, xp_amt), u["total_xp"] + max(0, xp_amt), u["coins"] + max(0, coin_amt)
    while cur >= needed_xp(lvl):
        cur -= needed_xp(lvl)
        lvl += 1
    conn.execute("UPDATE users SET level=?, xp=?, total_xp=?, coins=? WHERE LOWER(username)=LOWER(?)", (lvl, cur, tot, coins, username))


def update_daily_streak(conn, username):
    u = conn.execute("SELECT daily_streak, last_solve_date FROM users WHERE LOWER(username)=LOWER(?)", (username,)).fetchone()
    if not u:
        return 0
    today = time.strftime("%Y-%m-%d")
    yest = time.strftime("%Y-%m-%d", time.localtime(time.time() - 86400))
    if (u["last_solve_date"] or "") == today:
        return u["daily_streak"]
    streak = (u["daily_streak"] + 1) if u["last_solve_date"] == yest else 1
    conn.execute("UPDATE users SET daily_streak=?, last_solve_date=? WHERE LOWER(username)=LOWER(?)", (streak, today, username))
    return streak


def send_gmail_code(to_email, code):
    text = f"Salam!\n\nAzForces hesabınızı təsdiqləmək üçün kodunuz: {code}\n(Bu kod 5 dəqiqə etibarlıdır.)"
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
            return False, "Gmail təsdiq kodu göndərilmədi."
        except Exception:
            return False, "E-poçt servisinə qoşulmaq olmadı."
    if SMTP_USER and SMTP_PASS:
        try:
            msg = EmailMessage()
            msg["Subject"], msg["From"], msg["To"] = "AzForces — Qeydiyyat Təsdiq Kodu", SMTP_USER, to_email
            msg.set_content(text)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12) as srv:
                srv.starttls()
                srv.login(SMTP_USER, SMTP_PASS)
                srv.send_message(msg)
            return True, "sent"
        except Exception:
            return False, "Gmail göndərilərkən xəta oldu."
    print(f"\n[AzForces Gmail Kodu] {to_email} -> {code}\n", flush=True)
    return True, "console"


def get_session():
    ut = request.cookies.get("az_session", "").strip()
    at = request.cookies.get("az_admin_session", "").strip()
    ht = request.cookies.get("az_human", "").strip()
    gt = request.cookies.get("az_guest", "").strip()
    now = time.time()
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    u, adm, hum, guest_rem = None, False, False, None
    if ut:
        r = conn.execute("SELECT username FROM sessions WHERE token=? AND kind='user' AND expires_at>?", (ut, now)).fetchone()
        if r:
            u = r["username"]
    if at:
        r = conn.execute("SELECT username FROM sessions WHERE token=? AND kind='admin' AND expires_at>?", (at, now)).fetchone()
        if r:
            adm = True
            u = u or r["username"]
    if ht and conn.execute("SELECT 1 FROM sessions WHERE token=? AND kind='human' AND expires_at>?", (ht, now)).fetchone():
        hum = True
    if gt and not u:
        gr = conn.execute("SELECT expires_at FROM sessions WHERE token=? AND kind='guest'", (gt,)).fetchone()
        if gr:
            guest_rem = max(0, int(gr["expires_at"] - now))
    if u and (now - _seen_cache.get(u.lower(), 0) > 30):
        _seen_cache[u.lower()] = now
        conn.execute("UPDATE users SET last_seen_at=? WHERE LOWER(username)=LOWER(?)", (now, u))
    conn.commit()
    conn.close()
    return u, adm, hum, guest_rem


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
        u, adm, _, _ = get_session()
        if not u:
            return jsonify({"error": "Davam etmək üçün hesabınıza daxil olun."}), 401
        request._u = u
        request._adm = adm
        return fn(*a, **kw)
    return wrap


def require_admin(fn):
    @wraps(fn)
    def wrap(*a, **kw):
        u, adm, _, _ = get_session()
        if not adm:
            return jsonify({"error": "Yalnız Admin icazəsi tələb olunur."}), 403
        request._u = u or ADMIN_USERNAME
        return fn(*a, **kw)
    return wrap


def safe_add_col(conn, table, col_def):
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass 

def init_db():
    conn = get_db()
    PK = "SERIAL PRIMARY KEY" if IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
    TS = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    DBL = "DOUBLE PRECISION" if IS_PG else "REAL"

    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS users (
        id {PK}, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        bio TEXT DEFAULT '', avatar_url TEXT DEFAULT '', avatar_color TEXT DEFAULT '#3b82f6',
        avatar_frame TEXT DEFAULT 'none', level INTEGER DEFAULT 1, xp INTEGER DEFAULT 0,
        total_xp INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, rating INTEGER DEFAULT 800,
        daily_streak INTEGER DEFAULT 0, last_solve_date TEXT DEFAULT '', last_seen_at {DBL} DEFAULT 0,
        d_msg_date TEXT DEFAULT '', d_msg_cnt INTEGER DEFAULT 0,
        d_sub_date TEXT DEFAULT '', d_sub_cnt INTEGER DEFAULT 0,
        d_prop_date TEXT DEFAULT '', d_prop_cnt INTEGER DEFAULT 0,
        d_game_date TEXT DEFAULT '', d_game_cnt INTEGER DEFAULT 0,
        created_at {TS})""")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_u_name_ci ON users (LOWER(username))")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_u_mail_ci ON users (LOWER(email))")
    conn.execute("CREATE TABLE IF NOT EXISTS user_inventory (username TEXT NOT NULL, item_id TEXT NOT NULL, UNIQUE(username, item_id))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS rating_history (id {PK}, username TEXT NOT NULL, rating INTEGER NOT NULL, label TEXT DEFAULT '', created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS email_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, attempts INTEGER DEFAULT 0, expires_at {DBL} NOT NULL)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, kind TEXT DEFAULT 'user', expires_at {DBL} NOT NULL)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS friendships (id {PK}, user_a TEXT NOT NULL, user_b TEXT NOT NULL, status TEXT DEFAULT 'pending', action_by TEXT NOT NULL, created_at {TS}, UNIQUE(user_a, user_b))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS site_reviews (id {PK}, username TEXT UNIQUE NOT NULL, rating INTEGER NOT NULL, comment TEXT DEFAULT '', created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS contests (id {PK}, title TEXT NOT NULL, duration_min INTEGER DEFAULT 90, starts_at {DBL} NOT NULL, ends_at {DBL} NOT NULL, status TEXT DEFAULT 'active', created_at {TS})")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS problems (
        id {PK}, code_label TEXT DEFAULT '', title TEXT NOT NULL, rating INTEGER DEFAULT 800, tags TEXT DEFAULT 'math',
        time_limit {DBL} DEFAULT 2.0, memory_limit INTEGER DEFAULT 256, statement TEXT NOT NULL,
        input_spec TEXT DEFAULT '', output_spec TEXT DEFAULT '', note TEXT DEFAULT '', editorial TEXT DEFAULT '',
        starter_code TEXT DEFAULT '', author TEXT DEFAULT 'AzForces', visibility TEXT DEFAULT 'archive',
        contest_id INTEGER DEFAULT NULL, author_check_status TEXT DEFAULT '', reject_reason TEXT DEFAULT '',
        awarded_xp INTEGER DEFAULT 0, created_at {TS})""")
    conn.execute(f"CREATE TABLE IF NOT EXISTS test_cases (id {PK}, problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE, input_data TEXT NOT NULL, expected_output TEXT NOT NULL, is_sample INTEGER DEFAULT 1)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS submissions (id {PK}, problem_id INTEGER NOT NULL, problem_title TEXT NOT NULL, username TEXT NOT NULL, language TEXT NOT NULL, code TEXT NOT NULL, verdict TEXT NOT NULL, passed_tests INTEGER DEFAULT 0, total_tests INTEGER DEFAULT 0, quality_pct INTEGER DEFAULT 0, exec_time TEXT DEFAULT '-', details TEXT DEFAULT '', room_id INTEGER DEFAULT NULL, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS daily_challenges (day_date TEXT PRIMARY KEY, problem_id INTEGER NOT NULL)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS daily_solves (id {PK}, day_date TEXT NOT NULL, username TEXT NOT NULL, quality_pct INTEGER DEFAULT 0, solved_at {TS}, UNIQUE(day_date, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS rooms (id {PK}, room_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, bio TEXT DEFAULT 'Dostlarla söhbət və yarış qrupu', avatar_url TEXT DEFAULT '', avatar_color TEXT DEFAULT '#0ea5e9', creator TEXT NOT NULL, voice_link TEXT DEFAULT '', problem_ids_json TEXT DEFAULT '[]', duration_min INTEGER DEFAULT 0, max_members INTEGER DEFAULT 20, starts_at {DBL} NOT NULL, ends_at {DBL} NOT NULL, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS room_members (id {PK}, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, username TEXT NOT NULL, joined_at {TS}, UNIQUE(room_id, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS room_messages (id {PK}, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, username TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, audio_url TEXT DEFAULT '', audio_duration INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS direct_messages (id {PK}, sender TEXT NOT NULL, receiver TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, audio_url TEXT DEFAULT '', audio_duration INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS posts (id {PK}, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, post_type TEXT DEFAULT 'announcement', is_pinned INTEGER DEFAULT 0, poll_options_json TEXT DEFAULT '[]', created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS poll_votes (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, username TEXT NOT NULL, option_index INTEGER NOT NULL, UNIQUE(post_id, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS post_reactions (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, username TEXT NOT NULL, emoji TEXT NOT NULL, UNIQUE(post_id, username, emoji))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS post_comments (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, parent_id INTEGER DEFAULT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS creative_codes (id {PK}, title TEXT NOT NULL, description TEXT DEFAULT '', language TEXT NOT NULL, code TEXT NOT NULL, sample_input TEXT DEFAULT '', author TEXT DEFAULT 'AzForces', created_at {TS})")
    conn.commit()

    for tbl, cdef in [
        ("users", f"last_seen_at {DBL} DEFAULT 0"),
        ("submissions", "quality_pct INTEGER DEFAULT 0"),
        ("room_messages", "audio_url TEXT DEFAULT ''"),
        ("room_messages", "audio_duration INTEGER DEFAULT 0"),
        ("direct_messages", "audio_url TEXT DEFAULT ''"),
        ("direct_messages", "audio_duration INTEGER DEFAULT 0"),
    ]:
        safe_add_col(conn, tbl, cdef)

    for k, v in {"provider": os.environ.get("JUDGE_PROVIDER", "judge0"), "base_url": os.environ.get("JUDGE_BASE_URL", "https://ce.judge0.com"), "api_key": os.environ.get("JUDGE_API_KEY", "")}.items():
        conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING", (k, v))

    if not _ENV_ADMIN_HASH:
        row = conn.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'").fetchone()
        if not row or not row["value"]:
            gen = secrets.token_urlsafe(12)
            conn.execute("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", (generate_password_hash(gen),))
            print(f"\n[AzForces] İlk Admin parolu: {gen} | Gizli panel: /p/{ADMIN_SECRET_PATH}\n", flush=True)

    if conn.execute("SELECT COUNT(*) AS cnt FROM problems").fetchone()["cnt"] == 0:
        try:
            from problems_seed import SEED_PROBLEMS
            seed = SEED_PROBLEMS
        except ImportError:
            seed = [
                ("1A", "A + B Cəmi", 650, "math, başlanğıc", 1.0, 256, "İki tam ədəd $a$ və $b$ verilir ($-10^9 \\le a,b \\le 10^9$). Onların cəmini ($a+b$) tapın.", "Tək sətirdə $a$ və $b$.", "$a+b$ cəmi.", "", "`print(sum(map(int, input().split())))`", [("3 5", "8", 1), ("-10 25", "15", 1), ("1000000000 1000000000", "2000000000", 0)]),
                ("1B", "Tək yoxsa Cüt", 700, "math, başlanğıc", 1.0, 256, "Verilmiş $n$ ($1 \\le n \\le 10^9$) ədədinin tək və ya cüt olduğunu tapın.", "Bir tam ədəd $n$.", "Cütdürsə `EVEN`, təkdirsə `ODD`.", "", "`n % 2 == 0` yoxlayın.", [("4", "EVEN", 1), ("7", "ODD", 1), ("999999999", "ODD", 0)]),
                ("1C", "Sadə Ədəd", 1000, "number theory", 2.0, 256, "$n$ ($1 \\le n \\le 10^9$) natural ədədinin sadə olub-olmadığını yoxlayın.", "Bir tam ədəd $n$.", "Sadədirsə `YES`, əks halda `NO`.", "$1$ sadə deyil.", "$2$-dən $\\sqrt{n}$-ə qədər bölənləri yoxlayın.", [("7", "YES", 1), ("1", "NO", 1), ("1000000007", "YES", 0)]),
                ("1D", "Hədəf Cəm (Two Sum)", 1200, "hashing, arrays", 2.0, 256, "$n$ elementli massivdə cəmi $k$-ya bərabər iki müxtəlif indeksli element varmı?", "1-ci sətirdə $n, k$; 2-ci sətirdə $n$ ədəd.", "`YES` və ya `NO`.", "", "Ədədləri `set`-də saxlayın.", [("4 9\n2 7 11 15", "YES", 1), ("3 10\n1 2 3", "NO", 0)]),
                ("1E", "Ən Uzun Artan Alt-ardıcıllıq (LIS)", 1800, "dp, binary search", 2.0, 256, "$n$ ($1 \\le n \\le 10^5$) ədəddən ibarət massivdə ən uzun ciddi artan alt-ardıcıllığın uzunluğunu tapın.", "1-ci sətirdə $n$; 2-ci sətirdə massiv.", "Maksimum uzunluq.", "", "$O(n \\log n)$ binary search + tails massivi.", [("6\n10 9 2 5 3 7", "3", 1), ("5\n5 4 3 2 1", "1", 0)]),
            ]
        for lbl, t, rt, tg, tl, ml, st, ins, outs, nt, ed, tests in seed:
            pid = conn.execute("INSERT INTO problems (code_label,title,rating,tags,time_limit,memory_limit,statement,input_spec,output_spec,note,editorial,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,'AzForces','archive')",
                               (lbl, t, rt, tg, tl, ml, st, ins, outs, nt, ed)).lastrowid
            for i_d, o_d, smp in tests:
                conn.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, i_d, o_d, smp))

    if conn.execute("SELECT COUNT(*) AS cnt FROM posts").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO posts (author, title, body, post_type, is_pinned) VALUES (?, ?, ?, 'announcement', 1)",
                     (ADMIN_USERNAME, "AzForces Platformasına Xoş Gəldiniz!", "Burada rəsmi yarışlar, elanlar və anketlər paylaşılır. Hər gün Günün Məsələsini həll edərək aktivlik seriyanızı artırın, AzCoin yığıb fantastik animasiyalı çərçivələr əldə edin!"))
    if conn.execute("SELECT COUNT(*) AS cnt FROM site_reviews").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO site_reviews (username, rating, comment) VALUES (?, 5, ?) ON CONFLICT (username) DO NOTHING", (ADMIN_USERNAME, "Azərbaycan dilində müasir alqoritmik məsələ və icma platforması."))
    if conn.execute("SELECT COUNT(*) AS cnt FROM creative_codes").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES ('Almaz ASCII', 'Simmetrik almaz fiquru.', 'python', ?, '5', ?)",
                     ("n = int(input() or 5)\nfor i in range(n): print(' '*(n-i-1)+'*'*(2*i+1))\nfor i in range(n-2,-1,-1): print(' '*(n-i-1)+'*'*(2*i+1))", ADMIN_USERNAME))
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
def _sec(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    return resp


def sync_contests(conn):
    now = time.time()
    for r in conn.execute("SELECT id FROM contests WHERE status='active' AND ends_at<=?", (now,)).fetchall():
        conn.execute("UPDATE contests SET status='finished' WHERE id=?", (r["id"],))
        conn.execute("UPDATE problems SET visibility='gym' WHERE contest_id=? AND visibility='contest'", (r["id"],))
    conn.commit()


def check_daily(conn, username, kind, limit):
    u = conn.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(?)", (username,)).fetchone()
    if not u:
        return True
    today = time.strftime("%Y-%m-%d")
    dc, cc = f"d_{kind}_date", f"d_{kind}_cnt"
    cnt = u[cc] if u[dc] == today else 0
    if cnt >= limit:
        return False
    conn.execute(f"UPDATE users SET {dc}=?, {cc}=? WHERE LOWER(username)=LOWER(?)", (today, cnt + 1, username))
    return True


def norm_out(txt):
    return "\n".join(l.rstrip() for l in (txt or "").replace("\r\n", "\n").strip().splitlines())


def get_or_create_daily_pid(conn):
    today = time.strftime("%Y-%m-%d")
    row = conn.execute("SELECT problem_id FROM daily_challenges WHERE day_date=?", (today,)).fetchone()
    if row:
        if conn.execute("SELECT 1 FROM problems WHERE id=? AND visibility IN ('archive','gym')", (row["problem_id"],)).fetchone():
            return row["problem_id"]
    pool = conn.execute("SELECT id FROM problems WHERE visibility IN ('archive','gym') ORDER BY id ASC").fetchall()
    if not pool:
        return None
    chosen = pool[int(time.strftime("%Y%m%d")) % len(pool)]["id"]
    conn.execute("INSERT INTO daily_challenges (day_date, problem_id) VALUES (?, ?) ON CONFLICT (day_date) DO UPDATE SET problem_id=excluded.problem_id", (today, chosen))
    conn.commit()
    return chosen


def calc_quality_score(passed, total, time_str, time_limit, code):
    if total <= 0:
        return 0, {"tests_pct": 0, "speed_pct": 0, "style_pct": 0}
    test_pts = round(60 * passed / total)
    try:
        exec_s = float(str(time_str or "").replace("s", "").strip())
    except ValueError:
        exec_s = 0.25 if passed == total else time_limit
    speed_ratio = max(0.0, min(1.0, 1.0 - (exec_s / max(0.5, time_limit)) * 0.6))
    speed_pts = round(25 * speed_ratio * (passed / total))
    lc = len([l for l in code.splitlines() if l.strip()])
    style_pts = 15 if (1 <= lc <= 90) else (12 if lc <= 180 else 9)
    if passed < total:
        style_pts = max(3, round(style_pts * (passed / total)))
    return min(100, max(0, test_pts + speed_pts + style_pts)), {
        "tests_pct": round(100 * passed / total),
        "speed_pct": round(100 * speed_ratio) if passed > 0 else 0,
        "style_pct": round(100 * style_pts / 15),
    }


def upload_voice_storage(raw_bytes, ext="webm"):
    if VOICE_UPLOAD_WEBHOOK:
        r = requests.post(VOICE_UPLOAD_WEBHOOK, files={"file": (f"voice.{ext}", raw_bytes, f"audio/{ext}")}, timeout=20)
        if r.status_code < 400:
            url = (r.json() or {}).get("url") or (r.json() or {}).get("secure_url")
            if url:
                return url, None
        return None, "Xarici səs servisi cavab vermədi."
    if CLOUD_NAME and CLOUD_KEY and CLOUD_SECRET:
        ts = int(time.time())
        sig = hashlib.sha1(f"folder=azforces_voice&timestamp={ts}{CLOUD_SECRET}".encode("utf-8")).hexdigest()
        r = requests.post(
            f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload",
            data={"api_key": CLOUD_KEY, "timestamp": ts, "folder": "azforces_voice", "signature": sig},
            files={"file": (f"voice.{ext}", raw_bytes)}, timeout=25,
        )
        if r.status_code < 400:
            return r.json().get("secure_url", ""), None
        return None, "Cloudinary səs yükləməsi alınmadı."
    return None, "Səs saxlama servisi qoşulmayıb (Cloudinary və ya VOICE_UPLOAD_WEBHOOK təyin edin)."


def _get_wandbox_compilers():
    now = time.time()
    if now - _wandbox_cache["ts"] < 3600 and _wandbox_cache["compilers"]:
        return _wandbox_cache["compilers"]
    try:
        r = requests.get("https://wandbox.org/api/list.json", timeout=10)
        if r.status_code == 200:
            found = {}
            for it in r.json():
                lg, nm = it.get("language", "").lower(), it.get("name", "")
                if lg == "python" and "cpython" in nm and "python" not in found:
                    found["python"] = nm
                elif lg == "c++" and "gcc" in nm and "head" not in nm and "cpp" not in found:
                    found["cpp"] = nm
                elif lg == "c" and "gcc" in nm and "head" not in nm and "c" not in found:
                    found["c"] = nm
                elif lg == "javascript" and "nodejs" in nm and "javascript" not in found:
                    found["javascript"] = nm
                elif lg == "java" and "openjdk" in nm and "java" not in found:
                    found["java"] = nm
            if found:
                _wandbox_cache["compilers"], _wandbox_cache["ts"] = found, now
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
            hdrs["X-RapidAPI-Key"], hdrs["X-RapidAPI-Host"] = api_key, base_url.split("//")[-1].split("/")[0]
        else:
            hdrs["X-Auth-Token"] = api_key
    b64 = lambda s: base64.b64encode((s or "").encode("utf-8")).decode("ascii")
    deb64 = lambda s: base64.b64decode(s).decode("utf-8", errors="replace") if s else ""
    try:
        r = requests.post(f"{base_url}/submissions?base64_encoded=true&wait=true", json={"language_id": lids[lang], "source_code": b64(code), "stdin": b64(stdin_data), "cpu_time_limit": t_limit}, headers=hdrs, timeout=22)
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
        sid, et = d.get("status", {}).get("id", 0), f"{d.get('time')}s" if d.get("time") else "-"
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
    res = _run_judge0(url or "https://ce.judge0.com", key, lang, code, stdin_data, t_limit)
    if not res.get("ok"):
        wb = _run_wandbox(lang, code, stdin_data)
        if wb.get("ok"):
            return wb
    return res

@app.route("/")
def index():
    return render_template("index.html", admin_portal=False)


@app.route("/p/<slug>")
def secret_admin_portal(slug):
    _, adm, _, _ = get_session()
    if not adm or slug != ADMIN_SECRET_PATH:
        abort(404)
    return render_template("index.html", admin_portal=True)


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


@app.route("/api/guest/start", methods=["POST"])
def guest_start():
    u, _, _, rem = get_session()
    if u:
        return jsonify({"ok": True, "guest_remaining_sec": None})
    if rem is not None:
        return jsonify({"ok": True, "guest_remaining_sec": rem})
    gt = create_session("guest", kind="guest", ttl=GUEST_TTL)
    resp = make_response(jsonify({"ok": True, "guest_remaining_sec": GUEST_TTL}))
    set_cookie(resp, "az_guest", gt, GUEST_TTL)
    return resp


@app.route("/api/site-reviews", methods=["GET", "POST"])
def site_reviews():
    conn = get_db()
    if request.method == "GET":
        revs = [r | {"is_admin_user": r["username"] == ADMIN_USERNAME} for r in conn.execute("SELECT * FROM site_reviews ORDER BY id DESC LIMIT 12").fetchall()]
        avg = conn.execute("SELECT ROUND(AVG(rating), 1) AS avg_r, COUNT(*) AS cnt FROM site_reviews").fetchone()
        stats = {
            "users": conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()["cnt"],
            "problems": conn.execute("SELECT COUNT(*) AS cnt FROM problems WHERE visibility IN ('archive','gym')").fetchone()["cnt"],
            "submissions": conn.execute("SELECT COUNT(*) AS cnt FROM submissions").fetchone()["cnt"],
            "avg_rating": float(avg["avg_r"]) if avg["avg_r"] is not None else 5.0,
            "total_reviews": avg["cnt"],
        }
        conn.close()
        return jsonify({"stats": stats, "reviews": revs})
    u, _, _, _ = get_session()
    if not u:
        conn.close()
        return jsonify({"error": "Rəy yazmaq üçün daxil olun."}), 401
    d = request.get_json(silent=True) or {}
    rt, cmt = safe_int(d.get("rating"), 5, 1, 5), str(d.get("comment") or "").strip()[:300]
    conn.execute("INSERT INTO site_reviews (username, rating, comment) VALUES (?, ?, ?) ON CONFLICT (username) DO UPDATE SET rating = excluded.rating, comment = excluded.comment", (u, rt, cmt))
    conn.commit()
    conn.close()
    return jsonify({"message": "Dəyərləndirməniz qeyd edildi!"})


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    u, adm, hum, guest_rem = get_session()
    info = {"authenticated": bool(u), "username": u, "is_admin": adm, "infinite_coins": adm, "human_verified": hum, "guest_remaining_sec": guest_rem, "level": 1, "xp": 0, "needed_xp": 100, "coins": 0, "avatar_url": "", "avatar_frame": "none", "avatar_color": "#3b82f6"}
    if u:
        conn = get_db()
        row = conn.execute("SELECT level, xp, total_xp, coins, rating, daily_streak, avatar_url, avatar_color, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (u,)).fetchone()
        conn.close()
        if row:
            info.update({"level": row["level"], "xp": row["xp"], "needed_xp": needed_xp(row["level"]), "total_xp": row["total_xp"], "coins": row["coins"], "rating": row["rating"], "streak": row["daily_streak"], "avatar_url": row["avatar_url"], "avatar_color": row["avatar_color"], "avatar_frame": row["avatar_frame"]})
    return jsonify(info)


@app.route("/api/auth/send-code", methods=["POST"])
@rate_limit(5, 60)
def send_reg_code():
    d = request.get_json(silent=True) or {}
    email, uname, pw, pw2 = str(d.get("email") or "").strip().lower(), str(d.get("username") or "").strip(), str(d.get("password") or ""), str(d.get("password_confirm") or "")
    if not re.match(r"^[a-z0-9._%+-]+@gmail\.com$", email):
        return jsonify({"error": "Yalnız etibarlı @gmail.com ünvanı yazın."}), 400
    if ADMIN_EMAIL and email == ADMIN_EMAIL:
        return jsonify({"error": "Bu Gmail qeydiyyata bağlıdır."}), 400
    if not (3 <= len(uname) <= 22) or not re.match(r"^[a-zA-Z0-9_-]+$", uname) or uname.lower() == ADMIN_USERNAME.lower():
        return jsonify({"error": "İstifadəçi adı 3-22 simvol (hərf, rəqəm, _ -) olmalı və unikal olmalıdır."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Parol ən azı 6 simvol olmalıdır."}), 400
    if pw != pw2:
        return jsonify({"error": "Şifrələr eyni deyil — zəhmət olmasa iki dəfə düzgün yazın."}), 400
    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?)", (uname, email)).fetchone():
        conn.close()
        return jsonify({"error": "Bu ad və ya Gmail artıq mövcuddur."}), 400
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn.execute("INSERT INTO email_codes (email, code_hash, attempts, expires_at) VALUES (?, ?, 0, ?) ON CONFLICT (email) DO UPDATE SET code_hash=excluded.code_hash, attempts=0, expires_at=excluded.expires_at", (email, generate_password_hash(code), time.time() + 300))
    conn.commit()
    conn.close()
    ok, mode = send_gmail_code(email, code)
    if not ok:
        return jsonify({"error": mode}), 500
    res = {"ok": True, "message": "6 rəqəmli təsdiq kodu Gmail-inizə göndərildi."}
    if mode == "console" and DEV_EMAIL_PREVIEW:
        res["dev_code"] = code
    return jsonify(res)


@app.route("/api/auth/register", methods=["POST"])
@rate_limit(10, 60)
def auth_register():
    d = request.get_json(silent=True) or {}
    email, uname, pw, pw2, code = str(d.get("email") or "").strip().lower(), str(d.get("username") or "").strip(), str(d.get("password") or ""), str(d.get("password_confirm") or ""), str(d.get("code") or "").strip()
    if pw != pw2 or len(pw) < 6:
        return jsonify({"error": "Şifrələr uyğun gəlmir."}), 400
    conn = get_db()
    ec = conn.execute("SELECT * FROM email_codes WHERE LOWER(email)=LOWER(?)", (email,)).fetchone()
    if not ec or ec["expires_at"] < time.time():
        conn.close()
        return jsonify({"error": "Kodun müddəti bitib."}), 400
    if ec["attempts"] >= 5 or not check_password_hash(ec["code_hash"], code):
        conn.execute("UPDATE email_codes SET attempts=attempts+1 WHERE LOWER(email)=LOWER(?)", (email,))
        conn.commit()
        conn.close()
        return jsonify({"error": "Təsdiq kodu yanlışdır."}), 400
    if conn.execute("SELECT 1 FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?)", (uname, email)).fetchone():
        conn.close()
        return jsonify({"error": "Ad və ya Gmail artıq tutulub."}), 400
    conn.execute("INSERT INTO users (username, email, password_hash, coins, last_seen_at) VALUES (?, ?, ?, 50, ?)", (uname, email, generate_password_hash(pw), time.time()))
    conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, 'none') ON CONFLICT (username, item_id) DO NOTHING", (uname,))
    conn.execute("INSERT INTO rating_history (username, rating, label) VALUES (?, 800, 'Başlanğıc')", (uname,))
    conn.execute("DELETE FROM email_codes WHERE LOWER(email)=LOWER(?)", (email,))
    conn.commit()
    conn.close()
    tok = create_session(uname, "user", SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": uname, "message": "Xoş gəldiniz! +50 AzCoin hədiyyə."}))
    set_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/login", methods=["POST"])
@rate_limit(15, 60)
def auth_login():
    d = request.get_json(silent=True) or {}
    ident, pw = str(d.get("identifier") or "").strip(), str(d.get("password") or "")
    conn = get_db()
    adm_hash = _ENV_ADMIN_HASH or (conn.execute("SELECT value FROM settings WHERE key='admin_password_hash'").fetchone() or {"value": ""})["value"]
    is_adm_id = (ADMIN_EMAIL and ident.lower() == ADMIN_EMAIL) or (not ADMIN_EMAIL and ident.lower() == ADMIN_USERNAME.lower())

    if is_adm_id:
        now = time.time()
        with _fail_lock:
            if _admin_fails["until"] > now:
                conn.close()
                return jsonify({"error": f"Təhlükəsizlik kilidi ({int(_admin_fails['until']-now)}s)."}), 429
        if adm_hash and check_password_hash(adm_hash, pw):
            with _fail_lock:
                _admin_fails["count"] = 0
            if not conn.execute("SELECT 1 FROM users WHERE LOWER(username)=LOWER(?)", (ADMIN_USERNAME,)).fetchone():
                conn.execute("INSERT INTO users (username, email, password_hash, coins, last_seen_at) VALUES (?, ?, ?, 999999, ?) ON CONFLICT (username) DO NOTHING", (ADMIN_USERNAME, ADMIN_EMAIL or "admin@azforces.local", adm_hash, now))
                conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, 'none') ON CONFLICT (username, item_id) DO NOTHING", (ADMIN_USERNAME,))
                conn.execute("INSERT INTO rating_history (username, rating, label) VALUES (?, 800, 'Başlanğıc')", (ADMIN_USERNAME,))
            else:
                conn.execute("UPDATE users SET last_seen_at=? WHERE LOWER(username)=LOWER(?)", (now, ADMIN_USERNAME))
            conn.commit()
            conn.close()
            ut, at = create_session(ADMIN_USERNAME, "user", SESSION_TTL), create_session(ADMIN_USERNAME, "admin", ADMIN_TTL)
            resp = make_response(jsonify({"ok": True, "username": ADMIN_USERNAME, "is_admin": True, "message": "Xoş gəldiniz!"}))
            set_cookie(resp, "az_session", ut, SESSION_TTL)
            set_cookie(resp, "az_admin_session", at, ADMIN_TTL)
            return resp
        with _fail_lock:
            _admin_fails["count"] += 1
            if _admin_fails["count"] >= 5:
                _admin_fails["until"], _admin_fails["count"] = now + 900, 0
        conn.close()
        return jsonify({"error": "Məlumatlar yanlışdır."}), 401

    u = conn.execute("SELECT * FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?)", (ident, ident)).fetchone()
    if not u or not check_password_hash(u["password_hash"], pw):
        conn.close()
        return jsonify({"error": "Məlumatlar yanlışdır."}), 401
    conn.execute("UPDATE users SET last_seen_at=? WHERE LOWER(username)=LOWER(?)", (time.time(), u["username"]))
    conn.commit()
    conn.close()
    tok = create_session(u["username"], "user", SESSION_TTL)
    resp = make_response(jsonify({"ok": True, "username": u["username"], "is_admin": False, "message": "Xoş gəldiniz!"}))
    set_cookie(resp, "az_session", tok, SESSION_TTL)
    return resp


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    conn = get_db()
    for cn in ("az_session", "az_admin_session"):
        t = request.cookies.get(cn, "").strip()
        if t:
            conn.execute("DELETE FROM sessions WHERE token=?", (t,))
    conn.commit()
    conn.close()
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie("az_session")
    resp.delete_cookie("az_admin_session")
    return resp


def _build_profile_payload(conn, target, include_private=False, viewer_is_admin=False):
    u = conn.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(?)", (target,)).fetchone()
    if not u:
        return None
    uname = u["username"]
    solved = conn.execute("SELECT COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE LOWER(username)=LOWER(?) AND verdict='Accepted'", (uname,)).fetchone()["cnt"]
    recent = conn.execute("SELECT p.id, p.code_label, p.title, p.rating, MAX(s.created_at) AS solved_at FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE LOWER(s.username)=LOWER(?) AND s.verdict='Accepted' GROUP BY p.id, p.code_label, p.title, p.rating ORDER BY solved_at DESC LIMIT 8", (uname,)).fetchall()
    heat = defaultdict(int)
    for row in conn.execute("SELECT created_at FROM submissions WHERE LOWER(username)=LOWER(?) ORDER BY id DESC LIMIT 1000", (uname,)).fetchall():
        d_str = str(row["created_at"] or "")[:10]
        if len(d_str) == 10:
            heat[d_str] += 1
    r_hist = conn.execute("SELECT rating, label, created_at FROM rating_history WHERE LOWER(username)=LOWER(?) ORDER BY id ASC LIMIT 30", (uname,)).fetchall()
    need = needed_xp(u["level"])
    target_is_adm = (uname == ADMIN_USERNAME)
    data = {
        "username": uname, "bio": u["bio"], "avatar_url": u["avatar_url"], "avatar_color": u["avatar_color"],
        "avatar_frame": u["avatar_frame"], "level": u["level"], "xp": u["xp"], "needed_xp": need,
        "progress_pct": min(100, int(u["xp"] * 100 / need)), "total_xp": u["total_xp"],
        "coins": u["coins"], "infinite_coins": target_is_adm,
        "rating": u["rating"], "streak": u["daily_streak"], "solved_count": solved,
        "recent_solved": recent, "heatmap": dict(heat), "rating_history": r_hist, "is_admin_user": target_is_adm,
    }
    if viewer_is_admin:
        last_ts = float(u["last_seen_at"] or 0)
        is_on = (time.time() - last_ts) <= 120 if last_ts > 0 else False
        data["admin_meta"] = {
            "is_online": is_on,
            "last_seen": datetime.datetime.fromtimestamp(last_ts).strftime("%Y-%m-%d %H:%M") if last_ts > 0 else "Məlumat yoxdur",
            "joined_at": u["created_at"],
            "email": u["email"],
        }
    if include_private:
        fr_rows = conn.execute("SELECT * FROM friendships WHERE LOWER(user_a)=LOWER(?) OR LOWER(user_b)=LOWER(?)", (uname, uname)).fetchall()
        friends, inc = [], []
        for f in fr_rows:
            other = f["user_b"] if f["user_a"].lower() == uname.lower() else f["user_a"]
            if f["status"] == "accepted":
                fu = conn.execute("SELECT level, daily_streak, avatar_url, avatar_color, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (other,)).fetchone()
                friends.append({"username": other, "level": fu["level"] if fu else 1, "streak": fu["daily_streak"] if fu else 0, "avatar_url": fu["avatar_url"] if fu else "", "avatar_color": fu["avatar_color"] if fu else "#3b82f6", "avatar_frame": fu["avatar_frame"] if fu else "none", "is_admin_user": other == ADMIN_USERNAME})
            elif f["status"] == "pending" and f["action_by"].lower() != uname.lower():
                inc.append(other)
        data["email"] = u["email"]
        data["friends"] = friends
        data["incoming_requests"] = inc
    return data


@app.route("/api/profile", methods=["GET"])
@require_user
def my_profile():
    conn = get_db()
    payload = _build_profile_payload(conn, request._u, include_private=True, viewer_is_admin=request._adm)
    conn.close()
    return jsonify(payload)


@app.route("/api/users/<uname>", methods=["GET"])
@require_user
def public_profile(uname):
    conn = get_db()
    payload = _build_profile_payload(conn, uname, include_private=(uname.lower() == request._u.lower()), viewer_is_admin=request._adm)
    conn.close()
    return jsonify(payload) if payload else (jsonify({"error": "Tapılmadı."}), 404)


@app.route("/api/profile/update", methods=["POST"])
@require_user
def update_profile():
    d = request.get_json(silent=True) or {}
    bio, color = str(d.get("bio") or "").strip()[:200], str(d.get("avatar_color") or "#3b82f6").strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = "#3b82f6"
    conn = get_db()
    conn.execute("UPDATE users SET bio=?, avatar_color=? WHERE LOWER(username)=LOWER(?)", (bio, color, request._u))
    conn.commit()
    conn.close()
    return jsonify({"message": "Profil yeniləndi!"})


@app.route("/api/profile/avatar", methods=["POST"])
@require_user
def upload_avatar():
    if not (CLOUD_NAME and CLOUD_KEY and CLOUD_SECRET):
        return jsonify({"error": "Cloudinary açarları Render mühitində təyin edilməyib."}), 400
    f = request.files.get("avatar")
    if not f:
        return jsonify({"error": "Şəkil seçin."}), 400
    raw = f.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        return jsonify({"error": "Şəkil maksimum 2 MB ola bilər."}), 400
    if not (raw.startswith(b"\xff\xd8\xff") or raw.startswith(b"\x89PNG") or raw.startswith(b"GIF8") or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")):
        return jsonify({"error": "Yalnız JPG, PNG, WEBP və ya GIF şəkli yükləyin."}), 400
    ts = int(time.time())
    sig = hashlib.sha1(f"folder=azforces_avatars&timestamp={ts}{CLOUD_SECRET}".encode("utf-8")).hexdigest()
    try:
        r = requests.post(f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload", data={"api_key": CLOUD_KEY, "timestamp": ts, "folder": "azforces_avatars", "signature": sig}, files={"file": (f.filename or "avatar.jpg", raw)}, timeout=20)
        if r.status_code >= 400:
            return jsonify({"error": "Şəkil yüklənmədi."}), 502
        url = r.json().get("secure_url", "").replace("/upload/", "/upload/c_fill,w_256,h_256,q_auto/")
        conn = get_db()
        conn.execute("UPDATE users SET avatar_url=? WHERE LOWER(username)=LOWER(?)", (url, request._u))
        conn.commit()
        conn.close()
        return jsonify({"avatar_url": url, "message": "Profil şəkli yeniləndi!"})
    except Exception:
        return jsonify({"error": "Cloudinary bağlantısı uğursuz oldu."}), 502


@app.route("/api/media/upload-voice", methods=["POST"])
@require_user
@rate_limit(15, 60, by_user=True)
def upload_voice():
    f = request.files.get("audio")
    if not f:
        return jsonify({"error": "Səs faylı tapılmadı."}), 400
    raw = f.read(3 * 1024 * 1024 + 1)
    if len(raw) > 3 * 1024 * 1024 or len(raw) < 200:
        return jsonify({"error": "Səs faylı boşdur və ya 3 MB-dan böyükdür."}), 400
    ext = (f.filename or "voice.webm").rsplit(".", 1)[-1].lower()
    if ext not in ("webm", "ogg", "mp3", "m4a", "wav"):
        ext = "webm"
    url, err = upload_voice_storage(raw, ext)
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"audio_url": url})


@app.route("/api/coins/transfer", methods=["POST"])
@require_user
@rate_limit(15, 60, by_user=True)
def transfer_coins():
    me, is_adm = request._u, request._adm
    d = request.get_json(silent=True) or {}
    target = str(d.get("username") or "").strip().lstrip("@")
    amount = safe_int(d.get("amount"), 0, 1, 100000)
    if not target or target.lower() == me.lower() or amount <= 0:
        return jsonify({"error": "Düzgün istifadəçi adı və AzCoin miqdarı yazın."}), 400
    conn = get_db()
    sender = conn.execute("SELECT username, coins FROM users WHERE LOWER(username)=LOWER(?)", (me,)).fetchone()
    receiver = conn.execute("SELECT username FROM users WHERE LOWER(username)=LOWER(?)", (target,)).fetchone()
    if not receiver:
        conn.close()
        return jsonify({"error": f"'{target}' adlı istifadəçi tapılmadı."}), 404
    if not is_adm:
        if not sender or sender["coins"] < amount:
            conn.close()
            return jsonify({"error": "Balansınızda kifayət qədər AzCoin yoxdur."}), 400
        conn.execute("UPDATE users SET coins = coins - ? WHERE LOWER(username)=LOWER(?)", (amount, me))
    conn.execute("UPDATE users SET coins = coins + ? WHERE LOWER(username)=LOWER(?)", (amount, receiver["username"]))
    conn.execute("INSERT INTO direct_messages (sender, receiver, message) VALUES (?, ?, ?)", (me, receiver["username"], f"🪙 Sizə {amount} AzCoin göndərdi!"))
    conn.commit()
    conn.close()
    return jsonify({"message": f"{receiver['username']} istifadəçisinə {amount} AzCoin göndərildi!"})


@app.route("/api/shop", methods=["GET"])
@require_user
def get_shop():
    conn = get_db()
    u = conn.execute("SELECT coins, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (request._u,)).fetchone()
    owned = {r["item_id"] for r in conn.execute("SELECT item_id FROM user_inventory WHERE LOWER(username)=LOWER(?)", (request._u,)).fetchall()}
    owned.add("none")
    conn.close()
    return jsonify({"coins": u["coins"], "infinite_coins": request._adm, "equipped": u["avatar_frame"], "items": [it | {"owned": it["id"] in owned, "equipped": u["avatar_frame"] == it["id"]} for it in SHOP_ITEMS]})


@app.route("/api/shop/buy", methods=["POST"])
@require_user
def shop_buy():
    iid = str((request.get_json(silent=True) or {}).get("item_id") or "")
    item = next((x for x in SHOP_ITEMS if x["id"] == iid), None)
    if not item:
        return jsonify({"error": "Məhsul tapılmadı."}), 404
    conn = get_db()
    if conn.execute("SELECT 1 FROM user_inventory WHERE LOWER(username)=LOWER(?) AND item_id=?", (request._u, iid)).fetchone():
        conn.close()
        return jsonify({"error": "Artıq inventarınızdadır."}), 400
    if not request._adm:
        u = conn.execute("SELECT coins FROM users WHERE LOWER(username)=LOWER(?)", (request._u,)).fetchone()
        if u["coins"] < item["price"]:
            conn.close()
            return jsonify({"error": "Kifayət qədər AzCoin yoxdur."}), 400
        conn.execute("UPDATE users SET coins=coins-?, avatar_frame=? WHERE LOWER(username)=LOWER(?)", (item["price"], iid, request._u))
    else:
        conn.execute("UPDATE users SET avatar_frame=? WHERE LOWER(username)=LOWER(?)", (iid, request._u))
    conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, ?) ON CONFLICT (username, item_id) DO NOTHING", (request._u, iid))
    conn.commit()
    conn.close()
    return jsonify({"message": f"'{item['name']}' alındı və taxıldı!"})


@app.route("/api/shop/equip", methods=["POST"])
@require_user
def shop_equip():
    iid = str((request.get_json(silent=True) or {}).get("item_id") or "none")
    conn = get_db()
    if iid != "none" and not conn.execute("SELECT 1 FROM user_inventory WHERE LOWER(username)=LOWER(?) AND item_id=?", (request._u, iid)).fetchone():
        conn.close()
        return jsonify({"error": "Bu çərçivə sizdə yoxdur."}), 403
    conn.execute("UPDATE users SET avatar_frame=? WHERE LOWER(username)=LOWER(?)", (iid, request._u))
    conn.commit()
    conn.close()
    return jsonify({"message": "Çərçivə dəyişdirildi!"})


@app.route("/api/friends/request", methods=["POST"])
@require_user
def friend_req():
    me, target = request._u, str((request.get_json(silent=True) or {}).get("username") or "").strip().lstrip("@")
    if not target or target.lower() == me.lower():
        return jsonify({"error": "Düzgün istifadəçi adı yazın."}), 400
    conn = get_db()
    tu = conn.execute("SELECT username FROM users WHERE LOWER(username)=LOWER(?)", (target,)).fetchone()
    if not tu:
        conn.close()
        return jsonify({"error": "İstifadəçi tapılmadı."}), 404
    a, b = sorted([me, tu["username"]], key=str.lower)
    if conn.execute("SELECT 1 FROM friendships WHERE LOWER(user_a)=LOWER(?) AND LOWER(user_b)=LOWER(?)", (a, b)).fetchone():
        conn.close()
        return jsonify({"error": "Artıq dostsunuz və ya sorğu var."}), 400
    conn.execute("INSERT INTO friendships (user_a, user_b, status, action_by) VALUES (?, ?, 'pending', ?)", (a, b, me))
    conn.commit()
    conn.close()
    return jsonify({"message": f"{tu['username']} istifadəçisinə sorğu göndərildi!"})


@app.route("/api/friends/respond", methods=["POST"])
@require_user
def friend_resp():
    me, d = request._u, request.get_json(silent=True) or {}
    a, b = sorted([me, str(d.get("username") or "").strip()], key=str.lower)
    conn = get_db()
    if d.get("action") == "accept":
        conn.execute("UPDATE friendships SET status='accepted', action_by=? WHERE LOWER(user_a)=LOWER(?) AND LOWER(user_b)=LOWER(?) AND status='pending'", (me, a, b))
    else:
        conn.execute("DELETE FROM friendships WHERE LOWER(user_a)=LOWER(?) AND LOWER(user_b)=LOWER(?)", (a, b))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/admin/users", methods=["GET"])
@require_admin
def admin_list_users():
    q = (request.args.get("q") or "").strip().lower()
    conn = get_db()
    rows = conn.execute("SELECT id, username, email, level, xp, total_xp, coins, rating, daily_streak, last_seen_at, created_at FROM users ORDER BY id DESC").fetchall()
    solved_map = {r["username"].lower(): r["cnt"] for r in conn.execute("SELECT LOWER(username) AS username, COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE verdict='Accepted' GROUP BY LOWER(username)").fetchall()}
    conn.close()
    now, out = time.time(), []
    for r in rows:
        if q and q not in r["username"].lower() and q not in r["email"].lower():
            continue
        ts = float(r["last_seen_at"] or 0)
        out.append(r | {"solved_count": solved_map.get(r["username"].lower(), 0), "is_admin_user": r["username"] == ADMIN_USERNAME, "is_online": (now - ts) <= 120 if ts > 0 else False})
    return jsonify(out)


@app.route("/api/admin/users/<target>/gift", methods=["POST"])
@require_admin
def admin_gift_user(target):
    d = request.get_json(silent=True) or {}
    coins = safe_int(d.get("coins"), 0, -10000, 100000)
    xp = safe_int(d.get("xp"), 0, 0, 100000)
    conn = get_db()
    u = conn.execute("SELECT username, coins FROM users WHERE LOWER(username)=LOWER(?)", (target,)).fetchone()
    if not u:
        conn.close()
        return jsonify({"error": "İstifadəçi tapılmadı."}), 404
    if coins < 0:
        conn.execute("UPDATE users SET coins=? WHERE LOWER(username)=LOWER(?)", (max(0, u["coins"] + coins), u["username"]))
        award_rewards(conn, u["username"], xp, 0)
    else:
        award_rewards(conn, u["username"], xp, coins)
    conn.commit()
    conn.close()
    return jsonify({"message": f"{u['username']} yeniləndi (Coin: {coins:+d}, XP: +{xp})!"})


@app.route("/api/admin/users/<target>", methods=["DELETE"])
@require_admin
def admin_delete_user(target):
    if target.lower() == ADMIN_USERNAME.lower():
        return jsonify({"error": "Admin hesabını silmək olmaz."}), 400
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE LOWER(username)=LOWER(?)", (target,))
    cur = conn.execute("DELETE FROM users WHERE LOWER(username)=LOWER(?)", (target,))
    conn.commit()
    conn.close()
    return jsonify({"message": f"{target} silindi."}) if cur.rowcount else (jsonify({"error": "Tapılmadı."}), 404)


@app.route("/api/daily", methods=["GET"])
def daily_challenge():
    u, _, _, _ = get_session()
    conn = get_db()
    pid = get_or_create_daily_pid(conn)
    prob = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit FROM problems WHERE id=?", (pid,)).fetchone() if pid else None
    today = time.strftime("%Y-%m-%d")
    solved_today, streak = False, 0
    if u:
        solved_today = bool(conn.execute("SELECT 1 FROM daily_solves WHERE day_date=? AND LOWER(username)=LOWER(?)", (today, u)).fetchone())
        ur = conn.execute("SELECT daily_streak FROM users WHERE LOWER(username)=LOWER(?)", (u,)).fetchone()
        streak = ur["daily_streak"] if ur else 0
    top = [r | {"is_admin_user": r["username"] == ADMIN_USERNAME} for r in conn.execute("SELECT username, quality_pct, solved_at FROM daily_solves WHERE day_date=? ORDER BY id ASC LIMIT 10", (today,)).fetchall()]
    conn.close()
    now_lt = time.localtime()
    sec_left = 86400 - (now_lt.tm_hour * 3600 + now_lt.tm_min * 60 + now_lt.tm_sec)
    return jsonify({"day_date": today, "problem": prob, "solved_today": solved_today, "streak": streak, "seconds_left": sec_left, "reward_xp": 50, "reward_coins": 40, "chest_7day_coins": 200, "top_solvers": top})


@app.route("/api/admin/daily", methods=["POST"])
@require_admin
def admin_set_daily():
    key = str((request.get_json(silent=True) or {}).get("problem_code") or "").strip()
    conn = get_db()
    p = conn.execute("SELECT id, code_label, title FROM problems WHERE id=? OR UPPER(code_label)=UPPER(?)", (safe_int(key, -1), key)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404
    today = time.strftime("%Y-%m-%d")
    conn.execute("INSERT INTO daily_challenges (day_date, problem_id) VALUES (?, ?) ON CONFLICT (day_date) DO UPDATE SET problem_id=excluded.problem_id", (today, p["id"]))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Günün məsələsi '{p['code_label']}. {p['title']}' seçildi!"})

    @app.route("/api/problems", methods=["GET"])
def list_problems():
    view = request.args.get("view", "archive")
    u, adm, _, _ = get_session()
    conn = get_db()
    sync_contests(conn)
    if view == "gym":
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author FROM problems WHERE visibility='gym' ORDER BY contest_id DESC, rating ASC").fetchall()
    elif view == "all" and adm:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author, visibility FROM problems WHERE visibility IN ('archive','gym','contest') ORDER BY id ASC").fetchall()
    else:
        rows = conn.execute("SELECT id, code_label, title, rating, tags, time_limit, memory_limit, author FROM problems WHERE visibility='archive' ORDER BY rating ASC, id ASC").fetchall()
    cnts = {r["problem_id"]: r["cnt"] for r in conn.execute("SELECT problem_id, COUNT(DISTINCT username) AS cnt FROM submissions WHERE verdict='Accepted' GROUP BY problem_id").fetchall()}
    solved = {r["problem_id"] for r in conn.execute("SELECT DISTINCT problem_id FROM submissions WHERE verdict='Accepted' AND LOWER(username)=LOWER(?)", (u,)).fetchall()} if u else set()
    conn.close()
    return jsonify([r | {"solved": r["id"] in solved, "solved_count": cnts.get(r["id"], 0), "author_is_admin": r["author"] == ADMIN_USERNAME} for r in rows])


@app.route("/api/problems/<key>", methods=["GET"])
def problem_detail(key):
    _, adm, _, _ = get_session()
    conn = get_db()
    sync_contests(conn)
    p = conn.execute("SELECT * FROM problems WHERE id=? OR UPPER(code_label)=UPPER(?)", (safe_int(key, -1), str(key).strip())).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Məsələ tapılmadı."}), 404
    if p["visibility"] in ("pending", "rejected") and not adm:
        conn.close()
        return jsonify({"error": "Bu məsələ əlçatan deyil."}), 403
    samples = conn.execute("SELECT id, input_data, expected_output FROM test_cases WHERE problem_id=? AND is_sample=1", (p["id"],)).fetchall()
    conn.close()
    return jsonify(p | {"samples": samples, "author_is_admin": p["author"] == ADMIN_USERNAME})


@app.route("/api/problems", methods=["POST"])
@require_admin
def create_problem():
    d = request.get_json(silent=True) or {}
    t, st, tests = str(d.get("title") or "").strip(), str(d.get("statement") or "").strip(), d.get("tests") or []
    if not t or not st or not tests:
        return jsonify({"error": "Başlıq, şərt və test mütləqdir."}), 400
    conn = get_db()
    pid = conn.execute("INSERT INTO problems (code_label,title,rating,tags,time_limit,memory_limit,statement,input_spec,output_spec,note,editorial,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (str(d.get("code_label") or "").strip().upper()[:10], t, safe_int(d.get("rating"), 800, 100, 4000), str(d.get("tags", "custom")), safe_float(d.get("time_limit"), 2.0), safe_int(d.get("memory_limit"), 256, 16, 1024),
                        st, str(d.get("input_spec", "")), str(d.get("output_spec", "")), str(d.get("note", "")), str(d.get("editorial", "")), ADMIN_USERNAME, d.get("visibility", "archive"))).lastrowid
    if not conn.execute("SELECT code_label FROM problems WHERE id=?", (pid,)).fetchone()["code_label"]:
        conn.execute("UPDATE problems SET code_label=? WHERE id=?", (f"{pid}A", pid))
    for tc in tests:
        if isinstance(tc, dict):
            conn.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, str(tc.get("input", "")), str(tc.get("output", "")), 1 if tc.get("is_sample", True) else 0))
    conn.commit()
    conn.close()
    return jsonify({"id": pid, "message": "Məsələ birbaşa Məsələlər bölməsinə əlavə olundu!"})


@app.route("/api/problems/<int:pid>", methods=["DELETE"])
@require_admin
def delete_problem(pid):
    conn = get_db()
    conn.execute("DELETE FROM problems WHERE id=?", (pid,))
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
            ct["problems"] = conn.execute("SELECT id, code_label, title, rating FROM problems WHERE contest_id=? ORDER BY rating ASC", (ct["id"],)).fetchall()
            res.append(ct)
        conn.close()
        return jsonify(res)
    _, adm, _, _ = get_session()
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
            conn.execute("UPDATE problems SET contest_id=?, visibility='contest', code_label=? WHERE id=?", (cid, chr(65 + i) if i < 26 else f"P{i+1}", pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yarış başladıldı!"})


@app.route("/api/contests/<int:cid>/finish", methods=["POST"])
@require_admin
def finish_contest(cid):
    conn = get_db()
    conn.execute("UPDATE contests SET status='finished', ends_at=? WHERE id=?", (time.time(), cid))
    conn.execute("UPDATE problems SET visibility='gym' WHERE contest_id=? AND visibility='contest'", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Yarış bitirildi, suallar Gym-ə köçürüldü!"})


@app.route("/api/proposals", methods=["POST"])
@require_user
@rate_limit(5, 60, by_user=True)
def submit_proposal():
    me, is_adm, d = request._u, request._adm, request.get_json(silent=True) or {}
    t, st, tests, code, lang = str(d.get("title") or "").strip(), str(d.get("statement") or "").strip(), d.get("tests") or [], str(d.get("author_code") or ""), str(d.get("author_lang") or "python")
    if not t or not st or not tests or (not is_adm and not code.strip()):
        return jsonify({"error": "Bütün vacib xanaları doldurun."}), 400
    conn = get_db()
    if is_adm:
        pid = conn.execute("INSERT INTO problems (code_label,title,rating,tags,statement,input_spec,output_spec,editorial,starter_code,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,'archive')",
                           (str(d.get("code_label") or "").strip().upper()[:10], t[:120], safe_int(d.get("rating"), 800, 600, 3500), str(d.get("tags", "custom")), st, str(d.get("input_spec", "")), str(d.get("output_spec", "")), str(d.get("editorial", "")), code, me)).lastrowid
        if not conn.execute("SELECT code_label FROM problems WHERE id=?", (pid,)).fetchone()["code_label"]:
            conn.execute("UPDATE problems SET code_label=? WHERE id=?", (f"A{pid}", pid))
        for tc in tests[:15]:
            if isinstance(tc, dict):
                conn.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, str(tc.get("input", "")), str(tc.get("output", "")), 1 if tc.get("is_sample", True) else 0))
        conn.commit()
        conn.close()
        return jsonify({"message": "Admin sualı birbaşa Məsələlər bölməsinə əlavə edildi!"})

    if conn.execute("SELECT COUNT(*) AS cnt FROM problems WHERE LOWER(author)=LOWER(?) AND visibility='pending'", (me,)).fetchone()["cnt"] >= 2:
        conn.close()
        return jsonify({"error": "Gözləmədə maks. 2 təklifiniz ola bilər."}), 400
    if not check_daily(conn, me, "prop", MAX_DAILY_PROPS):
        conn.close()
        return jsonify({"error": "Gündəlik təklif limitiniz bitib."}), 429
    ok_cnt, status_txt = 0, "Keçdi ✔"
    for tc in tests[:4]:
        res = run_code_sandbox(lang, code, str(tc.get("input", "")), 2.0)
        if not res.get("ok") or res.get("status") != "OK" or norm_out(res.get("stdout")) != norm_out(str(tc.get("output", ""))):
            status_txt = f"Xəta ({res.get('status', 'WA')})"
            break
        ok_cnt += 1
    pid = conn.execute("INSERT INTO problems (code_label,title,rating,tags,statement,input_spec,output_spec,editorial,starter_code,author,visibility,author_check_status) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)",
                       ("P0", t[:120], safe_int(d.get("rating"), 800, 600, 3500), str(d.get("tags", "custom")), st, str(d.get("input_spec", "")), str(d.get("output_spec", "")), str(d.get("editorial", "")), code, me, f"{status_txt} ({ok_cnt}/{min(len(tests),4)})")).lastrowid
    conn.execute("UPDATE problems SET code_label=? WHERE id=?", (f"U{pid}", pid))
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
    rows = conn.execute("SELECT id, code_label, title, rating, visibility, awarded_xp, reject_reason FROM problems WHERE LOWER(author)=LOWER(?) ORDER BY id DESC LIMIT 20", (request._u,)).fetchall()
    conn.close()
    return jsonify(rows)


@app.route("/api/admin/proposals", methods=["GET"])
@require_admin
def admin_proposals():
    conn = get_db()
    rows = conn.execute("SELECT * FROM problems WHERE visibility='pending' ORDER BY id ASC").fetchall()
    for r in rows:
        r["tests"] = conn.execute("SELECT input_data, expected_output, is_sample FROM test_cases WHERE problem_id=?", (r["id"],)).fetchall()
    conn.close()
    return jsonify(rows)


@app.route("/api/admin/proposals/<int:pid>/review", methods=["POST"])
@require_admin
def review_proposal(pid):
    d = request.get_json(silent=True) or {}
    conn = get_db()
    p = conn.execute("SELECT * FROM problems WHERE id=? AND visibility='pending'", (pid,)).fetchone()
    if not p:
        conn.close()
        return jsonify({"error": "Tapılmadı."}), 404
    if d.get("action") == "approve":
        xp = safe_int(d.get("xp_reward"), 150, 0, 2000)
        coins = max(25, xp // 2)
        vis = d.get("visibility", "archive") if d.get("visibility") in ("archive", "gym") else "archive"
        clbl = str(d.get("code_label") or p["code_label"] or f"U{pid}").strip().upper()[:10]
        conn.execute("UPDATE problems SET visibility=?, awarded_xp=?, code_label=? WHERE id=?", (vis, xp, clbl, pid))
        award_rewards(conn, p["author"], xp, coins)
        conn.commit()
        conn.close()
        return jsonify({"message": f"Təsdiqləndi! {clbl} Məsələlərə düşdü, {p['author']} +{xp} XP və +{coins} AzCoin aldı."})
    conn.execute("UPDATE problems SET visibility='rejected', reject_reason=? WHERE id=?", (str(d.get("reason") or "Uyğun deyil."), pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Təklif rədd edildi və siyahıdan silindi."})


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
    p_key = str(d.get("problem_code") or d.get("problem_id") or "").strip()
    lang, code, room_id = str(d.get("language", "python")), str(d.get("code", "")), safe_int(d.get("room_id"), 0)
    if not p_key or not code.strip():
        return jsonify({"error": "Məsələ kodu (məs: 1A) və kod mütləqdir."}), 400
    conn = get_db()
    p = conn.execute("SELECT * FROM problems WHERE id=? OR UPPER(code_label)=UPPER(?)", (safe_int(p_key, -1), p_key)).fetchone()
    if not p or p["visibility"] in ("pending", "rejected"):
        conn.close()
        return jsonify({"error": f"'{p_key}' kodlu məsələ tapılmadı."}), 404
    if not check_daily(conn, me, "sub", MAX_DAILY_SUBS):
        conn.close()
        return jsonify({"error": "Gündəlik göndəriş limitiniz bitib."}), 429

    pid = p["id"]
    already = conn.execute("SELECT 1 FROM submissions WHERE problem_id=? AND LOWER(username)=LOWER(?) AND verdict='Accepted' LIMIT 1", (pid, me)).fetchone()
    tests = conn.execute("SELECT * FROM test_cases WHERE problem_id=? ORDER BY is_sample DESC, id ASC", (pid,)).fetchall()
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

    quality_pct, q_break = calc_quality_score(passed, total, mtime, p["time_limit"], code)
    xp_gain, coin_gain, daily_bonus_msg = 0, 0, ""

    if verdict == "Accepted":
        if not already and p["author"] != me:
            xp_gain = 15 if p["rating"] < 1000 else (25 if p["rating"] < 1500 else 45)
            coin_gain = 10 if p["rating"] < 1000 else (20 if p["rating"] < 1500 else 35)
            award_rewards(conn, me, xp_gain, coin_gain)
            cur_r = conn.execute("SELECT rating FROM users WHERE LOWER(username)=LOWER(?)", (me,)).fetchone()["rating"]
            new_r = min(3500, cur_r + (12 if p["rating"] >= cur_r else 5))
            conn.execute("UPDATE users SET rating=? WHERE LOWER(username)=LOWER(?)", (new_r, me))
            conn.execute("INSERT INTO rating_history (username, rating, label) VALUES (?, ?, ?)", (me, new_r, p["code_label"] or p["title"][:12]))

        daily_pid = get_or_create_daily_pid(conn)
        today = time.strftime("%Y-%m-%d")
        if daily_pid == pid and not conn.execute("SELECT 1 FROM daily_solves WHERE day_date=? AND LOWER(username)=LOWER(?)", (today, me)).fetchone():
            conn.execute("INSERT INTO daily_solves (day_date, username, quality_pct) VALUES (?, ?, ?)", (today, me, quality_pct))
            new_streak = update_daily_streak(conn, me)
            d_xp, d_coins = 50, 40
            if new_streak > 0 and new_streak % 7 == 0:
                d_coins += 200
                daily_bonus_msg = f"🔥 {new_streak} günlük seriya sandığı! +50 XP, +240 AzCoin!"
            else:
                daily_bonus_msg = f"🔥 Günün Məsələsi tamamlandı! Seriya: {new_streak} gün (+50 XP, +40 AzCoin)"
            award_rewards(conn, me, d_xp, d_coins)
            xp_gain += d_xp
            coin_gain += d_coins

    conn.execute("INSERT INTO submissions (problem_id,problem_title,username,language,code,verdict,passed_tests,total_tests,quality_pct,exec_time,details,room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                 (pid, f"{p['code_label']}. {p['title']}", me, lang, code, verdict, passed, total, quality_pct, mtime, details, room_id if room_id > 0 else None))
    conn.commit()
    conn.close()
    return jsonify({"verdict": verdict, "passed": passed, "total": total, "quality_pct": quality_pct, "quality_breakdown": q_break, "time": mtime, "details": details, "xp_gained": xp_gain, "coins_gained": coin_gain, "daily_msg": daily_bonus_msg})


@app.route("/api/submissions", methods=["GET"])
def get_submissions():
    u = (request.args.get("username") or "").strip()
    conn = get_db()
    rows = conn.execute("SELECT id, problem_id, problem_title, username, language, verdict, passed_tests, total_tests, quality_pct, exec_time, details, created_at FROM submissions" + (" WHERE LOWER(username)=LOWER(?)" if u else "") + " ORDER BY id DESC LIMIT 50", (u,) if u else ()).fetchall()
    conn.close()
    return jsonify([r | {"is_admin_user": r["username"] == ADMIN_USERNAME} for r in rows])


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    conn = get_db()
    users = conn.execute("SELECT username, level, xp, total_xp, coins, rating, daily_streak, avatar_url, avatar_color, avatar_frame FROM users ORDER BY level DESC, total_xp DESC LIMIT 50").fetchall()
    solved = {r["username"].lower(): r["cnt"] for r in conn.execute("SELECT LOWER(username) AS username, COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE verdict='Accepted' GROUP BY LOWER(username)").fetchall()}
    conn.close()
    return jsonify([u | {"solved_count": solved.get(u["username"].lower(), 0), "needed_xp": needed_xp(u["level"]), "is_admin_user": u["username"] == ADMIN_USERNAME} for u in users])


@app.route("/api/rooms/mine", methods=["GET"])
@require_user
def my_rooms():
    conn = get_db()
    rows = conn.execute("SELECT r.*, (SELECT COUNT(*) FROM room_members WHERE room_id=r.id) AS member_count FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE LOWER(rm.username)=LOWER(?) ORDER BY r.id DESC", (request._u,)).fetchall()
    conn.close()
    return jsonify(rows)


@app.route("/api/rooms", methods=["POST"])
@require_user
@rate_limit(5, 60, by_user=True)
def create_room():
    me, d = request._u, request.get_json(silent=True) or {}
    title, bio = str(d.get("title") or "").strip()[:70], str(d.get("bio") or "Dostlarla söhbət və kodlaşdırma qrupu").strip()[:220]
    color = str(d.get("avatar_color") or "#0ea5e9").strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = "#0ea5e9"
    pids = [int(x) for x in (d.get("problem_ids") or []) if str(x).isdigit()][:10]
    if not title:
        return jsonify({"error": "Qrup adı yazın."}), 400
    dur, now = safe_int(d.get("duration_min"), 0, 0, 1440), time.time()
    ends = (now + dur * 60) if dur > 0 else (now + 86400 * 30)
    code16 = f"{secrets.randbelow(10**16):016d}"
    conn = get_db()
    rid = conn.execute("INSERT INTO rooms (room_code,title,bio,avatar_color,creator,voice_link,problem_ids_json,duration_min,max_members,starts_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (code16, title, bio, color, me, str(d.get("voice_link") or "").strip()[:240], json.dumps(pids), dur, MAX_ROOM_MEMBERS, now, ends)).lastrowid
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
    rm = conn.execute("SELECT * FROM rooms WHERE room_code=?", (code,)).fetchone()
    if not rm:
        conn.close()
        return jsonify({"error": "Qrup tapılmadı."}), 404
    if not conn.execute("SELECT 1 FROM room_members WHERE room_id=? AND LOWER(username)=LOWER(?)", (rm["id"], me)).fetchone():
        if conn.execute("SELECT COUNT(*) AS cnt FROM room_members WHERE room_id=?", (rm["id"],)).fetchone()["cnt"] >= rm["max_members"]:
            conn.close()
            return jsonify({"error": "Qrup doludur (maks. 20 nəfər)."}), 403
        conn.execute("INSERT INTO room_members (room_id, username) VALUES (?, ?)", (rm["id"], me))
        conn.commit()
    conn.close()
    return jsonify({"ok": True, "room_code": code})


@app.route("/api/rooms/<code>/profile", methods=["POST"])
@require_user
def update_room_profile(code):
    d = request.get_json(silent=True) or {}
    conn = get_db()
    rm = conn.execute("SELECT * FROM rooms WHERE room_code=?", (code,)).fetchone()
    if not rm or rm["creator"].lower() != request._u.lower():
        conn.close()
        return jsonify({"error": "Yalnız qrup yaradıcısı dəyişə bilər."}), 403
    title = str(d.get("title") or rm["title"]).strip()[:70] or rm["title"]
    bio = str(d.get("bio") if "bio" in d else rm["bio"]).strip()[:220]
    color = str(d.get("avatar_color") or rm["avatar_color"]).strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", color):
        color = rm["avatar_color"]
    av_url = str(d.get("avatar_url") if "avatar_url" in d else rm["avatar_url"]).strip()[:300]
    conn.execute("UPDATE rooms SET title=?, bio=?, avatar_color=?, avatar_url=? WHERE id=?", (title, bio, color, av_url, rm["id"]))
    conn.commit()
    conn.close()
    return jsonify({"message": "Qrup profili yeniləndi!"})


@app.route("/api/rooms/<code>/kick", methods=["POST"])
@require_user
def kick_room_member(code):
    target = str((request.get_json(silent=True) or {}).get("username") or "").strip()
    conn = get_db()
    rm = conn.execute("SELECT id, creator FROM rooms WHERE room_code=?", (code,)).fetchone()
    if not rm or rm["creator"].lower() != request._u.lower() or target.lower() == rm["creator"].lower():
        conn.close()
        return jsonify({"error": "İcazə yoxdur."}), 403
    conn.execute("DELETE FROM room_members WHERE room_id=? AND LOWER(username)=LOWER(?)", (rm["id"], target))
    conn.commit()
    conn.close()
    return jsonify({"message": f"{target} qrupdan çıxarıldı."})


@app.route("/api/rooms/<code>/leave", methods=["POST"])
@require_user
def leave_room(code):
    conn = get_db()
    rm = conn.execute("SELECT id FROM rooms WHERE room_code=?", (code,)).fetchone()
    if rm:
        conn.execute("DELETE FROM room_members WHERE room_id=? AND LOWER(username)=LOWER(?)", (rm["id"], request._u))
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/rooms/<code>/state", methods=["GET"])
@require_user
def room_state(code):
    me, after_id = request._u, safe_int(request.args.get("after_id"), 0, 0)
    conn = get_db()
    rm = conn.execute("SELECT * FROM rooms WHERE room_code=?", (code,)).fetchone()
    if not rm or not conn.execute("SELECT 1 FROM room_members WHERE room_id=? AND LOWER(username)=LOWER(?)", (rm["id"], me)).fetchone():
        conn.close()
        return jsonify({"error": "İcazə yoxdur."}), 403
    pids = json.loads(rm["problem_ids_json"] or "[]")
    probs = conn.execute(f"SELECT id, code_label, title, rating FROM problems WHERE id IN ({','.join('?'*len(pids))})", pids).fetchall() if pids else []
    members = [m | {"is_admin_user": m["username"] == ADMIN_USERNAME} for m in conn.execute("SELECT u.username, u.level, u.avatar_url, u.avatar_color, u.avatar_frame FROM room_members rm JOIN users u ON LOWER(u.username)=LOWER(rm.username) WHERE rm.room_id=?", (rm["id"],)).fetchall()]
    msgs = [m | {"is_admin_user": m["username"] == ADMIN_USERNAME} for m in conn.execute("""
        SELECT m.*, p.code_label AS shared_code, p.title AS shared_problem_title,
               r.username AS reply_author, r.message AS reply_text,
               u.avatar_url AS sender_avatar_url, u.avatar_color AS sender_avatar_color, u.avatar_frame AS sender_avatar_frame
        FROM room_messages m
        LEFT JOIN problems p ON p.id=m.shared_problem_id
        LEFT JOIN room_messages r ON r.id=m.reply_to_id
        LEFT JOIN users u ON LOWER(u.username)=LOWER(m.username)
        WHERE m.room_id=? AND m.id>? ORDER BY m.id ASC LIMIT 80
    """, (rm["id"], after_id)).fetchall()]
    shared_all = conn.execute("SELECT DISTINCT p.id, p.code_label, p.title, p.rating FROM room_messages m JOIN problems p ON p.id=m.shared_problem_id WHERE m.room_id=? LIMIT 20", (rm["id"],)).fetchall()
    ac = {x["username"].lower(): x["cnt"] for x in conn.execute("SELECT LOWER(username) AS username, COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE room_id=? AND verdict='Accepted' GROUP BY LOWER(username)", (rm["id"],)).fetchall()}
    conn.close()
    board = sorted([{"username": m["username"], "solved": ac.get(m["username"].lower(), 0), "is_admin_user": m["username"] == ADMIN_USERNAME} for m in members], key=lambda x: (-x["solved"], x["username"]))
    rem = max(0, int(rm["ends_at"] - time.time())) if rm["duration_min"] > 0 else -1
    return jsonify({"room": rm | {"remaining_sec": rem}, "problems": probs, "shared_problems": shared_all, "members": members, "standings": board, "messages": msgs})


@app.route("/api/rooms/<code>/chat", methods=["POST"])
@require_user
@rate_limit(30, 60, by_user=True)
def room_chat(code):
    me, d = request._u, request.get_json(silent=True) or {}
    msg, r_id, spid = str(d.get("message") or "").strip()[:500], safe_int(d.get("reply_to_id"), 0), safe_int(d.get("shared_problem_id"), 0)
    a_url, a_dur = str(d.get("audio_url") or "").strip()[:300], safe_int(d.get("audio_duration"), 0, 0, 180)
    if not msg and spid <= 0 and not a_url:
        return jsonify({"error": "Mesaj boşdur."}), 400
    conn = get_db()
    rm = conn.execute("SELECT id FROM rooms WHERE room_code=?", (code,)).fetchone()
    if not rm or not conn.execute("SELECT 1 FROM room_members WHERE room_id=? AND LOWER(username)=LOWER(?)", (rm["id"], me)).fetchone():
        conn.close()
        return jsonify({"error": "Üzv deyilsiniz."}), 403
    if not check_daily(conn, me, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Gündəlik mesaj limitiniz bitib."}), 429
    conn.execute("INSERT INTO room_messages (room_id, username, message, reply_to_id, shared_problem_id, audio_url, audio_duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (rm["id"], me, msg or ("🎤 Səsli mesaj" if a_url else "Məsələ yönləndirdi:"), r_id if r_id > 0 else None, spid if spid > 0 else None, a_url, a_dur))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/dm/chats", methods=["GET"])
@require_user
def dm_chats():
    me = request._u
    conn = get_db()
    rows = conn.execute("SELECT CASE WHEN LOWER(sender)=LOWER(?) THEN receiver ELSE sender END AS partner, message, created_at FROM direct_messages WHERE LOWER(sender)=LOWER(?) OR LOWER(receiver)=LOWER(?) ORDER BY id DESC", (me, me, me)).fetchall()
    seen, chats = set(), []
    for r in rows:
        if r["partner"].lower() not in seen:
            seen.add(r["partner"].lower())
            pu = conn.execute("SELECT avatar_url, avatar_color, avatar_frame, last_seen_at FROM users WHERE LOWER(username)=LOWER(?)", (r["partner"],)).fetchone()
            chats.append({
                "username": r["partner"], "last_message": r["message"][:50], "created_at": r["created_at"],
                "is_admin_user": r["partner"] == ADMIN_USERNAME,
                "avatar_url": pu["avatar_url"] if pu else "", "avatar_color": pu["avatar_color"] if pu else "#3b82f6",
                "avatar_frame": pu["avatar_frame"] if pu else "none",
            })
    conn.close()
    return jsonify(chats)


@app.route("/api/dm/<other>", methods=["GET", "POST"])
@require_user
def dm_thread(other):
    me = request._u
    conn = get_db()
    tu = conn.execute("SELECT username, avatar_url, avatar_color, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (other.lstrip("@"),)).fetchone()
    if not tu:
        conn.close()
        return jsonify({"error": "İstifadəçi tapılmadı."}), 404
    partner = tu["username"]
    if request.method == "GET":
        after_id = safe_int(request.args.get("after_id"), 0, 0)
        msgs = [m | {"is_admin_user": m["sender"] == ADMIN_USERNAME} for m in conn.execute("""
            SELECT d.*, p.code_label AS shared_code, p.title AS shared_problem_title, r.sender AS reply_author, r.message AS reply_text
            FROM direct_messages d
            LEFT JOIN problems p ON p.id=d.shared_problem_id
            LEFT JOIN direct_messages r ON r.id=d.reply_to_id
            WHERE ((LOWER(d.sender)=LOWER(?) AND LOWER(d.receiver)=LOWER(?)) OR (LOWER(d.sender)=LOWER(?) AND LOWER(d.receiver)=LOWER(?))) AND d.id>?
            ORDER BY d.id ASC LIMIT 100
        """, (me, partner, partner, me, after_id)).fetchall()]
        conn.close()
        return jsonify({"partner": partner, "partner_is_admin": partner == ADMIN_USERNAME, "partner_avatar": tu, "messages": msgs})

    d = request.get_json(silent=True) or {}
    msg, r_id, spid = str(d.get("message") or "").strip()[:600], safe_int(d.get("reply_to_id"), 0), safe_int(d.get("shared_problem_id"), 0)
    a_url, a_dur = str(d.get("audio_url") or "").strip()[:300], safe_int(d.get("audio_duration"), 0, 0, 180)
    if not msg and spid <= 0 and not a_url:
        conn.close()
        return jsonify({"error": "Mesaj boşdur."}), 400
    if not check_daily(conn, me, "msg", MAX_DAILY_MSGS):
        conn.close()
        return jsonify({"error": "Gündəlik mesaj limitiniz bitib."}), 429
    conn.execute("INSERT INTO direct_messages (sender, receiver, message, reply_to_id, shared_problem_id, audio_url, audio_duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (me, partner, msg or ("🎤 Səsli mesaj" if a_url else "Məsələ göndərdi:"), r_id if r_id > 0 else None, spid if spid > 0 else None, a_url, a_dur))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/games/sprint/start", methods=["POST"])
@require_user
def sprint_start():
    tok = secrets.token_urlsafe(16)
    with _game_lock:
        _sprint_tokens[tok] = (request._u, time.time())
    return jsonify({"token": tok})


@app.route("/api/games/sprint/finish", methods=["POST"])
@require_user
def sprint_finish():
    d = request.get_json(silent=True) or {}
    tok, score = str(d.get("token") or ""), safe_int(d.get("score"), 0, 0, 40)
    with _game_lock:
        info = _sprint_tokens.pop(tok, None)
    if not info or info[0] != request._u or (time.time() - info[1]) < 5:
        return jsonify({"error": "Oyun sessiyası etibarsızdır."}), 400
    conn = get_db()
    if not check_daily(conn, request._u, "game", 5):
        conn.close()
        return jsonify({"xp_gained": 0, "coins_gained": 0, "message": f"Xal: {score} (Gündəlik mükafat limiti dolub)."})
    xp, coins = min(30, score * 2), min(25, score * 2)
    award_rewards(conn, request._u, xp, coins)
    conn.commit()
    conn.close()
    return jsonify({"xp_gained": xp, "coins_gained": coins, "message": f"Əla! {score} doğru cavab: +{xp} XP, +{coins} AzCoin!"})


@app.route("/api/games/bulls/start", methods=["POST"])
@require_user
def bulls_start():
    digits = list("0123456789")
    secrets.SystemRandom().shuffle(digits)
    if digits[0] == "0":
        digits[0], digits[1] = digits[1], digits[0]
    gid = secrets.token_urlsafe(12)
    with _game_lock:
        _bulls_games[gid] = {"user": request._u, "secret": "".join(digits[:4]), "tries": 0}
    return jsonify({"game_id": gid})


@app.route("/api/games/bulls/guess", methods=["POST"])
@require_user
def bulls_guess():
    d = request.get_json(silent=True) or {}
    gid, g = str(d.get("game_id") or ""), str(d.get("guess") or "").strip()
    if len(g) != 4 or not g.isdigit() or len(set(g)) != 4:
        return jsonify({"error": "4 fərqli rəqəm yazın (məs: 1234)."}), 400
    with _game_lock:
        gm = _bulls_games.get(gid)
        if not gm or gm["user"] != request._u:
            return jsonify({"error": "Oyun tapılmadı."}), 404
        gm["tries"] += 1
        sec, tries = gm["secret"], gm["tries"]
        bulls = sum(a == b for a, b in zip(g, sec))
        cows = sum(ch in sec for ch in g) - bulls
        won = bulls == 4
        if won or tries >= 10:
            _bulls_games.pop(gid, None)
    xp, coins = 0, 0
    if won:
        conn = get_db()
        if check_daily(conn, request._u, "game", 5):
            xp, coins = max(10, 40 - tries * 3), max(10, 35 - tries * 3)
            award_rewards(conn, request._u, xp, coins)
            conn.commit()
        conn.close()
    return jsonify({"bulls": bulls, "cows": cows, "tries": tries, "won": won, "lost": (not won and tries >= 10), "answer": sec if (won or tries >= 10) else None, "xp_gained": xp, "coins_gained": coins})


@app.route("/api/posts", methods=["GET", "POST"])
def posts_handler():
    u, adm, _, _ = get_session()
    conn = get_db()
    if request.method == "GET":
        posts = [p | {"is_admin_user": p["author"] == ADMIN_USERNAME} for p in conn.execute("SELECT * FROM posts ORDER BY is_pinned DESC, id DESC LIMIT 35").fetchall()]
        for p in posts:
            pid, opts = p["id"], json.loads(p["poll_options_json"] or "[]")
            vmap = {r["option_index"]: r["cnt"] for r in conn.execute("SELECT option_index, COUNT(*) AS cnt FROM poll_votes WHERE post_id=? GROUP BY option_index", (pid,)).fetchall()}
            mv = conn.execute("SELECT option_index FROM poll_votes WHERE post_id=? AND LOWER(username)=LOWER(?)", (pid, u)).fetchone() if u else None
            p["poll_options"] = [{"text": t, "votes": vmap.get(i, 0)} for i, t in enumerate(opts)]
            p["my_vote"] = mv["option_index"] if mv else None
            p["total_votes"] = sum(vmap.values())
            rmap = {r["emoji"]: r["cnt"] for r in conn.execute("SELECT emoji, COUNT(*) AS cnt FROM post_reactions WHERE post_id=? GROUP BY emoji", (pid,)).fetchall()}
            mr = {r["emoji"] for r in conn.execute("SELECT emoji FROM post_reactions WHERE post_id=? AND LOWER(username)=LOWER(?)", (pid, u)).fetchall()} if u else set()
            p["reactions"] = [{"emoji": e, "count": rmap.get(e, 0), "mine": e in mr} for e in ALLOWED_EMOJIS]
            p["comments"] = [c | {"is_admin_user": c["author"] == ADMIN_USERNAME} for c in conn.execute("SELECT * FROM post_comments WHERE post_id=? ORDER BY id ASC", (pid,)).fetchall()]
        conn.close()
        return jsonify(posts)

    if not adm:
        conn.close()
        return jsonify({"error": "Duyuru və etkinlikləri yalnız Admin paylaşa bilər."}), 403
    d = request.get_json(silent=True) or {}
    t, b = str(d.get("title") or "").strip()[:140], str(d.get("body") or "").strip()[:2000]
    opts = [str(o).strip()[:80] for o in (d.get("poll_options") or []) if str(o).strip()][:6]
    if not t or not b:
        conn.close()
        return jsonify({"error": "Başlıq və məzmun yazın."}), 400
    conn.execute("INSERT INTO posts (author, title, body, post_type, is_pinned, poll_options_json) VALUES (?, ?, ?, ?, ?, ?)",
                 (ADMIN_USERNAME, t, b, "poll" if opts else "announcement", 1 if d.get("is_pinned", True) else 0, json.dumps(opts)))
    conn.commit()
    conn.close()
    return jsonify({"message": "Duyuru paylaşıldı!"})


@app.route("/api/posts/<int:pid>/vote", methods=["POST"])
@require_user
def vote_poll(pid):
    idx = (request.get_json(silent=True) or {}).get("option_index")
    conn = get_db()
    p = conn.execute("SELECT poll_options_json FROM posts WHERE id=?", (pid,)).fetchone()
    if not p or not isinstance(idx, int) or not (0 <= idx < len(json.loads(p["poll_options_json"] or "[]"))):
        conn.close()
        return jsonify({"error": "Yanlış variant."}), 400
    conn.execute("INSERT INTO poll_votes (post_id, username, option_index) VALUES (?, ?, ?) ON CONFLICT (post_id, username) DO UPDATE SET option_index = excluded.option_index", (pid, request._u, idx))
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
    ex = conn.execute("SELECT id FROM post_reactions WHERE post_id=? AND LOWER(username)=LOWER(?) AND emoji=?", (pid, request._u, em)).fetchone()
    conn.execute("DELETE FROM post_reactions WHERE id=?" if ex else "INSERT INTO post_reactions (post_id, username, emoji) VALUES (?, ?, ?)", (ex["id"],) if ex else (pid, request._u, em))
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
    conn.execute("DELETE FROM posts WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/creative", methods=["GET", "POST"])
def creative_handler():
    conn = get_db()
    if request.method == "GET":
        rows = [r | {"is_admin_user": r["author"] == ADMIN_USERNAME} for r in conn.execute("SELECT * FROM creative_codes ORDER BY id DESC").fetchall()]
        conn.close()
        return jsonify(rows)
    u, _, _, _ = get_session()
    if not u:
        conn.close()
        return jsonify({"error": "Daxil olun."}), 401
    d = request.get_json(silent=True) or {}
    t, code, lang = str(d.get("title") or "").strip(), str(d.get("code") or ""), str(d.get("language", "python"))
    if not t or not code.strip() or lang not in ALLOWED_LANGS:
        conn.close()
        return jsonify({"error": "Məlumatlar natamamdır."}), 400
    conn.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES (?, ?, ?, ?, ?, ?)", (t[:100], str(d.get("description", ""))[:400], lang, code, str(d.get("sample_input", ""))[:1000], u))
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
        conn.execute("INSERT INTO settings (key, value) VALUES ('provider', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", (d["provider"],))
    if "base_url" in d:
        conn.execute("INSERT INTO settings (key, value) VALUES ('base_url', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", (str(d["base_url"]).strip(),))
    if str(d.get("api_key") or "").strip():
        conn.execute("INSERT INTO settings (key, value) VALUES ('api_key', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", (str(d["api_key"]).strip(),))
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
            
