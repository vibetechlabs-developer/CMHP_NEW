import './Dashboard.css'

// Small trend line shown inside KPI cards
export function Sparkline({ data = [10, 14, 12, 18, 16, 22, 25], color = '#2563eb' }) {
  const safeData = Array.isArray(data) && data.length > 1 ? data : [1, 1]
  const width = 100
  const height = 32
  const padding = 3
  const min = Math.min(...safeData)
  const max = Math.max(...safeData)
  const range = max - min || 1
  const step = width / (safeData.length - 1)

  const points = safeData
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
      style={{ width: 80, height: 26, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`spark-grad-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-grad-${color.replace(/[^a-zA-Z0-9]/g, '')})`}
      />
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

// Simple vertical bar chart
export function BarChart({ data = [], unit = '' }) {
  if (!data.length) return null
  const max = Math.max(...data.map((item) => Number(item.value) || 0), 1)

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
              style={{
                height: `${Math.max(((Number(item.value) || 0) / max) * 100, 4)}%`,
                background: item.color || undefined,
              }}
            />
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// Donut chart built with SVG circle strokes
export function DonutChart({ data = [], centerValue = '0', centerLabel = 'Total' }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const validData = data.filter((d) => Number(d.value) > 0)
  const total = validData.reduce((sum, item) => sum + Number(item.value), 0)

  if (total === 0) {
    return (
      <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Empty chart">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="16" />
        <text x="60" y="58" textAnchor="middle" className="donut-value" style={{ fill: '#94a3b8', fontSize: 16 }}>
          0
        </text>
        <text x="60" y="73" textAnchor="middle" className="donut-label" style={{ fill: '#94a3b8', fontSize: 10 }}>
          {centerLabel}
        </text>
      </svg>
    )
  }

  const segments = validData.reduce((list, item) => {
    const length = (Number(item.value) / total) * circumference
    const previous = list[list.length - 1]
    const offset = previous ? previous.offset + previous.length : 0
    return [...list, { ...item, length, offset }]
  }, [])

  return (
    <svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Donut breakdown">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="16" />
      {segments.map((segment, idx) => (
        <circle
          key={`${segment.label}-${idx}`}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={segment.color || '#3b82f6'}
          strokeWidth="16"
          strokeDasharray={`${segment.length} ${circumference - segment.length}`}
          strokeDashoffset={-segment.offset}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
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

// Area Trend Chart for Orders or Activity over time
export function AreaTrendChart({ data = [], height = 220, color = '#2563eb' }) {
  const safeData = data.length > 1 ? data : [
    { label: 'Day 1', value: 0 },
    { label: 'Day 2', value: 0 },
  ]
  const width = 720
  const values = safeData.map((d) => Number(d.value) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values, 1)
  const range = max - min || 1

  const points = values
    .map((value, index) => {
      const x = 30 + (index * (width - 55)) / (values.length - 1)
      const y = height - 35 - ((value - min) / range) * (height - 75)
      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `30,${height - 28} ${points} ${width - 25},${height - 28}`

  return (
    <div className="trend-chart-wrap" style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend chart"
        style={{ width: '100%', height, minWidth: 420 }}
      >
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid */}
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="30" y1={y} x2={width - 25} y2={y} className="chart-grid-line" stroke="#e2e8f0" strokeDasharray="3 3" />
        ))}

        {/* Gradient fill */}
        <polygon points={areaPoints} fill="url(#area-grad)" />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {values.map((value, index) => {
          const x = 30 + (index * (width - 55)) / (values.length - 1)
          const y = height - 35 - ((value - min) / range) * (height - 75)
          return (
            <g key={index}>
              <circle cx={x} cy={y} r="4" fill="#ffffff" stroke={color} strokeWidth="2.5" />
              <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#334155">
                {value}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="chart-x-labels" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 30px 0', fontSize: 11, color: '#64748b' }}>
        {safeData.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

// Grouped Bar Chart comparing Revenue vs Collected
export function GroupedBarChart({ data = [], height = 220 }) {
  if (!data.length) return <div className="dash-empty">No billing data available.</div>

  const maxVal = Math.max(
    ...data.flatMap((d) => [Number(d.revenue) || 0, Number(d.collected) || 0]),
    1
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#3b82f6' }} />
          <span>Invoiced Revenue</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#10b981' }} />
          <span>Collected Cash</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height, gap: 14, padding: '10px 0 24px', borderBottom: '1px solid #e2e8f0' }}>
        {data.map((item, idx) => {
          const revHeight = Math.max(((Number(item.revenue) || 0) / maxVal) * (height - 40), 4)
          const colHeight = Math.max(((Number(item.collected) || 0) / maxVal) * (height - 40), 4)

          return (
            <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: '100%' }}>
                <div
                  title={`Revenue: ₹${Number(item.revenue || 0).toLocaleString('en-IN')}`}
                  style={{
                    width: 16,
                    height: revHeight,
                    background: '#3b82f6',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                />
                <div
                  title={`Collected: ₹${Number(item.collected || 0).toLocaleString('en-IN')}`}
                  style={{
                    width: 16,
                    height: colHeight,
                    background: '#10b981',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}