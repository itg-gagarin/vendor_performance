import type { Origin } from '../config/types'

// Canonical rows after mapping. Dates are whole days since 1970-01-01 (UTC) so
// lead-time arithmetic is integer subtraction and never trips over time zones.

export type Day = number

export interface PoLine {
  poDoc: string
  poLine: string
  poDate: Day
  vendorCode: string
  vendorName: string
  vendorGroup: string
  itemCode: string
  itemName: string
  level1: string
  level2: string
  level3: string
  level4: string
  origin: Origin
  qtyOrdered: number
  lineValue: number
  openQty: number | null
  prDoc: string
  prDate: Day | null
  prRequiredDate: Day | null
}

export interface GrpoLine {
  grpoDoc: string
  grpoLine: string
  grpoDate: Day
  vendorCode: string
  vendorName: string
  itemCode: string
  qtyReceived: number
  poDoc: string
  poLine: string
}

export interface ReturnLine {
  returnDoc: string
  returnDate: Day
  vendorCode: string
  itemCode: string
  qtyReturned: number
}

export interface Dataset {
  po: PoLine[]
  grpo: GrpoLine[]
  returns: ReturnLine[]
  source: string
  loadedAt: string
  isDemo: boolean
}

/**
 * 'flat' is the combined SAP extract: one row per GRPO receipt with the PR, PO
 * and return fields repeated on it (PO lines without a receipt appear once with
 * empty GRPO fields). It is split into the three canonical tables on load.
 */
export type TableKey = 'po' | 'grpo' | 'returns' | 'flat'

export interface FieldDef {
  key: string
  label: string
  required: boolean
  kind: 'text' | 'date' | 'number' | 'origin'
}

export const FIELDS: Record<TableKey, FieldDef[]> = {
  flat: [
    { key: 'vendorCode', label: 'Vendor code', required: true, kind: 'text' },
    { key: 'vendorName', label: 'Vendor name', required: true, kind: 'text' },
    { key: 'vendorGroup', label: 'Vendor group', required: false, kind: 'text' },
    { key: 'level1', label: 'Material level 1', required: true, kind: 'text' },
    { key: 'level2', label: 'Material level 2', required: false, kind: 'text' },
    { key: 'level3', label: 'Material level 3', required: false, kind: 'text' },
    { key: 'level4', label: 'Material level 4', required: false, kind: 'text' },
    { key: 'prDoc', label: 'PR number', required: false, kind: 'text' },
    { key: 'prDate', label: 'PR date', required: false, kind: 'date' },
    { key: 'prRequiredDate', label: 'PR required date', required: false, kind: 'date' },
    { key: 'poDoc', label: 'PO number', required: true, kind: 'text' },
    { key: 'poLine', label: 'PO line', required: false, kind: 'text' },
    { key: 'poDate', label: 'PO date', required: true, kind: 'date' },
    { key: 'itemCode', label: 'Item code', required: true, kind: 'text' },
    { key: 'itemName', label: 'Item name', required: false, kind: 'text' },
    { key: 'qtyOrdered', label: 'Quantity ordered', required: true, kind: 'number' },
    { key: 'lineValue', label: 'Line total', required: true, kind: 'number' },
    { key: 'grpoDoc', label: 'GRPO number', required: false, kind: 'text' },
    { key: 'grpoDate', label: 'GRPO date', required: false, kind: 'date' },
    { key: 'qtyReceived', label: 'Quantity received', required: false, kind: 'number' },
    { key: 'qtyReturned', label: 'Quantity returned', required: false, kind: 'number' },
    { key: 'returnDate', label: 'Return date', required: false, kind: 'date' },
    { key: 'origin', label: 'Import / Local', required: false, kind: 'origin' },
  ],
  po: [
    { key: 'poDoc', label: 'PO number', required: true, kind: 'text' },
    { key: 'poLine', label: 'PO line', required: true, kind: 'text' },
    { key: 'poDate', label: 'PO date', required: true, kind: 'date' },
    { key: 'vendorCode', label: 'Vendor code', required: true, kind: 'text' },
    { key: 'vendorName', label: 'Vendor name', required: true, kind: 'text' },
    { key: 'vendorGroup', label: 'Vendor group', required: false, kind: 'text' },
    { key: 'itemCode', label: 'Item code', required: true, kind: 'text' },
    { key: 'itemName', label: 'Item name', required: false, kind: 'text' },
    { key: 'level1', label: 'Material level 1', required: true, kind: 'text' },
    { key: 'level2', label: 'Material level 2', required: false, kind: 'text' },
    { key: 'level3', label: 'Material level 3', required: false, kind: 'text' },
    { key: 'level4', label: 'Material level 4', required: false, kind: 'text' },
    { key: 'origin', label: 'Import / Local', required: false, kind: 'origin' },
    { key: 'qtyOrdered', label: 'Quantity ordered', required: true, kind: 'number' },
    { key: 'lineValue', label: 'Line total', required: true, kind: 'number' },
    { key: 'openQty', label: 'Open quantity', required: false, kind: 'number' },
    { key: 'prDoc', label: 'PR number', required: false, kind: 'text' },
    { key: 'prDate', label: 'PR date', required: false, kind: 'date' },
    { key: 'prRequiredDate', label: 'PR required date', required: false, kind: 'date' },
  ],
  grpo: [
    { key: 'grpoDoc', label: 'GRPO number', required: true, kind: 'text' },
    { key: 'grpoLine', label: 'GRPO line', required: false, kind: 'text' },
    { key: 'grpoDate', label: 'GRPO date', required: true, kind: 'date' },
    { key: 'vendorCode', label: 'Vendor code', required: true, kind: 'text' },
    { key: 'vendorName', label: 'Vendor name', required: false, kind: 'text' },
    { key: 'itemCode', label: 'Item code', required: true, kind: 'text' },
    { key: 'qtyReceived', label: 'Quantity received', required: true, kind: 'number' },
    { key: 'poDoc', label: 'Base PO number', required: false, kind: 'text' },
    { key: 'poLine', label: 'Base PO line', required: false, kind: 'text' },
  ],
  returns: [
    { key: 'returnDoc', label: 'Return number', required: false, kind: 'text' },
    { key: 'returnDate', label: 'Return date', required: true, kind: 'date' },
    { key: 'vendorCode', label: 'Vendor code', required: true, kind: 'text' },
    { key: 'itemCode', label: 'Item code', required: true, kind: 'text' },
    { key: 'qtyReturned', label: 'Quantity returned', required: true, kind: 'number' },
  ],
}

export const DAY_MS = 86_400_000

export function dayFromYMD(y: number, m: number, d: number): Day {
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function dayToDate(day: Day): Date {
  return new Date(day * DAY_MS)
}
