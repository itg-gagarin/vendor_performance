import { ChevronRight, Info } from 'lucide-react'
import { METRICS } from '../config/metrics'
import type { MetricKey, TileConfig } from '../config/types'
import { FLAGS } from '../config/types'
import type { CriterionCell, ScopeMetrics, ScopeResult, VendorRow } from '../engine/compute'
import { interpolate } from '../engine/compute'
import type { Formatter } from '../engine/format'
import { useUi } from './context'
import { Pill, Tip } from './primitives'

export function metricVars(m: ScopeMetrics, f: Formatter): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of Object.keys(METRICS) as MetricKey[]) out[k] = f.fmt(m[k], METRICS[k].format)
  out.topSharePct = f.fmt(m.topSharePct, 'pct').replace(/[,.]0%$/, '%')
  return out
}

export function Tiles({ tiles, metrics }: { tiles: TileConfig[]; metrics: ScopeMetrics }) {
  const { f } = useUi()
  const vars = metricVars(metrics, f)
  return (
    <div className="tiles">
      {tiles
        .filter((t) => t.visible)
        .map((t) => (
          <div key={t.id} className="tile" data-accent={t.accent}>
            <span className="label row-tight">
              <Tip content={t.tooltip}>
                <span>{interpolate(t.label, vars)}</span>
              </Tip>
            </span>
            <span className="tile-value">{f.fmt(metrics[t.metric], t.format)}</span>
            {t.hint && <span className="tile-hint">{interpolate(t.hint, vars)}</span>}
          </div>
        ))}
    </div>
  )
}

export function VendorCell({ r, showMarks = true }: { r: VendorRow; showMarks?: boolean }) {
  const { cfg } = useUi()
  const L = cfg.labels.legend
  return (
    <div className="vendor-cell">
      <span className="vendor-name" title={r.name}>
        {r.name}
      </span>
      <span className="vendor-meta">
        <span className="mono" style={{ fontSize: 12 }}>
          {r.code}
        </span>
        {r.group && <span className="tag">{r.group}</span>}
        {showMarks && (
          <Tip content={r.meetsReview ? L.thresholdDot : null}>
            <span className={`dot${r.meetsReview ? '' : ' dot-hollow'}`} aria-label={r.meetsReview ? L.thresholdDot : undefined} style={{ visibility: r.meetsReview ? 'visible' : 'hidden' }} />
          </Tip>
        )}
        {showMarks && r.thin && (
          <Tip content={L.thinMark}>
            <span className="thin-mark">{L.thinMarkLabel}</span>
          </Tip>
        )}
      </span>
    </div>
  )
}

export function CritCell({ c, kind, mode }: { c: CriterionCell; kind: 'days' | 'pct' | 'signedDays'; mode: 'plain' | 'ranks' }) {
  const { f, cfg } = useUi()
  const q = c.quartile ? cfg.quartiles.labels[c.quartile - 1] : null
  if (mode === 'ranks') {
    return (
      <div className="crit crit-rank" data-tone={c.tone} title={q ?? undefined}>
        <span className="mono">{c.rank ?? '—'}</span>
      </div>
    )
  }
  return (
    <div className="crit" data-tone={c.tone} title={q ?? undefined}>
      <span className="crit-word">{c.value === null ? cfg.verdicts.noData : c.verdict}</span>
      <span className="mono">{f.fmt(c.value, kind)}</span>
    </div>
  )
}

export function FlagPills({ r, withReason = false }: { r: VendorRow; withReason?: boolean }) {
  const { cfg } = useUi()
  if (r.flags.length === 0) return <span className="muted">{cfg.labels.table.noIssues}</span>
  if (!withReason) {
    return (
      <span className="row-tight" style={{ flexWrap: 'nowrap' }}>
        {r.flags.map((fl) => (
          <Tip key={fl.key} content={`${cfg.issues.severity[fl.severity].label}: ${fl.reason}`}>
            <Pill tone={cfg.issues.severity[fl.severity].tone}>{cfg.issues.flags[fl.key].label}</Pill>
          </Tip>
        ))}
      </span>
    )
  }
  return (
    <div className="flags-cell">
      {r.flags.map((fl) => (
        <div key={fl.key} className="flag-line">
          <Pill tone={cfg.issues.severity[fl.severity].tone}>{cfg.issues.flags[fl.key].label}</Pill>
          <span className="flag-reason">{fl.reason}</span>
        </div>
      ))}
    </div>
  )
}

export function CoverageNote({ res }: { res: ScopeResult }) {
  const { cfg, f } = useUi()
  const C = cfg.labels.coverage
  const m = res.metrics
  const reasons = (Object.keys(res.exclusions) as (keyof typeof res.exclusions)[]).filter((k) => res.exclusions[k] > 0)
  return (
    <div className="note">
      <Info size={14} />
      <span>
        <strong style={{ color: 'var(--text-default)', fontWeight: 500 }}>{C.title}. </strong>
        {interpolate(C.template, { linked: f.fmt(m.linkedReceipts, 'int'), total: f.fmt(m.receipts, 'int'), pct: f.fmt(m.poLinkCoverage, 'pct') })}
        {reasons.length > 0 && (
          <>
            {' '}
            {C.exclusionsTitle}:{' '}
            {reasons.map((k, i) => (
              <span key={k}>
                {i > 0 && ' · '}
                {C.reasons[k]} <span className="mono">{f.fmt(res.exclusions[k], 'int')}</span>
              </span>
            ))}
          </>
        )}
      </span>
    </div>
  )
}

export function Legend() {
  const { cfg } = useUi()
  const L = cfg.labels.legend
  const v = cfg.verdicts
  const i = cfg.issues
  const bands = [
    { name: cfg.labels.criteria.lead, items: [
      [v.lead.fast.label, `≤ ${v.lead.fastMultiple} × ${cfg.labels.leadBasis[v.lead.basis]}`],
      [v.lead.typical.label, `≤ ${v.lead.slowMultiple} × ${cfg.labels.leadBasis[v.lead.basis]}`],
      [v.lead.slow.label, `> ${v.lead.slowMultiple} × ${cfg.labels.leadBasis[v.lead.basis]}`],
    ] },
    { name: cfg.labels.criteria.fill, items: [
      [v.fill.complete.label, `≥ ${v.fill.completeAt}%`],
      [v.fill.near.label, `≥ ${v.fill.nearAt}%`],
      [v.fill.short.label, `< ${v.fill.nearAt}%`],
    ] },
    { name: cfg.labels.criteria.onTime, items: [
      [v.onTime.onTime.label, `≥ ${v.onTime.onTimeAt}%`],
      [v.onTime.mixed.label, `≥ ${v.onTime.mixedAt}%`],
      [v.onTime.late.label, `< ${v.onTime.mixedAt}%`],
    ] },
    { name: cfg.labels.criteria.reqSlip, items: [
      [v.reqSlip.onDate.label, `≤ ${v.reqSlip.onDateAt} d after required date`],
      [v.reqSlip.slight.label, `≤ ${v.reqSlip.slightAt} d`],
      [v.reqSlip.late.label, `> ${v.reqSlip.slightAt} d`],
    ] },
  ]
  const flagRule: Record<string, string> = {
    late: `On time < ${i.latePct}%`,
    slow: `Lead time > ${i.slowMultiple} × ${cfg.labels.leadBasis[v.lead.basis]}`,
    shortFill: `Fill < ${i.shortFillPct}% (serious < ${i.shortFillSeriousPct}%)`,
    returns: `Returns > ${i.returnsPct}% of net received`,
  }
  const flagSeverity: Record<string, 'serious' | 'warning'> = { late: 'serious', slow: 'warning', shortFill: 'warning', returns: 'warning' }
  return (
    <details className="legend card">
      <summary>
        <ChevronRight size={16} />
        {L.title}
      </summary>
      <div className="legend-grid">
        <div className="legend-list">
          <span className="label">{L.verdicts}</span>
          {bands.map((b) => (
            <div key={b.name} className="stack" style={{ gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{b.name}</span>
              {b.items.map(([w, rule]) => (
                <span key={w} className="small">
                  <strong style={{ fontWeight: 500 }}>{w}</strong> <span className="muted">{rule}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="legend-list">
          <span className="label">{L.quartiles}</span>
          {cfg.quartiles.labels.map((q, k) => (
            <span key={q} className="legend-item">
              <span className="swatch" data-tone={cfg.quartiles.tones[k]} />
              {q}
            </span>
          ))}
          <span className="small muted">{cfg.labels.modes.tip}</span>
        </div>
        <div className="legend-list">
          <span className="label">{L.flags}</span>
          {FLAGS.filter((k) => i.flags[k].enabled).map((k) => (
            <span key={k} className="legend-item">
              <Pill tone={i.severity[flagSeverity[k]].tone}>{i.flags[k].label}</Pill>
              <span className="small muted">{flagRule[k]}</span>
            </span>
          ))}
          <span className="small muted">Flags need at least {i.thinSample} receipts, except Returns.</span>
        </div>
        <div className="legend-list">
          <span className="label">{L.marks}</span>
          <span className="legend-item"><span className="dot" /> {L.thresholdDot}</span>
          <span className="legend-item"><span className="thin-mark">{L.thinMarkLabel}</span> {L.thinMark}</span>
          <span className="legend-item"><span className="tag">Group</span> {L.groupChip}</span>
          <span className="small muted">
            {L.stillInUse}: {cfg.labels.inUse.reference[cfg.inUse.reference]} − {cfg.labels.inUse.activity[cfg.inUse.activity].toLowerCase()} ≤ {cfg.inUse.days} d
            {cfg.inUse.openPoCounts ? ', or open PO lines' : ''}
          </span>
        </div>
      </div>
    </details>
  )
}
