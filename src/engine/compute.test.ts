import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { GROUP_ALL_IMPORT, GROUP_ALL_LOCAL, type AppConfig } from '../config/types'
import { buildDemoDataset } from '../data/demo'
import type { Dataset, GrpoLine, PoLine, ReturnLine } from '../data/schema'
import { clockReceipts, computeScope, EMPTY_SCOPE, measureValues } from './compute'
import { prepare } from './prepare'
import { binIndex, binLabels, median, quantile, rank } from './stats'

const cfg = (patch: (c: AppConfig) => void = () => {}): AppConfig => {
  const c = structuredClone(DEFAULT_CONFIG)
  patch(c)
  return c
}

function po(vendor: string, doc: string, poDate: number, qty: number, value: number, extra: Partial<PoLine> = {}): PoLine {
  return {
    poDoc: doc, poLine: '0', poDate, vendorCode: vendor, vendorName: `Vendor ${vendor}`, vendorGroup: 'G1',
    itemCode: 'HW-1', itemName: 'Bolt', level1: 'Hardware', level2: 'Fasteners', level3: 'Bolts', level4: 'Hex bolt',
    origin: 'Local', qtyOrdered: qty, lineValue: value, openQty: null, prDoc: `PR${doc}`, prDate: poDate - 2, prRequiredDate: null,
    ...extra,
  }
}
function gr(vendor: string, doc: string, date: number, qty: number, extra: Partial<GrpoLine> = {}): GrpoLine {
  return { grpoDoc: `G${doc}-${date}`, grpoLine: '0', grpoDate: date, vendorCode: vendor, vendorName: '', itemCode: 'HW-1', qtyReceived: qty, poDoc: doc, poLine: '0', ...extra }
}
function ds(p: PoLine[], g: GrpoLine[], r: ReturnLine[] = []): Dataset {
  return { po: p, grpo: g, returns: r, source: 'test', loadedAt: '', isDemo: false }
}

describe('stats', () => {
  it('median and quantiles interpolate like Excel', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1)
    expect(median([])).toBeNull()
  })
  it('ranks with each tie method', () => {
    expect(rank([10, 20, 20, 30], 'low', 'min')).toEqual([1, 2, 2, 4])
    expect(rank([10, 20, 20, 30], 'low', 'average')).toEqual([1, 2.5, 2.5, 4])
    expect(rank([10, 20, 20, 30], 'low', 'dense')).toEqual([1, 2, 2, 3])
    expect(rank([0.9, null, 0.95], 'high', 'min')).toEqual([2, null, 1])
  })
  it('bins are upper-inclusive with an open last bin', () => {
    expect(binIndex(7, [7, 14])).toBe(0)
    expect(binIndex(8, [7, 14])).toBe(1)
    expect(binIndex(15, [7, 14])).toBe(2)
    expect(binLabels([7, 14])).toEqual(['≤ 7 d', '8–14 d', '> 14 d'])
    expect(binLabels([-14, -7, 0, 1])).toEqual(['≤ −14 d', '−13 to −7 d', '−6 to 0 d', '1 d', '> 1 d'])
  })
})

describe('vendor formulas', () => {
  // Vendor A: 5 lines, each received in full 10 days after PO.
  // Vendor B: 5 lines, received at 20 days, 90% quantity; one more line not yet received.
  const A = [0, 1, 2, 3, 4].map((i) => po('A', `A${i}`, 100 + i, 100, 1_000_000))
  const B = [0, 1, 2, 3, 4, 5].map((i) => po('B', `B${i}`, 100 + i, 100, 3_000_000))
  const grA = A.map((l) => gr('A', l.poDoc, l.poDate + 10, 100))
  const grB = B.slice(0, 5).map((l) => gr('B', l.poDoc, l.poDate + 20, 90))
  const data = ds([...A, ...B], [...grA, ...grB, gr('B', '', 130, 5, { poDoc: '', poLine: '' })])

  it('lead time is the mean over receipts with a PO link; unlinked receipts are excluded', () => {
    const p = prepare(data)
    const res = computeScope(p, cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const a = res.rows.find((r) => r.code === 'A')!
    const b = res.rows.find((r) => r.code === 'B')!
    expect(a.lead.value).toBe(10)
    expect(b.lead.value).toBe(20)
    expect(b.receipts).toBe(6)
    expect(b.linkedReceipts).toBe(5)
    expect(res.exclusions.noPoLink).toBe(1)
    expect(res.metrics.poLinkCoverage).toBeCloseTo(10 / 11)
  })

  it('fill only counts PO lines with at least one receipt', () => {
    const p = prepare(data)
    const b = computeScope(p, cfg(), EMPTY_SCOPE, { minPoLines: 1 }).rows.find((r) => r.code === 'B')!
    // 5 received lines × 90 ÷ 5 × 100; the sixth line (no receipt) is ignored.
    expect(b.fill.value).toBeCloseTo(0.9)
    expect(b.openRows).toBe(6)
  })

  it('on time uses the allowance, and the required date as a pass route', () => {
    const c = cfg((x) => (x.onTime.allowances = { Hardware: { Local: 15, Import: null } }))
    const p = prepare(data)
    let res = computeScope(p, c, EMPTY_SCOPE, { minPoLines: 1 })
    expect(res.rows.find((r) => r.code === 'A')!.onTime.value).toBe(1)
    expect(res.rows.find((r) => r.code === 'B')!.onTime.value).toBe(0)

    // Give B's PRs a required date that its receipts meet.
    const withReq = ds(
      data.po.map((l) => (l.vendorCode === 'B' ? { ...l, prRequiredDate: l.poDate + 25 } : l)),
      data.grpo,
    )
    res = computeScope(prepare(withReq), c, EMPTY_SCOPE, { minPoLines: 1 })
    expect(res.rows.find((r) => r.code === 'B')!.onTime.value).toBe(1)
    const off = cfg((x) => {
      x.onTime.allowances = { Hardware: { Local: 15, Import: null } }
      x.onTime.requiredDateCounts = false
    })
    res = computeScope(prepare(withReq), off, EMPTY_SCOPE, { minPoLines: 1 })
    expect(res.rows.find((r) => r.code === 'B')!.onTime.value).toBe(0)
  })

  it('default allowance is the extract median per Level 1 and origin', () => {
    const ck = clockReceipts(prepare(data), cfg())
    const row = ck.allowances.find((a) => a.level1 === 'Hardware' && a.origin === 'Local')!
    expect(row.median).toBe(15) // median of five 10s and five 20s
    expect(row.allowance).toBe(15)
    expect(row.isDefault).toBe(true)
  })

  it('PR clock measures from the PR date', () => {
    const ck = clockReceipts(prepare(data), cfg((x) => (x.onTime.clock = 'PR_GRPO')))
    expect(ck.receipts[0].days).toBe(12)
  })

  it('score is the weighted sum of ranks and the lowest score is best', () => {
    const res = computeScope(prepare(data), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const a = res.rows.find((r) => r.code === 'A')!
    const b = res.rows.find((r) => r.code === 'B')!
    expect(a.lead.rank).toBe(1)
    expect(a.fill.rank).toBe(1)
    expect(a.score).toBe(3)
    expect(a.rank).toBe(1)
    expect(b.rank).toBe(2)
    const leadOnly = computeScope(prepare(data), cfg((x) => (x.scoring.weights = { lead: 2, fill: 0, onTime: 0, reqSlip: 0 })), EMPTY_SCOPE, { minPoLines: 1 })
    expect(leadOnly.rows.find((r) => r.code === 'B')!.score).toBe(4)
  })

  it('verdicts follow the scope median and the configured edges', () => {
    const res = computeScope(prepare(data), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    // M = median(10, 20) = 15. A: 10 ≤ 12 → Fast. B: 20 > 18.75 → Slow.
    expect(res.metrics.scopeMedianLead).toBe(15)
    expect(res.rows.find((r) => r.code === 'A')!.lead.verdict).toBe('Fast')
    expect(res.rows.find((r) => r.code === 'B')!.lead.verdict).toBe('Slow')
    expect(res.rows.find((r) => r.code === 'B')!.fill.verdict).toBe('Short')
  })

  it('issue flags respect thresholds, severity and the thin-sample guard', () => {
    const res = computeScope(prepare(data), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const b = res.rows.find((r) => r.code === 'B')!
    // Allowance = extract median 15 d, B takes 20 d on every receipt → 0% on time → Late (serious).
    expect(b.flags.map((f) => f.key).sort()).toEqual(['late', 'shortFill', 'slow'])
    expect(b.severity).toBe('serious')
    expect(b.flags.find((f) => f.key === 'shortFill')!.severity).toBe('warning')
    expect(b.flags.find((f) => f.key === 'shortFill')!.reason).toContain('90,0%')

    const thin = computeScope(prepare(data), cfg((x) => (x.issues.thinSample = 10)), EMPTY_SCOPE, { minPoLines: 1 })
    expect(thin.rows.find((r) => r.code === 'B')!.flags).toHaveLength(0)
  })

  it('returns flag ignores the thin-sample guard', () => {
    const r: ReturnLine[] = [{ returnDoc: 'R1', returnDate: 140, vendorCode: 'A', itemCode: 'HW-1', qtyReturned: 10 }]
    const res = computeScope(prepare(ds(data.po, data.grpo, r)), cfg((x) => (x.issues.thinSample = 50)), EMPTY_SCOPE, { minPoLines: 1 })
    const a = res.rows.find((x) => x.code === 'A')!
    expect(a.returnsRate).toBeCloseTo(10 / 490)
    expect(a.flags.map((f) => f.key)).toEqual(['returns'])
  })

  it('still in use compares the last PO with the newest PO in the data', () => {
    const old = po('C', 'C0', 10, 10, 1)
    const res = computeScope(prepare(ds([...data.po, old], data.grpo)), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    expect(res.rows.find((r) => r.code === 'C')!.stillInUse).toBe(false)
    expect(res.rows.find((r) => r.code === 'A')!.stillInUse).toBe(true)
  })

  it('review threshold and spend share', () => {
    const bySpend = (x: AppConfig) => {
      x.spend.basis = 'value'
      x.spend.partition = 'scope'
    }
    const res = computeScope(prepare(data), cfg(bySpend), EMPTY_SCOPE, { minPoLines: 1 })
    const b = res.rows.find((r) => r.code === 'B')!
    const a = res.rows.find((r) => r.code === 'A')!
    // B: 6 lines, Rp 18 jt → below both. A: Rp 5 jt → below.
    expect(b.meetsReview).toBe(false)
    expect(b.cumShare).toBeCloseTo(18 / 23)
    // B alone is 78% of spend, so A (the vendor that crosses 80%) is still inside the top 80%.
    expect(b.inTopSpend).toBe(true)
    expect(a.inTopSpend).toBe(true)
    const narrow = computeScope(prepare(data), cfg((x) => {
      bySpend(x)
      x.spend.topSharePct = 50
    }), EMPTY_SCOPE, { minPoLines: 1 })
    expect(narrow.rows.find((r) => r.code === 'A')!.inTopSpend).toBe(false)
  })

  it('share counts POs against the vendor group inside the item-group scope (default)', () => {
    // G1: A has 5 POs, B has 6. G2: D has 2 POs (one with two lines) and is alone in its group.
    const d1 = po('D', 'D0', 100, 10, 1, { vendorGroup: 'G2' })
    const d2 = { ...po('D', 'D0', 100, 10, 1, { vendorGroup: 'G2' }), poLine: '1' }
    const d3 = po('D', 'D1', 101, 10, 1, { vendorGroup: 'G2' })
    const res = computeScope(prepare(ds([...data.po, d1, d2, d3], data.grpo)), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const row = (c: string) => res.rows.find((r) => r.code === c)!
    expect(row('A').poCount).toBe(5)
    expect(row('D').poCount).toBe(2)
    expect(row('B').share).toBeCloseTo(6 / 11)
    expect(row('A').share).toBeCloseTo(5 / 11)
    expect(row('A').cumShare).toBeCloseTo(1)
    expect(row('D').share).toBe(1)
    // Item-group scope narrows both numerator and denominator.
    const other = po('A', 'A9', 120, 10, 1, { level1: 'Packaging' })
    const scoped = computeScope(prepare(ds([...data.po, other], data.grpo)), cfg(), { ...EMPTY_SCOPE, level1: 'Packaging' }, { minPoLines: 1 })
    expect(scoped.rows.map((r) => [r.code, r.share])).toEqual([['A', 1]])
  })

  it('All Import and All Local select vendor groups by origin', () => {
    const imp = po('I', 'I0', 100, 10, 1, { vendorGroup: 'V. Import Production', origin: 'Import' })
    const p = prepare(ds([...data.po, imp], data.grpo))
    expect(computeScope(p, cfg(), { ...EMPTY_SCOPE, vendorGroup: GROUP_ALL_IMPORT }, { minPoLines: 1 }).rows.map((r) => r.code)).toEqual(['I'])
    expect(computeScope(p, cfg(), { ...EMPTY_SCOPE, vendorGroup: GROUP_ALL_LOCAL }, { minPoLines: 1 }).rows.map((r) => r.code).sort()).toEqual(['A', 'B'])
  })

  it('required-date slip is a signed criterion with its own verdict and weight', () => {
    // A arrives 10 d after PO with required date PO + 15 → −5 d. B arrives 20 d after PO, required PO + 12 → +8 d.
    const withReq = ds(
      data.po.map((l) => ({ ...l, prRequiredDate: l.poDate + (l.vendorCode === 'A' ? 15 : 12) })),
      data.grpo,
    )
    const res = computeScope(prepare(withReq), cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const a = res.rows.find((r) => r.code === 'A')!
    const b = res.rows.find((r) => r.code === 'B')!
    expect(a.reqSlip.value).toBe(-5)
    expect(b.reqSlip.value).toBe(8)
    expect(a.reqSlip.verdict).toBe('By required date')
    expect(b.reqSlip.verdict).toBe('Late vs request')
    expect(a.reqSlip.rank).toBe(1)
    // Weight 0 by default: score unchanged (3 = 1 + 1 + 1).
    expect(a.score).toBe(3)
    const weighted = computeScope(prepare(withReq), cfg((x) => (x.scoring.weights.reqSlip = 2)), EMPTY_SCOPE, { minPoLines: 1 })
    expect(weighted.rows.find((r) => r.code === 'B')!.score).toBe(6 + 2 * 2)
    expect(res.metrics.avgReqSlip).toBeCloseTo((5 * -5 + 5 * 8) / 10)
    expect(measureValues(prepare(withReq), 'requiredToGrpo', a.poIdx, a.receiptIdx)).toEqual([-5, -5, -5, -5, -5])
  })

  it('verdict edges are independent of the issue thresholds', () => {
    const res = computeScope(prepare(data), cfg((x) => (x.verdicts.fill.nearAt = 85)), EMPTY_SCOPE, { minPoLines: 1 })
    const b = res.rows.find((r) => r.code === 'B')!
    expect(b.fill.verdict).toBe('Near full') // 90% ≥ 85%
    expect(b.flags.some((f) => f.key === 'shortFill')).toBe(true) // flag still uses 95%
  })

  it('lead verdict can compare with the median of the vendor\'s own materials', () => {
    // A is all Hardware Local; add a Packaging Local vendor P with 3-day receipts.
    const P = [0, 1, 2, 3, 4].map((i) => po('P', `P${i}`, 100 + i, 10, 1, { level1: 'Packaging' }))
    const grP = P.map((l) => gr('P', l.poDoc, l.poDate + 3, 10))
    const p = prepare(ds([...data.po, ...P], [...data.grpo, ...grP]))
    const scopeBasis = computeScope(p, cfg(), EMPTY_SCOPE, { minPoLines: 1 })
    const mix = computeScope(p, cfg((x) => (x.verdicts.lead.basis = 'mixMedian')), EMPTY_SCOPE, { minPoLines: 1 })
    // Scope median of (10, 20, 3) = 10 → A (10 d) is Typical. Against Hardware's own median (15 d) A is Fast.
    expect(scopeBasis.rows.find((r) => r.code === 'A')!.lead.verdict).toBe('Typical')
    expect(mix.rows.find((r) => r.code === 'A')!.leadReference).toBe(15)
    expect(mix.rows.find((r) => r.code === 'A')!.lead.verdict).toBe('Fast')
    expect(mix.rows.find((r) => r.code === 'P')!.leadReference).toBe(3)
  })

  it('still-in-use rule: reference date, activity, window and open PO lines', () => {
    // Newest PO = day 105. C last PO day 10, last GRPO day 100.
    const cPo = po('C', 'C0', 10, 10, 1)
    const cGr = gr('C', 'C0', 100, 5)
    const p = prepare(ds([...data.po, cPo], [...data.grpo, cGr]))
    const c = (patch: (x: AppConfig) => void) => computeScope(p, cfg(patch), EMPTY_SCOPE, { minPoLines: 1 }).rows.find((r) => r.code === 'C')!
    expect(c(() => {}).stillInUse).toBe(false)
    expect(c(() => {}).daysSinceActivity).toBe(95)
    expect(c(() => {}).inUseReason).toContain('95 d')
    expect(c((x) => (x.inUse.activity = 'lastGrpo')).stillInUse).toBe(true)
    expect(c((x) => (x.inUse.days = 100)).stillInUse).toBe(true)
    expect(c((x) => (x.inUse.openPoCounts = true)).stillInUse).toBe(true) // 5 of 10 received → open
    expect(c((x) => {
      x.inUse.reference = 'fixed'
      x.inUse.fixedDate = '1970-02-01' // day 31
    }).daysSinceActivity).toBe(21)
  })

  it('min PO lines narrows the rank population', () => {
    const res = computeScope(prepare(data), cfg(), EMPTY_SCOPE, { minPoLines: 6 })
    expect(res.population).toBe(1)
    expect(res.rows.find((r) => r.code === 'A')!.ranked).toBe(false)
  })

  it('scope filters by vendor group and material path', () => {
    const other = po('D', 'D0', 100, 10, 1, { vendorGroup: 'G2', level1: 'Packaging' })
    const p = prepare(ds([...data.po, other], data.grpo))
    expect(computeScope(p, cfg(), { ...EMPTY_SCOPE, vendorGroup: 'G2' }, { minPoLines: 1 }).rows.map((r) => r.code)).toEqual(['D'])
    expect(computeScope(p, cfg(), { ...EMPTY_SCOPE, level1: 'Hardware' }, { minPoLines: 1 }).rows).toHaveLength(2)
  })

  it('lead-time profile measures', () => {
    const p = prepare(data)
    const a = computeScope(p, cfg(), EMPTY_SCOPE, { minPoLines: 1 }).rows.find((r) => r.code === 'A')!
    expect(measureValues(p, 'poToGrpo', a.poIdx, a.receiptIdx)).toEqual([10, 10, 10, 10, 10])
    expect(measureValues(p, 'prToPo', a.poIdx, a.receiptIdx)).toEqual([2, 2, 2, 2, 2])
  })
})

describe('demo dataset', () => {
  it('is deterministic and computes quickly', () => {
    const d = buildDemoDataset()
    expect(d.po.length).toBeGreaterThan(1000)
    expect(buildDemoDataset().po.length).toBe(d.po.length)
    const p = prepare(d)
    const t = performance.now()
    const res = computeScope(p, DEFAULT_CONFIG, EMPTY_SCOPE, { minPoLines: 3 })
    // NF-2: a scope or configuration change re-renders in under 300 ms.
    expect(performance.now() - t).toBeLessThan(300)
    expect(res.rows.length).toBeGreaterThan(40)
    expect(res.rows.filter((r) => r.flags.length).length).toBeGreaterThan(0)
  })
})

describe('saved configuration from an earlier version', () => {
  it('replaces unedited retired default texts but keeps edited ones', async () => {
    const { normalizeConfig } = await import('../config/store')
    const old = structuredClone(DEFAULT_CONFIG)
    old.columns.scorecard.find((c) => c.id === 'cumShare')!.tip.formula = 'Σ value of this and larger vendors ÷ scope value'
    old.columns.scorecard.find((c) => c.id === 'value')!.tip.purpose = 'My own words'
    const cfg = normalizeConfig(JSON.parse(JSON.stringify(old)))
    expect(cfg.columns.scorecard.find((c) => c.id === 'cumShare')!.tip.formula).toBe('Generated from Configuration → Share')
    expect(cfg.columns.scorecard.find((c) => c.id === 'value')!.tip.purpose).toBe('My own words')
  })
})
