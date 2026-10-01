import { useCallback, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Search } from 'lucide-react'
import type { ScoreColumnKey } from '../config/types'
import { interpolate, type ScopeResult, type VendorRow } from '../engine/compute'
import { shareFormulas } from '../engine/explain'
import { DataTable, type Col } from '../ui/DataTable'
import { useUi } from '../ui/context'
import { CoverageNote, CritCell, FlagPills, Legend, metricVars, Tiles, VendorCell } from '../ui/parts'
import { ColumnTipContent, Field, Help, Segmented, Toggle, useNarrow } from '../ui/primitives'

interface Props {
  res: ScopeResult
  minPoLines: number
  setMinPoLines: (n: number) => void
  onOpen: (r: VendorRow) => void
  onCopy: (text: string, count: number) => void
  scopeKey: string
}

export function Scorecard({ res, minPoLines, setMinPoLines, onOpen, onCopy, scopeKey }: Props) {
  const { cfg, f } = useUi()
  const L = cfg.labels
  const [find, setFind] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [top80, setTop80] = useState(false)
  const [issueOnly, setIssueOnly] = useState(false)
  const [mode, setMode] = useState<'plain' | 'ranks'>('plain')
  const narrow = useNarrow()
  const sortedRef = useRef<VendorRow[]>([])
  const onSorted = useCallback((rows: VendorRow[]) => {
    sortedRef.current = rows
  }, [])

  const vars = metricVars(res.metrics, f)
  const share = shareFormulas(cfg)
  const rows = useMemo(() => {
    const q = find.trim().toLowerCase()
    return res.rows.filter(
      (r) =>
        r.poLines >= minPoLines &&
        (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)) &&
        (!reviewOnly || r.meetsReview) &&
        (!top80 || r.inTopSpend) &&
        (!issueOnly || r.flags.length > 0),
    )
  }, [res.rows, minPoLines, find, reviewOnly, top80, issueOnly])

  const colDefs: Record<ScoreColumnKey, Omit<Col<VendorRow>, 'id' | 'header' | 'tip'>> = {
    rank: { num: true, sort: (r) => r.rank, render: (r) => <span className="mono">{r.rank ?? '—'}</span>, frozenWidth: narrow ? 40 : 56 },
    vendor: { sort: (r) => r.name, render: (r) => <VendorCell r={r} />, frozenWidth: narrow ? 176 : 264 },
    lead: { num: true, sort: (r) => (mode === 'ranks' ? r.lead.rank : r.lead.value), render: (r) => <CritCell c={r.lead} kind="days" mode={mode} />, tdClass: 'cell-crit' },
    fill: { num: true, sort: (r) => (mode === 'ranks' ? r.fill.rank : r.fill.value), render: (r) => <CritCell c={r.fill} kind="pct" mode={mode} />, tdClass: 'cell-crit' },
    onTime: { num: true, sort: (r) => (mode === 'ranks' ? r.onTime.rank : r.onTime.value), render: (r) => <CritCell c={r.onTime} kind="pct" mode={mode} />, tdClass: 'cell-crit' },
    reqSlip: { num: true, sort: (r) => (mode === 'ranks' ? r.reqSlip.rank : r.reqSlip.value), render: (r) => <CritCell c={r.reqSlip} kind="signedDays" mode={mode} />, tdClass: 'cell-crit' },
    score: { num: true, sort: (r) => r.score, render: (r) => <span className="mono">{r.score === null ? '—' : f.num(r.score, Number.isInteger(r.score) ? 0 : 1)}</span> },
    issues: { sort: (r) => (r.severity === 'serious' ? 2 : r.severity ? 1 : 0), render: (r) => <FlagPills r={r} /> },
    lastPo: { num: true, sort: (r) => r.lastPo, render: (r) => <span className="mono">{f.fmt(r.lastPo, 'date')}</span> },
    value: { num: true, sort: (r) => r.value, render: (r) => <span className="mono">{f.fmt(r.value, 'money')}</span> },
    poCount: { num: true, sort: (r) => r.poCount, render: (r) => <span className="mono">{f.fmt(r.poCount, 'int')}</span> },
    share: { num: true, sort: (r) => r.share, render: (r) => <span className="mono">{f.fmt(r.share, 'pct')}</span> },
    cumShare: { num: true, sort: (r) => r.cumShare, render: (r) => <span className="mono">{f.fmt(r.cumShare, 'pct')}</span> },
    poLines: { num: true, sort: (r) => r.poLines, render: (r) => <span className="mono">{f.fmt(r.poLines, 'int')}</span> },
    receipts: { num: true, sort: (r) => r.receipts, render: (r) => <span className="mono">{f.fmt(r.receipts, 'int')}</span> },
  }
  const cols: Col<VendorRow>[] = cfg.columns.scorecard
    .filter((c) => c.visible || c.id === 'rank' || c.id === 'vendor')
    .map((c) => {
      // Share formulas follow the live Share settings, whatever tooltip text was saved earlier.
      const tip = c.id === 'share' ? { ...c.tip, formula: share.share } : c.id === 'cumShare' ? { ...c.tip, formula: share.cumShare } : c.tip
      return { id: c.id, header: c.label, tip: <ColumnTipContent tip={tip} />, ...colDefs[c.id] }
    })

  const copy = () => {
    const out = sortedRef.current
    const header = ['Rank', 'Vendor code', 'Vendor name', 'Group', 'Lead time (d)', 'Lead verdict', 'Fill', 'Fill verdict', 'On time', 'On-time verdict', 'vs Required (d)', 'vs Required verdict', 'Score', 'Issues', 'Status', 'Last PO', 'Value', 'POs', 'Share', 'Cum. share', 'PO lines', 'Receipts']
    const lines = out.map((r) =>
      [
        r.rank ?? '', r.code, r.name, r.group,
        r.lead.value?.toFixed(1) ?? '', r.lead.verdict,
        r.fill.value !== null ? (r.fill.value * 100).toFixed(1) + '%' : '', r.fill.verdict,
        r.onTime.value !== null ? (r.onTime.value * 100).toFixed(1) + '%' : '', r.onTime.verdict,
        r.reqSlip.value?.toFixed(1) ?? '', r.reqSlip.verdict,
        r.score ?? '', r.flags.map((x) => `${cfg.issues.flags[x.key].label}: ${x.reason}`).join('; '),
        r.stillInUse ? L.legend.stillInUse : L.legend.notInUse,
        f.fmt(r.lastPo, 'date'), Math.round(r.value), r.poCount, (r.share * 100).toFixed(1) + '%', (r.cumShare * 100).toFixed(1) + '%', r.poLines, r.receipts,
      ].join('\t'),
    )
    onCopy([header.join('\t'), ...lines].join('\n'), out.length)
  }

  return (
    <div className="stack-section">
      <Tiles tiles={cfg.tiles.scorecard} metrics={res.metrics} />
      <CoverageNote res={res} />
      <Legend />
      <div className="card card-flush">
        <div className="filters">
          <Field label={L.filters.find.label} tip={L.filters.find.tip}>
            <span className="search">
              <Search size={14} />
              <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or code" aria-label={L.filters.find.label} />
            </span>
          </Field>
          <Field label={L.filters.minPoLines.label} tip={L.filters.minPoLines.tip}>
            <Segmented
              ariaLabel={L.filters.minPoLines.label}
              value={minPoLines}
              onChange={setMinPoLines}
              options={cfg.filters.minPoLinesOptions.map((n) => ({ value: n, label: <span className="mono">{n}</span> }))}
            />
          </Field>
          <div className="stack" style={{ gap: 'var(--space-2)', paddingBottom: 2 }}>
            <Toggle checked={reviewOnly} onChange={setReviewOnly} label={L.filters.reviewOnly.label} tip={L.filters.reviewOnly.tip} />
            <Toggle checked={top80} onChange={setTop80} label={interpolate(L.filters.top80.label, vars)} tip={share.top} />
          </div>
          <div className="stack" style={{ gap: 'var(--space-2)', paddingBottom: 2 }}>
            <Toggle checked={issueOnly} onChange={setIssueOnly} label={L.filters.issueOnly.label} tip={L.filters.issueOnly.tip} />
            <span className="row-tight small muted">
              <span className="mono">{res.population}</span> ranked <Help tip={`Rank population: ${cfg.scoring.rankPopulation === 'scope' ? 'every vendor in scope' : `vendors in scope with ≥ ${minPoLines} PO lines`}. Change it under Configuration → Ranking method.`} />
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div className="row">
            <span className="row-tight">
              <Segmented ariaLabel="Display mode" value={mode} onChange={setMode} options={[{ value: 'plain', label: L.modes.plain }, { value: 'ranks', label: L.modes.ranks }]} />
              <Help tip={L.modes.tip} />
            </span>
            <button className="btn btn-advance" onClick={copy}>
              <ClipboardCopy size={16} />
              {L.actions.copyShortlist}
            </button>
          </div>
        </div>
        <DataTable
          rows={rows}
          cols={cols}
          rowKey={(r) => r.code}
          defaultSort={{ id: 'rank', dir: 'asc' }}
          pageSizes={cfg.filters.pageSizes}
          pageSizeDefault={cfg.filters.pageSizeDefault}
          onRowClick={onOpen}
          empty={L.table.empty}
          labels={L.table}
          onSorted={onSorted}
          resetKey={`${scopeKey}|${find}|${minPoLines}|${reviewOnly}|${top80}|${issueOnly}`}
        />
      </div>
    </div>
  )
}
