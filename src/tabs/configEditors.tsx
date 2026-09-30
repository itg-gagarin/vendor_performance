import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { DEFAULT_CONFIG } from '../config/defaults'
import { FORMAT_KEYS, METRICS, METRIC_KEYS } from '../config/metrics'
import { flattenLabels, setPath } from '../config/store'
import type { AppConfig, ColumnConfig, Measure, Origin, TileConfig, Tone, VerdictBand } from '../config/types'
import { binLabels, histogram } from '../engine/stats'
import { useUi } from '../ui/context'
import { Histogram } from '../ui/Histogram'
import { NumberInput, Toggle } from '../ui/primitives'

export type Edit = (fn: (d: AppConfig) => void) => void

export const TONES: Tone[] = ['neutral', 'emerald', 'amber', 'red', 'commit', 'sales', 'advance']

export function ToneSelect({ value, onChange, ariaLabel }: { value: Tone; onChange: (t: Tone) => void; ariaLabel: string }) {
  return (
    <span className="row-tight" style={{ flexWrap: 'nowrap' }}>
      <span className="swatch" data-tone={value} style={{ width: 18 }} />
      <select className="select input-sm" style={{ height: 30 }} value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as Tone)}>
        {TONES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </span>
  )
}

export function BandEditor({ band, onChange, rule }: { band: VerdictBand; onChange: (b: VerdictBand) => void; rule: string }) {
  return (
    <div className="row-tight" style={{ flexWrap: 'nowrap' }}>
      <input className="input input-sm" style={{ width: 120 }} value={band.label} aria-label="Verdict word" onChange={(e) => onChange({ ...band, label: e.target.value })} />
      <ToneSelect value={band.tone} ariaLabel="Colour" onChange={(tone) => onChange({ ...band, tone })} />
      <span className="small muted">{rule}</span>
    </div>
  )
}

// ---------------------------------------------------------------- Bins

export function BinEditor({ draft, edit, values }: { draft: AppConfig; edit: Edit; values: Record<Measure, Record<Origin, number[]>> }) {
  const { cfg, f } = useUi()
  const D = cfg.labels.detail
  const C = cfg.labels.config
  return (
    <div className="stack-section">
      {(Object.keys(draft.bins) as Measure[]).map((m) => (
        <div key={m} className="stack">
          <span style={{ fontWeight: 500 }}>{D.measures[m]}</span>
          <div className="grid-2">
            {(['Local', 'Import'] as Origin[]).map((o) => {
              const edges = draft.bins[m][o]
              const setEdges = (next: number[]) =>
                edit((d) => {
                  d.bins[m][o] = [...new Set(next.filter((x) => Number.isFinite(x) && x >= 0))].sort((a, b) => a - b)
                })
              return (
                <div key={o} className="stack" style={{ gap: 'var(--space-2)' }}>
                  <span className="row-tight small">
                    <span className="tag">{o}</span>
                    <span className="muted">
                      <span className="mono">{values[m][o].length}</span> values in the extract
                    </span>
                  </span>
                  <div className="edge-list">
                    {edges.map((e, i) => (
                      <span key={`${i}-${e}`} className="edge-chip">
                        <input
                          defaultValue={e}
                          inputMode="numeric"
                          aria-label={`Edge ${i + 1}`}
                          onBlur={(ev) => {
                            const v = Number(ev.target.value)
                            if (Number.isFinite(v)) setEdges(edges.map((x, k) => (k === i ? v : x)))
                            else ev.target.value = String(e)
                          }}
                          onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
                        />
                        <button type="button" aria-label="Remove edge" onClick={() => setEdges(edges.filter((_, k) => k !== i))}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className="btn btn-sm" onClick={() => setEdges([...edges, (edges[edges.length - 1] ?? 0) + 7])}>
                      <Plus size={14} /> {C.addEdge}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEdges(DEFAULT_CONFIG.bins[m][o])}>
                      <RotateCcw size={14} /> {C.resetBins}
                    </button>
                  </div>
                  {values[m][o].length > 0 && (
                    <Histogram counts={histogram(values[m][o], edges)} labels={binLabels(edges, '')} seriesLabel="Rows" height={130} formatPct={(x) => f.fmt(x, 'pct')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Cards

export function TileEditor({ tiles, onChange }: { tiles: TileConfig[]; onChange: (t: TileConfig[]) => void }) {
  const set = (i: number, patch: Partial<TileConfig>) => onChange(tiles.map((t, k) => (k === i ? { ...t, ...patch } : t)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= tiles.length) return
    const next = [...tiles]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="stack">
      {tiles.map((t, i) => (
        <div key={t.id} className="card" style={{ padding: 'var(--space-3)' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            <label className="field">
              <span className="label">Label</span>
              <input className="input input-sm" value={t.label} onChange={(e) => set(i, { label: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Metric</span>
              <select
                className="select"
                style={{ height: 30 }}
                value={t.metric}
                onChange={(e) => {
                  const metric = e.target.value as TileConfig['metric']
                  set(i, { metric, format: METRICS[metric].format })
                }}
              >
                {METRIC_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k} — {METRICS[k].description}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Format</span>
              <select className="select" style={{ height: 30 }} value={t.format} onChange={(e) => set(i, { format: e.target.value as TileConfig['format'] })}>
                {FORMAT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Accent rule</span>
              <ToneSelect value={t.accent} ariaLabel="Accent" onChange={(accent) => set(i, { accent })} />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="label">Hint template</span>
              <input className="input input-sm mono" value={t.hint} onChange={(e) => set(i, { hint: e.target.value })} />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="label">Tooltip</span>
              <input className="input input-sm" value={t.tooltip} onChange={(e) => set(i, { tooltip: e.target.value })} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 'var(--space-2)', justifyContent: 'space-between' }}>
            <Toggle checked={t.visible} onChange={(visible) => set(i, { visible })} label="Visible" />
            <span className="row-tight">
              <button className="btn btn-sm btn-icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp size={14} />
              </button>
              <button className="btn btn-sm btn-icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === tiles.length - 1}>
                <ArrowDown size={14} />
              </button>
              <button className="btn btn-sm btn-icon" aria-label="Remove card" onClick={() => onChange(tiles.filter((_, k) => k !== i))}>
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        </div>
      ))}
      <div>
        <button
          className="btn btn-sm"
          onClick={() =>
            onChange([...tiles, { id: `tile-${Date.now()}`, label: 'New card', metric: 'receipts', format: 'int', hint: '', tooltip: '', accent: 'neutral', visible: true }])
          }
        >
          <Plus size={14} /> Add card
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Columns

export function ColumnEditor<K extends string>({ cols, onChange, fixed }: { cols: ColumnConfig<K>[]; onChange: (c: ColumnConfig<K>[]) => void; fixed: K[] }) {
  const set = (i: number, patch: Partial<ColumnConfig<K>>) => onChange(cols.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const setTip = (i: number, key: 'purpose' | 'formula' | 'source', v: string) => onChange(cols.map((c, k) => (k === i ? { ...c, tip: { ...c.tip, [key]: v } } : c)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= cols.length || fixed.includes(cols[j].id) || fixed.includes(cols[i].id)) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="table-frame no-max" style={{ borderTop: 0 }}>
      <table className="dt">
        <thead>
          <tr>
            <th>Show</th>
            <th>Header</th>
            <th>Purpose</th>
            <th>Formula</th>
            <th>SAP source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cols.map((c, i) => {
            const isFixed = fixed.includes(c.id)
            return (
              <tr key={c.id}>
                <td>
                  <label className="toggle" aria-label={`Show ${c.label}`}>
                    <input type="checkbox" checked={c.visible || isFixed} disabled={isFixed} onChange={(e) => set(i, { visible: e.target.checked })} />
                    <span className="toggle-track" />
                  </label>
                </td>
                <td>
                  <input className="input input-sm" style={{ width: 120 }} value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
                </td>
                <td>
                  <input className="input input-sm" style={{ width: 260 }} value={c.tip.purpose} onChange={(e) => setTip(i, 'purpose', e.target.value)} />
                </td>
                <td>
                  <input className="input input-sm mono" style={{ width: 260 }} value={c.tip.formula} onChange={(e) => setTip(i, 'formula', e.target.value)} />
                </td>
                <td>
                  <input className="input input-sm mono" style={{ width: 220 }} value={c.tip.source} onChange={(e) => setTip(i, 'source', e.target.value)} />
                </td>
                <td>
                  {!isFixed && (
                    <span className="row-tight" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm btn-icon" aria-label="Move left" onClick={() => move(i, -1)} disabled={i === 0 || fixed.includes(cols[i - 1].id)}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="btn btn-sm btn-icon" aria-label="Move right" onClick={() => move(i, 1)} disabled={i === cols.length - 1}>
                        <ArrowDown size={14} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Labels

export function LabelEditor({ draft, onChange }: { draft: AppConfig; onChange: (d: AppConfig) => void }) {
  const { cfg } = useUi()
  const [q, setQ] = useState('')
  const all = useMemo(() => flattenLabels(draft.labels), [draft.labels])
  const defaults = useMemo(() => new Map(flattenLabels(DEFAULT_CONFIG.labels).map((x) => [x.path, x.value])), [])
  const needle = q.trim().toLowerCase()
  const shown = needle ? all.filter((x) => x.path.toLowerCase().includes(needle) || x.value.toLowerCase().includes(needle)) : all
  return (
    <div className="stack">
      <input className="input" placeholder={cfg.labels.config.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={cfg.labels.config.search} />
      <span className="caption muted">
        <span className="mono">{shown.length}</span> of <span className="mono">{all.length}</span> strings
      </span>
      <div className="table-frame" style={{ maxHeight: 480 }}>
        <table className="dt">
          <thead>
            <tr>
              <th>Key</th>
              <th>Text</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const def = defaults.get(x.path)
              return (
                <tr key={x.path}>
                  <td className="mono caption muted" style={{ width: 1 }}>
                    {x.path}
                  </td>
                  <td style={{ width: '100%' }}>
                    <input className="input input-sm" style={{ width: '100%', minWidth: 240 }} value={x.value} onChange={(e) => onChange(setPath(draft, `labels.${x.path}`, e.target.value))} />
                  </td>
                  <td>
                    {def !== undefined && def !== x.value && (
                      <button className="btn btn-sm btn-icon btn-ghost" aria-label="Restore default" title={`Default: ${def}`} onClick={() => onChange(setPath(draft, `labels.${x.path}`, def))}>
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lists

export function ListInput({ value, onChange, numeric = false, ariaLabel }: { value: (string | number)[]; onChange: (v: string[] | number[]) => void; numeric?: boolean; ariaLabel: string }) {
  const [text, setText] = useState(value.join(', '))
  return (
    <input
      className="input input-sm mono"
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
        if (numeric) {
          const nums = parts.map(Number).filter((n) => Number.isFinite(n) && n > 0)
          if (nums.length) onChange([...new Set(nums)].sort((a, b) => a - b))
          else setText(value.join(', '))
        } else onChange(parts)
      }}
    />
  )
}

export { NumberInput }
