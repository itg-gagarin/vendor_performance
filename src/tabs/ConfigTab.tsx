import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, RotateCcw, Save, Upload as UploadIcon } from 'lucide-react'
import { DEFAULT_CONFIG } from '../config/defaults'
import { normalizeConfig } from '../config/store'
import { CRITERIA, FLAGS, MEASURES, ORIGINS, type AppConfig, type Criterion, type Measure, type Origin } from '../config/types'
import { allIndexes, clockReceipts, computeScope, measureValues, type ScopeResult, type Scope } from '../engine/compute'
import type { Prepared } from '../engine/prepare'
import { useUi } from '../ui/context'
import { Dialog, Field, Help, NumberInput, Segmented, Toggle } from '../ui/primitives'
import { BandEditor, BinEditor, ColumnEditor, LabelEditor, ListInput, TileEditor, ToneSelect, type Edit } from './configEditors'
import { FIELDS, type TableKey } from '../data/schema'

interface Props {
  draft: AppConfig
  setDraft: (c: AppConfig) => void
  dirty: boolean
  onSave: () => void
  onDiscard: () => void
  prepared: Prepared | null
  scope: Scope
  minPoLines: number
  appliedRes: ScopeResult | null
}

function Section({ id, title, hint, children, action }: { id: string; title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="card anchor stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="card-title">{title}</span>
          {hint && <span className="small muted">{hint}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ConfigTab({ draft, setDraft, dirty, onSave, onDiscard, prepared, scope, minPoLines, appliedRes }: Props) {
  const { cfg, f } = useUi()
  const C = cfg.labels.config
  const A = cfg.labels.actions
  const edit: Edit = (fn) => {
    const next = structuredClone(draft)
    fn(next)
    setDraft(next)
  }
  const [confirmReset, setConfirmReset] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const weightsZero = CRITERIA.every((c) => draft.scoring.weights[c] === 0)

  // Draft results for CF-1 per-row stats and the live impact strip.
  const draftClock = useMemo(() => (prepared ? clockReceipts(prepared, draft) : null), [prepared, draft])
  const draftRes = useMemo(
    () => (prepared && draftClock && !weightsZero ? computeScope(prepared, draft, scope, { minPoLines }, draftClock) : null),
    [prepared, draft, draftClock, scope, minPoLines, weightsZero],
  )

  const binValues = useMemo(() => {
    const out = {} as Record<Measure, Record<Origin, number[]>>
    for (const m of MEASURES) {
      out[m] = { Local: [], Import: [] }
      if (!prepared) continue
      for (const o of ORIGINS) out[m][o] = measureValues(prepared, m, allIndexes(prepared.po.length), allIndexes(prepared.receipts.length), o)
    }
    return out
  }, [prepared])

  const groupCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of prepared?.po ?? []) m.set(l.vendorGroup, (m.get(l.vendorGroup) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [prepared])

  const impact = (() => {
    if (!appliedRes || !draftRes) return null
    const lateCount = (r: ScopeResult) => r.rows.filter((x) => x.flags.some((fl) => fl.key === 'late')).length
    const top = (r: ScopeResult) => r.rows.find((x) => x.rank === 1)?.name ?? '—'
    return [
      { label: C.impactOnTime, before: f.fmt(appliedRes.metrics.onTimeRate, 'pct'), after: f.fmt(draftRes.metrics.onTimeRate, 'pct'), delta: (draftRes.metrics.onTimeRate ?? 0) - (appliedRes.metrics.onTimeRate ?? 0), good: 1 },
      { label: C.impactLate, before: String(lateCount(appliedRes)), after: String(lateCount(draftRes)), delta: lateCount(draftRes) - lateCount(appliedRes), good: -1 },
      { label: C.impactProblem, before: String(appliedRes.metrics.problemInUse), after: String(draftRes.metrics.problemInUse), delta: draftRes.metrics.problemInUse - appliedRes.metrics.problemInUse, good: -1 },
      { label: C.impactTop, before: top(appliedRes), after: top(draftRes), delta: 0, good: 0 },
    ]
  })()

  const doExport = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendor-performance-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = async (file: File) => {
    try {
      setDraft(normalizeConfig(JSON.parse(await file.text())))
      setImportError(null)
    } catch (e) {
      setImportError(`Could not read ${file.name}: ${(e as Error).message}`)
    }
  }

  const nav: [string, string][] = [
    ['cf-groups', C.groupsTitle],
    ['cf-allowance', C.allowanceTitle],
    ['cf-ontime', C.onTimeTitle],
    ['cf-issues', C.issuesTitle],
    ['cf-weights', C.weightsTitle],
    ['cf-review', C.reviewTitle],
    ['cf-ranking', C.scoringTitle],
    ['cf-bins', C.binsTitle],
  ]
  const nav2: [string, string][] = [
    ['cf-verdicts', C.verdictTitle],
    ['cf-tiles', C.tilesTitle],
    ['cf-columns', C.columnsTitle],
    ['cf-filters', 'Filters & tables'],
    ['cf-format', C.formatTitle],
  ]
  const nav3: [string, string][] = [
    ['cf-labels', C.labelsTitle],
    ['cf-mapping', 'Data mapping'],
    ['cf-json', C.jsonTitle],
  ]

  const I = draft.issues

  return (
    <div className="stack-section">
      <div className="savebar">
        <span className="row-tight small">
          {dirty ? <strong style={{ fontWeight: 600 }}>{C.unsaved}</strong> : <span className="muted">{C.saved}</span>}
          {weightsZero && <span className="field-error">{C.weightsZero}</span>}
        </span>
        <span className="row-tight">
          <button className="btn" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={16} /> {A.reset}
          </button>
          <button className="btn" onClick={onDiscard} disabled={!dirty}>
            {A.discard}
          </button>
          <button className="btn btn-commit" onClick={onSave} disabled={!dirty || weightsZero}>
            <Save size={16} /> {A.save}
          </button>
        </span>
      </div>

      {impact && dirty && (
        <div className="card stack">
          <span className="label">{C.impactTitle}</span>
          <div className="impact">
            {impact.map((x) => (
              <div key={x.label}>
                <span className="caption muted">{x.label}</span>
                <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {x.before} → <span className={x.delta * x.good > 0 ? 'delta-up' : x.delta * x.good < 0 ? 'delta-down' : ''}>{x.after}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="config-layout">
        <nav className="config-nav" aria-label="Configuration sections">
          <span className="label">{C.sectionPolicy}</span>
          {nav.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          <span className="label">{C.sectionPresentation}</span>
          {nav2.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          <span className="label">{C.sectionAdvanced}</span>
          {nav3.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
        </nav>

        <div className="stack-section" style={{ minWidth: 0 }}>
          <Section id="cf-groups" title={C.groupsTitle} hint={C.groupsHint}>
            {!prepared ? (
              <span className="small muted">{cfg.labels.empty.noData}</span>
            ) : (
              <div className="form-grid">
                {groupCounts.map(([g, n]) => (
                  <Toggle
                    key={g}
                    checked={!draft.data.excludedVendorGroups.includes(g)}
                    onChange={(on) =>
                      edit((d) => {
                        d.data.excludedVendorGroups = on ? d.data.excludedVendorGroups.filter((x) => x !== g) : [...d.data.excludedVendorGroups, g]
                      })
                    }
                    label={
                      <span>
                        {g || '(no group)'} <span className="mono muted">{f.fmt(n, 'int')}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {/* CF-1 */}
          <Section id="cf-allowance" title={C.allowanceTitle} hint={C.allowanceHint}>
            {!draftClock || draftClock.allowances.length === 0 ? (
              <span className="small muted">{cfg.labels.empty.noData}</span>
            ) : (
              <div className="table-frame" style={{ maxHeight: 420 }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>{C.material}</th>
                      {ORIGINS.map((o) => (
                        <th key={o} colSpan={4} style={{ borderLeft: '1px solid var(--border-default)' }}>
                          {o}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ top: 33 }} />
                      {ORIGINS.map((o) => (
                        <FragmentHead key={o} labels={['Allowance', C.median, C.p90, C.onTimeNow]} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set(draftClock.allowances.map((a) => a.level1))].map((l1) => (
                      <tr key={l1}>
                        <td style={{ fontWeight: 500 }}>{l1}</td>
                        {ORIGINS.map((o) => {
                          const a = draftClock.allowances.find((x) => x.level1 === l1 && x.origin === o)!
                          return (
                            <FragmentCells key={o}>
                              <td style={{ borderLeft: '1px solid var(--border-default)' }}>
                                <NumberInput
                                  value={draft.onTime.allowances[l1]?.[o] ?? null}
                                  allowEmpty
                                  min={0}
                                  max={365}
                                  width={72}
                                  ariaLabel={`${l1} ${o} allowance`}
                                  placeholder={a.median !== null ? f.num(a.median, 0) : String(draft.onTime.fallbackAllowance[o])}
                                  onChange={(v) =>
                                    edit((d) => {
                                      const cur = d.onTime.allowances[l1] ?? { Local: null, Import: null }
                                      d.onTime.allowances[l1] = { ...cur, [o]: v }
                                    })
                                  }
                                />
                              </td>
                              <td className="num mono">{a.receipts ? f.num(a.median ?? 0, 0) : '—'}</td>
                              <td className="num mono">{a.receipts ? f.num(a.p90 ?? 0, 0) : '—'}</td>
                              <td className="num mono">{f.fmt(a.onTimeRate, 'pct')}</td>
                            </FragmentCells>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row">
              <Field label="Fallback, Local (d)" tip="Used when a material has no Local receipts to take a median from.">
                <NumberInput value={draft.onTime.fallbackAllowance.Local} min={0} max={365} onChange={(v) => v !== null && edit((d) => (d.onTime.fallbackAllowance.Local = v))} />
              </Field>
              <Field label="Fallback, Import (d)" tip="Used when a material has no Import receipts to take a median from.">
                <NumberInput value={draft.onTime.fallbackAllowance.Import} min={0} max={365} onChange={(v) => v !== null && edit((d) => (d.onTime.fallbackAllowance.Import = v))} />
              </Field>
            </div>
          </Section>

          {/* CF-2 */}
          <Section id="cf-ontime" title={C.onTimeTitle}>
            <div className="row">
              <Field label={C.clock} tip="PO → GRPO measures what the vendor controls. PR → GRPO adds internal approval time.">
                <Segmented ariaLabel={C.clock} value={draft.onTime.clock} onChange={(v) => edit((d) => (d.onTime.clock = v))} options={[{ value: 'PO_GRPO', label: C.clockPO }, { value: 'PR_GRPO', label: C.clockPR }]} />
              </Field>
            </div>
            <Toggle checked={draft.onTime.requiredDateCounts} onChange={(v) => edit((d) => (d.onTime.requiredDateCounts = v))} label={C.requiredDate} tip="A receipt dated on or before the PR required date is on time even if it is outside the allowance." />
          </Section>

          {/* CF-3 */}
          <Section id="cf-issues" title={C.issuesTitle}>
            <div className="form-grid">
              <Field label={C.latePct}><NumberInput value={I.latePct} min={1} max={100} onChange={(v) => v !== null && edit((d) => (d.issues.latePct = v))} /></Field>
              <Field label={C.slowMultiple}><NumberInput value={I.slowMultiple} min={1} step={0.05} onChange={(v) => v !== null && edit((d) => (d.issues.slowMultiple = v))} /></Field>
              <Field label={C.shortFillPct}><NumberInput value={I.shortFillPct} min={1} max={100} onChange={(v) => v !== null && edit((d) => (d.issues.shortFillPct = v))} /></Field>
              <Field label={C.shortFillSeriousPct}><NumberInput value={I.shortFillSeriousPct} min={0} max={100} onChange={(v) => v !== null && edit((d) => (d.issues.shortFillSeriousPct = v))} /></Field>
              <Field label={C.returnsPct}><NumberInput value={I.returnsPct} min={0} max={100} step={0.1} onChange={(v) => v !== null && edit((d) => (d.issues.returnsPct = v))} /></Field>
              <Field label={C.stillInUseDays}><NumberInput value={I.stillInUseDays} min={1} max={400} onChange={(v) => v !== null && edit((d) => (d.issues.stillInUseDays = v))} /></Field>
              <Field label={C.thinSample}><NumberInput value={I.thinSample} min={1} onChange={(v) => v !== null && edit((d) => (d.issues.thinSample = Math.round(v)))} /></Field>
            </div>
            <div className="table-frame no-max">
              <table className="dt">
                <thead>
                  <tr>
                    <th>On</th>
                    <th>Flag label</th>
                    <th>Reason template <Help tip="Placeholders: {value} {threshold} {serious} {multiple} {median}" /></th>
                  </tr>
                </thead>
                <tbody>
                  {FLAGS.map((k) => (
                    <tr key={k}>
                      <td>
                        <label className="toggle" aria-label={`Enable ${k}`}>
                          <input type="checkbox" checked={I.flags[k].enabled} onChange={(e) => edit((d) => (d.issues.flags[k].enabled = e.target.checked))} />
                          <span className="toggle-track" />
                        </label>
                      </td>
                      <td>
                        <input className="input input-sm" style={{ width: 140 }} value={I.flags[k].label} onChange={(e) => edit((d) => (d.issues.flags[k].label = e.target.value))} />
                      </td>
                      <td style={{ width: '100%' }}>
                        <input className="input input-sm mono" style={{ width: '100%', minWidth: 280 }} value={I.flags[k].reason} onChange={(e) => edit((d) => (d.issues.flags[k].reason = e.target.value))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* CF-5 */}
          <Section id="cf-weights" title={C.weightsTitle} hint={C.weightsHint}>
            {CRITERIA.map((c: Criterion) => (
              <div key={c} className="weight-row">
                <span style={{ width: 96, fontWeight: 500 }}>{cfg.columns.scorecard.find((x) => x.id === c)?.label}</span>
                <input type="range" min={0} max={5} step={1} value={draft.scoring.weights[c]} aria-label={`${c} weight`} onChange={(e) => edit((d) => (d.scoring.weights[c] = Number(e.target.value)))} />
                <span className="mono" style={{ width: 24, textAlign: 'right' }}>{draft.scoring.weights[c]}</span>
              </div>
            ))}
            {weightsZero && <span className="field-error">{C.weightsZero}</span>}
          </Section>

          {/* CF-6 */}
          <Section id="cf-review" title={C.reviewTitle}>
            <div className="row">
              <Field label={C.reviewLines}><NumberInput value={draft.review.minPoLines} min={0} onChange={(v) => v !== null && edit((d) => (d.review.minPoLines = Math.round(v)))} /></Field>
              <Field label={C.reviewValue}><NumberInput value={draft.review.minValue} min={0} width={140} onChange={(v) => v !== null && edit((d) => (d.review.minValue = v))} /></Field>
              <Field label={C.reviewCombine}>
                <Segmented ariaLabel={C.reviewCombine} value={draft.review.combine} onChange={(v) => edit((d) => (d.review.combine = v))} options={[{ value: 'any', label: C.reviewAny }, { value: 'all', label: C.reviewAll }]} />
              </Field>
            </div>
            <span className="small muted">= {f.fmt(draft.review.minValue, 'moneyFull')}</span>
          </Section>

          <Section id="cf-ranking" title={C.scoringTitle} hint="How ranks, ties and missing values are handled. These are policy choices the PRD leaves open; defaults are marked in How scoring works.">
            <div className="form-grid">
              <Field label={C.tieMethod} tip="min: 1, 2, 2, 4 · average: 1, 2.5, 2.5, 4 · dense: 1, 2, 2, 3">
                <select className="select" value={draft.scoring.tieMethod} onChange={(e) => edit((d) => (d.scoring.tieMethod = e.target.value as AppConfig['scoring']['tieMethod']))}>
                  <option value="min">Competition (1, 2, 2, 4)</option>
                  <option value="average">Average (1, 2.5, 2.5, 4)</option>
                  <option value="dense">Dense (1, 2, 2, 3)</option>
                </select>
              </Field>
              <Field label={C.missingRank} tip="A vendor with no PO-linked receipt has no lead time or on-time value.">
                <select className="select" value={draft.scoring.missingRank} onChange={(e) => edit((d) => (d.scoring.missingRank = e.target.value as AppConfig['scoring']['missingRank']))}>
                  <option value="worst">Worst rank</option>
                  <option value="median">Median rank</option>
                </select>
              </Field>
              <Field label={C.rankPopulation} tip="Whether one-off vendors hidden by Min PO lines still take part in ranking.">
                <select className="select" value={draft.scoring.rankPopulation} onChange={(e) => edit((d) => (d.scoring.rankPopulation = e.target.value as AppConfig['scoring']['rankPopulation']))}>
                  <option value="minPoLines">Vendors passing Min PO lines</option>
                  <option value="scope">Every vendor in scope</option>
                </select>
              </Field>
              <Field label={C.leadStat} tip="PRD: mean. Median is less sensitive to a single very late receipt.">
                <select className="select" value={draft.scoring.leadStat} onChange={(e) => edit((d) => (d.scoring.leadStat = e.target.value as AppConfig['scoring']['leadStat']))}>
                  <option value="mean">Mean</option>
                  <option value="median">Median</option>
                </select>
              </Field>
              <Field label="Top spend share (%)" tip="Used by the Top share filter and the Cum. share column.">
                <NumberInput value={draft.spend.topSharePct} min={1} max={100} onChange={(v) => v !== null && edit((d) => (d.spend.topSharePct = v))} />
              </Field>
              <Field label="Fast at or below (× scope median)">
                <NumberInput value={draft.verdicts.lead.fastMultiple} min={0} max={1} step={0.05} onChange={(v) => v !== null && edit((d) => (d.verdicts.lead.fastMultiple = v))} />
              </Field>
              <Field label="Fill complete at (%)">
                <NumberInput value={draft.verdicts.fill.completeAt} min={0} max={100} step={0.1} onChange={(v) => v !== null && edit((d) => (d.verdicts.fill.completeAt = v))} />
              </Field>
              <Field label="On time at (%)">
                <NumberInput value={draft.verdicts.onTime.onTimeAt} min={0} max={100} onChange={(v) => v !== null && edit((d) => (d.verdicts.onTime.onTimeAt = v))} />
              </Field>
            </div>
            <Toggle checked={draft.scoring.capFillAtOrdered} onChange={(v) => edit((d) => (d.scoring.capFillAtOrdered = v))} label={C.capFill} tip="Off (PRD): over-delivery on one line can offset short delivery on another. On: each line counts at most 100%." />
          </Section>

          {/* CF-4 */}
          <Section id="cf-bins" title={C.binsTitle} hint={C.binsHint}>
            <BinEditor draft={draft} edit={edit} values={binValues} />
          </Section>

          <Section id="cf-verdicts" title={C.verdictTitle} hint="Words and colours used in criterion cells, flags and quartiles.">
            <div className="grid-2">
              <div className="stack">
                <span className="label">Lead time</span>
                <BandEditor band={draft.verdicts.lead.fast} rule={`≤ ${draft.verdicts.lead.fastMultiple} × M`} onChange={(b) => edit((d) => (d.verdicts.lead.fast = b))} />
                <BandEditor band={draft.verdicts.lead.typical} rule={`≤ ${I.slowMultiple} × M`} onChange={(b) => edit((d) => (d.verdicts.lead.typical = b))} />
                <BandEditor band={draft.verdicts.lead.slow} rule="above" onChange={(b) => edit((d) => (d.verdicts.lead.slow = b))} />
                <span className="label">Fill</span>
                <BandEditor band={draft.verdicts.fill.complete} rule={`≥ ${draft.verdicts.fill.completeAt}%`} onChange={(b) => edit((d) => (d.verdicts.fill.complete = b))} />
                <BandEditor band={draft.verdicts.fill.near} rule={`≥ ${I.shortFillPct}%`} onChange={(b) => edit((d) => (d.verdicts.fill.near = b))} />
                <BandEditor band={draft.verdicts.fill.short} rule="below" onChange={(b) => edit((d) => (d.verdicts.fill.short = b))} />
                <span className="label">On time</span>
                <BandEditor band={draft.verdicts.onTime.onTime} rule={`≥ ${draft.verdicts.onTime.onTimeAt}%`} onChange={(b) => edit((d) => (d.verdicts.onTime.onTime = b))} />
                <BandEditor band={draft.verdicts.onTime.mixed} rule={`≥ ${I.latePct}%`} onChange={(b) => edit((d) => (d.verdicts.onTime.mixed = b))} />
                <BandEditor band={draft.verdicts.onTime.late} rule="below" onChange={(b) => edit((d) => (d.verdicts.onTime.late = b))} />
                <Field label="No-data word">
                  <input className="input input-sm" value={draft.verdicts.noData} onChange={(e) => edit((d) => (d.verdicts.noData = e.target.value))} />
                </Field>
              </div>
              <div className="stack">
                <span className="label">Cell colour by quartile in scope</span>
                <span className="small muted">Ranked vendors take the quartile colour; unranked vendors fall back to the verdict colour.</span>
                {([0, 1, 2, 3] as const).map((k) => (
                  <div key={k} className="row-tight" style={{ flexWrap: 'nowrap' }}>
                    <span className="mono" style={{ width: 24 }}>Q{k + 1}</span>
                    <ToneSelect value={draft.quartiles.tones[k]} ariaLabel={`Quartile ${k + 1} colour`} onChange={(t) => edit((d) => (d.quartiles.tones[k] = t))} />
                    <input className="input input-sm" value={draft.quartiles.labels[k]} aria-label={`Quartile ${k + 1} label`} onChange={(e) => edit((d) => (d.quartiles.labels[k] = e.target.value))} />
                  </div>
                ))}
                <span className="label">Severity</span>
                {(['serious', 'warning'] as const).map((s) => (
                  <BandEditor key={s} band={draft.issues.severity[s]} rule={s} onChange={(b) => edit((d) => (d.issues.severity[s] = b))} />
                ))}
              </div>
            </div>
          </Section>

          <Section id="cf-tiles" title={C.tilesTitle} hint={C.tilesHint}>
            <div className="grid-2">
              <div className="stack">
                <span className="label">{cfg.labels.tabs.scorecard}</span>
                <TileEditor tiles={draft.tiles.scorecard} onChange={(t) => edit((d) => (d.tiles.scorecard = t))} />
              </div>
              <div className="stack">
                <span className="label">{cfg.labels.tabs.issues}</span>
                <TileEditor tiles={draft.tiles.issues} onChange={(t) => edit((d) => (d.tiles.issues = t))} />
              </div>
            </div>
          </Section>

          <Section id="cf-columns" title={C.columnsTitle} hint={C.columnsHint}>
            <span className="label">{cfg.labels.tabs.scorecard}</span>
            <ColumnEditor cols={draft.columns.scorecard} fixed={['rank', 'vendor']} onChange={(c) => edit((d) => (d.columns.scorecard = c))} />
            <span className="label">{cfg.labels.tabs.issues}</span>
            <ColumnEditor cols={draft.columns.issues} fixed={['vendor']} onChange={(c) => edit((d) => (d.columns.issues = c))} />
          </Section>

          <Section id="cf-filters" title="Filters & tables">
            <div className="form-grid">
              <Field label="Min PO lines options">
                <ListInput numeric value={draft.filters.minPoLinesOptions} ariaLabel="Min PO lines options" onChange={(v) => edit((d) => {
                  d.filters.minPoLinesOptions = v as number[]
                  if (!d.filters.minPoLinesOptions.includes(d.filters.minPoLinesDefault)) d.filters.minPoLinesDefault = d.filters.minPoLinesOptions[0]
                })} />
              </Field>
              <Field label="Min PO lines default">
                <select className="select" value={draft.filters.minPoLinesDefault} onChange={(e) => edit((d) => (d.filters.minPoLinesDefault = Number(e.target.value)))}>
                  {draft.filters.minPoLinesOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Page sizes">
                <ListInput numeric value={draft.filters.pageSizes} ariaLabel="Page sizes" onChange={(v) => edit((d) => {
                  d.filters.pageSizes = v as number[]
                  if (!d.filters.pageSizes.includes(d.filters.pageSizeDefault)) d.filters.pageSizeDefault = d.filters.pageSizes[0]
                })} />
              </Field>
              <Field label="Default page size">
                <select className="select" value={draft.filters.pageSizeDefault} onChange={(e) => edit((d) => (d.filters.pageSizeDefault = Number(e.target.value)))}>
                  {draft.filters.pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </div>
            <Toggle checked={draft.filters.stillInUseDefault} onChange={(v) => edit((d) => (d.filters.stillInUseDefault = v))} label="“Still in use only” on by default" />
          </Section>

          <Section id="cf-format" title={C.formatTitle}>
            <div className="form-grid">
              <Field label="Locale" tip="BCP 47 tag, e.g. id-ID or en-US. Controls thousands and decimal separators.">
                <input className="input input-sm" value={draft.format.locale} onChange={(e) => edit((d) => (d.format.locale = e.target.value))} />
              </Field>
              <Field label="Currency prefix">
                <input className="input input-sm" value={draft.format.currencyPrefix} onChange={(e) => edit((d) => (d.format.currencyPrefix = e.target.value))} />
              </Field>
              <Field label="Date style">
                <select className="select" value={draft.format.dateStyle} onChange={(e) => edit((d) => (d.format.dateStyle = e.target.value as AppConfig['format']['dateStyle']))}>
                  <option value="dd MMM yyyy">dd MMM yyyy</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                  <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                </select>
              </Field>
              <Field label="Days suffix">
                <input className="input input-sm" value={draft.format.daysSuffix} onChange={(e) => edit((d) => (d.format.daysSuffix = e.target.value))} />
              </Field>
              <Field label="Money decimals"><NumberInput value={draft.format.moneyDecimals} min={0} max={3} onChange={(v) => v !== null && edit((d) => (d.format.moneyDecimals = Math.round(v)))} /></Field>
              <Field label="Percent decimals"><NumberInput value={draft.format.pctDecimals} min={0} max={3} onChange={(v) => v !== null && edit((d) => (d.format.pctDecimals = Math.round(v)))} /></Field>
              <Field label="Days decimals"><NumberInput value={draft.format.daysDecimals} min={0} max={3} onChange={(v) => v !== null && edit((d) => (d.format.daysDecimals = Math.round(v)))} /></Field>
            </div>
            <span className="label">Money units</span>
            <div className="row">
              {draft.format.moneyUnits.map((u, i) => (
                <span key={i} className="row-tight">
                  <span className="mono small">≥ {u.at.toExponential(0)}</span>
                  <input className="input input-sm" style={{ width: 64 }} value={u.suffix} aria-label={`Suffix for ${u.at}`} onChange={(e) => edit((d) => (d.format.moneyUnits[i].suffix = e.target.value))} />
                </span>
              ))}
            </div>
            <span className="small muted">Preview: {makePreview(draft)}</span>
          </Section>

          <Section id="cf-labels" title={C.labelsTitle} hint={C.labelsHint}>
            <LabelEditor draft={draft} onChange={setDraft} />
          </Section>

          <Section id="cf-mapping" title="Data mapping" hint="Header names recognised for each field on upload (comma-separated, case and punctuation ignored), and how Import / Local is read.">
            {(['po', 'grpo', 'returns'] as TableKey[]).map((t) => (
              <div key={t} className="stack">
                <span className="label">{cfg.labels.upload[`${t}Title`]}</span>
                <div className="map-grid">
                  {FIELDS[t].map((fd) => (
                    <Field key={fd.key} label={`${fd.label}${fd.required ? ' *' : ''}`}>
                      <ListInput value={draft.data.fieldAliases[t][fd.key] ?? []} ariaLabel={`${fd.label} aliases`} onChange={(v) => edit((d) => (d.data.fieldAliases[t][fd.key] = v as string[]))} />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
            <div className="form-grid">
              <Field label="Values read as Import"><ListInput value={draft.data.importValues} ariaLabel="Import values" onChange={(v) => edit((d) => (d.data.importValues = (v as string[]).map((s) => s.toLowerCase())))} /></Field>
              <Field label="Values read as Local"><ListInput value={draft.data.localValues} ariaLabel="Local values" onChange={(v) => edit((d) => (d.data.localValues = (v as string[]).map((s) => s.toLowerCase())))} /></Field>
              <Field label="Origin when blank">
                <Segmented ariaLabel="Default origin" value={draft.data.defaultOrigin} onChange={(v) => edit((d) => (d.data.defaultOrigin = v))} options={[{ value: 'Local', label: 'Local' }, { value: 'Import', label: 'Import' }]} />
              </Field>
              <Field label="Date order" tip="auto reads 05/03/2026 as 5 March (day first) unless the second number is above 12.">
                <select className="select" value={draft.data.dateOrder} onChange={(e) => edit((d) => (d.data.dateOrder = e.target.value as AppConfig['data']['dateOrder']))}>
                  <option value="auto">auto (day first)</option>
                  <option value="DMY">DMY</option>
                  <option value="MDY">MDY</option>
                  <option value="YMD">YMD</option>
                </select>
              </Field>
            </div>
            <span className="small muted">Mapping changes apply to the next upload.</span>
          </Section>

          <Section id="cf-json" title={C.jsonTitle} hint={C.jsonHint}>
            <div className="row">
              <button className="btn" onClick={doExport}>
                <Download size={16} /> {A.exportJson}
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                <UploadIcon size={16} /> {A.importJson}
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
            </div>
            {importError && <span className="field-error">{importError}</span>}
          </Section>
        </div>
      </div>

      {confirmReset && (
        <Dialog
          title={A.reset}
          onClose={() => setConfirmReset(false)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirmReset(false)}>{A.close}</button>
              <button
                className="btn btn-destructive"
                onClick={() => {
                  setDraft(structuredClone(DEFAULT_CONFIG))
                  setConfirmReset(false)
                }}
              >
                {A.reset}
              </button>
            </>
          }
        >
          <p className="small">Every threshold, weight, card, column and label returns to its default in the draft. Nothing is saved until you press {A.save}.</p>
        </Dialog>
      )}
    </div>
  )
}

function FragmentHead({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map((l, i) => (
        <th key={l} className={i === 0 ? '' : 'num'} style={{ top: 33, ...(i === 0 ? { borderLeft: '1px solid var(--border-default)' } : {}) }}>
          {l}
        </th>
      ))}
    </>
  )
}

function FragmentCells({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function makePreview(d: AppConfig) {
  const x = 1_234_567_890
  const unit = d.format.moneyUnits.find((u) => x >= u.at)
  const n = (v: number, k: number) => {
    try {
      return v.toLocaleString(d.format.locale, { minimumFractionDigits: k, maximumFractionDigits: k })
    } catch {
      return v.toFixed(k)
    }
  }
  return `${d.format.currencyPrefix}${unit ? n(x / unit.at, d.format.moneyDecimals) + unit.suffix : n(x, 0)} · ${n(87.654, d.format.pctDecimals)}% · ${n(12.34, d.format.daysDecimals)}${d.format.daysSuffix}`
}
