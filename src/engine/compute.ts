import type { AppConfig, Criterion, ExclusionReason, FlagKey, Measure, Origin, Severity, Tone } from '../config/types'
import { CRITERIA, FLAGS, GROUP_ALL_IMPORT, GROUP_ALL_LOCAL, ORIGINS } from '../config/types'
import { DAY_MS, dayFromYMD, type Day } from '../data/schema'
import { makeFormatter } from './format'
import type { Prepared } from './prepare'
import { mean, median, rank } from './stats'

// ---------------------------------------------------------------------------
// Scope

export interface Scope {
  /** A vendor group name, '' for all, or GROUP_ALL_IMPORT / GROUP_ALL_LOCAL. */
  vendorGroup: string
  level1: string
  level2: string
  level3: string
  level4: string
}

export const EMPTY_SCOPE: Scope = { vendorGroup: '', level1: '', level2: '', level3: '', level4: '' }

function matchesScope(scope: Scope, group: string, origin: Origin, path: readonly string[]): boolean {
  if (scope.vendorGroup === GROUP_ALL_IMPORT) {
    if (origin !== 'Import') return false
  } else if (scope.vendorGroup === GROUP_ALL_LOCAL) {
    if (origin !== 'Local') return false
  } else if (scope.vendorGroup && group !== scope.vendorGroup) return false
  if (scope.level1 && path[0] !== scope.level1) return false
  if (scope.level2 && path[1] !== scope.level2) return false
  if (scope.level3 && path[2] !== scope.level3) return false
  if (scope.level4 && path[3] !== scope.level4) return false
  return true
}

// ---------------------------------------------------------------------------
// Clock and allowances (extract-wide, scope-independent)

export interface ClockedReceipt {
  /** Days on the configured clock, or null when excluded. */
  days: number | null
  exclusion: ExclusionReason | null
  onTime: boolean | null
  /** GRPO date − PR required date; null without a PO link or required date. */
  reqSlip: number | null
}

export interface AllowanceRow {
  level1: string
  origin: Origin
  receipts: number
  median: number | null
  allowance: number
  isDefault: boolean
  onTimeRate: number | null
}

export interface ClockResult {
  receipts: ClockedReceipt[]
  allowances: AllowanceRow[]
  allowanceOf: (level1: string, origin: Origin) => number
  /** Extract median of clock days for a material and origin (null without history). */
  medianOf: (level1: string, origin: Origin) => number | null
}

function rawClockDays(p: Prepared, i: number, cfg: AppConfig): { days: number | null; exclusion: ExclusionReason | null } {
  const r = p.receipts[i]
  if (r.linkState !== 'linked') return { days: null, exclusion: r.linkState }
  const line = p.po[r.poIndex]
  let startDay: Day | null = line.poDate
  if (cfg.onTime.clock === 'PR_GRPO') {
    startDay = line.prDate
    if (startDay === null) return { days: null, exclusion: 'noPrDate' }
  }
  const days = r.grpoDate - startDay
  if (days < 0) return { days: null, exclusion: 'negativeDays' }
  return { days, exclusion: null }
}

export function clockReceipts(p: Prepared, cfg: AppConfig): ClockResult {
  const raw = p.receipts.map((_, i) => rawClockDays(p, i, cfg))

  // Default allowance A(m, o) = median clock days over all receipts of material m and origin o.
  const byKey = new Map<string, number[]>()
  const excluded = new Set(cfg.data.excludedVendorGroups)
  raw.forEach((c, i) => {
    if (c.days === null) return
    const r = p.receipts[i]
    if (excluded.has(r.vendorGroup)) return
    const k = `${r.path[0]}|${r.origin}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(c.days)
  })

  const medianByKey = new Map<string, number | null>()
  for (const [k, days] of byKey) medianByKey.set(k, median(days))
  const medianOf = (level1: string, origin: Origin) => medianByKey.get(`${level1}|${origin}`) ?? null

  const allowanceOf = (level1: string, origin: Origin): number => {
    const set = cfg.onTime.allowances[level1]?.[origin]
    if (set !== null && set !== undefined && Number.isFinite(set)) return set
    return medianOf(level1, origin) ?? cfg.onTime.fallbackAllowance[origin]
  }

  const tally = new Map<string, { n: number; ok: number }>()
  const receipts: ClockedReceipt[] = raw.map((c, i) => {
    const r = p.receipts[i]
    const line = r.poIndex >= 0 ? p.po[r.poIndex] : null
    const reqSlip = line && line.prRequiredDate !== null ? r.grpoDate - line.prRequiredDate : null
    if (c.days === null) return { days: null, exclusion: c.exclusion, onTime: null, reqSlip }
    const inside = c.days <= allowanceOf(r.path[0], r.origin)
    const byRequired = cfg.onTime.requiredDateCounts && line!.prRequiredDate !== null && r.grpoDate <= line!.prRequiredDate
    const onTime = inside || byRequired
    if (excluded.has(r.vendorGroup)) return { days: c.days, exclusion: null, onTime, reqSlip }
    const k = `${r.path[0]}|${r.origin}`
    const t = tally.get(k) ?? { n: 0, ok: 0 }
    t.n++
    if (onTime) t.ok++
    tally.set(k, t)
    return { days: c.days, exclusion: null, onTime, reqSlip }
  })

  const allowances: AllowanceRow[] = []
  for (const l1 of p.level1s) {
    for (const o of ORIGINS) {
      const k = `${l1}|${o}`
      const days = byKey.get(k) ?? []
      const t = tally.get(k)
      const set = cfg.onTime.allowances[l1]?.[o]
      allowances.push({
        level1: l1,
        origin: o,
        receipts: days.length,
        median: medianOf(l1, o),
        allowance: allowanceOf(l1, o),
        isDefault: set === null || set === undefined,
        onTimeRate: t && t.n ? t.ok / t.n : null,
      })
    }
  }

  return { receipts, allowances, allowanceOf, medianOf }
}

// ---------------------------------------------------------------------------
// Still-in-use reference date

/** The date the still-in-use window is measured back from, per the configured rule. */
export function inUseReferenceDate(p: Prepared, cfg: AppConfig): Day | null {
  const u = cfg.inUse
  if (u.reference === 'today') return Math.floor(Date.now() / DAY_MS)
  if (u.reference === 'fixed') {
    const m = u.fixedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return dayFromYMD(+m[1], +m[2], +m[3])
    return p.newestPoDate
  }
  if (u.reference === 'newestActivity') {
    let newest = p.newestPoDate
    for (const r of p.receipts) if (newest === null || r.grpoDate > newest) newest = r.grpoDate
    return newest
  }
  return p.newestPoDate
}

// ---------------------------------------------------------------------------
// Vendor rows

export interface Flag {
  key: FlagKey
  severity: Severity
  reason: string
}

export interface CriterionCell {
  value: number | null
  rank: number | null
  quartile: 1 | 2 | 3 | 4 | null
  verdict: string
  tone: Tone
}

export interface VendorRow {
  code: string
  name: string
  group: string
  origin: Origin
  poLines: number
  poCount: number
  value: number
  receipts: number
  linkedReceipts: number
  onTimeReceipts: number
  leadDays: number[]
  /** Reference R the lead time is judged against (scope median or own-material median). */
  leadReference: number | null
  lead: CriterionCell
  fill: CriterionCell
  onTime: CriterionCell
  reqSlip: CriterionCell
  receivedQty: number
  returnedQty: number
  returnsRate: number | null
  openRows: number
  score: number | null
  rank: number | null
  ranked: boolean
  /** Own share of its partition (vendor group or scope) on the configured basis. */
  share: number
  inTopSpend: boolean
  meetsReview: boolean
  thin: boolean
  lastPo: Day | null
  firstPo: Day | null
  lastGrpo: Day | null
  firstGrpo: Day | null
  /** Reference date − last PO. */
  daysSinceLastPo: number | null
  /** Reference date − latest activity (per the still-in-use rule). */
  daysSinceActivity: number | null
  stillInUse: boolean
  /** The still-in-use rule applied to this vendor, in words. */
  inUseReason: string
  flags: Flag[]
  severity: Severity | null
  poIdx: number[]
  receiptIdx: number[]
}

export interface ScopeMetrics {
  vendorsInScope: number
  vendorsRanked: number
  purchaseValue: number
  avgLeadTime: number | null
  scopeMedianLead: number | null
  onTimeRate: number | null
  orderFill: number | null
  poLines: number
  receipts: number
  linkedReceipts: number
  poLinkCoverage: number | null
  excludedReceipts: number
  reviewVendors: number
  top80Vendors: number
  problemInUse: number
  problemInUseSerious: number
  problemNotUsed: number
  problemSpend: number
  problemSpendShare: number | null
  mostCommonIssue: string
  mostCommonIssueCount: number
  newestPoDate: Day | null
  topSharePct: number
  avgReqSlip: number | null
  shareBasisLabel: string
  inUseReferenceDate: Day | null
}

export interface ScopeResult {
  rows: VendorRow[]
  metrics: ScopeMetrics
  exclusions: Record<ExclusionReason, number>
  clock: ClockResult
  population: number
}

export interface ComputeOptions {
  minPoLines: number
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

function quartileOf(r: number | null, n: number): 1 | 2 | 3 | 4 | null {
  if (r === null || n === 0) return null
  return (Math.min(4, Math.floor(((r - 1) / n) * 4) + 1)) as 1 | 2 | 3 | 4
}

/** Rank direction per criterion: lower lead time and slip are better, higher fill and on-time are better. */
export const ORIENT: Record<Criterion, 'low' | 'high'> = { lead: 'low', fill: 'high', onTime: 'high', reqSlip: 'low' }

export function computeScope(p: Prepared, cfg: AppConfig, scope: Scope, opts: ComputeOptions, clock?: ClockResult): ScopeResult {
  const ck = clock ?? clockReceipts(p, cfg)
  const iss = cfg.issues
  const L = cfg.labels
  // Reasons are shown to people, so numbers follow the configured locale.
  const { fmt, num } = makeFormatter(cfg)
  const fmtPct = (x: number) => fmt(x, 'pct')
  const fmtDays = (x: number) => fmt(x, 'days')
  // Excluded (non-material) vendor groups never enter any scope.
  const excludedGroups = new Set(cfg.data.excludedVendorGroups)
  const inScope = (group: string, origin: Origin, path: readonly string[]) => !excludedGroups.has(group) && matchesScope(scope, group, origin, path)
  const byVendor = new Map<string, { po: number[]; rc: number[]; ret: number[] }>()
  const bucket = (code: string) => {
    let b = byVendor.get(code)
    if (!b) byVendor.set(code, (b = { po: [], rc: [], ret: [] }))
    return b
  }

  p.po.forEach((l, i) => {
    if (inScope(l.vendorGroup, l.origin, [l.level1, l.level2, l.level3, l.level4])) bucket(l.vendorCode).po.push(i)
  })
  p.receipts.forEach((r, i) => {
    if (inScope(r.vendorGroup, r.origin, r.path)) bucket(r.vendorCode).rc.push(i)
  })
  p.returns.forEach((r, i) => {
    if (inScope(r.vendorGroup, r.origin, r.path)) bucket(r.vendorCode).ret.push(i)
  })

  const exclusions: Record<ExclusionReason, number> = { noPoLink: 0, poNotFound: 0, negativeDays: 0, noPrDate: 0 }
  const rows: VendorRow[] = []
  const refDate = inUseReferenceDate(p, cfg)
  const u = cfg.inUse
  let scopeReceipts = 0
  let scopeLinked = 0
  const leadBasis = cfg.verdicts.lead.basis

  for (const [code, b] of byVendor) {
    // A vendor is in scope when it has PO lines in scope. Receipts or returns
    // alone (PO outside the extract) are still counted in coverage.
    const info = p.vendors.get(code) ?? { code, name: code, group: '' }
    let value = 0
    let lastPo: Day | null = null
    let firstPo: Day | null = null
    let openRows = 0
    let filledOrdered = 0
    let filledReceived = 0
    const poDocs = new Set<string>()
    const originCount = { Local: 0, Import: 0 }
    for (const i of b.po) {
      const l = p.po[i]
      value += l.lineValue
      poDocs.add(l.poDoc)
      if (lastPo === null || l.poDate > lastPo) lastPo = l.poDate
      if (firstPo === null || l.poDate < firstPo) firstPo = l.poDate
      originCount[l.origin]++
      const rec = p.receivedByPo[i]
      const open = l.openQty !== null ? l.openQty > 0 : rec < l.qtyOrdered
      if (open) openRows++
      if (p.receiptCountByPo[i] > 0) {
        filledOrdered += l.qtyOrdered
        filledReceived += cfg.scoring.capFillAtOrdered ? Math.min(rec, l.qtyOrdered) : rec
      }
    }

    const leadDays: number[] = []
    const slips: number[] = []
    let mixRefSum = 0
    let mixRefN = 0
    let onTimeReceipts = 0
    let receivedQty = 0
    let lastGrpo: Day | null = null
    let firstGrpo: Day | null = null
    for (const i of b.rc) {
      const r = p.receipts[i]
      const c = ck.receipts[i]
      receivedQty += r.qty
      if (lastGrpo === null || r.grpoDate > lastGrpo) lastGrpo = r.grpoDate
      if (firstGrpo === null || r.grpoDate < firstGrpo) firstGrpo = r.grpoDate
      if (c.reqSlip !== null) slips.push(c.reqSlip)
      if (c.days === null) {
        exclusions[c.exclusion!]++
        continue
      }
      leadDays.push(c.days)
      if (c.onTime) onTimeReceipts++
      const m = ck.medianOf(r.path[0], r.origin)
      if (m !== null) {
        mixRefSum += m
        mixRefN++
      }
    }
    let returnedQty = 0
    for (const i of b.ret) returnedQty += p.returns[i].qty
    scopeReceipts += b.rc.length
    scopeLinked += leadDays.length

    if (b.po.length === 0) continue

    const leadValue = cfg.scoring.leadStat === 'median' ? median(leadDays) : mean(leadDays)
    const netReceived = receivedQty - returnedQty
    const returnsRate = returnedQty === 0 ? (receivedQty > 0 ? 0 : null) : netReceived > 0 ? returnedQty / netReceived : Infinity
    const origin: Origin = originCount.Import > originCount.Local ? 'Import' : 'Local'

    // Still in use: reference date − latest activity ≤ window (or open PO lines, when enabled).
    const activity = u.activity === 'lastPo' ? lastPo : u.activity === 'lastGrpo' ? lastGrpo : lastPo === null ? lastGrpo : lastGrpo === null ? lastPo : Math.max(lastPo, lastGrpo)
    const daysSinceActivity = refDate !== null && activity !== null ? refDate - activity : null
    const byWindow = daysSinceActivity !== null && daysSinceActivity <= u.days
    const byOpen = u.openPoCounts && openRows > 0
    const stillInUse = byWindow || byOpen
    const verdictWord = stillInUse ? L.legend.stillInUse : L.legend.notInUse
    const inUseReason =
      byOpen && !byWindow
        ? interpolate(L.inUse.openReason, { open: openRows, verdict: verdictWord })
        : interpolate(L.inUse.reason, {
            activity: L.inUse.activity[u.activity],
            date: activity === null ? '—' : fmt(activity, 'date'),
            days: daysSinceActivity ?? '—',
            reference: L.inUse.reference[u.reference],
            refDate: refDate === null ? '—' : fmt(refDate, 'date'),
            window: u.days,
            verdict: verdictWord,
          })

    const blank = (): CriterionCell => ({ value: null, rank: null, quartile: null, verdict: cfg.verdicts.noData, tone: 'neutral' })
    rows.push({
      code,
      name: info.name,
      group: info.group,
      origin,
      poLines: b.po.length,
      poCount: poDocs.size,
      value,
      receipts: b.rc.length,
      linkedReceipts: leadDays.length,
      onTimeReceipts,
      leadDays,
      leadReference: leadBasis === 'mixMedian' && mixRefN ? mixRefSum / mixRefN : null,
      lead: { ...blank(), value: leadValue },
      fill: { ...blank(), value: filledOrdered > 0 ? filledReceived / filledOrdered : null },
      onTime: { ...blank(), value: leadDays.length ? onTimeReceipts / leadDays.length : null },
      reqSlip: { ...blank(), value: mean(slips) },
      receivedQty,
      returnedQty,
      returnsRate,
      openRows,
      score: null,
      rank: null,
      ranked: false,
      share: 0,
      inTopSpend: false,
      meetsReview: false,
      thin: b.rc.length < iss.thinSample,
      lastPo,
      firstPo,
      lastGrpo,
      firstGrpo,
      daysSinceLastPo: refDate !== null && lastPo !== null ? refDate - lastPo : null,
      daysSinceActivity,
      stillInUse,
      inUseReason,
      flags: [],
      severity: null,
      poIdx: b.po,
      receiptIdx: b.rc,
    })
  }

  // Share per vendor group (or the whole scope). The Top share filter walks each group largest first.
  const basisOf = (r: VendorRow) => (cfg.spend.basis === 'poCount' ? r.poCount : cfg.spend.basis === 'poLines' ? r.poLines : r.value)
  const partitions = new Map<string, VendorRow[]>()
  for (const r of rows) {
    const k = cfg.spend.partition === 'vendorGroup' ? r.group : ''
    if (!partitions.has(k)) partitions.set(k, [])
    partitions.get(k)!.push(r)
  }
  const topCut = cfg.spend.topSharePct / 100
  for (const members of partitions.values()) {
    const total = members.reduce((s, r) => s + basisOf(r), 0)
    let running = 0
    for (const r of [...members].sort((a, b) => basisOf(b) - basisOf(a) || b.value - a.value)) {
      r.inTopSpend = total > 0 && running / total < topCut
      running += basisOf(r)
      r.share = total > 0 ? basisOf(r) / total : 0
    }
  }
  const totalValue = rows.reduce((s, r) => s + r.value, 0)

  // Review threshold
  for (const r of rows) {
    const byLines = r.poLines >= cfg.review.minPoLines
    const byValue = r.value >= cfg.review.minValue
    r.meetsReview = cfg.review.combine === 'all' ? byLines && byValue : byLines || byValue
  }

  // Scope median M of vendor lead times; reference R per vendor for verdicts and the Slow flag.
  const M = median(rows.map((r) => r.lead.value).filter((v): v is number => v !== null))
  if (leadBasis === 'scopeMedian') for (const r of rows) r.leadReference = M

  // Rank population and criterion ranks.
  const pop = cfg.scoring.rankPopulation === 'scope' ? rows : rows.filter((r) => r.poLines >= opts.minPoLines)
  const n = pop.length
  for (const c of CRITERIA) {
    const ranks = rank(pop.map((r) => r[c].value), ORIENT[c], cfg.scoring.tieMethod)
    const known = ranks.filter((x): x is number => x !== null)
    const fillRank = cfg.scoring.missingRank === 'worst' ? n : (median(known) ?? n)
    pop.forEach((r, i) => {
      r[c].rank = ranks[i] ?? fillRank
      r[c].quartile = ranks[i] === null ? null : quartileOf(ranks[i], n)
    })
  }

  const w = cfg.scoring.weights
  for (const r of pop) {
    r.ranked = true
    r.score = CRITERIA.reduce((s, c) => s + (w[c] ?? 0) * (r[c].rank ?? n), 0)
  }
  const overall = [...pop].sort((a, b) => a.score! - b.score! || b.value - a.value)
  overall.forEach((r, i) => (r.rank = i + 1))

  // Verdicts and tones.
  const v = cfg.verdicts
  const q = cfg.quartiles.tones
  const tone = (c: CriterionCell, bandTone: Tone) => (c.quartile ? q[c.quartile - 1] : bandTone)
  for (const r of rows) {
    const Lv = r.lead.value
    const R = r.leadReference
    if (Lv !== null && R !== null) {
      const band = Lv <= v.lead.fastMultiple * R ? v.lead.fast : Lv <= v.lead.slowMultiple * R ? v.lead.typical : v.lead.slow
      r.lead.verdict = band.label
      r.lead.tone = tone(r.lead, band.tone)
    }
    const F = r.fill.value
    if (F !== null) {
      const pct = F * 100
      const band = pct >= v.fill.completeAt ? v.fill.complete : pct >= v.fill.nearAt ? v.fill.near : v.fill.short
      r.fill.verdict = band.label
      r.fill.tone = tone(r.fill, band.tone)
    }
    const O = r.onTime.value
    if (O !== null) {
      const pct = O * 100
      const band = pct >= v.onTime.onTimeAt ? v.onTime.onTime : pct >= v.onTime.mixedAt ? v.onTime.mixed : v.onTime.late
      r.onTime.verdict = band.label
      r.onTime.tone = tone(r.onTime, band.tone)
    }
    const S = r.reqSlip.value
    if (S !== null) {
      const band = S <= v.reqSlip.onDateAt ? v.reqSlip.onDate : S <= v.reqSlip.slightAt ? v.reqSlip.slight : v.reqSlip.late
      r.reqSlip.verdict = band.label
      r.reqSlip.tone = tone(r.reqSlip, band.tone)
    }
  }

  // Issue flags.
  const fl = iss.flags
  for (const r of rows) {
    const enough = r.receipts >= iss.thinSample
    if (fl.late.enabled && enough && r.onTime.value !== null && r.onTime.value * 100 < iss.latePct) {
      r.flags.push({ key: 'late', severity: 'serious', reason: interpolate(fl.late.reason, { value: fmtPct(r.onTime.value), threshold: `${iss.latePct}%` }) })
    }
    const R = r.leadReference
    if (fl.slow.enabled && enough && r.lead.value !== null && R !== null && r.lead.value > iss.slowMultiple * R) {
      r.flags.push({
        key: 'slow', severity: 'warning',
        reason: interpolate(fl.slow.reason, {
          value: fmtDays(r.lead.value), threshold: fmtDays(iss.slowMultiple * R),
          multiple: num(iss.slowMultiple, 2), median: fmtDays(R), basis: L.leadBasis[leadBasis],
        }),
      })
    }
    if (fl.shortFill.enabled && enough && r.fill.value !== null && r.fill.value * 100 < iss.shortFillPct) {
      const serious = r.fill.value * 100 < iss.shortFillSeriousPct
      r.flags.push({
        key: 'shortFill', severity: serious ? 'serious' : 'warning',
        reason: interpolate(fl.shortFill.reason, { value: fmtPct(r.fill.value), threshold: `${iss.shortFillPct}%`, serious: `${iss.shortFillSeriousPct}%` }),
      })
    }
    if (fl.returns.enabled && r.returnsRate !== null && r.returnsRate * 100 > iss.returnsPct) {
      r.flags.push({
        key: 'returns', severity: 'warning',
        reason: interpolate(fl.returns.reason, { value: Number.isFinite(r.returnsRate) ? fmtPct(r.returnsRate) : '> 100%', threshold: `${iss.returnsPct}%` }),
      })
    }
    r.severity = r.flags.some((f) => f.severity === 'serious') ? 'serious' : r.flags.length ? 'warning' : null
  }

  // Scope metrics.
  let linked = 0
  let onTimeAll = 0
  let leadSum = 0
  let ordered = 0
  let received = 0
  let poLines = 0
  let slipSum = 0
  let slipN = 0
  for (const r of rows) {
    linked += r.linkedReceipts
    onTimeAll += r.onTimeReceipts
    for (const d of r.leadDays) leadSum += d
    poLines += r.poLines
    for (const i of r.receiptIdx) {
      const s = ck.receipts[i].reqSlip
      if (s !== null) {
        slipSum += s
        slipN++
      }
    }
    for (const i of r.poIdx) {
      if (p.receiptCountByPo[i] > 0) {
        ordered += p.po[i].qtyOrdered
        received += cfg.scoring.capFillAtOrdered ? Math.min(p.receivedByPo[i], p.po[i].qtyOrdered) : p.receivedByPo[i]
      }
    }
  }
  const problems = rows.filter((r) => r.flags.length > 0)
  const inUse = problems.filter((r) => r.stillInUse)
  const flagCounts = new Map<FlagKey, number>()
  for (const r of problems) for (const f of r.flags) flagCounts.set(f.key, (flagCounts.get(f.key) ?? 0) + 1)
  let common: FlagKey | null = null
  for (const k of FLAGS) if ((flagCounts.get(k) ?? 0) > (common ? flagCounts.get(common)! : 0)) common = k
  const problemSpend = problems.reduce((s, r) => s + r.value, 0)
  const excluded = Object.values(exclusions).reduce((a, b) => a + b, 0)

  const metrics: ScopeMetrics = {
    vendorsInScope: rows.length,
    vendorsRanked: pop.length,
    purchaseValue: totalValue,
    avgLeadTime: linked ? leadSum / linked : null,
    scopeMedianLead: M,
    onTimeRate: linked ? onTimeAll / linked : null,
    orderFill: ordered ? received / ordered : null,
    poLines,
    receipts: scopeReceipts,
    linkedReceipts: scopeLinked,
    poLinkCoverage: scopeReceipts ? scopeLinked / scopeReceipts : null,
    excludedReceipts: excluded,
    reviewVendors: rows.filter((r) => r.meetsReview).length,
    top80Vendors: rows.filter((r) => r.inTopSpend).length,
    problemInUse: inUse.length,
    problemInUseSerious: inUse.filter((r) => r.severity === 'serious').length,
    problemNotUsed: problems.length - inUse.length,
    problemSpend,
    problemSpendShare: totalValue ? problemSpend / totalValue : null,
    mostCommonIssue: common ? cfg.issues.flags[common].label : '—',
    mostCommonIssueCount: common ? flagCounts.get(common)! : 0,
    newestPoDate: p.newestPoDate,
    topSharePct: cfg.spend.topSharePct / 100,
    avgReqSlip: slipN ? slipSum / slipN : null,
    shareBasisLabel: L.share.basis[cfg.spend.basis],
    inUseReferenceDate: refDate,
  }

  return { rows, metrics, exclusions, clock: ck, population: n }
}

// ---------------------------------------------------------------------------
// Lead-time profiles

export function measureValues(p: Prepared, measure: Measure, poIdx: number[], receiptIdx: number[], origin?: Origin): number[] {
  const out: number[] = []
  if (measure === 'poToGrpo' || measure === 'requiredToGrpo') {
    for (const i of receiptIdx) {
      const r = p.receipts[i]
      if (r.poIndex < 0) continue
      const l = p.po[r.poIndex]
      if (origin && l.origin !== origin) continue
      if (measure === 'poToGrpo') {
        const d = r.grpoDate - l.poDate
        if (d >= 0) out.push(d)
      } else if (l.prRequiredDate !== null) {
        // Signed: negative = arrived before the PR required date.
        out.push(r.grpoDate - l.prRequiredDate)
      }
    }
    return out
  }
  for (const i of poIdx) {
    const l = p.po[i]
    if (origin && l.origin !== origin) continue
    if (l.prDate === null) continue
    const end = measure === 'prToPo' ? l.poDate : l.prRequiredDate
    if (end === null) continue
    const d = end - l.prDate
    if (d >= 0) out.push(d)
  }
  return out
}

export function allIndexes(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}
