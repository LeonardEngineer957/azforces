let me = {
  authenticated: false, username: null, is_admin: false, infinite_coins: false,
  human_verified: false, guest_remaining_sec: null, level: 1, xp: 0, needed_xp: 100,
  coins: 0, rating: 800, university: "", university_name: "Seçilməyib",
  avatar_url: "", avatar_color: "#3b82f6", avatar_frame: "none",
  rank_title: "Beginner", rank_color: "#9ca3af", is_creator: false,
  pending_proposals_count: 0, custom_frames: [], universities: []
};
let customFramesMap = {};
let allProblems = [], currentProblem = null, solveCM = null, pgCM = null;
let submissionsCache = [], adminUsersCache = [], forwardPid = null, guestTimer = null;
let activeRoomCode = "", activeRoomData = null, roomPollTimer = null, lastRoomMsgId = 0, roomReplyId = null;
let activeServerId = 0, activeChannelId = 0, activeServerData = null, serverPollTimer = null, lastServerMsgId = 0, serverReplyId = null;
let activeDmPartner = "", dmPollTimer = null, lastDmMsgId = 0, dmReplyId = null;
let bullsGameId = "", calcGameId = "", calcTimerInt = null, lastCalcQid = "";
let dailyTimerInterval = null, dailyProblemKey = null;
let shopCache = null, shopFilterCategory = "all";
let voiceRecorder = null, voiceChunks = [], voiceStream = null, voiceTimerInt = null, voiceStartTs = 0, voiceActiveMode = "";
let pendingExpanded = false, creativeCache = [], pingStarted = false;
let roomPolling = false, dmPolling = false, serverPolling = false;
let sendingRoom = false, sendingDm = false, sendingServer = false;
let currentProfileUser = "", currentProfileSubTab = "overview";
let currentProblemsSub = "archive", currentReadSub = "statement", currentLbScope = "world";

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
function uniBadgeHtml(uniCode) {
  const c = String(uniCode || "").trim().toUpperCase();
  if (!c) return "";
  return `<span class="uni-badge" title="${esc(c)}">${esc(c)}</span>`;
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
  switchTab("home", "announcements"); toast("5 dəqiqəlik qonaq rejimi başladı!");
}
function runGuestTimer(sec) {
  clearInterval(guestTimer); const pill = el("hdrGuestPill"); if (!pill) return;
  if (me.authenticated || sec === null || sec === undefined) { pill.style.display = "none"; return; }
  let left = sec;
  const tick = () => {
    if (me.authenticated) { pill.style.display = "none"; clearInterval(guestTimer); return; }
    if (left <= 0) { pill.style.display = "none"; clearInterval(guestTimer); switchTab("home", "welcome"); openAuthModal(); toast("5 dəqiqəlik qonaq vaxtı bitdi — hesab açın!", true); return; }
    pill.style.display = "inline-block";
    pill.textContent = `Qonaq ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    left--;
  };
  tick(); guestTimer = setInterval(tick, 1000);
}

/* ── DRAWER & 7-DÜYMƏLİ NAVİQASİYA + CODEFORCES TABLARI ── */
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

function switchHomeSub(sub) {
  const s = sub || "announcements";
  document.querySelectorAll("#tab-home .cf-tab-btn[data-hsub]").forEach(b => b.classList.toggle("active", b.dataset.hsub === s));
  if (el("homePaneAnnouncements")) el("homePaneAnnouncements").style.display = s === "announcements" ? "block" : "none";
  if (el("homePaneWelcome")) el("homePaneWelcome").style.display = s === "welcome" ? "block" : "none";
  if (s === "announcements") loadPosts();
  if (s === "welcome") loadWelcomeReviews();
}

function switchProblemsSub(sub) {
  const s = sub || "archive";
  currentProblemsSub = s;
  document.querySelectorAll("#problemsMainTabs .cf-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.psub === s));
  if (el("problemsMainTabs")) el("problemsMainTabs").style.display = "flex";
  if (el("problemReadView")) el("problemReadView").style.display = "none";

  const map = {
    archive: "probPaneArchive", gym: "probPaneGym", daily: "probPaneDaily",
    submit: "probPaneSubmit", submissions: "probPaneSubmissions", propose: "probPanePropose"
  };
  Object.entries(map).forEach(([k, id]) => {
    const n = el(id); if (n) n.style.display = (k === s) ? "block" : "none";
  });

  if (s === "submit") {
    const box = el("solveEditorBox"), host = el("probPaneSubmit");
    if (box && host && box.parentElement !== host) host.appendChild(box);
    if (solveCM) setTimeout(() => solveCM.refresh(), 50);
    lookupSubmitProblem();
  }
  if (s === "archive") loadProblems("archive");
  if (s === "gym") loadGym();
  if (s === "daily") loadDailyChallenge();
  if (s === "submissions") loadSubmissions();
  if (s === "propose") { loadMyProposals(); if (me.is_admin) loadAdminPendingBar(); }
}

function switchReadSub(sub) {
  const s = sub || "statement";
  currentReadSub = s;
  document.querySelectorAll("#problemReadView .cf-tab-btn[data-rsub]").forEach(b => b.classList.toggle("active", b.dataset.rsub === s));
  const map = { statement: "readPaneStatement", solve: "readPaneSolve", mysubs: "readPaneMySubs" };
  Object.entries(map).forEach(([k, id]) => {
    const n = el(id); if (n) n.style.display = (k === s) ? "block" : "none";
  });
  if (s === "solve") {
    const box = el("solveEditorBox"), host = el("readPaneSolve");
    if (box && host && box.parentElement !== host) host.appendChild(box);
    if (currentProblem) el("subProbCode").value = currentProblem.code_label || currentProblem.id;
    lookupSubmitProblem();
    if (solveCM) setTimeout(() => solveCM.refresh(), 50);
  }
  if (s === "mysubs") loadProblemSubmissions();
}

function switchLabSub(sub) {
  const s = sub || "pg";
  document.querySelectorAll("#tab-playground .cf-tab-btn[data-lsub]").forEach(b => b.classList.toggle("active", b.dataset.lsub === s));
  if (el("labPanePg")) el("labPanePg").style.display = s === "pg" ? "block" : "none";
  if (el("labPaneCreative")) el("labPaneCreative").style.display = s === "creative" ? "block" : "none";
  if (s === "pg" && pgCM) setTimeout(() => pgCM.refresh(), 50);
  if (s === "creative") loadCreative();
}

function switchLeaderScope(sub) {
  const s = sub || "world";
  document.querySelectorAll("#tab-leaderboard .cf-tab-btn[data-lbsub]").forEach(b => b.classList.toggle("active", b.dataset.lbsub === s));
  const isReg = (s === "registrations");
  if (el("lbPaneTable")) el("lbPaneTable").style.display = isReg ? "none" : "block";
  if (el("lbPaneRegistrations")) el("lbPaneRegistrations").style.display = isReg ? "block" : "none";
  if (isReg) loadRegistrations("weekly");
  else { currentLbScope = s; loadLeaderboard(s); }
}

function switchTab(tab, sub) {
  toggleLeftDrawer(false);
  if (tab === "welcome") return switchTab("home", "welcome");
  if (tab === "announcements") return switchTab("home", "announcements");
  if (tab === "gym") return switchTab("problems", "gym");
  if (tab === "daily") return switchTab("problems", "daily");
  if (tab === "submit") return switchTab("problems", "submit");
  if (tab === "submissions") return switchTab("problems", "submissions");
  if (tab === "propose") return switchTab("problems", "propose");
  if (tab === "creative") return switchTab("playground", "creative");
  if (tab === "registrations") return switchTab("leaderboard", "registrations");
  if (tab === "shop") return openMyProfileTab("shop");
  if (tab === "games") return openMyProfileTab("games");

  const sec = el("tab-" + tab); if (!sec) return;
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".drawer-item").forEach(b => b.classList.remove("active"));
  sec.classList.add("active");
  const nav = document.querySelector(`.drawer-item[data-tab="${tab}"]`);
  if (nav) nav.classList.add("active");

  if (tab === "home") switchHomeSub(sub || "announcements");
  if (tab === "problems") switchProblemsSub(sub || currentProblemsSub || "archive");
  if (tab === "contests") loadContests();
  if (tab === "chat") switchChatMode(sub || "servers");
  if (tab === "leaderboard") switchLeaderScope(sub || currentLbScope || "world");
  if (tab === "playground") switchLabSub(sub || "pg");
  if (tab === "admin" && me.is_admin) loadAdminData();
    }
