import { Capsule, Plus, Tablet } from './shapes'

export default function LoginBackground() {
  return (
    <div className="login-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        {/* Soft circles */}
        <circle cx="1200" cy="800" r="260" fill="#dfe8ff" opacity="0.5" />
        <circle cx="120" cy="80" r="220" fill="#e3ebff" opacity="0.6" />

        {/* Large faded capsules */}
        <Capsule x={50} y={720} rotate={-28} scale={3.2} left="#cddcfe" right="#e2ebff" opacity={0.65} />
        <Capsule x={1090} y={70} rotate={32} scale={3} left="#d6e3ff" right="#e8efff" opacity={0.7} />

        {/* Faded tablets */}
        <Tablet x={1270} y={740} r={90} fill="#dbe6ff" ring="#c7d7fe" line="#c7d7fe" opacity={0.6} />
        <Tablet x={230} y={190} r={55} fill="#dbe6ff" ring="#c7d7fe" line="#c7d7fe" opacity={0.6} />

        {/* Hexagons */}
        <polygon
          transform="translate(1180 470)"
          points="60,0 30,52 -30,52 -60,0 -30,-52 30,-52"
          fill="none"
          stroke="#c7d7fe"
          strokeWidth="4"
          opacity="0.7"
        />
        <polygon
          transform="translate(260 800) scale(0.7)"
          points="60,0 30,52 -30,52 -60,0 -30,-52 30,-52"
          fill="none"
          stroke="#c7d7fe"
          strokeWidth="4"
          opacity="0.7"
        />

        {/* Plus signs */}
        <Plus x={180} y={120} size={46} fill="#c3d5fd" opacity={0.7} />
        <Plus x={1300} y={400} size={40} fill="#c3d5fd" opacity={0.7} />
        <Plus x={720} y={860} size={36} fill="#c3d5fd" opacity={0.7} />
        <Plus x={90} y={460} size={30} fill="#c3d5fd" opacity={0.7} />
        <Plus x={1380} y={620} size={28} fill="#c3d5fd" opacity={0.7} />
        <Plus x={560} y={60} size={26} fill="#c3d5fd" opacity={0.7} />
      </svg>
    </div>
  )
}