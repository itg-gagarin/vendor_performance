import { useCallback, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Search } from 'lucide-react'
import type { FlagKey, IssueColumnKey } from '../config/types'
import { FLAGS } from '../config/types'
import { interpolate, type ScopeResult, type VendorRow } from '../engine/compute'
import { DataTable, type Col } from '../ui/DataTable'
import { useUi } from '../ui/context'
import { FlagPills, Tiles, VendorCell } from '../ui/parts'
import { ColumnTipContent, Field, Pill, Segmented, Tip, Toggle, useNarrow } from '../ui/primitives'

interface Props {
  res: ScopeResult
  onOpen: (r: VendorRow) => void
  onCopy: (text: string, count: number) => void
  scopeKey: string
}

export function Issues({ res, onOpen, onCopy, scopeKey }: Props) {
  const { cfg, f } = useUi()
  const L = cfg.labels
  const [find, setFind] = useState('')
  const [inUse, setInUse] = useState(cfg.filters.stillInUseDefault)
  const [severity, setSeverity] = useState<'any' | 'serious'>('any')
  const [type, setType] = useState<FlagKey | ''>('')
  const narrow = useNarrow()
  const sortedRef = useRef<VendorRow[]>([])
  const onSorted = useCallback((rows: VendorRow[]) => {
    sortedRef.current = rows
  }, [])

  const rows = useMemo(() => {
    const q = find.trim().toLowerCase()
    return res.rows.filter(
      (r) =>
        r.flags.length > 0 &&
        (!inUse || r.stillInUse) &&
        (severity === 'any' || r.severity === 'serious') &&
        (!type || r.flags.some((x) => x.key === type)) &&
        (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)),
    )
  }, [res.rows, find, inUse, severity, type])

  const pct = (v: number | null) => <span className="mono">{f.fmt(v, 'pct')}</span>
  const colDefs: Record<IssueColumnKey, Omit<Col<VendorRow>, 'id' | 'header' | 'tip'>> = {
    vendor: { sort: (r) => r.name, render: (r) => <VendorCell r={r} showMarks={false} />, frozenWidth: narrow ? 176 : 248 },
    flags: { sort: (r) => (r.severity === 'serious' ? 2 : 1), render: (r) => <FlagPills r={r} withReason /> },
    lastPo: {
      num: true,
      sort: (r) => r.lastPo,
      render: (r) => (
        <span className="stack" style={{ gap: 0 }}>
          <span className="mono">{f.fmt(r.lastPo, 'date')}</span>
          <span className="caption muted">{interpolate(L.table.daysAgo, { days: r.daysSinceLastPo ?? '—' })}</span>
        </span>
      ),
    },
    status: {
      sort: (r) => r.daysSinceActivity,
      render: (r) => (
        <Tip content={r.inUseReason}>
          <span className="stack" style={{ gap: 0 }}>
            <Pill tone={r.stillInUse ? 'emerald' : 'neutral'}>{r.stillInUse ? L.legend.stillInUse : L.legend.notInUse}</Pill>
          </span>
        </Tip>
      ),
    },
    onTime: { num: true, sort: (r) => r.onTime.value, render: (r) => pct(r.onTime.value) },
    reqSlip: { num: true, sort: (r) => r.reqSlip.value, render: (r) => <span className="mono">{f.fmt(r.reqSlip.value, 'signedDays')}</span> },
    lead: { num: true, sort: (r) => r.lead.value, render: (r) => <span className="mono">{f.fmt(r.lead.value, 'days')}</span> },
    fill: { num: true, sort: (r) => r.fill.value, render: (r) => pct(r.fill.value) },
    returns: { num: true, sort: (r) => (r.returnsRate !== null && Number.isFinite(r.returnsRate) ? r.returnsRate : r.returnsRate === null ? null : 1e9), render: (r) => (r.returnsRate !== null && !Number.isFinite(r.returnsRate) ? <span className="mono">&gt; 100%</span> : pct(r.returnsRate)) },
    openRows: { num: true, sort: (r) => r.openRows, render: (r) => <span className="mono">{r.openRows}</span> },
    value: { num: true, sort: (r) => r.value, render: (r) => <span className="mono">{f.fmt(r.value, 'money')}</span> },
    receipts: { num: true, sort: (r) => r.receipts, render: (r) => <span className="mono">{r.receipts}</span> },
  }
  const cols: Col<VendorRow>[] = cfg.columns.issues
    .filter((c) => c.visible || c.id === 'vendor')
    .map((c) => ({ id: c.id, header: c.label, tip: <ColumnTipContent tip={c.tip} />, ...colDefs[c.id] }))

  const copy = () => {
    const out = sortedRef.current
    const header = ['Vendor code', 'Vendor name', 'Group', 'Severity', 'Issues', 'Last PO', 'Days since last PO', 'Still in use', 'Still-in-use rule', 'On time', 'Lead time (d)', 'Fill', 'vs Required (d)', 'Returns', 'Open rows', 'Value', 'Receipts']
    const p = (v: number | null) => (v === null ? '' : Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '>100%')
    const lines = out.map((r) =>
      [
        r.code, r.name, r.group, r.severity ? cfg.issues.severity[r.severity].label : '',
        r.flags.map((x) => `${cfg.issues.flags[x.key].label}: ${x.reason}`).join('; '),
        f.fmt(r.lastPo, 'date'), r.daysSinceLastPo ?? '', r.stillInUse ? L.legend.stillInUse : L.legend.notInUse, r.inUseReason,
        p(r.onTime.value), r.lead.value?.toFixed(1) ?? '', p(r.fill.value), r.reqSlip.value?.toFixed(1) ?? '', p(r.returnsRate), r.openRows, Math.round(r.value), r.receipts,
      ].join('\t'),
    )
    onCopy([header.join('\t'), ...lines].join('\n'), out.length)
  }

  return (
    <div className="stack-section">
      <Tiles tiles={cfg.tiles.issues} metrics={res.metrics} />
      <div className="card card-flush">
        <div className="filters">
          <Field label={L.filters.find.label} tip={L.filters.find.tip}>
            <span className="search">
              <Search size={14} />
              <input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name or code" aria-label={L.filters.find.label} />
            </span>
          </Field>
          <Field label={L.filters.severity.label} tip={L.filters.severity.tip}>
            <Segmented ariaLabel={L.filters.severity.label} value={severity} onChange={setSeverity} options={[{ value: 'any', label: L.filters.severityAny }, { value: 'serious', label: L.filters.severitySerious }]} />
          </Field>
          <Field label={L.filters.issueType.label} tip={L.filters.issueType.tip}>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as FlagKey | '')}>
              <option value="">{L.filters.issueTypeAny}</option>
              {FLAGS.filter((k) => cfg.issues.flags[k].enabled).map((k) => (
                <option key={k} value={k}>
                  {cfg.issues.flags[k].label}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ paddingBottom: 8 }}>
            <Toggle checked={inUse} onChange={setInUse} label={L.filters.stillInUse.label} tip={L.filters.stillInUse.tip} />
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-advance" onClick={copy}>
            <ClipboardCopy size={16} />
            {L.actions.copyShortlist}
          </button>
        </div>
        <DataTable
          rows={rows}
          cols={cols}
          rowKey={(r) => r.code}
          defaultSort={{ id: 'lastPo', dir: 'desc' }}
          pageSizes={cfg.filters.pageSizes}
          pageSizeDefault={cfg.filters.pageSizeDefault}
          onRowClick={onOpen}
          empty={L.table.emptyIssues}
          labels={L.table}
          onSorted={onSorted}
          resetKey={`${scopeKey}|${find}|${inUse}|${severity}|${type}`}
        />
      </div>
    </div>
  )
}
