import { useState } from 'react'

// Single-series distribution: all bars signal green, grey only for gridlines.
// The optional reference is drawn as a dashed outline (scope share per bin), so
// identity never depends on a second colour.

interface Props {
  counts: number[]
  labels: string[]
  /** Share per bin of a reference population, drawn as a dashed outline. */
  reference?: number[]
  referenceLabel?: string
  seriesLabel?: string
  height?: number
  formatPct: (x: number) => string
}

export function Histogram({ counts, labels, reference, referenceLabel, seriesLabel = 'Share', height = 150, formatPct }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const total = counts.reduce((a, b) => a + b, 0)
  const shares = counts.map((c) => (total ? c / total : 0))
  const maxShare = Math.max(0.0001, ...shares, ...(reference ?? []))
  const niceMax = Math.min(1, Math.ceil(maxShare * 10) / 10)

  const W = 560
  const H = height
  const padL = 36
  const padR = 8
  const padT = 16
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const bw = plotW / counts.length
  const gap = 2
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH
  const ticks = [0, niceMax / 2, niceMax]

  const barPath = (x: number, w: number, top: number) => {
    const base = padT + plotH
    const h = base - top
    if (h <= 0) return ''
    const r = Math.min(4, h, w / 2)
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${seriesLabel} per bin`}>
        <g className="grid">
          {ticks.map((t) => (
            <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t) => (
            <text key={t} x={padL - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t * 100)}%
            </text>
          ))}
          {labels.map((l, i) => (
            <text key={l} x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle">
              {l}
            </text>
          ))}
        </g>
        {counts.map((c, i) => {
          const x = padL + i * bw + gap / 2 + bw * 0.12
          const w = bw * 0.76 - gap
          return (
            <g key={i} className="bin" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect className="hit" x={padL + i * bw} y={padT} width={bw} height={plotH} />
              <path className="bar" d={barPath(x, w, y(shares[i]))} />
              {reference && reference[i] > 0 && (
                <path className="bar-ref" d={`M${x},${padT + plotH} V${y(reference[i])} H${x + w} V${padT + plotH}`} />
              )}
              {c > 0 && (hover === i || counts.length <= 6) && (
                <g className="val">
                  <text x={x + w / 2} y={y(shares[i]) - 4} textAnchor="middle">
                    {c}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ position: 'absolute', left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, top: 0, transform: 'translate(-50%, -100%)' }}>
          <strong>{labels[hover]}</strong>
          {'\n'}
          {counts[hover]} ({formatPct(shares[hover])}) {seriesLabel.toLowerCase()}
          {reference && `\n${referenceLabel}: ${formatPct(reference[hover])}`}
        </div>
      )}
    </div>
  )
}
