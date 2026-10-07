import { Capsule, Plus, Tablet } from '../auth/shapes'

function Floating({ delay = 0, children }) {
  return (
    <g className="dash-float" style={{ animationDelay: `${delay}s` }}>
      {children}
    </g>
  )
}

function Flask() {
  return (
    <g transform="translate(330 128) scale(1.25)">
      <path
        d="M-14 -50 H14 V-20 L44 34 Q50 46 38 46 H-38 Q-50 46 -44 34 L-14 -20 Z"
        fill="rgba(255,255,255,0.22)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M-33 14 H33 L44 34 Q50 46 38 46 H-38 Q-50 46 -44 34 Z" fill="#34d399" opacity="0.9" />
      <rect x="-19" y="-56" width="38" height="8" rx="4" fill="#ffffff" />
      <circle cx="-10" cy="28" r="4" fill="#ffffff" opacity="0.7" />
      <circle cx="8" cy="34" r="3" fill="#ffffff" opacity="0.7" />
      <circle cx="16" cy="22" r="2.5" fill="#ffffff" opacity="0.7" />
    </g>
  )
}

function Molecule({ x, y }) {
  const nodes = [
    [0, 0],
    [34, 20],
    [24, 58],
    [-18, 50],
    [-32, 12],
  ]
  const links = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
  ]

  return (
    <g transform={`translate(${x} ${y})`}>
      {links.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={nodes[a][0]}
          y1={nodes[a][1]}
          x2={nodes[b][0]}
          y2={nodes[b][1]}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
        />
      ))}
      {nodes.map(([cx, cy], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={index === 0 ? 7 : 5}
          fill="rgba(255,255,255,0.7)"
        />
      ))}
    </g>
  )
}

export default function HeroArt() {
  return (
    <svg
      className="hero-art"
      viewBox="0 0 420 220"
      preserveAspectRatio="xMaxYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="330" cy="120" r="118" fill="rgba(255,255,255,0.07)" />
      <circle cx="330" cy="120" r="78" fill="rgba(255,255,255,0.07)" />

      <Molecule x={150} y={88} />

      <Floating delay={0}>
        <Capsule x={100} y={26} rotate={18} scale={0.6} left="#ffffff" right="#34d399" />
      </Floating>
      <Floating delay={1.2}>
        <Capsule x={190} y={168} rotate={-28} scale={0.55} left="#bfdbfe" right="#ffffff" />
      </Floating>
      <Floating delay={0.6}>
        <Tablet x={262} y={46} r={16} />
      </Floating>
      <Floating delay={1.8}>
        <Tablet x={404} y={196} r={14} />
      </Floating>
      <Floating delay={0.3}>
        <Flask />
      </Floating>

      <Plus x={300} y={24} size={16} opacity={0.5} />
      <Plus x={232} y={122} size={12} opacity={0.4} />
      <Plus x={408} y={104} size={14} opacity={0.45} />
    </svg>
  )
}