import './Dashboard.css'

// Small trend line shown inside KPI cards
export function Sparkline({ data, color }) {
  const width = 100
  const height = 32
  const padding = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)

  const points = data
    .map((value, index) => {
      const x = (index * step).toFixed(1)
      const y = (height - padding - ((value - min) / range) * (height - padding * 2)).toFixed(1)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={color} opacity="0.12" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// Simple vertical bar chart. The last bar is highlighted.
export function BarChart({ data, unit = '' }) {
  const max = Math.max(...data.map((item) => item.value))

  return (
    <div className="bar-chart" role="img" aria-label="Bar chart">
      {data.map((item, index) => (
        <div className="bar-col" key={`${item.label}-${index}`}>
          <span className="bar-value">
            {item.value}
            {unit}
          </span>
          <div className="bar-track">
            <div
              className={index === data.length - 1 ? 'bar-fill bar-fill-active' : 'bar-fill'}
              style={{ height: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// Donut chart built with SVG circle strokes
export function DonutChart({ data, centerValue, centerLabel }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const total = data.reduce((sum, item) => sum + item.value, 0)

  const segments = data.reduce((list, item) => {
    const length = (item.value / total) * circumference
    const previous = list[list.length - 1]
    const offset = previous ? previous.offset + previous.length : 0
    return [...list, { ...item, length, offset }]
  }, [])

  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Products by category">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#eef2ff" strokeWidth="16" />
      {segments.map((segment) => (
        <circle
          key={segment.label}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={segment.color}
          strokeWidth="16"
          strokeDasharray={`${segment.length} ${circumference - segment.length}`}
          strokeDashoffset={-segment.offset}
          transform="rotate(-90 60 60)"
        />
      ))}
      <text x="60" y="58" textAnchor="middle" className="donut-value">
        {centerValue}
      </text>
      <text x="60" y="73" textAnchor="middle" className="donut-label">
        {centerLabel}
      </text>
    </svg>
  )
}