import base64
import datetime
from fractions import Fraction
import hashlib
import json
import os
import random
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
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # 4 MB (şəkil / səs / çərçivə üçün)

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

# ── Azərbaycan saat qurşağı (UTC+4) ──
AZ_TZ = datetime.timezone(datetime.timedelta(hours=4))

# ── Azərbaycan Universitetləri & Təhsil Kateqoriyaları ──
UNIVERSITIES = [
    {"code": "BDU", "name": "Bakı Dövlət Universiteti"},
    {"code": "ADA", "name": "ADA Universiteti"},
    {"code": "BANM", "name": "Bakı Ali Neft Məktəbi"},
    {"code": "ADNSU", "name": "Azərbaycan Dövlət Neft və Sənaye Universiteti"},
    {"code": "BMU", "name": "Bakı Mühəndislik Universiteti"},
    {"code": "AzTU", "name": "Azərbaycan Texniki Universiteti"},
    {"code": "UNEC", "name": "Azərbaycan Dövlət İqtisad Universiteti"},
    {"code": "XEZER", "name": "Xəzər Universiteti"},
    {"code": "ADU", "name": "Azərbaycan Dillər Universiteti"},
    {"code": "AZMIU", "name": "Azərbaycan Memarlıq və İnşaat Universiteti"},
    {"code": "QARB", "name": "Qərbi Kaspi Universiteti"},
    {"code": "SDU", "name": "Sumqayıt Dövlət Universiteti"},
    {"code": "NDU", "name": "Naxçıvan Dövlət Universiteti"},
    {"code": "GDU", "name": "Gəncə Dövlət Universiteti"},
    {"code": "MEKTEBLI", "name": "Məktəbli / Abituriyent"},
    {"code": "MUSTEQIL", "name": "Müstəqil / Məzun"},
]
UNI_MAP = {u["code"]: u["name"] for u in UNIVERSITIES}

# ── Admin və gizli panel (Render mühit dəyişənlərindən oxunur) ──
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "Mr.Leonard").strip() or "Mr.Leonard"
ADMIN_SECRET_PATH = os.environ.get("ADMIN_SECRET_PATH", "azf-panel-9482").strip("/")
ADMIN_INFINITE_COINS = 999999999

_ENV_ADMIN_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
if not _ENV_ADMIN_HASH and os.environ.get("ADMIN_PASSWORD", "").strip():
    _ENV_ADMIN_HASH = generate_password_hash(os.environ["ADMIN_PASSWORD"].strip())

# ── E-poçt (Brevo / SMTP) ──
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
DEV_EMAIL_PREVIEW = os.environ.get("DEV_EMAIL_PREVIEW", "false").lower() == "true"
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "").strip() or SMTP_USER or ADMIN_EMAIL

# ── Cloudinary & Xarici Səs Saxlama ──
CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUD_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUD_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
VOICE_UPLOAD_WEBHOOK = os.environ.get("VOICE_UPLOAD_WEBHOOK", "").strip()

SESSION_TTL = 86400 * 7
ADMIN_TTL = SESSION_TTL
GUEST_TTL = 300
MAX_ROOM_MEMBERS = 20
MAX_SERVER_MEMBERS = 500
MAX_DAILY_MSGS = 80
MAX_DAILY_SUBS = 40
MAX_DAILY_PROPS = 2
CALC_TIME_LIMIT = 300  # 5 dəqiqə = 300 saniyə
UNI_CHANGE_COOLDOWN = 86400 * 30  # 30 gün

# ── MAĞAZA: Hərəkətli SVG Fantastik/Təbiət/Əfsanəvi Çərçivələr (12.000 – 50.000 AzCoin) ──
SHOP_ITEMS = [
    {"id": "none", "name": "Çərçivəsiz", "tier": "classic", "price": 0, "desc": "Sadə görünüş"},
    {"id": "angry-anime", "name": "💢 Sinirli", "tier": "classic", "price": 15000, "desc": "Qırmızı zərbə halqası, anime əsəb işarəsi və ! balonu"},
    {"id": "butterfly-dream", "name": "🦋 Kəpənək Yuxusu", "tier": "nature", "price": 15000, "desc": "Qırmızı glitch halqa və qanad çırpan qara-qırmızı kəpənək"},
    {"id": "afternoon-bloom", "name": "🌸 Bahar Çiçəkləri", "tier": "nature", "price": 15000, "desc": "Yellənən yaşıl çəmən və rəngli çiçək tacı"},
    {"id": "oni-glitch", "name": "👾 O.N.I Holoqram", "tier": "fantasy", "price": 16000, "desc": "Kiber holoqram, glitch skan xətləri və işıqlı əl"},
    {"id": "siyah-mana", "name": "💀 Siyah Mana", "tier": "fantasy", "price": 18000, "desc": "Dəmir tikanlı halqa, skelet əlləri və parlayan kəllə kürəsi"},
    {"id": "zaman-carki", "name": "⚙️ Zaman Çarxı", "tier": "fantasy", "price": 18000, "desc": "Dönən steampunk dişlilər, klaviatura və yaşıl zaman portalı"},
    {"id": "bonsai-sakura", "name": "🌺 Bonsai Sakura", "tier": "nature", "price": 20000, "desc": "Bükülmüş bonsai gövdəsi, çəhrayı sakura və tökülən ləçəklər"},
    {"id": "pirate-king", "name": "🏴‍☠️ Korsan Kralı", "tier": "classic", "price": 22000, "desc": "Kapitan şapkası, çarpaz qılınclar və dənizçi tacı"},
    {"id": "elit-yilan", "name": "🐍 Elit Qızıl İlan", "tier": "fantasy", "price": 24000, "desc": "Qızıl dəfnə yarpaqları və qıvrılmış qızıl əjdaha ilanı"},
    {"id": "purple-runes", "name": "🔮 Sehrbaz Rünləri", "tier": "fantasy", "price": 24000, "desc": "Dönən neon bənövşəyi halqa və parlayan qədim rünlər"},
    {"id": "golden-leo", "name": "🌻 Günəş Aslanı", "tier": "nature", "price": 25000, "desc": "Qızıl günəş şüaları, günəbaxanlar və parlayan Aslan simvolu"},
    {"id": "golden-aura", "name": "✨ Altın Sarısı Parlama", "tier": "classic", "price": 28000, "desc": "İsti qızıl aura halqası və parlayan ulduz işartısı"},
    {"id": "black-hole", "name": "🕳️ Qara Dəlik", "tier": "fantasy", "price": 28000, "desc": "Fırlanan gümüşü akkresiya diski və kosmik burulğan"},
    {"id": "venom-symbiote", "name": "🕷️ Venom Simbiot", "tier": "fantasy", "price": 28000, "desc": "Canlı qara maye simbiot və qıvrılan ağ işıqlı çıxıntılar"},
    {"id": "flaming-bull", "name": "🔥 Alovlu Buğa", "tier": "fantasy", "price": 30000, "desc": "Qoç nişanı, alovlu buynuzlar və od halqası"},
    {"id": "cyclone-wind", "name": "🌪️ Qasırğa", "tier": "nature", "price": 36000, "desc": "Sürətlə dönən buz-mavi külək burulğanı və axın zolaqları"},
    {"id": "thunder-god", "name": "⚡ Yıldırım Tanrısı", "tier": "fantasy", "price": 38000, "desc": "Çaxan qızıl ildırım qövsləri və elektrik ruhu"},
    {"id": "cute-angel", "name": "😇 Şirin Mələk", "tier": "fantasy", "price": 45000, "desc": "Qızıl halo, kiçik çırpınan qanadlar və qanadlı ürək"},
    {"id": "tatli-ejderha", "name": "🐉 Şirin Əjdaha", "tier": "legendary", "price": 45000, "desc": "Avatarı ağzında tutan bənövşəyi əjdaha və daxili ildırım"},
    {"id": "venom-legend", "name": "😈 Venom Canavarı", "tier": "legendary", "price": 50000, "desc": "Kəskin dişli nəhəng Venom çənəsi və qəzəbli ağ gözlər"},
    {"id": "phoenix-wings", "name": "🔥 Feniks Qanadları", "tier": "legendary", "price": 50000, "desc": "Alovlu yüksələn simurq qanadları və qızılı lələk quyruğu"},
    {"id": "dark-angel", "name": "🖤 Qara Qanadlı Mələk", "tier": "legendary", "price": 50000, "desc": "Ağ işıqlı uclu nəhəng qara mələk qanadları və tökülən lələklər"},
    {"id": "fallen-angel", "name": "🪽 Yitik Mələk", "tier": "legendary", "price": 50000, "desc": "Ən prestijli — nəhəng inci-ağ mələk qanadları və tökülən lələklər"},
]

# ── 5 DƏQİQƏLİK ÇƏTİN RİYAZİ OYUN BANKI (Törəmə, İnteqral, Limit) ──
CALCULUS_BANK = [
    {
        "id": "d1", "category": "Törəmə",
        "title": "3-cü Tərtib Törəmə (Leybnis)",
        "prompt": "$$f(x) = x^2 e^{3x} \\cos(2x)$$ funksiyası üçün $$f'''(0)$$ qiymətini tapın.",
        "answer": "18",
        "solution": "$g(x)=e^{3x}\\cos(2x)$ götürək. Leybnis düsturu ilə $(x^2 g(x))'''|_{x=0} = 3 \\cdot 2 \\cdot g'(0) = 6 g'(0)$. $g'(0)=3$, odur ki $f'''(0) = 18$."
    },
    {
        "id": "d2", "category": "Törəmə",
        "title": "4-cü Tərtib Törəmə (Makloren)",
        "prompt": "$$f(x) = \\frac{x \\sin(2x)}{1 - x}$$ funksiyası üçün $$f^{(4)}(0)$$ qiymətini tapın.",
        "answer": "16",
        "solution": "$x\\sin(2x) = 2x^2 - \\frac{4}{3}x^4 + \\dots$ və $(1-x)^{-1} = 1 + x + x^2 + \\dots$. Hasilin $x^4$ əmsalı $2 - \\frac{4}{3} = \\frac{2}{3}$. Beləliklə, $f^{(4)}(0) = 4! \\cdot \\frac{2}{3} = 16$."
    },
    {
        "id": "d3", "category": "Törəmə",
        "title": "Qeyri-aşkar Funksiyanın 2-ci Törəməsi",
        "prompt": "$$x^3 + y^3 - 3xy = 3$$ əyrisinin $$(2, 1)$$ nöqtəsində $$\\frac{d^2y}{dx^2}$$ qiymətini tapın.",
        "answer": "16",
        "solution": "1-ci törəmə: $x^2 + y^2 y' - y - xy' = 0 \\Rightarrow y'(2,1)=3$. Yenidən diferensiallayıb $(2,1)$ və $y'=3$ yazsaq: $4 + 18 + y'' - 6 - 2y'' = 0 \\Rightarrow y'' = 16$."
    },
    {
        "id": "d4", "category": "Törəmə",
        "title": "Tərs Funksiyanın 2-ci Törəməsi",
        "prompt": "$$f(x) = x^3 + 2e^{x-1} + x$$ funksiyasının tərsi $$g(x) = f^{-1}(x)$$ olarsa, $$g''(4)$$ qiymətini tapın.",
        "answer": "-1/27",
        "solution": "$f(1)=4$, $f'(1)=3+2+1=6$, $f''(1)=6+2=8$. $g''(f(x)) = -\\frac{f''(x)}{(f'(x))^3} \\Rightarrow g''(4) = -\\frac{8}{6^3} = -\\frac{1}{27}$."
    },
    {
        "id": "d5", "category": "Törəmə",
        "title": "Parametrik Funksiyanın 2-ci Törəməsi",
        "prompt": "$$x(t) = t^2 + \\ln t,\\; y(t) = t^3 + 3t$$ parametrik əyrisi üçün $$t = 1$$ nöqtəsində $$\\frac{d^2y}{dx^2}$$ qiymətini tapın.",
        "answer": "4/9",
        "solution": "$x'(1)=3, x''(1)=1, y'(1)=6, y''(1)=6$. Düstura görə $\\frac{y''x' - y'x''}{(x')^3} = \\frac{18 - 6}{27} = \\frac{4}{9}$."
    },
    {
        "id": "d6", "category": "Törəmə",
        "title": "Üstlü-Qüvvət Funksiyasının 2-ci Törəməsi",
        "prompt": "$$f(x) = (x^2 - x + 1)^{x^3 + 3x - 1}$$ funksiyası üçün $$f''(1)$$ qiymətini tapın.",
        "answer": "24",
        "solution": "$L(x)=\\ln f(x) = (x^3+3x-1)\\ln(x^2-x+1)$. $L(1)=0 \\Rightarrow f(1)=1$. $L'(1)=3 \\Rightarrow f'(1)=3$. $L''(1)=15 \\Rightarrow f''(1)=f'(1)L'(1)+f(1)L''(1)=9+15=24$."
    },
    {
        "id": "d7", "category": "Törəmə",
        "title": "Dəyişən Sərhədli İnteqralın 2-ci Törəməsi",
        "prompt": "$$F(x) = \\int_{x^2}^{2x} \\frac{2t + 1}{t^2 + 1}\\,dt$$ funksiyası üçün $$F''(1)$$ qiymətini tapın.",
        "answer": "-13/5",
        "solution": "$g(t)=\\frac{2t+1}{t^2+1}$. $F'(x)=2g(2x)-2xg(x^2)$, $F''(x)=4g'(2x)-2g(x^2)-4x^2g'(x^2)$. $g(1)=\\frac{3}{2}, g'(1)=-\\frac{1}{2}, g'(2)=-\\frac{2}{5}$ olduğundan $F''(1)=4(-\\frac{2}{5})-3+2=-\\frac{13}{5}$."
    },
    {
        "id": "d8", "category": "Törəmə",
        "title": "Tərs Triqonometrik Törəmə (Bölgə Analizi)",
        "prompt": "$$f(x) = \\arcsin\\!\\left(\\frac{2x}{1 + x^2}\\right)$$ funksiyası üçün $$f'(2)$$ qiymətini tapın.",
        "answer": "-2/5",
        "solution": "$x > 1$ üçün $\\arcsin(\\frac{2x}{1+x^2}) = \\pi - 2\\arctan x$. Odur ki, $f'(x) = -\\frac{2}{1+x^2}$ və $f'(2) = -\\frac{2}{5}$."
    },
    {
        "id": "i1", "category": "İnteqral",
        "title": "Simmetriya Üsulu ilə İnteqral",
        "prompt": "$$\\int_{-3}^{3} \\frac{5x^4 + 3x^2}{1 + e^{x^3}}\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "270",
        "solution": "$x \\to -x$ əvəzləməsi edib verilən inteqralla toplasaq: $2I = \\int_{-3}^3 (5x^4+3x^2)\\,dx = 2[x^5+x^3]_0^3 = 2(243+27) \\Rightarrow I = 270$."
    },
    {
        "id": "i2", "category": "İnteqral",
        "title": "Eksponensial Hissə-Hissə İnteqrallama",
        "prompt": "$$\\int_{0}^{1} (x^5 - x^3 - x) e^{x^2}\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "-1",
        "solution": "$u = x^2$ əvəzləməsi ilə $I = \\frac{1}{2}\\int_0^1 (u^2 - u - 1)e^u\\,du = \\frac{1}{2}[(u^2 - 3u + 2)e^u]_0^1 = \\frac{1}{2}(0 - 2) = -1$."
    },
    {
        "id": "i3", "category": "İnteqral",
        "title": "Tərs Funksiyanın Müəyyən İnteqralı",
        "prompt": "$$f(x) = x^5 + 2x^3 + 3x$$ funksiyasının tərsi $$f^{-1}(x)$$ olarsa, $$\\int_{6}^{54} f^{-1}(x)\\,dx$$ inteqralını hesablayın.",
        "answer": "159/2",
        "solution": "$f(1)=6, f(2)=54$. $\\int_6^{54} f^{-1}(x)dx = 2\\cdot 54 - 1\\cdot 6 - \\int_1^2 (x^5+2x^3+3x)dx = 102 - \\frac{45}{2} = \\frac{159}{2}$."
    },
    {
        "id": "i4", "category": "İnteqral",
        "title": "İrrasional İnteqral",
        "prompt": "$$\\int_{0}^{4/5} \\frac{x^3}{(1 - x^2)^{3/2}}\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "4/15",
        "solution": "$u = \\sqrt{1-x^2}$ əvəzləməsi ilə $I = \\int_{3/5}^1 (u^{-2}-1)\\,du = [-u^{-1}-u]_{3/5}^1 = -2 + \\frac{34}{15} = \\frac{4}{15}$."
    },
    {
        "id": "i5", "category": "İnteqral",
        "title": "Yüksək Dərəcəli Rasional Kəsr İnteqralı",
        "prompt": "$$\\int_{0}^{\\sqrt{3}} \\frac{x^3}{(x^2 + 1)^4}\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "9/128",
        "solution": "$u = x^2+1$ ilə $I = \\frac{1}{2}\\int_1^4 (u^{-3}-u^{-4})\\,du = \\frac{1}{2}[-\\frac{1}{2u^2}+\\frac{1}{3u^3}]_1^4 = \\frac{9}{128}$."
    },
    {
        "id": "i6", "category": "İnteqral",
        "title": "Triqonometrik Əvəzləmə",
        "prompt": "$$\\int_{0}^{\\pi/2} \\frac{\\sin^3 x \\cos x}{(1 + \\cos^2 x)^3}\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "1/8",
        "solution": "$u = 1+\\cos^2 x$ götürsək $\\sin^2 x = 2-u$ və $du = -2\\sin x\\cos x\\,dx$. $I = \\frac{1}{2}\\int_1^2 (2u^{-3}-u^{-2})\\,du = \\frac{1}{8}$."
    },
    {
        "id": "i7", "category": "İnteqral",
        "title": "Qeyri-Məxsusi Eksponensial-Triqonometrik İnteqral",
        "prompt": "$$\\int_{0}^{\\infty} x e^{-3x} \\cos(2x)\\,dx$$ qeyri-məxsusi inteqralını hesablayın.",
        "answer": "5/169",
        "solution": "$\\text{Re}\\int_0^\\infty x e^{-(3-2i)x}dx = \\text{Re}\\frac{1}{(3-2i)^2} = \\frac{3^2 - 2^2}{(3^2+2^2)^2} = \\frac{5}{169}$."
    },
    {
        "id": "i8", "category": "İnteqral",
        "title": "Eyler Beta Funksiyası İnteqralı",
        "prompt": "$$\\int_{0}^{2} x^3 (2 - x)^4\\,dx$$ müəyyən inteqralını hesablayın.",
        "answer": "32/35",
        "solution": "$x = 2t$ əvəzləməsi ilə $2^8 \\int_0^1 t^3(1-t)^4 dt = 256 \\cdot B(4,5) = 256 \\cdot \\frac{3!4!}{8!} = \\frac{32}{35}$."
    },
    {
        "id": "l1", "category": "Limit",
        "title": "5-ci Tərtib Teylor Açılışı Limiti",
        "prompt": "$$\\lim_{x \\to 0} \\frac{x \\cos x - \\sin x + \\frac{x^3}{3}}{x^5}$$ limitini hesablayın.",
        "answer": "1/30",
        "solution": "$x\\cos x = x - \\frac{x^3}{2} + \\frac{x^5}{24} - \\dots$ və $\\sin x = x - \\frac{x^3}{6} + \\frac{x^5}{120} - \\dots$. Surət $\\left(\\frac{1}{24}-\\frac{1}{120}\\right)x^5 = \\frac{x^5}{30}$, limit $\\frac{1}{30}$."
    },
    {
        "id": "l2", "category": "Limit",
        "title": "2-ci Tərtib 1^∞ Qeyri-Müəyyənliyi",
        "prompt": "$$\\lim_{x \\to 0} \\frac{e^{-1}(1 + \\tan x)^{1/x} - 1 + \\frac{x}{2}}{x^2}$$ limitini hesablayın.",
        "answer": "19/24",
        "solution": "$\\frac{\\ln(1+\\tan x)}{x} = 1 - \\frac{x}{2} + \\frac{2}{3}x^2 + O(x^3)$. $\\exp(-\\frac{x}{2}+\\frac{2}{3}x^2) = 1 - \\frac{x}{2} + (\\frac{2}{3}+\\frac{1}{8})x^2 + \\dots$, odur ki limit $\\frac{19}{24}$."
    },
    {
        "id": "l3", "category": "Limit",
        "title": "Sonsuzluqda Yüksək Tərtibli Köklər Fərqi",
        "prompt": "$$\\lim_{x \\to \\infty} x^2 \\left( \\sqrt{x^4 + 2x^2 + 3} - \\sqrt[3]{x^6 + 3x^4 + 5x^2} \\right)$$ limitini hesablayın.",
        "answer": "1/3",
        "solution": "$t=1/x$ əvəz etsək: $(1+2t^2+3t^4)^{1/2} = 1 + t^2 + t^4 + \\dots$ və $(1+3t^2+5t^4)^{1/3} = 1 + t^2 + \\frac{2}{3}t^4 + \\dots$. Fərq $\\frac{1}{3}x^2t^4 = \\frac{1}{3x^2}$, $x^2$ ilə vurduqda $\\frac{1}{3}$."
    },
    {
        "id": "l4", "category": "Limit",
        "title": "Riman İnteqral Cəmi Limiti",
        "prompt": "$$\\lim_{n \\to \\infty} \\sum_{k=1}^{n} \\frac{k^3}{n^3 \\sqrt{n^2 + 3k^2}}$$ limitini hesablayın.",
        "answer": "4/27",
        "solution": "$\\lim \\frac{1}{n}\\sum \\frac{(k/n)^3}{\\sqrt{1+3(k/n)^2}} = \\int_0^1 \\frac{x^3}{\\sqrt{1+3x^2}}dx$. $u=\\sqrt{1+3x^2}$ ilə $\\frac{1}{9}\\int_1^2 (u^2-1)du = \\frac{4}{27}$."
    },
    {
        "id": "l5", "category": "Limit",
        "title": "Teleskopik Sonsuz Hasil Limiti",
        "prompt": "$$\\lim_{n \\to \\infty} \\prod_{k=2}^{n} \\frac{k^3 - 1}{k^3 + 1}$$ limitini hesablayın.",
        "answer": "2/3",
        "solution": "$\\frac{k^3-1}{k^3+1} = \\frac{k-1}{k+1} \\cdot \\frac{k^2+k+1}{k^2-k+1}$. Hasil $\\frac{2}{n(n+1)} \\cdot \\frac{n^2+n+1}{3} \\to \\frac{2}{3}$."
    },
    {
        "id": "l6", "category": "Limit",
        "title": "Tərs Triqonometrik Teylor Limiti",
        "prompt": "$$\\lim_{x \\to 0} \\frac{\\arcsin x - \\arctan x - \\frac{x^3}{2}}{x^5}$$ limitini hesablayın.",
        "answer": "-1/8",
        "solution": "$\\arcsin x = x + \\frac{x^3}{6} + \\frac{3}{40}x^5 + \\dots$ və $\\arctan x = x - \\frac{x^3}{3} + \\frac{1}{5}x^5 - \\dots$. $x^5$ əmsalı $\\frac{3}{40}-\\frac{1}{5} = -\\frac{1}{8}$."
    },
    {
        "id": "l7", "category": "Limit",
        "title": "Üstlü-Loqarifmik Limit",
        "prompt": "$$\\lim_{x \\to 1} \\frac{x^x - x}{x - 1 - \\ln x}$$ limitini hesablayın.",
        "answer": "2",
        "solution": "$x = 1 + t$ götürsək $x^x = 1 + t + t^2 + O(t^3)$, surət $t^2 + O(t^3)$, məxrəc $\\frac{t^2}{2} + O(t^3)$. Limit $2$-dir."
    },
    {
        "id": "l8", "category": "Limit",
        "title": "Loqarifmik Tangens Teylor Limiti",
        "prompt": "$$\\lim_{x \\to 0} \\frac{\\ln\\!\\left(\\tan\\!\\left(\\frac{\\pi}{4} + x\\right)\\right) - 2x}{x^3}$$ limitini hesablayın.",
        "answer": "4/3",
        "solution": "$(\\ln(\\tan(\\frac{\\pi}{4}+x)))' = 2\\sec(2x) = 2 + 4x^2 + \\dots$. İnteqrallasaq $2x + \\frac{4}{3}x^3 + \\dots$, odur ki limit $\\frac{4}{3}$."
    },
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
_calc_games = {}
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


def az_now():
    return datetime.datetime.now(AZ_TZ)


def az_today(days_offset=0):
    return (az_now() + datetime.timedelta(days=days_offset)).strftime("%Y-%m-%d")


def to_az_str(val):
    if val is None:
        return ""
    if isinstance(val, datetime.datetime):
        dt = val if val.tzinfo else val.replace(tzinfo=datetime.timezone.utc)
        return dt.astimezone(AZ_TZ).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, datetime.date):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if len(s) >= 19 and s[10] in (" ", "T"):
        try:
            fmt = "%Y-%m-%d %H:%M:%S" if s[10] == " " else "%Y-%m-%dT%H:%M:%S"
            dt = datetime.datetime.strptime(s[:19], fmt)
            return dt.replace(tzinfo=datetime.timezone.utc).astimezone(AZ_TZ).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return s


def clean_row(r):
    if r is None:
        return None
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, (datetime.datetime, datetime.date)) or (k in ("created_at", "solved_at", "joined_at") and isinstance(v, str)):
            d[k] = to_az_str(v)
    return d


def get_uni_name(code):
    c = str(code or "").strip().upper()
    return UNI_MAP.get(c, c or "Seçilməyib")


def get_user_rank(rating, is_admin=False):
    """Codeforces tərzi reytinq ünvanları + Admin üçün dalğalanan 'Yaradıcı'."""
    if is_admin:
        return {"rank_title": "Yaradıcı", "rank_color": "rainbow", "is_creator": True}
    r = safe_int(rating, 800)
    if r < 1200:
        return {"rank_title": "Beginner", "rank_color": "#9ca3af", "is_creator": False}
    if r < 1400:
        return {"rank_title": "Pupil", "rank_color": "#22c55e", "is_creator": False}
    if r < 1600:
        return {"rank_title": "Specialist", "rank_color": "#06b6d4", "is_creator": False}
    if r < 1900:
        return {"rank_title": "Expert", "rank_color": "#3b82f6", "is_creator": False}
    if r < 2100:
        return {"rank_title": "Candidate Master", "rank_color": "#a855f7", "is_creator": False}
    if r < 2300:
        return {"rank_title": "Master", "rank_color": "#f59e0b", "is_creator": False}
    if r < 2400:
        return {"rank_title": "International Master", "rank_color": "#ea580c", "is_creator": False}
    if r < 2600:
        return {"rank_title": "Grandmaster", "rank_color": "#ef4444", "is_creator": False}
    if r < 3000:
        return {"rank_title": "International Grandmaster", "rank_color": "#dc2626", "is_creator": False}
    return {"rank_title": "Legendary Grandmaster", "rank_color": "#ff2e4c", "is_creator": False}


def parse_math_answer(raw):
    s = str(raw or "").strip().replace(" ", "").replace(",", ".").replace("−", "-")
    if not s:
        return None
    try:
        if "/" in s:
            parts = s.split("/")
            if len(parts) != 2:
                return None
            return float(Fraction(parts[0]) / Fraction(parts[1]))
        return float(Fraction(s)) if "." not in s else float(s)
    except (ValueError, ZeroDivisionError):
        return None


_RET_TABLES = {"PROBLEMS", "CONTESTS", "ROOMS", "POSTS", "USERS", "SUBMISSIONS", "SERVERS", "SERVER_CHANNELS", "SERVER_MESSAGES"}


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
        m = re.match(r"INSERT\s+INTO\s+([A-Z0-9_]+)", s_up)
        needs_ret = bool(m and m.group(1) in _RET_TABLES and "RETURNING" not in s_up)
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
        return _DualConn(psycopg2.connect(DATABASE_URL, connect_timeout=10), is_pg=True)
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
            if getattr(request, "_adm", False):
                return fn(*a, **kw)
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
    lvl, cur, tot = u["level"], u["xp"] + max(0, xp_amt), u["total_xp"] + max(0, xp_amt)
    coins = u["coins"] + max(0, coin_amt)
    if username.lower() == ADMIN_USERNAME.lower():
        coins = ADMIN_INFINITE_COINS
    while cur >= needed_xp(lvl):
        cur -= needed_xp(lvl)
        lvl += 1
    conn.execute("UPDATE users SET level=?, xp=?, total_xp=?, coins=? WHERE LOWER(username)=LOWER(?)", (lvl, cur, tot, coins, username))


def update_daily_streak(conn, username):
    u = conn.execute("SELECT daily_streak, last_solve_date FROM users WHERE LOWER(username)=LOWER(?)", (username,)).fetchone()
    if not u:
        return 0
    today = az_today()
    yest = az_today(-1)
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
                json={"sender": {"name": "AzForces", "email": BREVO_SENDER_EMAIL}, "to": [{"email": to_email}],
                      "subject": "AzForces — Qeydiyyat Təsdiq Kodu", "textContent": text},
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
    did_write = False
    if secrets.randbelow(20) == 0:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        did_write = True
    u, adm, hum, guest_rem = None, False, False, None
    if ut:
        r = conn.execute("SELECT username FROM sessions WHERE token=? AND kind='user' AND expires_at>?", (ut, now)).fetchone()
        if r:
            u = r["username"]
            if u.lower() == ADMIN_USERNAME.lower():
                adm = True
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
    if u and (now - _seen_cache.get(u.lower(), 0) > 25):
        _seen_cache[u.lower()] = now
        conn.execute("UPDATE users SET last_seen_at=? WHERE LOWER(username)=LOWER(?)", (now, u))
        did_write = True
    if did_write:
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
        request._adm = True
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
