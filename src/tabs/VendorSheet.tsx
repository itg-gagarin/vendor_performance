import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { MEASURES, type Criterion } from '../config/types'
import { measureValues, type ScopeResult, type VendorRow } from '../engine/compute'
import type { Prepared } from '../engine/prepare'
import { binLabels, histogram } from '../engine/stats'
import { useUi } from '../ui/context'
import { Histogram } from '../ui/Histogram'
import { FlagPills } from '../ui/parts'
import { Pill, useEscape } from '../ui/primitives'

interface Props {
  row: VendorRow
  res: ScopeResult
  prepared: Prepared
  onClose: () => void
}

export function VendorSheet({ row: r, res, prepared, onClose }: Props) {
  const { cfg, f } = useUi()
  const D = cfg.labels.detail
  const L = cfg.labels
  useEscape(onClose)

  const scopePo = useMemo(() => res.rows.flatMap((x) => x.poIdx), [res.rows])
  const scopeRc = useMemo(() => res.rows.flatMap((x) => x.receiptIdx), [res.rows])

  const profiles = MEASURES.map((m) => {
    const edges = cfg.bins[m][r.origin]
    const mine = measureValues(prepared, m, r.poIdx, r.receiptIdx, r.origin)
    const ref = measureValues(prepared, m, scopePo, scopeRc, r.origin)
    const refCounts = histogram(ref, edges)
    const refTotal = ref.length
    return { m, edges, counts: histogram(mine, edges), n: mine.length, reference: refCounts.map((c) => (refTotal ? c / refTotal : 0)) }
  })

  const topItems = useMemo(() => {
    const byItem = new Map<string, { name: string; value: number; qty: number; lines: number }>()
    for (const i of r.poIdx) {
      const l = prepared.po[i]
      const e = byItem.get(l.itemCode) ?? { name: l.itemName, value: 0, qty: 0, lines: 0 }
      e.value += l.lineValue
      e.qty += l.qtyOrdered
      e.lines++
      byItem.set(l.itemCode, e)
    }
    return [...byItem.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 5)
  }, [r, prepared])

  const critRows: { key: Criterion; label: string; kind: 'days' | 'pct' | 'signedDays' }[] = [
    { key: 'lead', label: cfg.labels.criteria.lead, kind: 'days' },
    { key: 'fill', label: cfg.labels.criteria.fill, kind: 'pct' },
    { key: 'onTime', label: cfg.labels.criteria.onTime, kind: 'pct' },
    { key: 'reqSlip', label: cfg.labels.criteria.reqSlip, kind: 'signedDays' },
  ]

  const span = r.firstPo !== null && r.lastPo !== null ? r.lastPo - r.firstPo : null

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={r.name}>
        <div className="sheet-head">
          <div className="stack" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
            <h4 style={{ overflowWrap: 'anywhere' }}>{r.name}</h4>
            <span className="row-tight caption muted">
              <span className="mono">{r.code}</span>
              {r.group && <span className="tag">{r.group}</span>}
              <span className="tag">{r.origin}</span>
              <Pill tone={r.stillInUse ? 'emerald' : 'neutral'}>{r.stillInUse ? L.legend.stillInUse : L.legend.notInUse}</Pill>
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={L.actions.close}>
            <X size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <section className="sheet-section">
            <span className="label">{D.issues}</span>
            <FlagPills r={r} withReason />
          </section>

          <section className="sheet-section">
            <span className="label">{D.status}</span>
            <span className="row-tight small">
              <Pill tone={r.stillInUse ? 'emerald' : 'neutral'}>{r.stillInUse ? L.legend.stillInUse : L.legend.notInUse}</Pill>
              <span className="muted">{r.inUseReason}</span>
            </span>
          </section>

          <section className="kv">
            <div>
              <span className="label">{D.scoreRank}</span>
              <span className="mono">
                {r.score === null ? '—' : f.num(r.score, Number.isInteger(r.score) ? 0 : 1)} · #{r.rank ?? '—'} {L.table.of} {res.population}
              </span>
            </div>
            <div>
              <span className="label">{D.lastPo}</span>
              <span className="mono">{f.fmt(r.lastPo, 'date')}</span>
            </div>
            <div>
              <span className="label">{D.lastGrpo}</span>
              <span className="mono">{f.fmt(r.lastGrpo, 'date')}</span>
            </div>
            <div>
              <span className="label">{cfg.columns.scorecard.find((c) => c.id === 'share')?.label ?? 'Share'}</span>
              <span className="mono">
                {f.fmt(r.share, 'pct')} · cum. {f.fmt(r.cumShare, 'pct')}
              </span>
              <span className="caption muted">
                {r.poCount} POs · {cfg.labels.share.basis[cfg.spend.basis]} {cfg.labels.share.partition[cfg.spend.partition]}
              </span>
            </div>
            <div>
              <span className="label">{D.openRows}</span>
              <span className="mono">{r.openRows}</span>
            </div>
            <div>
              <span className="label">{cfg.columns.scorecard.find((c) => c.id === 'value')!.label}</span>
              <span className="mono">{f.fmt(r.value, 'moneyFull')}</span>
            </div>
            <div>
              <span className="label">{cfg.columns.scorecard.find((c) => c.id === 'receipts')!.label}</span>
              <span className="mono">
                {r.receipts} ({r.linkedReceipts} linked)
              </span>
            </div>
          </section>

          <section className="sheet-section">
            <span className="label">{D.criteria}</span>
            <div className="table-frame no-max" style={{ borderTop: 0 }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th />
                    <th>{D.measured}</th>
                    <th className="num">{D.rank}</th>
                    <th className="num">{D.weight}</th>
                    <th>{D.quartile}</th>
                  </tr>
                </thead>
                <tbody>
                  {critRows.map((c) => {
                    const cell = r[c.key]
                    return (
                      <tr key={c.key}>
                        <td style={{ fontWeight: 500 }}>{c.label}</td>
                        <td className="cell-crit">
                          <div className="crit" data-tone={cell.tone}>
                            <span className="crit-word">{cell.value === null ? cfg.verdicts.noData : cell.verdict}</span>
                            <span className="mono">{f.fmt(cell.value, c.kind)}</span>
                          </div>
                        </td>
                        <td className="num mono">{cell.rank ?? '—'}</td>
                        <td className="num mono">{cfg.scoring.weights[c.key]}</td>
                        <td className="small muted">{cell.quartile ? cfg.quartiles.labels[cell.quartile - 1] : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {r.returnsRate !== null && (
              <span className="small muted">
                Returns <span className="mono">{Number.isFinite(r.returnsRate) ? f.fmt(r.returnsRate, 'pct') : '> 100%'}</span> ({f.num(r.returnedQty, 0)} of {f.num(r.receivedQty - r.returnedQty, 0)} net received)
              </span>
            )}
          </section>

          <section className="sheet-section">
            <span className="label">
              {D.profiles} · {r.origin}
            </span>
            {profiles.map((p) => (
              <div key={p.m} className="stack" style={{ gap: 'var(--space-1)' }}>
                <span className="row-tight small">
                  <strong style={{ fontWeight: 500 }}>{D.measures[p.m]}</strong>
                  <span className="muted">
                    <span className="mono">{p.n}</span> {D.receipts} · dashed = scope
                  </span>
                </span>
                {p.n === 0 ? (
                  <span className="small muted">{D.noProfile}</span>
                ) : (
                  <Histogram counts={p.counts} labels={binLabels(p.edges, '')} reference={p.reference} referenceLabel="Scope" seriesLabel={D.receipts} formatPct={(x) => f.fmt(x, 'pct')} />
                )}
              </div>
            ))}
          </section>

          <section className="sheet-section">
            <span className="label">{D.topItems}</span>
            <div className="table-frame no-max" style={{ borderTop: 0 }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>{D.item}</th>
                    <th className="num">{D.qty}</th>
                    <th className="num">{D.value}</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map(([code, it]) => (
                    <tr key={code}>
                      <td>
                        <div className="vendor-cell" style={{ minWidth: 0 }}>
                          <span className="vendor-name">{it.name || code}</span>
                          <span className="mono caption muted">{code}</span>
                        </div>
                      </td>
                      <td className="num mono">{f.num(it.qty, 0)}</td>
                      <td className="num mono">{f.fmt(it.value, 'money')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sheet-section">
            <span className="label">{D.relationship}</span>
            <div className="kv">
              <div>
                <span className="caption muted">{D.firstPo}</span>
                <span className="mono">{f.fmt(r.firstPo, 'date')}</span>
              </div>
              <div>
                <span className="caption muted">{D.firstGrpo}</span>
                <span className="mono">{f.fmt(r.firstGrpo, 'date')}</span>
              </div>
              <div>
                <span className="caption muted">{D.span}</span>
                <span className="mono">{span === null ? '—' : `${span}${cfg.format.daysSuffix}`}</span>
              </div>
              <div>
                <span className="caption muted">{cfg.columns.scorecard.find((c) => c.id === 'poLines')!.label}</span>
                <span className="mono">{r.poLines}</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>,
    document.body,
  )
}
