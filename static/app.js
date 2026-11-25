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
let roomPolling = false, dmPolling = false, sendingRoom = false, sendingDm = false;
let currentProfileUser = "", currentProfileSubTab = "overview";

const TEMPLATES = {
  python: "# Kodunuzu bura yazın\n",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n",
  c: "#include <stdio.h>\n\nint main() {\n    return 0;\n}\n",
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}\n",
  javascript: "const fs = require('fs');\nconst data = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);\nconsole.log(data.join(' '));\n"
};

const FRAME_TIERS = {
  "none": "classic",
  "angry-anime": "classic", "pirate-king": "classic", "golden-aura": "classic",
  "butterfly-dream": "nature", "afternoon-bloom": "nature", "bonsai-sakura": "nature",
  "golden-leo": "nature", "cyclone-wind": "nature",
  "oni-glitch": "fantasy", "siyah-mana": "fantasy", "zaman-carki": "fantasy",
  "elit-yilan": "fantasy", "purple-runes": "fantasy", "black-hole": "fantasy",
  "venom-symbiote": "fantasy", "flaming-bull": "fantasy", "thunder-god": "fantasy",
  "cute-angel": "fantasy",
  "tatli-ejderha": "legendary", "venom-legend": "legendary",
  "phoenix-wings": "legendary", "dark-angel": "legendary",
  "fallen-angel": "legendary", "angel-wings": "legendary"
};

function frameTier(id) {
  if (customFramesMap[id]) return customFramesMap[id].tier || "fantasy";
  return FRAME_TIERS[String(id || "none").trim()] || "classic";
}

const SVG_FRAMES = {
  "angry-anime": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <circle cx="120" cy="120" r="61" fill="none" stroke="#991b1b" stroke-width="5"/>
    <g class="fx-spin-slow">
      <circle cx="120" cy="120" r="64" fill="none" stroke="#ef4444" stroke-width="3.5" stroke-dasharray="48 14 22 14" stroke-linecap="round"/>
      <circle cx="120" cy="120" r="71" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="36 28 14 22" opacity=".9"/>
    </g>
    <g class="fx-pulse-angry">
      <g transform="translate(166 54) rotate(12)">
        <path d="M-16,-6 Q-4,-4 -4,-16 M4,-16 Q4,-4 16,-6 M16,6 Q4,4 4,16 M-4,16 Q-4,4 -16,6" fill="none" stroke="#111" stroke-width="8" stroke-linecap="round"/>
        <path d="M-16,-6 Q-4,-4 -4,-16 M4,-16 Q4,-4 16,-6 M16,6 Q4,4 4,16 M-4,16 Q-4,4 -16,6" fill="none" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"/>
      </g>
      <path d="M52,162 C44,142 64,132 76,144 L88,136 L82,150 C92,162 80,184 60,180 C44,178 40,168 52,162 Z" fill="#fff" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M64,149 L62,165" stroke="#111" stroke-width="5" stroke-linecap="round"/>
      <circle cx="61.5" cy="172" r="2.8" fill="#111"/>
    </g>
  </svg>`,

  "butterfly-dream": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azBdR" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f43f5e"/><stop offset=".5" stop-color="#be123c"/><stop offset="1" stop-color="#1e060b"/>
      </linearGradient>
    </defs>
    <g class="fx-glitch-scan">
      <circle cx="120" cy="120" r="61" fill="none" stroke="url(#azBdR)" stroke-width="7"/>
      <circle cx="120" cy="120" r="67" fill="none" stroke="#e11d48" stroke-width="3" stroke-dasharray="32 8 10 12"/>
      <circle cx="120" cy="120" r="73" fill="none" stroke="#9f1239" stroke-width="2" stroke-dasharray="18 22 6 14" opacity=".85"/>
      <rect x="44" y="108" width="18" height="3" fill="#fb7185" opacity=".85"/>
      <rect x="178" y="128" width="20" height="3" fill="#f43f5e" opacity=".85"/>
      <rect x="108" y="45" width="22" height="2.5" fill="#fda4af" opacity=".75"/>
    </g>
    <g class="fx-butterfly" transform="translate(64 68) rotate(-25)">
      <path d="M0,0 C-18,-22 -30,-6 -16,8 C-26,16 -14,26 0,10 Z" fill="#e11d48" stroke="#111" stroke-width="2"/>
      <path d="M0,0 C18,-22 30,-6 16,8 C26,16 14,26 0,10 Z" fill="#be123c" stroke="#111" stroke-width="2"/>
      <circle cx="-11" cy="-3" r="3" fill="#111"/><circle cx="11" cy="-3" r="3" fill="#111"/>
      <circle cx="-9" cy="10" r="2" fill="#fda4af"/><circle cx="9" cy="10" r="2" fill="#fda4af"/>
      <line x1="0" y1="-8" x2="0" y2="14" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M0,-8 Q-5,-15 -9,-14 M0,-8 Q5,-15 9,-14" fill="none" stroke="#fda4af" stroke-width="1.3"/>
    </g>
  </svg>`,

  "afternoon-bloom": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#84cc16"/><stop offset="1" stop-color="#14532d"/></linearGradient>
    </defs>
    <circle cx="120" cy="120" r="59" fill="none" stroke="#4ade80" stroke-width="2.5" opacity=".55"/>
    <g class="fx-sway">
      <path d="M56,128 C58,176 92,196 120,196 C148,196 182,176 184,128 C176,162 150,182 120,182 C90,182 64,162 56,128 Z" fill="url(#azGrass)"/>
      <path d="M62,154 L50,136 L66,148 M76,172 L68,154 L84,168 M96,184 L94,166 L104,182 M120,186 L120,168 L127,185 M144,184 L148,166 L154,180 M164,172 L174,154 L172,168 M178,154 L192,134 L182,150" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/>
      <g transform="translate(58 122)">
        <circle cx="0" cy="-7" r="5" fill="#f472b6"/><circle cx="7" cy="-2" r="5" fill="#f472b6"/><circle cx="4" cy="6" r="5" fill="#f472b6"/><circle cx="-4" cy="6" r="5" fill="#f472b6"/><circle cx="-7" cy="-2" r="5" fill="#f472b6"/><circle cx="0" cy="0" r="4" fill="#fde047"/>
      </g>
      <g transform="translate(76 164)">
        <circle cx="0" cy="-6" r="4.5" fill="#fb7185"/><circle cx="6" cy="-2" r="4.5" fill="#fb7185"/><circle cx="4" cy="5" r="4.5" fill="#fb7185"/><circle cx="-4" cy="5" r="4.5" fill="#fb7185"/><circle cx="-6" cy="-2" r="4.5" fill="#fb7185"/><circle cx="0" cy="0" r="3.5" fill="#fef08a"/>
      </g>
      <g transform="translate(182 118)">
        <circle cx="0" cy="-7" r="5" fill="#fbbf24"/><circle cx="7" cy="-2" r="5" fill="#fbbf24"/><circle cx="4" cy="6" r="5" fill="#fbbf24"/><circle cx="-4" cy="6" r="5" fill="#fbbf24"/><circle cx="-7" cy="-2" r="5" fill="#fbbf24"/><circle cx="0" cy="0" r="4" fill="#ea580c"/>
      </g>
      <g transform="translate(166 160)">
        <circle cx="0" cy="-6" r="4.5" fill="#fff"/><circle cx="6" cy="-2" r="4.5" fill="#fff"/><circle cx="4" cy="5" r="4.5" fill="#fff"/><circle cx="-4" cy="5" r="4.5" fill="#fff"/><circle cx="-6" cy="-2" r="4.5" fill="#fff"/><circle cx="0" cy="0" r="3.5" fill="#facc15"/>
      </g>
      <g transform="translate(58 98)">
        <circle cx="0" cy="-5" r="3.8" fill="#fef08a"/><circle cx="5" cy="0" r="3.8" fill="#fef08a"/><circle cx="0" cy="5" r="3.8" fill="#fef08a"/><circle cx="-5" cy="0" r="3.8" fill="#fef08a"/><circle cx="0" cy="0" r="2.8" fill="#f97316"/>
      </g>
      <g transform="translate(184 96)">
        <circle cx="0" cy="-5" r="3.5" fill="#fbcfe8"/><circle cx="5" cy="0" r="3.5" fill="#fbcfe8"/><circle cx="0" cy="5" r="3.5" fill="#fbcfe8"/><circle cx="-5" cy="0" r="3.5" fill="#fbcfe8"/><circle cx="0" cy="0" r="2.5" fill="#ec4899"/>
      </g>
    </g>
  </svg>`,

  "oni-glitch": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azOni" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#818cf8"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
    </defs>
    <g class="fx-glitch-scan">
      <circle cx="120" cy="120" r="61" fill="none" stroke="url(#azOni)" stroke-width="5" stroke-dasharray="38 8 14 8"/>
      <circle cx="120" cy="120" r="67" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-dasharray="22 18"/>
      <circle cx="120" cy="120" r="71" fill="none" stroke="#ec4899" stroke-width="2" stroke-dasharray="12 24"/>
      <rect x="44" y="54" width="38" height="4" rx="2" fill="#22d3ee" opacity=".9"/>
      <rect x="158" y="64" width="34" height="4" rx="2" fill="#ec4899" opacity=".9"/>
      <rect x="164" y="168" width="40" height="4" rx="2" fill="#38bdf8" opacity=".85"/>
      <rect x="48" y="182" width="46" height="4" rx="2" fill="#c084fc" opacity=".85"/>
      <path d="M54,196 L60,162 L66,174 L70,146 L76,170 L82,150 L87,172 L96,158 L98,176 L88,196 Z" fill="rgba(56,189,248,.22)" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round"/>
    </g>
  </svg>`,

  "siyah-mana": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azManaMet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2e8f0"/><stop offset=".5" stop-color="#64748b"/><stop offset="1" stop-color="#1e293b"/></linearGradient>
      <radialGradient id="azManaOrb" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#e879f9"/><stop offset=".55" stop-color="#7e22ce"/><stop offset="1" stop-color="#1e1b4b"/></radialGradient>
    </defs>
    <path d="M62,138 Q120,210 178,138 Q150,185 120,185 Q90,185 62,138 Z" fill="#a855f7" opacity=".42" filter="blur(4px)"/>
    <circle cx="120" cy="120" r="64" fill="none" stroke="url(#azManaMet)" stroke-width="11"/>
    <circle cx="120" cy="120" r="59" fill="none" stroke="#1e293b" stroke-width="2"/>
    <g fill="#475569" stroke="#cbd5e1" stroke-width="1.2">
      <polygon points="120,44 114,56 126,56"/>
      <polygon points="44,120 56,114 56,126"/>
      <polygon points="196,120 184,114 184,126"/>
      <polygon points="62,174 74,166 78,176"/>
      <polygon points="178,174 166,166 162,176"/>
    </g>
    <g class="fx-sway" fill="#e2e8f0" stroke="#334155" stroke-width="1.6" stroke-linejoin="round">
      <path d="M54,90 L42,64 L54,60 L60,78 L60,52 L70,52 L72,74 L78,48 L88,52 L84,78 L92,62 L98,68 L84,94 C74,98 62,96 54,90 Z"/>
      <path d="M186,90 L198,64 L186,60 L180,78 L180,52 L170,52 L168,74 L162,48 L152,52 L156,78 L148,62 L142,68 L156,94 C166,98 178,96 186,90 Z"/>
    </g>
    <g class="fx-pulse">
      <circle cx="120" cy="184" r="20" fill="url(#azManaOrb)" stroke="#94a3b8" stroke-width="4"/>
      <path d="M111,180 C111,173 129,173 129,180 L127,188 L123,188 L123,192 L117,192 L117,188 L113,188 Z" fill="#c084fc" opacity=".88"/>
      <circle cx="115" cy="181" r="2.8" fill="#1e1b4b"/><circle cx="125" cy="181" r="2.8" fill="#1e1b4b"/>
    </g>
  </svg>`,

  "zaman-carki": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azBrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#d97706"/><stop offset="1" stop-color="#78350f"/></linearGradient>
    </defs>
    <g class="fx-glitch-scan">
      <circle cx="120" cy="120" r="60" fill="none" stroke="#4ade80" stroke-width="4" stroke-dasharray="32 10" opacity=".85"/>
      <circle cx="120" cy="120" r="64" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="14 18"/>
    </g>
    <circle cx="120" cy="120" r="67" fill="none" stroke="url(#azBrass)" stroke-width="9"/>
    <g class="fx-spin-slow" transform-origin="68 68">
      <circle cx="68" cy="68" r="15" fill="none" stroke="url(#azBrass)" stroke-width="6" stroke-dasharray="6 4"/>
      <circle cx="68" cy="68" r="6" fill="#78350f" stroke="#fde68a" stroke-width="2"/>
    </g>
    <g class="fx-spin-rev" transform-origin="176 74">
      <circle cx="176" cy="74" r="13" fill="none" stroke="url(#azBrass)" stroke-width="5" stroke-dasharray="5 3"/>
      <circle cx="176" cy="74" r="5" fill="#78350f" stroke="#fde68a" stroke-width="2"/>
    </g>
    <path d="M50,118 L42,118 L42,64 L54,64 M190,114 L198,114 L198,154 L186,154" fill="none" stroke="url(#azBrass)" stroke-width="4" stroke-linecap="round"/>
    <g>
      <rect x="76" y="176" width="88" height="26" rx="4" fill="#451a03" stroke="url(#azBrass)" stroke-width="2.5"/>
      <g fill="#fde68a" stroke="#78350f" stroke-width="1">
        <circle cx="88" cy="185" r="4"/><circle cx="101" cy="185" r="4"/><circle cx="114" cy="185" r="4"/><circle cx="127" cy="185" r="4"/><circle cx="140" cy="185" r="4"/><circle cx="153" cy="185" r="4"/>
        <rect x="92" y="193" width="56" height="5" rx="2"/>
      </g>
    </g>
  </svg>`,

  "bonsai-sakura": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azBark" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4c0519"/><stop offset="1" stop-color="#9d174d"/></linearGradient>
    </defs>
    <circle cx="120" cy="120" r="60" fill="none" stroke="#f472b6" stroke-width="2" opacity=".55"/>
    <g class="fx-sway">
      <path d="M64,174 C98,196 154,196 184,178 C196,170 202,152 192,126 C188,108 192,84 176,66 C164,54 134,48 106,54 C132,58 158,64 170,80 C178,94 174,122 178,142 C178,162 156,178 122,180 C96,182 78,176 64,174 Z" fill="url(#azBark)" stroke="#fbcfe8" stroke-width="1.2"/>
      <g fill="#f472b6" stroke="#fbcfe8" stroke-width="1">
        <circle cx="72" cy="64" r="10"/><circle cx="92" cy="54" r="12"/><circle cx="116" cy="48" r="13"/><circle cx="142" cy="52" r="12"/><circle cx="166" cy="60" r="11"/><circle cx="182" cy="76" r="10"/><circle cx="188" cy="96" r="8"/>
      </g>
      <g fill="#fdf2f8">
        <circle cx="72" cy="64" r="4"/><circle cx="92" cy="54" r="5"/><circle cx="116" cy="48" r="5"/><circle cx="142" cy="52" r="5"/><circle cx="166" cy="60" r="4.5"/><circle cx="182" cy="76" r="4"/>
      </g>
    </g>
    <g class="az-feathers">
      <ellipse class="az-feather" style="--dx:-14px;--rot:120deg;animation-delay:0s;" cx="78" cy="78" rx="4" ry="2.2" fill="#f9a8d4"/>
      <ellipse class="az-feather" style="--dx:16px;--rot:-140deg;animation-delay:1.1s;" cx="148" cy="70" rx="4.2" ry="2.4" fill="#fbcfe8"/>
      <ellipse class="az-feather" style="--dx:-10px;--rot:160deg;animation-delay:2.2s;" cx="110" cy="64" rx="3.8" ry="2" fill="#f472b6"/>
      <ellipse class="az-feather" style="--dx:12px;--rot:-110deg;animation-delay:3.2s;" cx="174" cy="108" rx="4" ry="2.2" fill="#f9a8d4"/>
    </g>
  </svg>`,

  "pirate-king": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azPirHat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#991b1b"/><stop offset=".5" stop-color="#450a0a"/><stop offset="1" stop-color="#1c1917"/></linearGradient>
      <linearGradient id="azSword" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#64748b"/></linearGradient>
    </defs>
    <circle cx="120" cy="120" r="61" fill="none" stroke="#b45309" stroke-width="5"/>
    <g class="fx-sway">
      <path d="M58,180 L182,76 L186,82 L64,186 Z" fill="url(#azSword)" stroke="#1e293b" stroke-width="1.5"/>
      <path d="M182,180 L58,76 L54,82 L176,186 Z" fill="url(#azSword)" stroke="#1e293b" stroke-width="1.5"/>
      <path d="M46,62 C70,32 100,24 120,24 C140,24 170,32 194,62 C176,72 150,74 120,66 C90,74 64,72 46,62 Z" fill="url(#azPirHat)" stroke="#d97706" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="120" cy="48" r="8" fill="#f8fafc" stroke="#111" stroke-width="1.5"/>
      <circle cx="117" cy="47" r="1.6" fill="#111"/><circle cx="123" cy="47" r="1.6" fill="#111"/>
      <path d="M114,54 L126,54" stroke="#111" stroke-width="1.5"/>
    </g>
  </svg>`,

  "elit-yilan": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azSnk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".45" stop-color="#d97706"/><stop offset="1" stop-color="#78350f"/></linearGradient>
    </defs>
    <g class="fx-gold-shimmer">
      <circle cx="120" cy="120" r="63" fill="none" stroke="url(#azSnk)" stroke-width="12"/>
      <circle cx="120" cy="120" r="69" fill="none" stroke="#fde047" stroke-width="3" stroke-dasharray="12 6"/>
      <circle cx="120" cy="120" r="57" fill="none" stroke="#92400e" stroke-width="2.5" stroke-dasharray="8 8"/>
      <g fill="url(#azSnk)" stroke="#78350f" stroke-width="1.5">
        <path d="M108,54 C96,42 74,40 62,54 C54,64 60,76 74,74 C86,72 90,60 108,64 Z"/>
        <circle cx="72" cy="56" r="2.2" fill="#ef4444"/>
        <path d="M58,64 L48,68 M58,64 L50,60" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`,

  "purple-runes": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azRuneG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e879f9"/><stop offset=".5" stop-color="#9333ea"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
    </defs>
    <g class="fx-spin-slow">
      <circle cx="120" cy="120" r="64" fill="none" stroke="url(#azRuneG)" stroke-width="11" opacity=".92"/>
      <circle cx="120" cy="120" r="69" fill="none" stroke="#f0abfc" stroke-width="2" stroke-dasharray="5 9"/>
      <circle cx="120" cy="120" r="59" fill="none" stroke="#d8b4fe" stroke-width="1.5" opacity=".75"/>
      <path id="azRuneArc" d="M120,52 A68,68 0 1,1 119.9,52" fill="none"/>
      <text fill="#fdf4ff" font-size="10.5" font-weight="900" letter-spacing="5.5">
        <textPath href="#azRuneArc">✦ ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ✦ ᚷ ᚹ ᚺ ᚾ ᛁ ✦ ᛟ ᛉ ᛏ ᛗ</textPath>
      </text>
    </g>
  </svg>`,

  "golden-leo": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azLeo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    </defs>
    <g class="fx-spin-slow" stroke="url(#azLeo)" stroke-width="2.5" fill="url(#azLeo)">
      <circle cx="120" cy="120" r="63" fill="none" stroke-width="8"/>
      <polygon points="120,38 115,53 125,53"/><polygon points="120,202 115,187 125,187"/>
      <polygon points="38,120 53,115 53,125"/><polygon points="202,120 187,115 187,125"/>
      <polygon points="62,62 76,68 68,76"/><polygon points="178,62 164,68 172,76"/>
      <polygon points="62,178 76,172 68,164"/><polygon points="178,178 164,172 172,164"/>
    </g>
    <g class="fx-sway">
      <g transform="translate(86 58)"><circle cx="0" cy="0" r="10" fill="#fbbf24" stroke="#b45309" stroke-width="2" stroke-dasharray="3 2"/><circle cx="0" cy="0" r="5" fill="#78350f"/></g>
      <g transform="translate(154 58)"><circle cx="0" cy="0" r="10" fill="#fbbf24" stroke="#b45309" stroke-width="2" stroke-dasharray="3 2"/><circle cx="0" cy="0" r="5" fill="#78350f"/></g>
      <circle cx="120" cy="52" r="13" fill="#fef08a" stroke="#b45309" stroke-width="2.5"/>
      <text x="120" y="57" text-anchor="middle" font-size="14" font-weight="900" fill="#92400e">♌</text>
    </g>
  </svg>`,

  "golden-aura": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azGoldRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fde047"/><stop offset=".7" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    </defs>
    <circle cx="120" cy="120" r="64" fill="none" stroke="#f59e0b" stroke-width="11" opacity=".4" filter="blur(3px)"/>
    <circle cx="120" cy="120" r="63" fill="none" stroke="url(#azGoldRing)" stroke-width="7"/>
    <g class="fx-spin-slow">
      <circle cx="120" cy="120" r="68" fill="none" stroke="#fef08a" stroke-width="2" stroke-dasharray="55 185" stroke-linecap="round"/>
      <g transform="translate(76 76)">
        <path d="M0,-12 L2.5,-2.5 L12,0 L2.5,2.5 L0,12 L-2.5,2.5 L-12,0 L-2.5,-2.5 Z" fill="#fff"/>
      </g>
    </g>
  </svg>`,

  "black-hole": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azBhG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#d4d4d8"/><stop offset="1" stop-color="#78716c"/></linearGradient>
    </defs>
    <g class="fx-spin-fast">
      <ellipse cx="120" cy="120" rx="68" ry="61" fill="none" stroke="url(#azBhG)" stroke-width="8" opacity=".88"/>
      <ellipse cx="120" cy="120" rx="62" ry="69" fill="none" stroke="#fafafa" stroke-width="3" stroke-dasharray="65 28" opacity=".9"/>
    </g>
    <g class="fx-spin-rev">
      <circle cx="120" cy="120" r="73" fill="none" stroke="#e4e4e7" stroke-width="2" stroke-dasharray="28 18 12 24" opacity=".75"/>
      <circle cx="120" cy="47" r="2.5" fill="#fff"/><circle cx="185" cy="152" r="2" fill="#fde68a"/>
    </g>
  </svg>`,

  "venom-symbiote": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-venom-writhe">
      <circle cx="120" cy="120" r="63" fill="none" stroke="#030712" stroke-width="13"/>
      <circle cx="120" cy="120" r="64" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="14 18" opacity=".6"/>
      <path d="M120,56 Q106,30 128,14 M156,66 Q186,38 206,46 M180,98 Q216,86 226,108 M182,140 Q218,154 214,178 M152,174 Q176,208 164,226 M114,182 Q102,218 120,232 M78,170 Q46,200 32,184 M58,136 Q22,142 14,120 M62,92 Q28,74 38,52 M88,62 Q68,30 84,18" fill="none" stroke="#090d16" stroke-width="7.5" stroke-linecap="round"/>
      <path d="M120,56 Q106,30 128,14 M180,98 Q216,86 226,108 M152,174 Q176,208 164,226 M78,170 Q46,200 32,184 M62,92 Q28,74 38,52" fill="none" stroke="#e2e8f0" stroke-width="1.4" opacity=".75" stroke-linecap="round"/>
    </g>
  </svg>`,

  "flaming-bull": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azBullFire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b91c1c"/><stop offset=".55" stop-color="#f97316"/><stop offset="1" stop-color="#fef08a"/></linearGradient>
    </defs>
    <g class="fx-flame-rise">
      <circle cx="120" cy="122" r="63" fill="none" stroke="url(#azBullFire)" stroke-width="8"/>
      <path d="M64,158 Q88,196 120,192 Q152,196 176,158 Q154,180 120,180 Q86,180 64,158 Z" fill="url(#azBullFire)"/>
      <path d="M72,88 C42,68 38,34 74,26 C56,44 62,64 82,76 Z" fill="#1c1917" stroke="url(#azBullFire)" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M168,88 C198,68 202,34 166,26 C184,44 178,64 158,76 Z" fill="#1c1917" stroke="url(#azBullFire)" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="120" cy="52" r="12" fill="#1c1917" stroke="#fb923c" stroke-width="2.5"/>
      <text x="120" y="57" text-anchor="middle" font-size="14" font-weight="900" fill="#fde047">♈</text>
    </g>
  </svg>`,

  "cyclone-wind": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-spin-fast">
      <path d="M52,110 Q120,44 188,92" fill="none" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" opacity=".88"/>
      <path d="M62,152 Q128,198 192,134" fill="none" stroke="#a5f3fc" stroke-width="4.5" stroke-linecap="round" opacity=".9"/>
      <path d="M78,56 Q178,72 184,166" fill="none" stroke="#06b6d4" stroke-width="4" stroke-linecap="round" opacity=".78"/>
      <path d="M164,186 Q64,170 58,74" fill="none" stroke="#e0f2fe" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>
      <circle cx="186" cy="92" r="3" fill="#e0f2fe"/><circle cx="62" cy="152" r="2.5" fill="#7dd3fc"/>
    </g>
  </svg>`,

  "thunder-god": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <circle cx="120" cy="120" r="61" fill="none" stroke="#facc15" stroke-width="3" opacity=".6"/>
    <g class="fx-thunder">
      <polyline points="68,166 50,144 72,136 52,104 74,98" fill="none" stroke="#fde047" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="172,74 190,96 168,104 188,136 166,142" fill="none" stroke="#facc15" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="92,58 112,44 116,60 138,46" fill="none" stroke="#fef08a" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M62,162 C52,148 76,142 84,158 C90,170 72,184 56,178 C46,174 52,166 62,162 Z" fill="#fef08a" opacity=".92"/>
      <circle cx="69" cy="164" r="7" fill="#fff"/>
    </g>
  </svg>`,

  "cute-angel": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-float-svg">
      <ellipse cx="120" cy="44" rx="28" ry="7" fill="none" stroke="#111" stroke-width="7"/>
      <ellipse cx="120" cy="44" rx="28" ry="7" fill="none" stroke="#fde047" stroke-width="3.8"/>
      <g class="wing wing-l"><path d="M74,78 C54,50 38,58 48,76 C40,84 52,96 70,88 Z" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/></g>
      <g class="wing wing-r"><path d="M166,78 C186,50 202,58 192,76 C200,84 188,96 170,88 Z" fill="#fff" stroke="#111" stroke-width="2.5" stroke-linejoin="round"/></g>
      <g transform="translate(120 184)">
        <path d="M-12,-2 C-20,-10 -24,-2 -14,3 Z M12,-2 C20,-10 24,-2 14,3 Z" fill="#fff" stroke="#111" stroke-width="1.8"/>
        <path d="M0,10 C-12,2 -14,-8 -5,-8 C-2,-8 0,-4 0,-4 C0,-4 2,-8 5,-8 C14,-8 12,2 0,10 Z" fill="#f472b6" stroke="#111" stroke-width="2"/>
      </g>
      <circle cx="48" cy="136" r="2" fill="#fff"/><circle cx="192" cy="138" r="2.2" fill="#fef08a"/>
    </g>
  </svg>`,

  "tatli-ejderha": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azDrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>
    </defs>
    <g class="fx-float-svg">
      <circle cx="120" cy="120" r="76" fill="none" stroke="url(#azDrg)" stroke-width="24"/>
      <polygon points="74,46 60,26 88,38" fill="#6d28d9" stroke="#c4b5fd" stroke-width="1.5"/>
      <polygon points="166,46 180,26 152,38" fill="#6d28d9" stroke="#c4b5fd" stroke-width="1.5"/>
      <path d="M68,186 L62,204 L76,204 L82,190 M172,186 L178,204 L164,204 L158,190" fill="#4c1d95" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round"/>
      <g fill="#f8fafc" stroke="#4c1d95" stroke-width="1.2">
        <polygon points="94,58 100,71 106,58"/><polygon points="134,58 140,71 146,58"/>
        <polygon points="92,180 99,166 106,180"/><polygon points="134,180 141,166 148,180"/>
      </g>
      <g class="fx-thunder">
        <polyline points="72,96 84,84 78,76 92,66" fill="none" stroke="#e879f9" stroke-width="3" stroke-linecap="round"/>
        <polyline points="168,98 156,86 162,78 148,68" fill="none" stroke="#c084fc" stroke-width="3" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`,

  "venom-legend": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <g class="fx-venom-jaw">
      <circle cx="120" cy="120" r="68" fill="none" stroke="#090d16" stroke-width="22"/>
      <path d="M120,42 Q104,16 126,8 M174,56 Q204,34 218,46 M192,118 Q226,112 232,134 M168,186 Q198,214 188,228 M72,186 Q44,214 54,228 M48,118 Q14,112 8,134 M66,56 Q36,34 22,46" fill="none" stroke="#090d16" stroke-width="8" stroke-linecap="round"/>
      <path d="M74,64 C86,58 102,72 104,88 C90,88 76,78 74,64 Z" fill="#f8fafc" stroke="#111" stroke-width="2"/>
      <path d="M166,64 C154,58 138,72 136,88 C150,88 164,78 166,64 Z" fill="#f8fafc" stroke="#111" stroke-width="2"/>
      <g fill="#f8fafc" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round">
        <polygon points="78,100 88,118 96,102"/><polygon points="162,100 152,118 144,102"/>
        <polygon points="76,162 88,140 96,164"/><polygon points="96,170 108,144 116,174"/>
        <polygon points="116,174 124,146 132,174"/><polygon points="132,170 144,144 154,164"/>
        <polygon points="154,162 164,140 168,162"/>
      </g>
    </g>
  </svg>`,

  "phoenix-wings": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azPhxW" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fde047"/><stop offset=".45" stop-color="#f97316"/><stop offset="1" stop-color="#dc2626"/></linearGradient>
      <g id="azPhxR">
        <path fill="url(#azPhxW)" d="M160,154 C196,136 226,88 228,36 C206,68 184,104 156,138 Z"/>
        <path fill="url(#azPhxW)" d="M158,162 C202,150 226,118 234,76 C208,104 182,128 152,150 Z"/>
        <path fill="#fb923c" d="M152,168 C192,168 218,148 226,116 C198,136 172,148 144,158 Z"/>
        <path fill="#fde047" opacity=".9" d="M126,176 C152,190 176,184 192,164 C170,168 146,166 122,168 Z"/>
      </g>
    </defs>
    <g class="fx-flame-rise">
      <circle cx="120" cy="120" r="61" fill="none" stroke="#f97316" stroke-width="5" opacity=".75"/>
      <g class="wing wing-r"><use href="#azPhxR"/></g>
      <g class="wing wing-l"><use href="#azPhxR" transform="translate(240 0) scale(-1 1)"/></g>
    </g>
  </svg>`,

  "dark-angel": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azDkWing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090d16"/><stop offset=".68" stop-color="#1e293b"/><stop offset="1" stop-color="#f8fafc"/></linearGradient>
      <g id="azDkR">
        <path fill="url(#azDkWing)" stroke="#e2e8f0" stroke-width="1.2" d="M158,118 C184,64 214,34 234,26 C224,62 198,96 164,126 Z"/>
        <path fill="url(#azDkWing)" stroke="#e2e8f0" stroke-width="1.2" d="M162,126 C192,88 220,72 238,70 C220,98 192,120 162,134 Z"/>
        <path fill="url(#azDkWing)" stroke="#cbd5e1" stroke-width="1.1" d="M162,134 C192,116 218,112 234,122 C212,136 184,142 158,142 Z"/>
        <path fill="url(#azDkWing)" stroke="#cbd5e1" stroke-width="1.1" d="M154,142 C180,144 206,154 218,174 C194,174 168,162 146,150 Z"/>
      </g>
    </defs>
    <g class="wing wing-r"><use href="#azDkR"/></g>
    <g class="wing wing-l"><use href="#azDkR" transform="translate(240 0) scale(-1 1)"/></g>
    <g class="az-feathers">
      <path class="az-feather" style="--dx:-12px;--rot:-130deg;animation-delay:0s;" fill="#1e293b" stroke="#e2e8f0" stroke-width=".8" d="M62,72 C66,74 66,84 62,88 C58,84 58,74 62,72 Z"/>
      <path class="az-feather" style="--dx:14px;--rot:140deg;animation-delay:1.2s;" fill="#0f172a" stroke="#f8fafc" stroke-width=".8" d="M178,72 C182,74 182,84 178,88 C174,84 174,74 178,72 Z"/>
      <path class="az-feather" style="--dx:-8px;--rot:-110deg;animation-delay:2.4s;" fill="#1e293b" stroke="#e2e8f0" stroke-width=".8" d="M110,48 C114,50 114,60 110,64 C106,60 106,50 110,48 Z"/>
    </g>
  </svg>`,

  "fallen-angel": `<svg class="fx-svg" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="azWingA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e2e8f0"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>
      <linearGradient id="azWingB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>
      <g id="azWingR">
        <path fill="url(#azWingA)" d="M158,116 C182,64 210,36 234,30 C220,66 194,98 164,124 Z"/>
        <path fill="url(#azWingA)" d="M162,124 C192,88 220,76 238,78 C216,102 190,120 162,132 Z"/>
        <path fill="url(#azWingB)" d="M162,132 C190,114 216,112 232,124 C210,136 184,140 158,140 Z"/>
        <path fill="url(#azWingB)" opacity=".94" d="M154,140 C178,144 202,158 212,182 C188,180 166,162 146,148 Z"/>
      </g>
    </defs>
    <ellipse cx="120" cy="34" rx="30" ry="7" fill="none" stroke="#fde047" stroke-width="3.5" opacity=".92"/>
    <g class="wing wing-r"><use href="#azWingR"/></g>
    <g class="wing wing-l"><use href="#azWingR" transform="translate(240 0) scale(-1 1)"/></g>
    <g class="az-feathers">
      <path class="az-feather" style="--dx:-10px;--rot:-120deg;animation-delay:0s;" fill="#f8fafc" opacity=".92" d="M68,66 C71,68 71,76 68,80 C65,76 65,68 68,66 Z"/>
      <path class="az-feather" style="--dx:14px;--rot:150deg;animation-delay:.8s;" fill="#eef2f9" opacity=".88" d="M101,46 C104,48 104,56 101,60 C98,56 98,48 101,46 Z"/>
      <path class="az-feather" style="--dx:-16px;--rot:-160deg;animation-delay:1.6s;" fill="#f8fafc" opacity=".92" d="M172,66 C175,68 175,76 172,80 C169,76 169,68 172,66 Z"/>
      <path class="az-feather" style="--dx:12px;--rot:135deg;animation-delay:2.4s;" fill="#eef2f9" opacity=".88" d="M139,46 C142,48 142,56 139,60 C136,56 136,48 139,46 Z"/>
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
function userLinkHtml(username, innerHtml) {
  if (!username || username === "AzForces") return innerHtml;
  return `<span class="user-link" onclick="event.stopPropagation();openFullProfile(${q(username)})">${innerHtml}</span>`;
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

/* ── DRAWER & NAVİQASİYA ── */
function toggleLeftDrawer(force) {
  const d = el("leftDrawer"), b = el("leftBackdrop"), open = force !== undefined ? force : !d.classList.contains("open");
  d.classList.toggle("open", open); b.classList.toggle("open", open);
}
function toggleProfileDrawer() {}
function togglePdSub(id) { const n = el(id); if (n) n.style.display = n.style.display === "none" ? "block" : "none"; }
function openMyProfileTab(subTab) {
  if (!me.authenticated) return openAuthModal();
  return openFullProfile(me.username, subTab || "overview");
}
function switchTab(tab) {
  toggleLeftDrawer(false);
  if (tab === "shop") return openMyProfileTab("shop");
  if (tab === "games") return openMyProfileTab("games");
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
        ${userLinkHtml(r.username, renderNameWithRank(r.username, r.is_admin_user, r.user_rating))}
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
  currentProfileUser = "";
  await syncMe(); switchTab("welcome"); toast("Çıxış edildi");
}

/* ── ADMİN META & PROFİL SƏHİFƏSİ (Çərçivə + Oyunlar + Ayarlar daxilində) ── */
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

async function sendCoinsToUser() {
  if (!me.authenticated) return openAuthModal();
  const u = el("coinTargetInput").value.trim().replace(/^@/, ""), amt = parseInt(el("coinAmtInput").value, 10);
  if (!u || !amt || amt <= 0) return toast("İstifadəçi adı və düzgün miqdar yazın!", true);
  const r = await fetch("/api/coins/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, amount: amt }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok);
  if (r.ok) { el("coinTargetInput").value = ""; el("coinAmtInput").value = ""; await syncMe(); openFullProfile(me.username, currentProfileSubTab); }
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
  if (r.ok) { await syncMe(); openFullProfile(me.username, currentProfileSubTab); }
}
async function saveProfileBio() {
  const r = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: el("profBioInput").value, avatar_color: el("profColorInput").value }) });
  if (r.ok) { await syncMe(); openFullProfile(me.username, currentProfileSubTab); toast("Yadda saxlanıldı!"); }
  else toast((await r.json()).error || "Xəta", true);
}
async function sendFriendRequestTo(target) {
  const r = await fetch("/api/friends/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: target }) });
  const d = await r.json(); toast(d.message || d.error, !r.ok); return r.ok;
}
async function sendFriendRequest() { const i = el("addFriendInput"); if (await sendFriendRequestTo(i.value.trim())) i.value = ""; }
async function respondFriend(username, action) {
  await fetch("/api/friends/respond", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, action }) });
  openFullProfile(me.username, "settings");
}

function switchProfileSubTab(sub) {
  const isMe = me.authenticated && currentProfileUser.toLowerCase() === me.username.toLowerCase();
  const target = (isMe || sub === "overview") ? sub : "overview";
  currentProfileSubTab = target;

  document.querySelectorAll(".prof-sub-btn").forEach(b => b.classList.toggle("active", b.dataset.psub === target));
  const map = { overview: "profPaneOverview", shop: "profPaneShop", games: "profPaneGames", settings: "profPaneSettings" };
  Object.entries(map).forEach(([k, id]) => {
    const node = el(id); if (node) node.style.display = (k === target) ? "block" : "none";
  });

  if (target === "shop") loadShop();
}

async function openFullProfile(uname, subTab) {
  if (!me.authenticated) return openAuthModal();
  const r = await fetch(`/api/users/${encodeURIComponent(uname)}`);
  if (!r.ok) return toast("Profil tapılmadı", true);
  const p = await r.json();
  currentProfileUser = p.username;
  const isMe = me.authenticated && p.username.toLowerCase() === me.username.toLowerCase();

  switchTab("profile");
  setAvatar("fpAvatarWrap", "fpAvatarImg", "fpAvatarTxt", "av-xl", p);
  el("fpName").innerHTML = renderName(p.username, p.is_admin_user);
  applyRankEl(el("fpRank"), p.rating, p.is_admin_user);
  el("fpBio").textContent = p.bio || "Bio yazılmayıb.";
  el("fpLvlBadge").textContent = `Səviyyə ${p.level}`;
  el("fpCoinsBadge").style.display = isMe ? "inline-block" : "none";
  el("fpCoinsBadge").textContent = `🪙 ${p.infinite_coins ? "∞" : p.coins}`;
  el("fpRatingBadge").textContent = `Reytinq: ${p.rating}`;
  el("fpStreakBadge").textContent = `🔥 ${p.streak} gün`;
  el("fpSolvedBadge").textContent = `✔ ${p.solved_count} həll`;
  el("fpXpNums").textContent = `${p.xp} / ${p.needed_xp} XP`;
  el("fpXpFill").style.width = `${p.progress_pct}%`;
  applyAdminMeta("fp", p);

  ["psubShopBtn", "psubGamesBtn", "psubSettingsBtn"].forEach(id => {
    const b = el(id); if (b) b.style.display = isMe ? "inline-flex" : "none";
  });

  el("fpActions").innerHTML = isMe
    ? `<button class="btn btn-sm btn-danger" onclick="logoutAll()">🚪 Hesabdan Çıx</button>`
    : `<button class="btn btn-primary btn-sm" onclick="switchTab('chat');switchChatMode('dm');openDmWith(${q(p.username)})">💬 Mesaj Yaz</button>
       <button class="btn btn-success btn-sm" onclick="quickSendCoins(${q(p.username)})">🪙 Coin Göndər</button>
       <button class="btn btn-sm" onclick="sendFriendRequestTo(${q(p.username)})">+ Dost Ol</button>`;

  if (isMe) {
    el("profBioInput").value = p.bio || "";
    el("profColorInput").value = p.avatar_color || "#3b82f6";
    el("fpIncomingReqs").innerHTML = (p.incoming_requests || []).map(u => `
      <div class="row" style="justify-content:space-between;font-size:.82rem;margin-bottom:6px;">
        <span class="user-link" onclick="openFullProfile(${q(u)})">${esc(u)}</span>
        <span><button class="btn btn-sm btn-success" onclick="respondFriend(${q(u)},'accept')">✔</button> <button class="btn btn-sm btn-danger" onclick="respondFriend(${q(u)},'reject')">✕</button></span>
      </div>`).join("");
    el("fpFriendsList").innerHTML = (p.friends || []).length
      ? p.friends.map(f => `
        <div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.84rem;">
          <span class="user-link" onclick="openFullProfile(${q(f.username)})">${renderName(f.username, f.is_admin_user)} <span class="muted">Lv.${f.level}</span></span>
          <button class="btn btn-sm btn-primary" onclick="switchTab('chat');switchChatMode('dm');openDmWith(${q(f.username)})">💬</button>
        </div>`).join("")
      : `<div class="muted" style="font-size:.82rem;">Dost yoxdur.</div>`;
  }

  el("fpRecentSolved").innerHTML = (p.recent_solved || []).length
    ? p.recent_solved.map(s => `<div style="padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openProblem(${q(s.code_label || s.id)})">✔ <strong>${esc(s.code_label)}. ${esc(s.title)}</strong> <span class="muted">(${s.rating})</span></div>`).join("")
    : `<span class="muted">Hələ yoxdur.</span>`;
  renderHeatmap(p.heatmap || {});
  drawRatingChart((p.rating_history && p.rating_history.length) ? p.rating_history : [{ rating: p.rating }]);
  switchProfileSubTab(isMe ? (subTab || "overview") : "overview");
}

function renderHeatmap(heat) {
  const grid = el("profileHeatmap"); if (!grid) return; grid.innerHTML = "";
  const now = new Date();
  for (let i = 167; i >= 0; i--) {
    const key = new Date(today.getTime() + 4 * 3600000 - i * 86400000).toISOString().slice(0, 10), count = heatmap[key] || 0;
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

/* ── QEYDİYYATLAR PƏNCƏRƏSİ ── */
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
    const cmtHtml = (p.comments || []).map(c => `<div class="comment-item ${c.parent_id ? 'comment-reply' : ''}">${userLinkHtml(c.author, renderName(c.author, c.is_admin_user))}: ${esc(c.body)} <button class="btn btn-sm" style="padding:1px 6px;font-size:.7rem;" onclick="replyComment(${p.id},${c.id},${q(c.author)})">Cavabla</button></div>`).join("");
    return `<div class="card post-card ${p.is_pinned ? 'pinned' : ''}">
      <div class="row" style="justify-content:space-between;"><strong>${p.is_pinned ? '📌 ' : ''}${esc(p.title)}</strong>
        <span class="muted" style="font-size:.8rem;">${userLinkHtml(p.author, renderName(p.author, p.is_admin_user))} · ${esc(p.created_at)} ${me.is_admin ? `<button class="btn btn-sm btn-danger" onclick="deletePost(${p.id})">Sil</button>` : ''}</span>
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
async function deletePost(pid) { await fetch(`/api/posts/${pid}`, { method: "DELETE" }); loadPosts(); }/* ── MƏSƏLƏLƏR ── */
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
  el("probAuthorMeta").innerHTML = `Müəllif: ${userLinkHtml(p.author, renderName(p.author, p.author_is_admin))} | Reytinq: ${p.rating}`;
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
    const bodyHtml = m.audio_url ? voiceBubbleHtml(m) : `<div>${userLinkHtml(m.username, renderName(m.username, m.is_admin_user))}: ${esc(m.message)}</div>`;
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
      <div><h3 style="margin:0;">${esc(rm.title)}</h3><div class="muted" style="font-size:.82rem;">Yaradıcı: ${userLinkHtml(rm.creator, esc(rm.creator))} · Kod: ${rm.room_code.replace(/(.{4})/g, "$1-").slice(0, -1)}</div></div></div>
    <p style="font-size:.88rem;margin:0 0 12px;">${esc(rm.bio)}</p>
    ${isCr ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Qrup Profilini Düzəlt</strong>
      <input id="gpTitle" value="${esc(rm.title)}" style="margin-top:6px;"><textarea id="gpBio" rows="2" style="margin-top:6px;">${esc(rm.bio)}</textarea>
      <div class="row" style="margin-top:6px;"><input id="gpAvUrl" value="${esc(rm.avatar_url || '')}" placeholder="Şəkil linki" style="flex:1;"><input id="gpColor" type="color" value="${esc(rm.avatar_color)}" style="width:46px;height:34px;padding:2px;"></div>
      <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="saveGroupProfile()">Yenilə</button></div>` : ""}
    ${(d.shared_problems || []).length ? `<div class="prof-box" style="margin-bottom:10px;"><strong style="font-size:.84rem;">Paylaşılan Suallar</strong><div style="margin-top:6px;">${d.shared_problems.map(p => `<button class="btn btn-sm" style="margin:2px;" onclick="closeModal('groupProfileModal');openProblem(${q(p.code_label || p.id)})">${esc(p.code_label)}. ${esc(p.title)}</button>`).join("")}</div></div>` : ""}
    <div class="prof-box"><strong style="font-size:.84rem;">Üzvlər (${d.members.length}/20)</strong>
      ${d.members.map(m => `<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.84rem;">
        <span class="user-link" onclick="closeModal('groupProfileModal');openFullProfile(${q(m.username)})">${renderName(m.username, m.is_admin_user)} <span class="muted">Lv.${m.level}</span> ${m.username === rm.creator ? '<span class="badge">Admin</span>' : ''}</span>
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
  activeDmPartner = u; lastDmMsgId = 0; dmReplyId = null; el("dmChatBox").innerHTML = "";
  el("dmPartnerTitle").innerHTML = userLinkHtml(u, `✈️ @${esc(u)}`);
  pollDm(); clearInterval(dmPollTimer); dmPollTimer = setInterval(() => { if (!document.hidden && activeDmPartner) pollDm(); }, 3000);
}
function closeDm() { activeDmPartner = ""; clearInterval(dmPollTimer); el("dmChatBox").innerHTML = ""; el("dmPartnerTitle").textContent = "✈️ —"; }
function replyDmMsg(id, author, text) { dmReplyId = id; el("dmReplyText").textContent = `↩ ${author}: ${String(text).slice(0, 45)}`; el("dmReplyBanner").style.display = "flex"; el("dmChatInput").focus(); }
function cancelDmReply() { dmReplyId = null; el("dmReplyBanner").style.display = "none"; }
async function pollDm() {
  if (!activeDmPartner) return;
  const r = await fetch(`/api/dm/${encodeURIComponent(activeDmPartner)}?after_id=${lastDmMsgId}`); if (!r.ok) return;
  const d = await r.json(), box = el("dmChatBox");
  el("dmPartnerTitle").innerHTML = userLinkHtml(d.partner, `✈️ ${renderName(d.partner, d.partner_is_admin)}`);
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

/* ── MAĞAZA (PROFİL DAXİLİNDƏ) ── */
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
  toast(d.message || d.error, !r.ok); await syncMe(); await loadShop();
  if (el("tab-profile")?.classList.contains("active") && currentProfileUser.toLowerCase() === (me.username || "").toLowerCase()) {
    setAvatar("fpAvatarWrap", "fpAvatarImg", "fpAvatarTxt", "av-xl", me);
    if (el("fpCoinsBadge")) el("fpCoinsBadge").textContent = `🪙 ${me.infinite_coins ? "∞" : me.coins}`;
  }
}
async function equipItem(id) {
  const r = await fetch("/api/shop/equip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: id }) }), d = await r.json();
  toast(d.message || d.error, !r.ok); await syncMe(); await loadShop();
  if (el("tab-profile")?.classList.contains("active") && currentProfileUser.toLowerCase() === (me.username || "").toLowerCase()) {
    setAvatar("fpAvatarWrap", "fpAvatarImg", "fpAvatarTxt", "av-xl", me);
  }
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

/* ── 5 DƏQİQƏLİK ÇƏTİN RİYAZİ OYUN + BULLS & COWS (PROFİL DAXİLİNDƏ) ── */
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
    <p style="margin:0 0 6px;"><strong>Müəllif:</strong> ${userLinkHtml(p.author, esc(p.author))} · <strong>Kod yoxlaması:</strong> ${esc(p.author_check_status || "—")} · <strong>Teqlər:</strong> ${esc(p.tags)}</p>
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
      return `<tr class="clickable" onclick="openSubModal(${i})"><td>#${s.id}</td><td>${userLinkHtml(s.username, renderName(s.username, s.is_admin_user))}</td><td>${esc(s.problem_title)}</td><td>${esc(s.language)}</td>
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
    <div class="muted" style="font-size:.78rem;">${userLinkHtml(c.author, renderName(c.author, c.is_admin_user))}</div><p class="muted" style="font-size:.84rem;">${esc(c.description)}</p>
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
    <tr><td>${userLinkHtml(u.username, renderNameWithRank(u.username, u.is_admin_user, u.rating))}
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
