import { useMemo, useState } from 'react'
import { Database, FileDown, FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { autoMap, convert, guessTable, readFile, type RawSheet } from '../data/parse'
import { FIELDS, type Dataset, type TableKey } from '../data/schema'
import { interpolate } from '../engine/compute'
import { useUi } from '../ui/context'
import { Field, Pill } from '../ui/primitives'

interface Props {
  dataset: Dataset | null
  onLoad: (ds: Dataset) => void
  onDemo: () => void
  onClear: () => void
}

interface Staged {
  key: string
  file: string
  sheet: RawSheet
  table: TableKey | ''
  map: Record<string, number>
}

const TABLES: TableKey[] = ['po', 'grpo', 'returns']

export function UploadTab({ dataset, onLoad, onDemo, onClear }: Props) {
  const { cfg, f } = useUi()
  const U = cfg.labels.upload
  const [staged, setStaged] = useState<Staged[]>([])
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ table: TableKey; rows: number; skipped: number; reasons: Record<string, number>; originDefaulted: number }[] | null>(null)

  const addFiles = async (files: FileList | File[]) => {
    setError(null)
    const next: Staged[] = []
    for (const file of Array.from(files)) {
      try {
        const sheets = await readFile(file)
        for (const s of sheets) {
          if (s.rows.length === 0) continue
          const t = guessTable(s, cfg) ?? ''
          next.push({ key: `${file.name}|${s.name}|${Date.now()}`, file: file.name, sheet: s, table: t, map: t ? autoMap(s.headers, t, cfg.data.fieldAliases[t]) : {} })
        }
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    setStaged((cur) => [...cur, ...next])
  }

  const setTable = (i: number, t: TableKey | '') =>
    setStaged((cur) => cur.map((s, k) => (k === i ? { ...s, table: t, map: t ? autoMap(s.sheet.headers, t, cfg.data.fieldAliases[t]) : {} } : s)))
  const setMap = (i: number, field: string, idx: number) => setStaged((cur) => cur.map((s, k) => (k === i ? { ...s, map: { ...s.map, [field]: idx } } : s)))

  const byTable = (t: TableKey) => staged.filter((s) => s.table === t)
  const missing = staged.flatMap((s) => (s.table ? FIELDS[s.table].filter((fd) => fd.required && (s.map[fd.key] ?? -1) < 0).map((fd) => `${s.sheet.name}: ${fd.label}`) : []))
  const canLoad = byTable('po').length > 0 && byTable('grpo').length > 0 && missing.length === 0

  const load = () => {
    const ds: Dataset = { po: [], grpo: [], returns: [], source: [...new Set(staged.filter((s) => s.table).map((s) => s.file))].join(', '), loadedAt: new Date().toISOString(), isDemo: false }
    const rep: NonNullable<typeof report> = []
    for (const t of TABLES) {
      let rows = 0
      let skipped = 0
      let originDefaulted = 0
      const reasons: Record<string, number> = {}
      for (const s of byTable(t)) {
        // Overloads need a literal table; dispatch explicitly.
        const r = t === 'po' ? convert('po', s.sheet, s.map, cfg) : t === 'grpo' ? convert('grpo', s.sheet, s.map, cfg) : convert('returns', s.sheet, s.map, cfg)
        ;(ds[t] as unknown[]).push(...r.rows)
        rows += r.rows.length
        skipped += r.skipped
        originDefaulted += r.originDefaulted
        for (const [k, v] of Object.entries(r.reasons)) reasons[k] = (reasons[k] ?? 0) + v
      }
      rep.push({ table: t, rows, skipped, reasons, originDefaulted })
    }
    setReport(rep)
    onLoad(ds)
    setStaged([])
  }

  const totals = useMemo(() => {
    if (!dataset) return null
    const range = (xs: number[]) => (xs.length ? [xs.reduce((a, b) => Math.min(a, b)), xs.reduce((a, b) => Math.max(a, b))] : null)
    return {
      poLines: dataset.po.length,
      poDocs: new Set(dataset.po.map((l) => l.poDoc)).size,
      vendors: new Set(dataset.po.map((l) => l.vendorCode)).size,
      qtyOrdered: dataset.po.reduce((s, l) => s + l.qtyOrdered, 0),
      value: dataset.po.reduce((s, l) => s + l.lineValue, 0),
      poRange: range(dataset.po.map((l) => l.poDate)),
      grpo: dataset.grpo.length,
      qtyReceived: dataset.grpo.reduce((s, g) => s + g.qtyReceived, 0),
      grpoRange: range(dataset.grpo.map((g) => g.grpoDate)),
      returns: dataset.returns.length,
      qtyReturned: dataset.returns.reduce((s, r) => s + r.qtyReturned, 0),
    }
  }, [dataset])

  const template = (t: TableKey) => {
    const headers = FIELDS[t].map((fd) => cfg.data.fieldAliases[t][fd.key]?.[0] ?? fd.label)
    const blob = new Blob(['﻿' + headers.join(',') + '\n'], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `template-${t}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack-section">
      <div className="card stack">
        <div className="card-head">
          <div className="stack" style={{ gap: 2 }}>
            <span className="card-title">{U.title}</span>
            <span className="small muted">{U.intro}</span>
          </div>
        </div>
        <div className="grid-2" style={{ gap: 'var(--gap)' }}>
          {TABLES.map((t) => (
            <div key={t} className="stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{U[`${t}Title`]}</span>
              <span className="small muted">{U[`${t}Hint`]}</span>
              <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => template(t)}>
                <FileDown size={14} /> CSV template
              </button>
            </div>
          ))}
        </div>
        <label
          className={`dropzone${drag ? ' drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          <FileSpreadsheet size={24} />
          <span>Drop CSV or Excel files here, or</span>
          <span className="btn btn-sm">
            <Upload size={14} /> {U.chooseFile}
          </span>
          <input type="file" hidden multiple accept=".csv,.txt,.xlsx,.xlsm" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </label>
        {error && <span className="field-error">{error}</span>}

        {staged.map((s, i) => (
          <div key={s.key} className="card stack" style={{ background: 'var(--surface-page)' }}>
            <div className="card-head">
              <span className="row-tight">
                <strong style={{ fontWeight: 500 }}>{s.file}</strong>
                {s.sheet.name !== s.file && <span className="tag">{U.sheet}: {s.sheet.name}</span>}
                <span className="small muted">{interpolate(U.rowsRead, { rows: f.fmt(s.sheet.rows.length, 'int') })}</span>
              </span>
              <span className="row-tight">
                <select className="select" value={s.table} aria-label="Table" onChange={(e) => setTable(i, e.target.value as TableKey | '')}>
                  <option value="">Ignore this sheet</option>
                  {TABLES.map((t) => (
                    <option key={t} value={t}>
                      {U[`${t}Title`]}
                    </option>
                  ))}
                </select>
                <button className="btn btn-icon" aria-label="Remove" onClick={() => setStaged((cur) => cur.filter((_, k) => k !== i))}>
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
            {s.table && (
              <div className="map-grid">
                {FIELDS[s.table].map((fd) => {
                  const idx = s.map[fd.key] ?? -1
                  const bad = fd.required && idx < 0
                  return (
                    <Field key={fd.key} label={<>{fd.label} <span className="muted">({fd.required ? U.required : U.optional})</span></>} error={bad ? ' ' : null}>
                      <select className="select" aria-invalid={bad} style={bad ? { borderColor: 'var(--status-red)' } : undefined} value={idx} onChange={(e) => setMap(i, fd.key, Number(e.target.value))}>
                        <option value={-1}>{U.notMapped}</option>
                        {s.sheet.headers.map((h, k) => (
                          <option key={k} value={k}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {staged.length > 0 && (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted">
              {missing.length > 0 ? `${U.missingRequired} (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})` : byTable('po').length === 0 || byTable('grpo').length === 0 ? 'PO lines and GRPO lines are both required.' : ''}
            </span>
            <button className="btn btn-advance" disabled={!canLoad} onClick={load}>
              <Database size={16} /> {cfg.labels.actions.loadData}
            </button>
          </div>
        )}
      </div>

      {report && (
        <div className="card stack">
          <span className="card-title">{U.reconcileTitle}</span>
          <div className="table-frame no-max" style={{ borderTop: 0 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="num">Rows loaded</th>
                  <th className="num">Rows skipped</th>
                  <th>Why skipped</th>
                  <th className="num">Origin defaulted</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.table}>
                    <td>{U[`${r.table}Title`]}</td>
                    <td className="num mono">{f.fmt(r.rows, 'int')}</td>
                    <td className="num mono">{f.fmt(r.skipped, 'int')}</td>
                    <td className="small" style={{ whiteSpace: 'normal' }}>{Object.entries(r.reasons).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}</td>
                    <td className="num mono">{r.table === 'po' ? f.fmt(r.originDefaulted, 'int') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="card-head">
          <span className="card-title">{U.currentTitle}</span>
          <span className="row-tight">
            <button className="btn" onClick={onDemo}>
              {cfg.labels.actions.loadDemo}
            </button>
            {dataset && (
              <button className="btn" onClick={onClear}>
                <Trash2 size={16} /> {cfg.labels.actions.clearData}
              </button>
            )}
          </span>
        </div>
        {!dataset || !totals ? (
          <p className="small muted">{cfg.labels.empty.noDataHint}</p>
        ) : (
          <>
            <div className="row-tight small">
              <span className="muted">{U.source}:</span> <span>{dataset.source}</span>
              <span className="muted">· {U.loadedAt}:</span> <span className="mono">{new Date(dataset.loadedAt).toLocaleString(cfg.format.locale)}</span>
              {dataset.isDemo && <Pill tone="amber">Demo</Pill>}
            </div>
            {dataset.isDemo && <span className="small" style={{ color: 'var(--ink-amber)' }}>{U.demoNote}</span>}
            <span className="small muted">{U.reconcileHint}</span>
            <div className="kv">
              <div><span className="caption muted">PO lines</span><span className="mono">{f.fmt(totals.poLines, 'int')}</span></div>
              <div><span className="caption muted">PO documents</span><span className="mono">{f.fmt(totals.poDocs, 'int')}</span></div>
              <div><span className="caption muted">Vendors</span><span className="mono">{f.fmt(totals.vendors, 'int')}</span></div>
              <div><span className="caption muted">Σ qty ordered</span><span className="mono">{f.num(totals.qtyOrdered, 0)}</span></div>
              <div><span className="caption muted">Σ line total</span><span className="mono">{f.fmt(totals.value, 'moneyFull')}</span></div>
              <div><span className="caption muted">PO dates</span><span className="mono">{totals.poRange ? `${f.fmt(totals.poRange[0], 'date')} – ${f.fmt(totals.poRange[1], 'date')}` : '—'}</span></div>
              <div><span className="caption muted">GRPO lines</span><span className="mono">{f.fmt(totals.grpo, 'int')}</span></div>
              <div><span className="caption muted">Σ qty received</span><span className="mono">{f.num(totals.qtyReceived, 0)}</span></div>
              <div><span className="caption muted">GRPO dates</span><span className="mono">{totals.grpoRange ? `${f.fmt(totals.grpoRange[0], 'date')} – ${f.fmt(totals.grpoRange[1], 'date')}` : '—'}</span></div>
              <div><span className="caption muted">Return lines</span><span className="mono">{f.fmt(totals.returns, 'int')}</span></div>
              <div><span className="caption muted">Σ qty returned</span><span className="mono">{f.num(totals.qtyReturned, 0)}</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
