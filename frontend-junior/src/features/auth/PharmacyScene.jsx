import { Capsule, Plus } from './shapes'

// Organic blob shape used as the frame of the illustration.
// The left side extends outside the box, so the SVG uses overflow: visible.
const BLOB =
  'M200 0 C105 66 0 140 0 262 C0 380 150 380 250 470 C320 532 370 600 420 640 L700 640 L700 0 Z'

// Products on the wall shelves. y is the shelf position, x/w/h are sizes.
const SHELVES = [
  {
    y: 190,
    items: [
      { type: 'bottle', x: 46, h: 46, color: '#bfdbfe' },
      { type: 'box', x: 82, w: 30, h: 40, color: '#ffffff', accent: '#2563eb' },
      { type: 'box', x: 118, w: 34, h: 44, color: '#ffffff', accent: '#3b82f6' },
      { type: 'bottle', x: 162, h: 46, color: '#93c5fd' },
      { type: 'box', x: 202, w: 34, h: 44, color: '#dbeafe', accent: '#2563eb' },
      { type: 'bottle', x: 246, h: 46, color: '#60a5fa' },
      { type: 'box', x: 286, w: 30, h: 36, color: '#ffffff', accent: '#6366f1' },
      { type: 'bottle', x: 326, h: 50, color: '#3b82f6' },
      { type: 'box', x: 366, w: 40, h: 50, color: '#ffffff', accent: '#2563eb' },
      { type: 'bottle', x: 420, h: 44, color: '#bfdbfe' },
      { type: 'bottle', x: 470, h: 40, color: '#a5b4fc' },
      { type: 'box', x: 510, w: 36, h: 46, color: '#ffffff', accent: '#3b82f6' },
      { type: 'bottle', x: 556, h: 44, color: '#93c5fd' },
      { type: 'box', x: 596, w: 34, h: 40, color: '#e0e7ff', accent: '#4f46e5' },
      { type: 'bottle', x: 640, h: 46, color: '#60a5fa' },
    ],
  },
  {
    y: 290,
    items: [
      { type: 'box', x: 24, w: 36, h: 44, color: '#dbeafe', accent: '#3b82f6' },
      { type: 'bottle', x: 68, h: 44, color: '#60a5fa' },
      { type: 'box', x: 118, w: 36, h: 44, color: '#ffffff', accent: '#2563eb' },
      { type: 'bottle', x: 162, h: 42, color: '#bfdbfe' },
      { type: 'box', x: 202, w: 38, h: 46, color: '#dbeafe', accent: '#3b82f6' },
      { type: 'bottle', x: 248, h: 46, color: '#60a5fa' },
      { type: 'box', x: 288, w: 32, h: 38, color: '#ffffff', accent: '#6366f1' },
      { type: 'bottle', x: 330, h: 48, color: '#93c5fd' },
      { type: 'bottle', x: 566, h: 44, color: '#3b82f6' },
      { type: 'box', x: 604, w: 40, h: 48, color: '#ffffff', accent: '#2563eb' },
      { type: 'bottle', x: 652, h: 40, color: '#a5b4fc' },
    ],
  },
  {
    y: 390,
    items: [
      { type: 'box', x: 150, w: 44, h: 52, color: '#ffffff', accent: '#3b82f6' },
      { type: 'bottle', x: 204, h: 44, color: '#60a5fa' },
      { type: 'box', x: 244, w: 40, h: 48, color: '#dbeafe', accent: '#2563eb' },
      { type: 'bottle', x: 292, h: 46, color: '#93c5fd' },
      { type: 'box', x: 330, w: 34, h: 40, color: '#ffffff', accent: '#6366f1' },
    ],
  },
]

// y is the bottom position of the item
function MedBox({ x, y, w = 34, h = 44, color = '#ffffff', accent = '#3b82f6' }) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} rx="3" fill={color} />
      <rect x={x} y={y - h + 8} width={w} height="6" fill={accent} opacity="0.9" />
      <rect x={x + 6} y={y - h + 21} width={w - 12} height="3" rx="1.5" fill={accent} opacity="0.5" />
      <rect x={x + 6} y={y - h + 28} width={w - 20} height="3" rx="1.5" fill={accent} opacity="0.35" />
    </g>
  )
}

function Bottle({ x, y, w = 26, h = 46, color = '#60a5fa', cap = '#1e3a8a' }) {
  return (
    <g>
      <rect x={x + w * 0.18} y={y - h - 9} width={w * 0.64} height="12" rx="3" fill={cap} />
      <rect x={x} y={y - h} width={w} height={h} rx="7" fill={color} />
      <rect x={x + 4} y={y - h + 14} width={w - 8} height={h * 0.45} rx="3" fill="#ffffff" opacity="0.92" />
      <rect x={x + w / 2 - 1.5} y={y - h + 19} width="3" height={h * 0.45 - 10} rx="1.5" fill={color} />
    </g>
  )
}

export default function PharmacyScene() {
  return (
    <svg
      className="login-scene"
      viewBox="0 0 700 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="scene-clip">
          <path d={BLOB} />
        </clipPath>
        <linearGradient id="scene-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8f0ff" />
          <stop offset="100%" stopColor="#cddfff" />
        </linearGradient>
        <linearGradient id="scene-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c3d7ff" />
          <stop offset="100%" stopColor="#98b6f8" />
        </linearGradient>
      </defs>

      {/* Outer band and main blob */}
      <path className="scene-band" d={BLOB} transform="translate(-16 0)" fill="#b9cffc" />
      <path d={BLOB} fill="url(#scene-wall)" />

      <g clipPath="url(#scene-clip)">
        {/* Hanging Rx sign */}
        <line x1="262" y1="0" x2="262" y2="44" stroke="#8fb0f7" strokeWidth="2" />
        <line x1="304" y1="0" x2="304" y2="44" stroke="#8fb0f7" strokeWidth="2" />
        <rect x="240" y="44" width="84" height="52" rx="10" fill="#ffffff" stroke="#b8cdf7" strokeWidth="2" />
        <text
          x="282"
          y="81"
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fontStyle="italic"
          fontFamily="Georgia, 'Times New Roman', serif"
          fill="#2563eb"
        >
          Rx
        </text>

        {/* Shelves and products */}
        {SHELVES.map((shelf) => (
          <g key={shelf.y}>
            <rect x="-40" y={shelf.y} width="760" height="9" rx="3" fill="#8fb0f7" />
            {shelf.items.map((item) =>
              item.type === 'box' ? (
                <MedBox key={item.x} y={shelf.y} {...item} />
              ) : (
                <Bottle key={item.x} y={shelf.y} {...item} />
              )
            )}
          </g>
        ))}

        {/* Floating decoration */}
        <Capsule x={390} y={36} rotate={20} scale={0.65} left="#ffffff" right="#34d399" float delay={0.6} />
        <Plus x={500} y={90} size={22} opacity={0.7} />
        <Plus x={130} y={110} size={18} opacity={0.6} />

        {/* Pharmacist */}
        <path d="M430 300 C424 350 430 376 446 388 L494 388 C510 376 516 350 510 300 Z" fill="#1f2a5c" />
        <ellipse cx="470" cy="298" rx="41" ry="44" fill="#1f2a5c" />
        <rect x="461" y="326" width="18" height="30" rx="6" fill="#efb994" />
        <path
          d="M392 452 C392 386 420 358 458 350 L482 350 C520 358 548 386 548 452 Z"
          fill="#ffffff"
          stroke="#b8cdf7"
          strokeWidth="1.5"
        />
        <path d="M458 350 L470 384 L482 350 Z" fill="#2563eb" />
        <path d="M470 384 L470 452" stroke="#dbeafe" strokeWidth="2" />
        {/* Stethoscope */}
        <path d="M452 352 C448 395 492 395 488 352" stroke="#64748b" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="470" cy="397" r="5" fill="#94a3b8" />
        {/* Name badge and coat cross */}
        <rect x="500" y="398" width="28" height="15" rx="3" fill="#dbeafe" />
        <rect x="504" y="403" width="16" height="3" rx="1.5" fill="#2563eb" />
        <Plus x={430} y={408} size={16} fill="#34d399" opacity={1} />
        {/* Face */}
        <circle cx="470" cy="302" r="30" fill="#f6c9a6" />
        <path
          d="M438 300 C438 268 502 266 502 300 C492 286 470 280 452 292 C446 295 441 298 438 300 Z"
          fill="#1f2a5c"
        />
        <circle cx="459" cy="304" r="2.6" fill="#1f2a5c" />
        <circle cx="481" cy="304" r="2.6" fill="#1f2a5c" />
        <path d="M461 316 Q470 324 479 316" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="452" cy="312" r="5" fill="#fca5a5" opacity="0.5" />
        <circle cx="488" cy="312" r="5" fill="#fca5a5" opacity="0.5" />

        {/* Counter */}
        <rect x="326" y="456" width="420" height="220" fill="url(#scene-counter)" />
        <rect x="312" y="434" width="440" height="26" rx="10" fill="#f4f8ff" />
        <rect x="340" y="492" width="110" height="120" rx="12" fill="none" stroke="#a9c2fb" strokeWidth="2" />
        <rect x="590" y="492" width="100" height="120" rx="12" fill="none" stroke="#a9c2fb" strokeWidth="2" />
        <rect x="475" y="505" width="100" height="100" rx="24" fill="#2f6df6" />
        <Plus x={525} y={555} size={56} fill="#ffffff" opacity={1} />

        {/* Items on the counter */}
        <MedBox x={326} y={434} w={34} h={42} color="#ffffff" accent="#3b82f6" />
        <Bottle x={368} y={434} w={24} h={40} color="#fbbf24" cap="#92400e" />

        {/* Prescription clipboard */}
        <g transform="translate(640 434) rotate(8)">
          <rect x="-30" y="-86" width="60" height="86" rx="6" fill="#1f2a5c" />
          <rect x="-24" y="-72" width="48" height="68" rx="3" fill="#ffffff" />
          <rect x="-12" y="-92" width="24" height="12" rx="4" fill="#64748b" />
          <rect x="-18" y="-60" width="36" height="4" rx="2" fill="#cbd5e1" />
          <rect x="-18" y="-50" width="26" height="4" rx="2" fill="#cbd5e1" />
          <rect x="-18" y="-40" width="32" height="4" rx="2" fill="#cbd5e1" />
          <circle cx="-9" cy="-20" r="8" fill="#34d399" />
          <path
            d="M-13 -20 l3 3 l6 -6"
            stroke="#ffffff"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
    </svg>
  )
}