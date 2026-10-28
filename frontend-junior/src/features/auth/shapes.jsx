export function Capsule({
  x,
  y,
  rotate = 0,
  scale = 1,
  left,
  right,
  opacity = 1,
  float = false,
  delay = 0,
}) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}
      opacity={opacity}
    >
      <g
        className={float ? 'float-item' : undefined}
        style={float ? { animationDelay: `${delay}s` } : undefined}
      >
        <path d="M22 0 H60 V44 H22 A22 22 0 0 1 22 0 Z" fill={left} />
        <path d="M60 0 H98 A22 22 0 0 1 98 44 H60 Z" fill={right} />
      </g>
    </g>
  )
}

export function Tablet({
  x,
  y,
  r = 28,
  fill = 'rgba(255,255,255,0.9)',
  ring = '#bfdbfe',
  line = '#93c5fd',
  opacity = 1,
}) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <circle r={r} fill={fill} />
      <circle r={r - 6} fill="none" stroke={ring} strokeWidth="2" />
      <line
        x1={-(r - 9)}
        y1="0"
        x2={r - 9}
        y2="0"
        stroke={line}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  )
}

export function Plus({ x, y, size = 22, fill = '#ffffff', opacity = 0.4 }) {
  const s = size
  return (
    <path
      transform={`translate(${x} ${y})`}
      d={`M${-s / 6} ${-s / 2} h${s / 3} v${s / 3} h${s / 3} v${s / 3} h${-s / 3} v${s / 3} h${-s / 3} v${-s / 3} h${-s / 3} v${-s / 3} h${s / 3} z`}
      fill={fill}
      opacity={opacity}
    />
  )
}