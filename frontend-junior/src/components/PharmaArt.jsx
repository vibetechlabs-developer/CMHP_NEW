/* =========================================================
   CMHP PHARMA ERP
   PHARMACEUTICAL ARTWORK (visual only)

   HeroScene    -> microscope, medicine bottles, capsules,
                   tablets, molecule and DNA. Used inside
                   <PageHero /> on every page.

   SidebarScene -> capsules, bottle and leaves for the
                   bottom of the sidebar.

   These are pure SVG drawings. They contain NO business
   data and never receive any props from the application.
   ========================================================= */


/* ---------- small building blocks ---------- */

function Capsule({ x, y, rotate = 0, scale = 1, a, b }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <ellipse cx="2" cy="15" rx="30" ry="5" fill="#8fb4d8" opacity="0.28" />
      <path d="M-30 -12 H0 V12 H-30 A12 12 0 0 1 -30 -12 Z" fill={`url(#${a})`} />
      <path d="M0 -12 H30 A12 12 0 0 1 30 12 H0 Z" fill={`url(#${b})`} />
      <rect x="-27" y="-9" width="52" height="4" rx="2" fill="#ffffff" opacity="0.5" />
    </g>
  )
}

function Tablet({ x, y, r = 11, fill = '#ffffff', edge = '#cfe0f0', line = '#b6cee5' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="1" cy={r * 0.7} rx={r} ry={r * 0.4} fill="#8fb4d8" opacity="0.28" />
      <circle r={r} fill={fill} stroke={edge} strokeWidth="1.4" />
      <circle r={r - 3.5} fill="none" stroke={line} strokeWidth="1" opacity="0.7" />
      <line
        x1={-r * 0.55}
        y1="0"
        x2={r * 0.55}
        y2="0"
        stroke={line}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  )
}

function Plus({ x, y, s = 10, fill = '#8cc3ee', opacity = 0.55 }) {
  const t = s / 3
  return (
    <path
      transform={`translate(${x} ${y})`}
      d={`M${-t / 2} ${-s / 2} h${t} v${(s - t) / 2} h${(s - t) / 2} v${t} h${-(s - t) / 2} v${(s - t) / 2} h${-t} v${-(s - t) / 2} h${-(s - t) / 2} v${-t} h${(s - t) / 2} z`}
      fill={fill}
      opacity={opacity}
    />
  )
}

function Bottle({ x, y, w, h, cap = 'ph-capBlue' }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={w / 2 + 4} cy={h + 2} rx={w * 0.62} ry="6" fill="#8fb4d8" opacity="0.3" />
      <rect x={w * 0.18} y="0" width={w * 0.64} height={h * 0.17} rx="5" fill={`url(#${cap})`} />
      <rect x={w * 0.1} y={h * 0.15} width={w * 0.8} height={h * 0.06} rx="3" fill="#d3e4f5" />
      <rect
        x="0"
        y={h * 0.2}
        width={w}
        height={h * 0.8}
        rx={w * 0.2}
        fill="url(#ph-bottle)"
        stroke="#cfe0f0"
        strokeWidth="1.2"
      />
      <rect
        x={w * 0.07}
        y={h * 0.42}
        width={w * 0.86}
        height={h * 0.34}
        rx="4"
        fill="url(#ph-blue)"
      />
      <path
        d={`M${w / 2 - 3} ${h * 0.5} h6 v4 h4 v6 h-4 v4 h-6 v-4 h-4 v-6 h4 z`}
        fill="#ffffff"
        opacity="0.95"
      />
      <rect
        x={w * 0.14}
        y={h * 0.26}
        width={w * 0.09}
        height={h * 0.62}
        rx={w * 0.045}
        fill="#ffffff"
        opacity="0.75"
      />
    </g>
  )
}

function Microscope({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="2" cy="4" rx="56" ry="6" fill="#8fb4d8" opacity="0.3" />

      {/* base */}
      <path
        d="M-48 0 H48 Q54 0 54 -7 V-13 H-54 V-7 Q-54 0 -48 0 Z"
        fill="url(#ph-metal)"
        stroke="#bcd4ea"
        strokeWidth="1.2"
      />

      {/* curved arm */}
      <path
        d="M30 -14 C82 -14 88 -70 26 -112"
        fill="none"
        stroke="#bcd4ea"
        strokeWidth="19"
        strokeLinecap="round"
      />
      <path
        d="M30 -14 C82 -14 88 -70 26 -112"
        fill="none"
        stroke="url(#ph-metal)"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* stage */}
      <rect x="-38" y="-58" width="70" height="8" rx="3" fill="#cfe1f3" stroke="#b5cfe8" />
      <rect x="-22" y="-64" width="30" height="6" rx="2" fill="#ffffff" stroke="#c6dbef" />

      {/* body tube */}
      <g transform="translate(8 -116) rotate(-12)">
        <rect
          x="-11"
          y="-52"
          width="22"
          height="92"
          rx="8"
          fill="url(#ph-metal)"
          stroke="#bcd4ea"
          strokeWidth="1.2"
        />
        <rect x="-8" y="-68" width="16" height="18" rx="4" fill="url(#ph-capBlue)" />
        <rect x="-6" y="40" width="12" height="16" rx="3" fill="url(#ph-capBlue)" />
        <rect x="-9" y="34" width="18" height="6" rx="3" fill="#a9c8e6" />
      </g>

      {/* focus knobs */}
      <circle cx="52" cy="-44" r="10" fill="url(#ph-capBlue)" />
      <circle cx="52" cy="-44" r="4.5" fill="#d8eafb" />
    </g>
  )
}

function Molecule({ x, y, opacity = 0.7 }) {
  const nodes = [
    [0, 0],
    [30, -17],
    [60, 0],
    [60, 34],
    [30, 51],
    [0, 34],
    [92, -16],
  ]
  const links = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [2, 6],
  ]

  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      {links.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a][0]}
          y1={nodes[a][1]}
          x2={nodes[b][0]}
          y2={nodes[b][1]}
          stroke="#9ccbee"
          strokeWidth="2"
        />
      ))}
      {nodes.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i === 6 ? 7 : 5}
          fill={i === 6 ? '#7358c9' : i % 2 ? '#17a99f' : '#1478c9'}
          opacity="0.75"
        />
      ))}
    </g>
  )
}

function Dna({ x, y, height = 170, opacity = 0.5 }) {
  const steps = 22
  const stepY = height / steps
  const amp = 17
  const pointsA = []
  const pointsB = []
  const rungs = []

  for (let i = 0; i <= steps; i += 1) {
    const py = y + i * stepY
    const dx = amp * Math.sin(i * 0.55)
    pointsA.push(`${x + dx},${py}`)
    pointsB.push(`${x - dx},${py}`)
    if (i % 2 === 0) {
      rungs.push([x + dx, x - dx, py])
    }
  }

  return (
    <g opacity={opacity}>
      {rungs.map(([x1, x2, py]) => (
        <line key={py} x1={x1} y1={py} x2={x2} y2={py} stroke="#bfdcf4" strokeWidth="2" />
      ))}
      <polyline points={pointsA.join(' ')} fill="none" stroke="#5fb0ea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pointsB.join(' ')} fill="none" stroke="#17a99f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

function Leaf({ x, y, rotate = 0, scale = 1, fill = '#4cc9a4' }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0 C-16 -18 -12 -48 0 -64 C12 -48 16 -18 0 0 Z" fill={fill} opacity="0.9" />
      <path d="M0 0 V-52" stroke="#ffffff" strokeWidth="1.6" opacity="0.6" />
    </g>
  )
}


/* ---------- shared gradients ---------- */

function ArtDefs() {
  return (
    <defs>
      <radialGradient id="ph-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#d9ecfb" stopOpacity="0" />
      </radialGradient>

      <linearGradient id="ph-surface" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="1" stopColor="#cfe4f7" stopOpacity="0.85" />
      </linearGradient>

      <linearGradient id="ph-bottle" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#d9e8f6" />
        <stop offset="0.35" stopColor="#ffffff" />
        <stop offset="0.75" stopColor="#f0f6fc" />
        <stop offset="1" stopColor="#cbdcee" />
      </linearGradient>

      <linearGradient id="ph-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6fafe" />
        <stop offset="1" stopColor="#c7dbef" />
      </linearGradient>

      <linearGradient id="ph-blue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3b9be8" />
        <stop offset="1" stopColor="#0f65b3" />
      </linearGradient>

      <linearGradient id="ph-capBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4aa6ee" />
        <stop offset="1" stopColor="#1478c9" />
      </linearGradient>

      <linearGradient id="ph-capWhite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d9e7f5" />
      </linearGradient>

      <linearGradient id="ph-capOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffc65f" />
        <stop offset="1" stopColor="#f28c1e" />
      </linearGradient>

      <linearGradient id="ph-capGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#52e0b6" />
        <stop offset="1" stopColor="#17a99f" />
      </linearGradient>
    </defs>
  )
}


/* =========================================================
   HERO SCENE
   ========================================================= */

export function HeroScene() {
  return (
    <svg
      className="page-hero-scene"
      viewBox="0 0 760 240"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <ArtDefs />

      {/* soft background glow + rings */}
      <circle cx="590" cy="118" r="180" fill="url(#ph-glow)" />
      <circle cx="620" cy="112" r="122" fill="none" stroke="#cfe4f7" strokeWidth="1.5" opacity="0.8" />
      <circle cx="620" cy="112" r="170" fill="none" stroke="#dcebf8" strokeWidth="1.2" strokeDasharray="4 7" opacity="0.9" />

      {/* science decorations */}
      <Dna x={196} y={22} height={176} opacity={0.4} />
      <Molecule x={262} y={26} opacity={0.6} />

      <Plus x={150} y={120} s={13} />
      <Plus x={726} y={40} s={15} />
      <Plus x={470} y={92} s={10} fill="#7358c9" opacity={0.35} />
      <Plus x={708} y={150} s={9} fill="#17a99f" opacity={0.5} />
      <Plus x={330} y={70} s={11} />
      <Plus x={300} y={196} s={11} />

      {/* glass shelf */}
      <ellipse cx="520" cy="216" rx="262" ry="22" fill="url(#ph-surface)" />
      <ellipse cx="520" cy="216" rx="262" ry="22" fill="none" stroke="#d6e8f6" />

      {/* small vials, far left */}
      <g transform="translate(300 150)">
        <rect x="0" y="0" width="16" height="9" rx="3" fill="url(#ph-capGreen)" />
        <rect x="1" y="8" width="14" height="52" rx="6" fill="url(#ph-bottle)" stroke="#cfe0f0" />
        <rect x="2" y="34" width="12" height="16" rx="3" fill="url(#ph-capGreen)" opacity="0.85" />
      </g>
      <g transform="translate(324 162)">
        <rect x="0" y="0" width="14" height="8" rx="3" fill="url(#ph-capBlue)" />
        <rect x="1" y="7" width="12" height="44" rx="5" fill="url(#ph-bottle)" stroke="#cfe0f0" />
        <rect x="2" y="28" width="10" height="14" rx="3" fill="url(#ph-blue)" opacity="0.85" />
      </g>

      {/* main objects */}
      <Bottle x={368} y={108} w={48} h={104} cap="ph-capBlue" />
      <Microscope x={556} y={212} />
      <Bottle x={650} y={90} w={64} h={122} cap="ph-capBlue" />

      <Leaf x={728} y={214} rotate={16} scale={0.75} />
      <Leaf x={742} y={214} rotate={40} scale={0.6} fill="#7ad9bd" />

      {/* capsules + tablets in front */}
      <Capsule x={288} y={216} rotate={-14} scale={1.05} a="ph-capGreen" b="ph-capWhite" />
      <Capsule x={452} y={214} rotate={-18} scale={1.15} a="ph-capBlue" b="ph-capWhite" />
      <Capsule x={614} y={222} rotate={14} scale={0.95} a="ph-capOrange" b="ph-capWhite" />
      <Capsule x={640} y={206} rotate={-32} scale={0.7} a="ph-capGreen" b="ph-capWhite" />
      <Capsule x={352} y={226} rotate={8} scale={0.8} a="ph-capOrange" b="ph-capWhite" />

      <Tablet x={246} y={226} r={11} />
      <Tablet x={396} y={228} r={12} />
      <Tablet x={506} y={228} r={10} fill="#ffd27a" edge="#f3b85a" line="#e7a541" />
      <Tablet x={540} y={230} r={11} />
      <Tablet x={684} y={226} r={11} fill="#ffb15e" edge="#f09a3e" line="#de8629" />
      <Tablet x={712} y={231} r={9} />
      <Tablet x={424} y={234} r={8} fill="#ffd27a" edge="#f3b85a" line="#e7a541" />
    </svg>
  )
}


/* =========================================================
   SIDEBAR SCENE
   ========================================================= */

export function SidebarScene() {
  return (
    <svg
      className="sidebar-art-scene"
      viewBox="0 0 240 110"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <ArtDefs />

      <ellipse cx="120" cy="104" rx="118" ry="14" fill="url(#ph-surface)" />

      <Leaf x={30} y={100} rotate={-24} scale={0.9} />
      <Leaf x={46} y={102} rotate={8} scale={0.75} fill="#7ad9bd" />
      <Leaf x={214} y={100} rotate={22} scale={0.85} />
      <Leaf x={226} y={102} rotate={48} scale={0.6} fill="#7ad9bd" />

      <Bottle x={44} y={34} w={34} h={70} cap="ph-capBlue" />

      <Capsule x={132} y={88} rotate={-22} scale={1.35} a="ph-capBlue" b="ph-capWhite" />
      <Capsule x={186} y={98} rotate={16} scale={0.95} a="ph-capOrange" b="ph-capWhite" />
      <Tablet x={98} y={98} r={10} />
      <Tablet x={160} y={104} r={9} fill="#ffd27a" edge="#f3b85a" line="#e7a541" />

      <Plus x={112} y={28} s={12} />
      <Plus x={204} y={44} s={9} fill="#17a99f" opacity={0.55} />
      <Plus x={20} y={40} s={8} fill="#7358c9" opacity={0.4} />
    </svg>
  )
}