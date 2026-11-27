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

def ensure_global_server(conn):
    row = conn.execute("SELECT id FROM servers WHERE server_code='AZ-GLOBAL'").fetchone()
    if row:
        return row["id"]
    sid = conn.execute(
        "INSERT INTO servers (server_code, name, description, icon_emoji, avatar_color, owner, server_type, university, is_public, max_members) VALUES (?, ?, ?, ?, ?, ?, 'global', '', 1, 2000)",
        ("AZ-GLOBAL", "AzForces Ümumi DC", "Bütün Azərbaycan tələbələri üçün tanışlıq, alqoritm və komanda axtarışı serveri", "🌐", "#3b82f6", ADMIN_USERNAME)
    ).lastrowid
    channels = [
        ("tanisliq", "#tanışlıq", "Özünü təqdim et: universitet, kurs, ixtisas və bildiyin dillər", "text", 1),
        ("umumi", "#ümumi-söhbət", "Bütün universitetlərdən tələbələr üçün sərbəst söhbət", "text", 2),
        ("alqoritm", "#alqoritm-kömək", "Kodlaşdırma, məsələ müzakirəsi və ICPC hazırlığı", "text", 3),
        ("komanda", "#komanda-axtarışı", "Hackathon, startap və yarış komandası ortağı tap", "text", 4),
        ("ses", "🔊 Səs Otağı", "Canlı səsli müzakirə kanalı", "voice", 5),
    ]
    for slug, nm, top, ctype, pos in channels:
        conn.execute(
            "INSERT INTO server_channels (server_id, slug, name, topic, channel_type, pos) VALUES (?, ?, ?, ?, ?, ?)",
            (sid, slug, nm, top, ctype, pos)
        )
    return sid


def ensure_uni_server(conn, uni_code):
    uc = str(uni_code or "").strip().upper()
    if uc not in UNI_MAP:
        return None
    scode = f"UNI-{uc}"
    row = conn.execute("SELECT id FROM servers WHERE server_code=?", (scode,)).fetchone()
    if row:
        return row["id"]
    sid = conn.execute(
        "INSERT INTO servers (server_code, name, description, icon_emoji, avatar_color, owner, server_type, university, is_public, max_members) VALUES (?, ?, ?, ?, ?, ?, 'university', ?, 0, 1000)",
        (scode, f"{uc} Tələbə Serveri", f"Yalnız {UNI_MAP[uc]} ({uc}) üzvləri üçün qapalı universitet serveri", "🏛️", "#0ea5e9", ADMIN_USERNAME, uc)
    ).lastrowid
    channels = [
        ("umumi", "#ümumi", f"{uc} tələbələrinin əsas söhbət kanalı", "text", 1),
        ("dersler", "#dərslər-imtahan", "Dərslər, kollekvium, imtahan və müəllim məsləhətləri", "text", 2),
        ("yarishlar", "#uni-yarışları", f"{uc} daxili müsabiqələr və komanda yığımı", "text", 3),
    ]
    for slug, nm, top, ctype, pos in channels:
        conn.execute(
            "INSERT INTO server_channels (server_id, slug, name, topic, channel_type, pos) VALUES (?, ?, ?, ?, ?, ?)",
            (sid, slug, nm, top, ctype, pos)
        )
    return sid


def sync_user_default_servers(conn, username, uni_code=""):
    gid = ensure_global_server(conn)
    role_g = "owner" if username.lower() == ADMIN_USERNAME.lower() else "member"
    conn.execute("INSERT INTO server_members (server_id, username, role) VALUES (?, ?, ?) ON CONFLICT (server_id, username) DO NOTHING", (gid, username, role_g))
    uc = str(uni_code or "").strip().upper()
    if username.lower() != ADMIN_USERNAME.lower():
        conn.execute("DELETE FROM server_members WHERE LOWER(username)=LOWER(?) AND server_id IN (SELECT id FROM servers WHERE server_type='university' AND UPPER(university)<>UPPER(?))", (username, uc))
    if uc in UNI_MAP:
        uid = ensure_uni_server(conn, uc)
        if uid:
            conn.execute("INSERT INTO server_members (server_id, username, role) VALUES (?, ?, ?) ON CONFLICT (server_id, username) DO NOTHING", (uid, username, role_g))


def init_db():
    conn = get_db()
    PK = "SERIAL PRIMARY KEY" if IS_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"
    TS = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    DBL = "DOUBLE PRECISION" if IS_PG else "REAL"

    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute(f"""CREATE TABLE IF NOT EXISTS users (
        id {PK}, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        bio TEXT DEFAULT '', university TEXT DEFAULT '', uni_changed_at {DBL} DEFAULT 0,
        avatar_url TEXT DEFAULT '', avatar_color TEXT DEFAULT '#3b82f6',
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
        id {PK}, code_label TEXT DEFAULT '', title TEXT NOT NULL, plan TEXT DEFAULT '', rating INTEGER DEFAULT 800, tags TEXT DEFAULT 'math',
        time_limit {DBL} DEFAULT 2.0, memory_limit INTEGER DEFAULT 256, statement TEXT NOT NULL,
        input_spec TEXT DEFAULT '', output_spec TEXT DEFAULT '', note TEXT DEFAULT '', editorial TEXT DEFAULT '',
        starter_code TEXT DEFAULT '', author TEXT DEFAULT 'AzForces', visibility TEXT DEFAULT 'archive',
        contest_id INTEGER DEFAULT NULL, author_check_status TEXT DEFAULT '', reject_reason TEXT DEFAULT '',
        awarded_xp INTEGER DEFAULT 0, created_at {TS})""")
    conn.execute(f"CREATE TABLE IF NOT EXISTS test_cases (id {PK}, problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE, input_data TEXT NOT NULL, expected_output TEXT NOT NULL, is_sample INTEGER DEFAULT 1)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS submissions (id {PK}, problem_id INTEGER NOT NULL, problem_title TEXT NOT NULL, username TEXT NOT NULL, language TEXT NOT NULL, code TEXT NOT NULL, verdict TEXT NOT NULL, passed_tests INTEGER DEFAULT 0, total_tests INTEGER DEFAULT 0, quality_pct INTEGER DEFAULT 0, exec_time TEXT DEFAULT '-', details TEXT DEFAULT '', room_id INTEGER DEFAULT NULL, created_at {TS})")
    conn.execute("CREATE TABLE IF NOT EXISTS daily_challenges (day_date TEXT PRIMARY KEY, problem_id INTEGER NOT NULL)")
    conn.execute(f"CREATE TABLE IF NOT EXISTS daily_solves (id {PK}, day_date TEXT NOT NULL, username TEXT NOT NULL, quality_pct INTEGER DEFAULT 0, solved_at {TS}, UNIQUE(day_date, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS rooms (id {PK}, room_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, bio TEXT DEFAULT 'Dostlarla söhbət və yarış qrupu', avatar_url TEXT DEFAULT '', avatar_color TEXT DEFAULT '#0ea5e9', creator TEXT NOT NULL, voice_link TEXT DEFAULT '', problem_ids_json TEXT DEFAULT '[]', duration_min INTEGER DEFAULT 0, max_members INTEGER DEFAULT 20, starts_at {DBL} NOT NULL, ends_at {DBL} NOT NULL, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS room_members (id {PK}, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, username TEXT NOT NULL, joined_at {TS}, UNIQUE(room_id, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS room_messages (id {PK}, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, username TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, audio_url TEXT DEFAULT '', audio_duration INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS servers (id {PK}, server_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', icon_emoji TEXT DEFAULT '🌐', avatar_color TEXT DEFAULT '#3b82f6', owner TEXT NOT NULL, server_type TEXT DEFAULT 'custom', university TEXT DEFAULT '', is_public INTEGER DEFAULT 1, max_members INTEGER DEFAULT 500, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS server_channels (id {PK}, server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE, slug TEXT NOT NULL, name TEXT NOT NULL, topic TEXT DEFAULT '', channel_type TEXT DEFAULT 'text', voice_url TEXT DEFAULT '', pos INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS server_members (id {PK}, server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE, username TEXT NOT NULL, role TEXT DEFAULT 'member', muted_until {DBL} DEFAULT 0, joined_at {TS}, UNIQUE(server_id, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS server_messages (id {PK}, server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE, channel_id INTEGER NOT NULL REFERENCES server_channels(id) ON DELETE CASCADE, username TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, audio_url TEXT DEFAULT '', audio_duration INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS direct_messages (id {PK}, sender TEXT NOT NULL, receiver TEXT NOT NULL, message TEXT NOT NULL, reply_to_id INTEGER DEFAULT NULL, shared_problem_id INTEGER DEFAULT NULL, audio_url TEXT DEFAULT '', audio_duration INTEGER DEFAULT 0, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS posts (id {PK}, author TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, post_type TEXT DEFAULT 'announcement', is_pinned INTEGER DEFAULT 0, poll_options_json TEXT DEFAULT '[]', created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS poll_votes (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, username TEXT NOT NULL, option_index INTEGER NOT NULL, UNIQUE(post_id, username))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS post_reactions (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, username TEXT NOT NULL, emoji TEXT NOT NULL, UNIQUE(post_id, username, emoji))")
    conn.execute(f"CREATE TABLE IF NOT EXISTS post_comments (id {PK}, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, parent_id INTEGER DEFAULT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS creative_codes (id {PK}, title TEXT NOT NULL, description TEXT DEFAULT '', language TEXT NOT NULL, code TEXT NOT NULL, sample_input TEXT DEFAULT '', author TEXT DEFAULT 'AzForces', created_at {TS})")
    conn.execute(f"CREATE TABLE IF NOT EXISTS custom_frames (id TEXT PRIMARY KEY, name TEXT NOT NULL, tier TEXT DEFAULT 'fantasy', price INTEGER DEFAULT 15000, description TEXT DEFAULT '', image_url TEXT NOT NULL, anim_class TEXT DEFAULT 'fx-float', created_at {TS})")
    conn.commit()

    for tbl, cdef in [
        ("users", f"last_seen_at {DBL} DEFAULT 0"),
        ("users", "university TEXT DEFAULT ''"),
        ("users", f"uni_changed_at {DBL} DEFAULT 0"),
        ("problems", "plan TEXT DEFAULT ''"),
        ("submissions", "quality_pct INTEGER DEFAULT 0"),
        ("room_messages", "audio_url TEXT DEFAULT ''"),
        ("room_messages", "audio_duration INTEGER DEFAULT 0"),
        ("direct_messages", "audio_url TEXT DEFAULT ''"),
        ("direct_messages", "audio_duration INTEGER DEFAULT 0"),
    ]:
        safe_add_col(conn, tbl, cdef)

    for k, v in {"provider": os.environ.get("JUDGE_PROVIDER", "judge0"),
                 "base_url": os.environ.get("JUDGE_BASE_URL", "https://ce.judge0.com"),
                 "api_key": os.environ.get("JUDGE_API_KEY", "")}.items():
        conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING", (k, v))

    if not _ENV_ADMIN_HASH:
        row = conn.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'").fetchone()
        if not row or not row["value"]:
            gen = secrets.token_urlsafe(12)
            conn.execute("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", (generate_password_hash(gen),))
            if os.environ.get("SHOW_INIT_ADMIN_PASSWORD", "false").lower() == "true":
                print(f"\n[AzForces] İlk Admin parolu: {gen} | Gizli panel: /p/{ADMIN_SECRET_PATH}\n", flush=True)
            else:
                print("\n[AzForces] İlkin Admin parolu yaradıldı. ADMIN_PASSWORD env təyin etmək tövsiyə olunur.\n", flush=True)

    if conn.execute("SELECT COUNT(*) AS cnt FROM problems").fetchone()["cnt"] == 0:
        try:
            from problems_seed import SEED_PROBLEMS
            seed = SEED_PROBLEMS
        except ImportError:
            seed = [
                ("1A", "A + B Cəmi", 650, "math, başlanğıc", 1.0, 256, "İki tam ədəd $a$ və $b$ verilir. Onların cəmini tapın.", "Tək sətirdə $a$ və $b$.", "$a+b$ cəmi.", "", "`print(sum(map(int, input().split())))`", [("3 5", "8", 1), ("-10 25", "15", 1), ("1000000000 1000000000", "2000000000", 0)]),
                ("1B", "Tək yoxsa Cüt", 700, "math, başlanğıc", 1.0, 256, "Verilmiş $n$ ədədinin tək və ya cüt olduğunu tapın.", "Bir tam ədəd $n$.", "Cütdürsə `EVEN`, təkdirsə `ODD`.", "", "`n % 2 == 0` yoxlayın.", [("4", "EVEN", 1), ("7", "ODD", 1), ("999999999", "ODD", 0)]),
                ("1C", "Sadə Ədəd", 1000, "number theory", 2.0, 256, "$n$ natural ədədinin sadə olub-olmadığını yoxlayın.", "Bir tam ədəd $n$.", "Sadədirsə `YES`, əks halda `NO`.", "$1$ sadə deyil.", "Kökə qədər bölənləri yoxlayın.", [("7", "YES", 1), ("1", "NO", 1), ("1000000007", "YES", 0)]),
                ("1D", "Hədəf Cəm (Two Sum)", 1200, "hashing, arrays", 2.0, 256, "Massivdə cəmi $k$-ya bərabər iki element varmı?", "1-ci sətirdə $n, k$; 2-ci sətirdə $n$ ədəd.", "`YES` və ya `NO`.", "", "Ədədləri `set`-də saxlayın.", [("4 9\n2 7 11 15", "YES", 1), ("3 10\n1 2 3", "NO", 0)]),
                ("1E", "Ən Uzun Artan Alt-ardıcıllıq", 1800, "dp, binary search", 2.0, 256, "Ən uzun ciddi artan alt-ardıcıllığın uzunluğunu tapın.", "1-ci sətirdə $n$; 2-ci sətirdə massiv.", "Maksimum uzunluq.", "", "Binary search + tails.", [("6\n10 9 2 5 3 7", "3", 1), ("5\n5 4 3 2 1", "1", 0)]),
            ]
        for lbl, t, rt, tg, tl, ml, st, ins, outs, nt, ed, tests in seed:
            pid = conn.execute("INSERT INTO problems (code_label,title,plan,rating,tags,time_limit,memory_limit,statement,input_spec,output_spec,note,editorial,author,visibility) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'AzForces','archive')",
                               (lbl, t, tg, rt, tg, tl, ml, st, ins, outs, nt, ed)).lastrowid
            for i_d, o_d, smp in tests:
                conn.execute("INSERT INTO test_cases (problem_id, input_data, expected_output, is_sample) VALUES (?, ?, ?, ?)", (pid, i_d, o_d, smp))

    if conn.execute("SELECT COUNT(*) AS cnt FROM posts").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO posts (author, title, body, post_type, is_pinned) VALUES (?, ?, ?, 'announcement', 1)",
                     (ADMIN_USERNAME, "AzForces Platformasına Xoş Gəldiniz!", "Rəsmi yarışlar, elanlar və anketlər burada paylaşılır. Hər gün Günün Məsələsini həll edib seriyanızı artırın!"))

    if conn.execute("SELECT COUNT(*) AS cnt FROM site_reviews").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO site_reviews (username, rating, comment) VALUES (?, 5, ?) ON CONFLICT (username) DO NOTHING",
                     (ADMIN_USERNAME, "Azərbaycan dilində müasir alqoritmik məsələ və icma platforması."))

    if conn.execute("SELECT COUNT(*) AS cnt FROM creative_codes").fetchone()["cnt"] == 0:
        conn.execute("INSERT INTO creative_codes (title, description, language, code, sample_input, author) VALUES ('Almaz ASCII', 'Simmetrik almaz fiquru.', 'python', ?, '5', ?)",
                     ("n = int(input() or 5)\nfor i in range(n): print(' '*(n-i-1)+'*'*(2*i+1))\nfor i in range(n-2,-1,-1): print(' '*(n-i-1)+'*'*(2*i+1))", ADMIN_USERNAME))

    ensure_global_server(conn)
    conn.commit()
    conn.close()


@app.before_request
def _boot():
    global _db_ready
    if request.path == "/health":
        return
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
    if username.lower() == ADMIN_USERNAME.lower():
        return True
    u = conn.execute("SELECT * FROM users WHERE LOWER(username)=LOWER(?)", (username,)).fetchone()
    if not u:
        return True
    today = az_today()
    dc, cc = f"d_{kind}_date", f"d_{kind}_cnt"
    cnt = u[cc] if u[dc] == today else 0
    if cnt >= limit:
        return False
    conn.execute(f"UPDATE users SET {dc}=?, {cc}=? WHERE LOWER(username)=LOWER(?)", (today, cnt + 1, username))
    return True


def norm_out(txt):
    return "\n".join(l.rstrip() for l in (txt or "").replace("\r\n", "\n").strip().splitlines())


def get_or_create_daily_pid(conn):
    today = az_today()
    row = conn.execute("SELECT problem_id FROM daily_challenges WHERE day_date=?", (today,)).fetchone()
    if row:
        if conn.execute("SELECT 1 FROM problems WHERE id=? AND visibility IN ('archive','gym')", (row["problem_id"],)).fetchone():
            return row["problem_id"]
    pool = conn.execute("SELECT id FROM problems WHERE visibility IN ('archive','gym') ORDER BY id ASC").fetchall()
    if not pool:
        return None
    chosen = pool[int(az_now().strftime("%Y%m%d")) % len(pool)]["id"]
    conn.execute("INSERT INTO daily_challenges (day_date, problem_id) VALUES (?, ?) ON CONFLICT (day_date) DO UPDATE SET problem_id=excluded.problem_id", (today, chosen))
    conn.commit()
    return chosen


def get_all_shop_items(conn):
    custom = conn.execute("SELECT * FROM custom_frames ORDER BY created_at DESC").fetchall()
    items = [dict(it) | {"fx_type": "svg" if it["id"] != "none" else "none", "image_url": "", "anim_class": ""} for it in SHOP_ITEMS]
    for cf in custom:
        items.append({
            "id": cf["id"], "name": cf["name"], "tier": cf["tier"] or "fantasy",
            "price": cf["price"], "desc": cf["description"] or "Xüsusi animasiyalı çərçivə",
            "fx_type": "img", "image_url": cf["image_url"], "anim_class": cf["anim_class"] or "fx-float",
        })
    return items


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
        try:
            r = requests.post(VOICE_UPLOAD_WEBHOOK, files={"file": (f"voice.{ext}", raw_bytes, f"audio/{ext}")}, timeout=20)
            if r.status_code < 400:
                j = r.json() or {}
                url = j.get("url") or j.get("secure_url")
                if url:
                    return url, None
        except Exception:
            pass
        return None, "Xarici səs servisi cavab vermədi."
    if CLOUD_NAME and CLOUD_KEY and CLOUD_SECRET:
        ts = int(time.time())
        sig = hashlib.sha1(f"folder=azforces_voice&timestamp={ts}{CLOUD_SECRET}".encode("utf-8")).hexdigest()
        try:
            r = requests.post(
                f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/video/upload",
                data={"api_key": CLOUD_KEY, "timestamp": ts, "folder": "azforces_voice", "signature": sig},
                files={"file": (f"voice.{ext}", raw_bytes)}, timeout=25,
            )
            if r.status_code < 400:
                return r.json().get("secure_url", ""), None
        except Exception:
            pass
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


def _run_piston(base_url, lang, code, stdin_data):
    piston_langs = {"python": "python", "cpp": "c++", "c": "c", "java": "java", "javascript": "javascript"}
    ep = (base_url or "").strip().rstrip("/")
    if not ep or "judge0" in ep:
        ep = "https://emkc.org/api/v2/piston"
    if not ep.endswith("/execute"):
        ep = f"{ep}/execute"
    try:
        t0 = time.perf_counter()
        r = requests.post(ep, json={"language": piston_langs.get(lang, lang), "version": "*",
                                    "files": [{"content": code}], "stdin": stdin_data}, timeout=22)
        el = f"{time.perf_counter() - t0:.2f}s"
        if r.status_code >= 400:
            return {"ok": False, "status": "API Error", "stderr": f"Piston HTTP {r.status_code}"}
        d = r.json()
        comp = d.get("compile") or {}
        if comp.get("code", 0) not in (0, None):
            return {"ok": True, "status": "Compilation Error", "stdout": "", "stderr": comp.get("stderr") or comp.get("output") or "Kompilyasiya xətası", "time": el}
        run = d.get("run") or {}
        if run.get("signal") == "SIGKILL":
            return {"ok": True, "status": "Time Limit Exceeded", "stdout": run.get("stdout", ""), "stderr": "Vaxt limiti aşıldı", "time": el}
        if run.get("code", 0) not in (0, None):
            return {"ok": True, "status": "Runtime Error", "stdout": run.get("stdout", ""), "stderr": run.get("stderr") or run.get("output") or f"Exit {run.get('code')}", "time": el}
        return {"ok": True, "status": "OK", "stdout": run.get("stdout", ""), "stderr": run.get("stderr", ""), "time": el}
    except requests.RequestException as e:
        return {"ok": False, "status": "Connection Error", "stderr": f"Piston xətası: {e}"}


def _run_judge0(base_url, api_key, lang, code, stdin_data, t_limit):
    lids = {"python": 71, "cpp": 54, "c": 50, "java": 62, "javascript": 63}
    hdrs = {"Content-Type": "application/json"}
    if api_key:
        if "rapidapi.com" in base_url:
            hdrs["X-RapidAPI-Key"], hdrs["X-RapidAPI-Host"] = api_key, base_url.split("//")[-1].split("/")[0]
        else:
            hdrs["X-Auth-Token"] = api_key

    def b64(s):
        return base64.b64encode((s or "").encode("utf-8")).decode("ascii")

    def deb64(s):
        return base64.b64decode(s).decode("utf-8", errors="replace") if s else ""

    try:
        r = requests.post(f"{base_url}/submissions?base64_encoded=true&wait=true",
                          json={"language_id": lids[lang], "source_code": b64(code), "stdin": b64(stdin_data), "cpu_time_limit": t_limit},
                          headers=hdrs, timeout=22)
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
    prov = cfg.get("provider", "judge0")
    url = cfg.get("base_url", "https://ce.judge0.com").strip().rstrip("/")
    key = cfg.get("api_key", "").strip()

    if prov == "local" and ALLOW_LOCAL_RUNNER and lang == "python":
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "m.py")
            with open(src, "w", encoding="utf-8") as fh:
                fh.write(code)
            try:
                t0 = time.perf_counter()
                p = subprocess.run([sys.executable, "-I", src], input=stdin_data, capture_output=True, text=True, timeout=t_limit, cwd=td)
                return {"ok": True, "status": "OK" if p.returncode == 0 else "Runtime Error", "stdout": p.stdout[:65536], "stderr": p.stderr[:65536], "time": f"{time.perf_counter()-t0:.2f}s"}
            except subprocess.TimeoutExpired:
                return {"ok": True, "status": "Time Limit Exceeded", "stdout": "", "stderr": "Vaxt limiti aşıldı", "time": f"{t_limit:.2f}s"}

    if prov == "wandbox":
        return _run_wandbox(lang, code, stdin_data)

    if prov == "piston":
        res = _run_piston(url, lang, code, stdin_data)
        if not res.get("ok"):
            wb = _run_wandbox(lang, code, stdin_data)
            if wb.get("ok"):
                return wb
        return res

    res = _run_judge0(url or "https://ce.judge0.com", key, lang, code, stdin_data, t_limit)
    if not res.get("ok"):
        wb = _run_wandbox(lang, code, stdin_data)
        if wb.get("ok"):
            return wb
    return res


# ═══════════════ SƏHİFƏLƏR & HEALTH ═══════════════
@app.route("/health")
def health():
    return "OK", 200


@app.route("/")
def index():
    return render_template("index.html", admin_portal=False)


@app.route("/p/<slug>")
def secret_admin_portal(slug):
    _, adm, _, _ = get_session()
    if not adm or slug != ADMIN_SECRET_PATH:
        abort(404)
    return render_template("index.html", admin_portal=True)


# ═══════════════ İNSAN / QONAQ / HEARTBEAT / RƏYLƏR ═══════════════
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


@app.route("/api/ping", methods=["POST"])
def ping_online():
    get_session()
    return jsonify({"ok": True})


@app.route("/api/site-reviews", methods=["GET", "POST"])
def site_reviews():
    conn = get_db()
    if request.method == "GET":
        raw_revs = conn.execute("SELECT r.*, u.rating AS user_rating, u.university FROM site_reviews r LEFT JOIN users u ON LOWER(u.username)=LOWER(r.username) ORDER BY r.id DESC LIMIT 12").fetchall()
        revs = []
        for r in raw_revs:
            is_adm = (r["username"] == ADMIN_USERNAME)
            rk = get_user_rank(r.get("user_rating") or 800, is_adm)
            revs.append(r | {"is_admin_user": is_adm, "university_name": get_uni_name(r.get("university"))} | rk)
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


# ═══════════════ AUTH (parol 2 dəfə + universitet + rank + admin) ═══════════════
@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    u, adm, hum, guest_rem = get_session()
    info = {"authenticated": bool(u), "username": u, "is_admin": adm, "infinite_coins": adm,
            "human_verified": hum, "guest_remaining_sec": guest_rem, "level": 1, "xp": 0,
            "needed_xp": 100, "coins": 0, "rating": 800, "university": "", "university_name": "Seçilməyib",
            "avatar_url": "", "avatar_frame": "none", "avatar_color": "#3b82f6", "pending_proposals_count": 0} | get_user_rank(800, adm)
    conn = get_db()
    if u:
        row = conn.execute("SELECT level, xp, total_xp, coins, rating, daily_streak, university, uni_changed_at, avatar_url, avatar_color, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (u,)).fetchone()
        if row:
            rk = get_user_rank(row["rating"], adm)
            uni = row.get("university") or ""
            info.update({"level": row["level"], "xp": row["xp"], "needed_xp": needed_xp(row["level"]),
                         "total_xp": row["total_xp"], "coins": ADMIN_INFINITE_COINS if adm else row["coins"],
                         "rating": row["rating"], "streak": row["daily_streak"],
                         "university": uni, "university_name": get_uni_name(uni),
                         "uni_changed_at": row.get("uni_changed_at") or 0,
                         "avatar_url": row["avatar_url"], "avatar_color": row["avatar_color"],
                         "avatar_frame": row["avatar_frame"]} | rk)
    if adm:
        info["pending_proposals_count"] = conn.execute("SELECT COUNT(*) AS cnt FROM problems WHERE visibility='pending'").fetchone()["cnt"]
    custom_frames = conn.execute("SELECT id, name, tier, price, image_url, anim_class FROM custom_frames").fetchall()
    conn.close()
    info["custom_frames"] = custom_frames
    info["universities"] = UNIVERSITIES
    return jsonify(info)


@app.route("/api/auth/send-code", methods=["POST"])
@rate_limit(5, 60)
def send_reg_code():
    d = request.get_json(silent=True) or {}
    email = str(d.get("email") or "").strip().lower()
    uname = str(d.get("username") or "").strip()
    pw = str(d.get("password") or "")
    pw2 = str(d.get("password_confirm") or "")
    if not re.match(r"^[a-z0-9._%+-]+@gmail\.com$", email):
        return jsonify({"error": "Yalnız etibarlı @gmail.com ünvanı yazın."}), 400
    if ADMIN_EMAIL and email == ADMIN_EMAIL:
        return jsonify({"error": "Bu Gmail qeydiyyata bağlıdır."}), 400
    if not (3 <= len(uname) <= 22) or not re.match(r"^[a-zA-Z0-9_-]+$", uname) or uname.lower() == ADMIN_USERNAME.lower():
        return jsonify({"error": "İstifadəçi adı 3-22 simvol (hərf, rəqəm, _ -) olmalıdır."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Parol ən azı 6 simvol olmalıdır."}), 400
    if pw != pw2:
        return jsonify({"error": "Şifrələr eyni deyil — parolu 2 dəfə eyni yazın."}), 400
    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE LOWER(username)=LOWER(?) OR LOWER(email)=LOWER(?)", (uname, email)).fetchone():
        conn.close()
        return jsonify({"error": "Bu ad və ya Gmail artıq mövcuddur."}), 400
    code = f"{secrets.randbelow(1000000):06d}"
    conn.execute("INSERT INTO email_codes (email, code_hash, attempts, expires_at) VALUES (?, ?, 0, ?) ON CONFLICT (email) DO UPDATE SET code_hash=excluded.code_hash, attempts=0, expires_at=excluded.expires_at",
                 (email, generate_password_hash(code), time.time() + 300))
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
    email = str(d.get("email") or "").strip().lower()
    uname = str(d.get("username") or "").strip()
    pw = str(d.get("password") or "")
    pw2 = str(d.get("password_confirm") or "")
    code = str(d.get("code") or "").strip()
    uni = str(d.get("university") or "").strip().upper()
    if uni not in UNI_MAP:
        uni = ""
    if uname.lower() == ADMIN_USERNAME.lower():
        return jsonify({"error": "Bu ad qorunur."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Parol ən azı 6 simvol olmalıdır."}), 400
    if pw != pw2:
        return jsonify({"error": "Şifrələr uyğun gəlmir — iki dəfə düzgün yazın."}), 400
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
    now = time.time()
    conn.execute("INSERT INTO users (username, email, password_hash, coins, university, uni_changed_at, last_seen_at) VALUES (?, ?, ?, 50, ?, ?, ?)",
                 (uname, email, generate_password_hash(pw), uni, now if uni else 0, now))
    conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, 'none') ON CONFLICT (username, item_id) DO NOTHING", (uname,))
    conn.execute("INSERT INTO rating_history (username, rating, label) VALUES (?, 800, 'Başlanğıc')", (uname,))
    conn.execute("DELETE FROM email_codes WHERE LOWER(email)=LOWER(?)", (email,))
    sync_user_default_servers(conn, uname, uni)
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
    is_adm_id = (ADMIN_EMAIL and ident.lower() == ADMIN_EMAIL) or (ident.lower() == ADMIN_USERNAME.lower())

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
                conn.execute("INSERT INTO users (username, email, password_hash, coins, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (username) DO NOTHING",
                             (ADMIN_USERNAME, ADMIN_EMAIL or "admin@azforces.local", adm_hash, ADMIN_INFINITE_COINS, now))
                conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, 'none') ON CONFLICT (username, item_id) DO NOTHING", (ADMIN_USERNAME,))
                conn.execute("INSERT INTO rating_history (username, rating, label) VALUES (?, 800, 'Başlanğıc')", (ADMIN_USERNAME,))
            adm_row = conn.execute("SELECT university FROM users WHERE LOWER(username)=LOWER(?)", (ADMIN_USERNAME,)).fetchone()
            conn.execute("UPDATE users SET last_seen_at=?, coins=? WHERE LOWER(username)=LOWER(?)", (now, ADMIN_INFINITE_COINS, ADMIN_USERNAME))
            for it in SHOP_ITEMS:
                conn.execute("INSERT INTO user_inventory (username, item_id) VALUES (?, ?) ON CONFLICT (username, item_id) DO NOTHING", (ADMIN_USERNAME, it["id"]))
            sync_user_default_servers(conn, ADMIN_USERNAME, (adm_row or {}).get("university") or "")
            conn.commit()
            conn.close()
            _seen_cache[ADMIN_USERNAME.lower()] = now
            ut = create_session(ADMIN_USERNAME, "user", SESSION_TTL)
            at = create_session(ADMIN_USERNAME, "admin", ADMIN_TTL)
            resp = make_response(jsonify({"ok": True, "username": ADMIN_USERNAME, "is_admin": True, "infinite_coins": True, "message": "Xoş gəldiniz, Yaradıcı!"}))
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
    now = time.time()
    _seen_cache[u["username"].lower()] = now
    conn.execute("UPDATE users SET last_seen_at=? WHERE LOWER(username)=LOWER(?)", (now, u["username"]))
    sync_user_default_servers(conn, u["username"], u.get("university") or "")
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


# ═══════════════ UNİVERSİTETLƏR & PROFİL + QEYDİYYATLAR ═══════════════
@app.route("/api/universities", methods=["GET"])
def list_universities():
    conn = get_db()
    cnt_rows = conn.execute("SELECT UPPER(university) AS uni, COUNT(*) AS cnt FROM users WHERE university <> '' GROUP BY UPPER(university)").fetchall()
    conn.close()
    cnt_map = {r["uni"]: r["cnt"] for r in cnt_rows}
    return jsonify([u | {"members": cnt_map.get(u["code"], 0)} for u in UNIVERSITIES])


@app.route("/api/profile/university", methods=["POST"])
@require_user
def set_my_university():
    d = request.get_json(silent=True) or {}
    uni = str(d.get("university") or "").strip().upper()
    if uni not in UNI_MAP:
        return jsonify({"error": "Siyahıdan düzgün universitet seçin."}), 400
    conn = get_db()
    u = conn.execute("SELECT university, uni_changed_at FROM users WHERE LOWER(username)=LOWER(?)", (request._u,)).fetchone()
    now = time.time()
    cur_uni = (u.get("university") or "").strip().upper() if u else ""
    last_ch = float((u.get("uni_changed_at") or 0) if u else 0)
    if cur_uni == uni:
        conn.close()
        return jsonify({"message": f"Artıq {UNI_MAP[uni]} ({uni}) seçilib."})
    if cur_uni and not request._adm and (now - last_ch) < UNI_CHANGE_COOLDOWN:
        days_left = max(1, int((UNI_CHANGE_COOLDOWN - (now - last_ch)) // 86400) + 1)
        conn.close()
        return jsonify({"error": f"Universiteti 30 gündə 1 dəfə dəyişmək olar ({days_left} gün qalıb)."}), 429
    conn.execute("UPDATE users SET university=?, uni_changed_at=? WHERE LOWER(username)=LOWER(?)", (uni, now, request._u))
    sync_user_default_servers(conn, request._u, uni)
    conn.commit()
    conn.close()
    return jsonify({"university": uni, "university_name": UNI_MAP[uni], "message": f"Universitet '{UNI_MAP[uni]}' olaraq seçildi və serveriniz açıldı!"})


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
    rk = get_user_rank(u["rating"], target_is_adm)
    uni = u.get("university") or ""
    data = {
        "username": uname, "bio": u["bio"], "university": uni, "university_name": get_uni_name(uni),
        "avatar_url": u["avatar_url"], "avatar_color": u["avatar_color"],
        "avatar_frame": u["avatar_frame"], "level": u["level"], "xp": u["xp"], "needed_xp": need,
        "progress_pct": min(100, int(u["xp"] * 100 / need)), "total_xp": u["total_xp"],
        "coins": ADMIN_INFINITE_COINS if target_is_adm else u["coins"], "infinite_coins": target_is_adm,
        "rating": u["rating"], "streak": u["daily_streak"], "solved_count": solved,
        "recent_solved": recent, "heatmap": dict(heat), "rating_history": r_hist, "is_admin_user": target_is_adm,
        "created_at": u["created_at"],
    } | rk
    if viewer_is_admin:
        last_ts = float(u["last_seen_at"] or 0)
        data["admin_meta"] = {
            "is_online": (time.time() - last_ts) <= 120 if last_ts > 0 else False,
            "last_seen": datetime.datetime.fromtimestamp(last_ts, AZ_TZ).strftime("%Y-%m-%d %H:%M") if last_ts > 0 else "Məlumat yoxdur",
            "joined_at": u["created_at"],
            "email": u["email"],
        }
    if include_private:
        fr_rows = conn.execute("SELECT * FROM friendships WHERE LOWER(user_a)=LOWER(?) OR LOWER(user_b)=LOWER(?)", (uname, uname)).fetchall()
        friends, inc = [], []
        for f in fr_rows:
            other = f["user_b"] if f["user_a"].lower() == uname.lower() else f["user_a"]
            if f["status"] == "accepted":
                fu = conn.execute("SELECT level, rating, university, daily_streak, avatar_url, avatar_color, avatar_frame FROM users WHERE LOWER(username)=LOWER(?)", (other,)).fetchone()
                other_adm = (other == ADMIN_USERNAME)
                frk = get_user_rank(fu["rating"] if fu else 800, other_adm)
                friends.append({"username": other, "level": fu["level"] if fu else 1, "streak": fu["daily_streak"] if fu else 0,
                                "university": (fu.get("university") or "") if fu else "",
                                "avatar_url": fu["avatar_url"] if fu else "", "avatar_color": fu["avatar_color"] if fu else "#3b82f6",
                                "avatar_frame": fu["avatar_frame"] if fu else "none", "is_admin_user": other_adm} | frk)
            elif f["status"] == "pending" and f["action_by"].lower() != uname.lower():
                inc.append(other)
        data["email"] = u["email"]
        data["friends"] = friends
        data["incoming_requests"] = inc
    return data


@app.route("/api/users/registrations", methods=["GET"])
def list_registrations():
    """Günlük və həftəlik qeydiyyat siyahısı (Bakı vaxtı UTC+4; onlayn/oflayn YALNIZ admin üçün)."""
    _, adm, _, _ = get_session()
    period = (request.args.get("period") or "weekly").strip().lower()
    today_str = az_today()
    week_ago_str = az_today(-7)

    conn = get_db()
    rows = conn.execute("SELECT username, email, university, level, rating, avatar_url, avatar_color, avatar_frame, last_seen_at, created_at FROM users ORDER BY id DESC LIMIT 200").fetchall()
    conn.close()

    now_ts = time.time()
    today_cnt, week_cnt, online_cnt = 0, 0, 0
    items = []

    for r in rows:
        reg_day = str(r["created_at"] or "")[:10]
        is_adm_u = (r["username"] == ADMIN_USERNAME)
        ts = float(r["last_seen_at"] or 0)
        is_on = (now_ts - ts) <= 120 if ts > 0 else False

        if reg_day == today_str:
            today_cnt += 1
        if reg_day >= week_ago_str:
            week_cnt += 1
        if is_on:
            online_cnt += 1

        if period == "daily" and reg_day != today_str:
            continue
        if period == "weekly" and reg_day < week_ago_str:
            continue

        rk = get_user_rank(r["rating"], is_adm_u)
        uni = r.get("university") or ""
        item = {
            "username": r["username"],
            "university": uni,
            "university_name": get_uni_name(uni),
            "level": r["level"],
            "rating": r["rating"],
            "avatar_url": r["avatar_url"],
            "avatar_color": r["avatar_color"],
            "avatar_frame": r["avatar_frame"],
            "created_at": r["created_at"],
            "is_admin_user": is_adm_u,
        } | rk
        if adm:
            item["is_online"] = is_on
            item["last_seen"] = datetime.datetime.fromtimestamp(ts, AZ_TZ).strftime("%Y-%m-%d %H:%M") if ts > 0 else "—"
            item["email"] = r["email"]
        items.append(item)

    res = {
        "period": period,
        "today_count": today_cnt,
        "week_count": week_cnt,
        "total_count": len(rows),
        "users": items,
        "viewer_is_admin": adm,
    }
    if adm:
        res["online_count"] = online_cnt
    return jsonify(res)


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
    f = request.files.get("avatar")
    if not f:
        return jsonify({"error": "Şəkil seçin."}), 400
    raw = f.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        return jsonify({"error": "Şəkil maksimum 2 MB ola bilər."}), 400
    if raw.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif raw.startswith(b"\x89PNG"):
        mime = "image/png"
    elif raw.startswith(b"GIF8"):
        mime = "image/gif"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        return jsonify({"error": "Yalnız JPG, PNG, WEBP və ya GIF şəkli yükləyin."}), 400

    url = ""
    if CLOUD_NAME and CLOUD_KEY and CLOUD_SECRET:
        ts = int(time.time())
        sig = hashlib.sha1(f"folder=azforces_avatars&timestamp={ts}{CLOUD_SECRET}".encode("utf-8")).hexdigest()
        try:
            r = requests.post(
                f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload",
                data={"api_key": CLOUD_KEY, "timestamp": ts, "folder": "azforces_avatars", "signature": sig},
                files={"file": (f.filename or "avatar.jpg", raw)}, timeout=20,
            )
            if r.status_code < 400:
                url = r.json().get("secure_url", "").replace("/upload/", "/upload/c_fill,w_256,h_256,q_auto/")
        except Exception:
            pass
    if not url:
        if len(raw) > 512 * 1024:
            return jsonify({"error": "Cloudinary qoşulmadığı üçün şəkli 512 KB-dan kiçik seçin."}), 400
        url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

    conn = get_db()
    conn.execute("UPDATE users SET avatar_url=? WHERE LOWER(username)=LOWER(?)", (url, request._u))
    conn.commit()
    conn.close()
    return jsonify({"avatar_url": url, "message": "Profil şəkli yeniləndi!"})


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
