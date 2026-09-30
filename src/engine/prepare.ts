import type { Origin } from '../config/types'
import type { Dataset, Day, PoLine } from '../data/schema'

// Joins that do not depend on configuration: receipts to their PO line, items
// and vendors to their master attributes. Runs once per dataset.

export interface ReceiptFact {
  vendorCode: string
  vendorGroup: string
  itemCode: string
  path: [string, string, string, string]
  origin: Origin
  grpoDate: Day
  qty: number
  /** Index into Prepared.po, or -1 when the receipt has no usable PO link. */
  poIndex: number
  linkState: 'linked' | 'noPoLink' | 'poNotFound'
}

export interface ReturnFact {
  vendorCode: string
  vendorGroup: string
  itemCode: string
  path: [string, string, string, string]
  origin: Origin
  date: Day
  qty: number
}

export interface VendorInfo {
  code: string
  name: string
  group: string
}

export interface ScopeTree {
  groups: string[]
  /** level1 → level2 → level3 → level4[] */
  paths: Map<string, Map<string, Map<string, Set<string>>>>
}

export interface Prepared {
  po: PoLine[]
  receipts: ReceiptFact[]
  returns: ReturnFact[]
  vendors: Map<string, VendorInfo>
  /** Σ linked receipt qty per PO line index. */
  receivedByPo: Float64Array
  receiptCountByPo: Uint32Array
  newestPoDate: Day | null
  tree: ScopeTree
  level1s: string[]
}

interface ItemInfo {
  name: string
  path: [string, string, string, string]
  origin: Origin
}

export function prepare(ds: Dataset): Prepared {
  const po = ds.po
  const poKey = new Map<string, number>()
  const poItemKey = new Map<string, number>()
  const items = new Map<string, ItemInfo>()
  const vendors = new Map<string, VendorInfo>()
  const itemDate = new Map<string, Day>()
  let newestPoDate: Day | null = null

  po.forEach((l, i) => {
    poKey.set(`${l.poDoc}|${l.poLine}`, i)
    const ik = `${l.poDoc}|${l.itemCode}`
    if (!poItemKey.has(ik)) poItemKey.set(ik, i)
    if (newestPoDate === null || l.poDate > newestPoDate) newestPoDate = l.poDate
    // Item master = attributes on the item's most recent PO line.
    if (!items.has(l.itemCode) || l.poDate >= (itemDate.get(l.itemCode) ?? -Infinity)) {
      items.set(l.itemCode, { name: l.itemName, path: [l.level1, l.level2, l.level3, l.level4], origin: l.origin })
      itemDate.set(l.itemCode, l.poDate)
    }
    const v = vendors.get(l.vendorCode)
    if (!v) vendors.set(l.vendorCode, { code: l.vendorCode, name: l.vendorName || l.vendorCode, group: l.vendorGroup })
  })

  const receivedByPo = new Float64Array(po.length)
  const receiptCountByPo = new Uint32Array(po.length)
  const fallbackPath: [string, string, string, string] = ['(Unmapped)', '', '', '']

  const receipts: ReceiptFact[] = ds.grpo.map((g) => {
    let poIndex = -1
    let linkState: ReceiptFact['linkState'] = 'noPoLink'
    if (g.poDoc) {
      const byLine = poKey.get(`${g.poDoc}|${g.poLine}`)
      if (byLine !== undefined) {
        poIndex = byLine
      } else if (!g.poLine) {
        // No base line: accept the first line on that PO with the same item.
        poIndex = poItemKey.get(`${g.poDoc}|${g.itemCode}`) ?? -1
      }
      linkState = poIndex >= 0 ? 'linked' : 'poNotFound'
    }
    if (!vendors.has(g.vendorCode)) vendors.set(g.vendorCode, { code: g.vendorCode, name: g.vendorName || g.vendorCode, group: '' })
    const line = poIndex >= 0 ? po[poIndex] : null
    const item = items.get(g.itemCode)
    if (line) {
      receivedByPo[poIndex] += g.qtyReceived
      receiptCountByPo[poIndex]++
    }
    return {
      vendorCode: g.vendorCode,
      vendorGroup: line?.vendorGroup ?? vendors.get(g.vendorCode)!.group,
      itemCode: g.itemCode,
      path: line ? [line.level1, line.level2, line.level3, line.level4] : item?.path ?? fallbackPath,
      origin: line?.origin ?? item?.origin ?? 'Local',
      grpoDate: g.grpoDate,
      qty: g.qtyReceived,
      poIndex,
      linkState,
    }
  })

  const returns: ReturnFact[] = ds.returns.map((r) => {
    const item = items.get(r.itemCode)
    return {
      vendorCode: r.vendorCode,
      vendorGroup: vendors.get(r.vendorCode)?.group ?? '',
      itemCode: r.itemCode,
      path: item?.path ?? fallbackPath,
      origin: item?.origin ?? 'Local',
      date: r.returnDate,
      qty: r.qtyReturned,
    }
  })

  const groups = new Set<string>()
  const paths: ScopeTree['paths'] = new Map()
  for (const l of po) {
    if (l.vendorGroup) groups.add(l.vendorGroup)
    if (!paths.has(l.level1)) paths.set(l.level1, new Map())
    const m2 = paths.get(l.level1)!
    if (!m2.has(l.level2)) m2.set(l.level2, new Map())
    const m3 = m2.get(l.level2)!
    if (!m3.has(l.level3)) m3.set(l.level3, new Set())
    m3.get(l.level3)!.add(l.level4)
  }

  return {
    po,
    receipts,
    returns,
    vendors,
    receivedByPo,
    receiptCountByPo,
    newestPoDate,
    tree: { groups: [...groups].sort(), paths },
    level1s: [...paths.keys()].sort(),
  }
}

export function itemNameLookup(ds: Dataset): Map<string, string> {
  const m = new Map<string, string>()
  for (const l of ds.po) if (l.itemName) m.set(l.itemCode, l.itemName)
  return m
}
