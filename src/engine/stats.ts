export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** Linear-interpolated quantile (Excel PERCENTILE.INC / QUARTILE.INC). */
export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export function median(xs: number[]): number | null {
  return quantile(xs, 0.5)
}

export type TieMethod = 'min' | 'average' | 'dense'

/**
 * Rank values where rank 1 is best. `better` = 'low' ranks the smallest value
 * first. Null values are left null for the caller to place.
 */
export function rank(values: (number | null)[], better: 'low' | 'high', tie: TieMethod): (number | null)[] {
  const idx = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v))
    .sort((a, b) => (better === 'low' ? a.v - b.v : b.v - a.v))
  const out: (number | null)[] = values.map(() => null)
  let pos = 0
  let dense = 0
  while (pos < idx.length) {
    let end = pos
    while (end + 1 < idx.length && idx[end + 1].v === idx[pos].v) end++
    dense++
    const r = tie === 'min' ? pos + 1 : tie === 'dense' ? dense : (pos + 1 + end + 1) / 2
    for (let k = pos; k <= end; k++) out[idx[k].i] = r
    pos = end + 1
  }
  return out
}

/** Index of the bin a value falls in: ≤e0 → 0, (e0,e1] → 1, …, >eN → N+1. */
export function binIndex(value: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i++) if (value <= edges[i]) return i
  return edges.length
}

export function binLabels(edges: number[], suffix = ' d'): string[] {
  if (edges.length === 0) return ['All']
  const out = [`≤ ${edges[0]}${suffix}`]
  for (let i = 1; i < edges.length; i++) out.push(`${edges[i - 1] + 1}–${edges[i]}${suffix}`)
  out.push(`> ${edges[edges.length - 1]}${suffix}`)
  return out
}

export function histogram(values: number[], edges: number[]): number[] {
  const counts = new Array(edges.length + 1).fill(0)
  for (const v of values) counts[binIndex(v, edges)]++
  return counts
}
