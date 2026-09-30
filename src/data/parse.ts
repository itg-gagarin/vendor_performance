import Papa from 'papaparse'
import type { AppConfig, FieldAliases, Origin } from '../config/types'
import { DAY_MS, FIELDS, dayFromYMD, type Day, type GrpoLine, type PoLine, type ReturnLine, type TableKey } from './schema'

export type Cell = string | number | boolean | Date | null

export interface RawSheet {
  name: string
  headers: string[]
  rows: Cell[][]
}

export async function readFile(file: File): Promise<RawSheet[]> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    return sheets.map((s) => toRaw(s.sheet, s.data as unknown as Cell[][]))
  }
  const text = await file.text()
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  return [toRaw(file.name, parsed.data)]
}

function toRaw(name: string, data: Cell[][]): RawSheet {
  // Header row = first row with at least two non-empty cells (SAP exports often carry a title row).
  let h = data.findIndex((r) => r.filter((c) => c !== null && String(c).trim() !== '').length >= 2)
  if (h < 0) h = 0
  const headers = (data[h] ?? []).map((c, i) => (c === null || String(c).trim() === '' ? `Column ${i + 1}` : String(c).trim()))
  return { name, headers, rows: data.slice(h + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== '')) }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Field → header index (or -1), matched through the configured aliases. */
export function autoMap(headers: string[], table: TableKey, aliases: FieldAliases): Record<string, number> {
  const normalized = headers.map(norm)
  const used = new Set<number>()
  const out: Record<string, number> = {}
  for (const f of FIELDS[table]) {
    const names = [f.key, f.label, ...(aliases[f.key] ?? [])].map(norm)
    let idx = -1
    for (const n of names) {
      idx = normalized.findIndex((h, i) => h === n && !used.has(i))
      if (idx >= 0) break
    }
    if (idx >= 0) used.add(idx)
    out[f.key] = idx
  }
  return out
}

/** Which table a sheet most likely holds, by how many required fields its headers match. */
export function guessTable(sheet: RawSheet, cfg: AppConfig): TableKey | null {
  let best: TableKey | null = null
  let bestScore = 0
  for (const t of ['po', 'grpo', 'returns'] as TableKey[]) {
    const m = autoMap(sheet.headers, t, cfg.data.fieldAliases[t])
    const req = FIELDS[t].filter((f) => f.required)
    const hit = req.filter((f) => m[f.key] >= 0).length / req.length
    const sheetHint = norm(sheet.name).includes(t === 'po' ? 'po' : t === 'grpo' ? 'grpo' : 'return') ? 0.2 : 0
    if (hit + sheetHint > bestScore) {
      bestScore = hit + sheetHint
      best = t
    }
  }
  return bestScore >= 0.6 ? best : null
}

// ---------------------------------------------------------------------------
// Cell parsing

export function parseDay(c: Cell, order: AppConfig['data']['dateOrder']): Day | null {
  if (c === null || c === '') return null
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : Math.floor(c.getTime() / DAY_MS)
  if (typeof c === 'number') {
    // Excel serial day (1900 system). 25569 = 1970-01-01.
    if (c > 20_000 && c < 80_000) return Math.floor(c) - 25_569
    // yyyymmdd as a number
    if (c > 19_000_000 && c < 21_000_000) return dayFromYMD(Math.floor(c / 10_000), Math.floor((c % 10_000) / 100), c % 100)
    return null
  }
  const s = String(c).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return dayFromYMD(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return dayFromYMD(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    let a = +m[1]
    let b = +m[2]
    let y = +m[3]
    if (y < 100) y += 2000
    const mdy = order === 'MDY' || (order === 'auto' && b > 12 && a <= 12)
    if (mdy) [a, b] = [b, a]
    return dayFromYMD(y, b, a)
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})/)
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const alt: Record<string, number> = { mei: 4, agu: 7, agt: 7, okt: 9, des: 11 }
    const key = m[2].toLowerCase()
    const mi = months.indexOf(key) >= 0 ? months.indexOf(key) : alt[key] ?? -1
    if (mi >= 0) {
      let y = +m[3]
      if (y < 100) y += 2000
      return dayFromYMD(y, mi + 1, +m[1])
    }
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : Math.floor(t / DAY_MS)
}

export function parseNumber(c: Cell, locale: string): number | null {
  if (c === null || c === '') return null
  if (typeof c === 'number') return c
  if (typeof c === 'boolean' || c instanceof Date) return null
  let s = String(c).trim().replace(/[^\d.,\-()]/g, '')
  const negative = /^\(.*\)$/.test(s)
  s = s.replace(/[()]/g, '')
  if (!s) return null
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (hasDot) {
    const dotThousands = /^(id|de|nl|es|it|pt|tr)/i.test(locale)
    if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s) || (dotThousands && /^-?\d{1,3}(\.\d{3})+$/.test(s))) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export function parseOrigin(c: Cell, cfg: AppConfig): Origin | null {
  if (c === null || String(c).trim() === '') return null
  const s = String(c).trim().toLowerCase()
  if (cfg.data.importValues.includes(s)) return 'Import'
  if (cfg.data.localValues.includes(s)) return 'Local'
  if (s.includes('import')) return 'Import'
  if (s.includes('local') || s.includes('lokal')) return 'Local'
  return null
}

// ---------------------------------------------------------------------------
// Row conversion

export interface ConvertResult<T> {
  rows: T[]
  skipped: number
  reasons: Record<string, number>
  originDefaulted: number
}

const text = (c: Cell) => (c === null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())

export function convert(table: 'po', sheet: RawSheet, map: Record<string, number>, cfg: AppConfig): ConvertResult<PoLine>
export function convert(table: 'grpo', sheet: RawSheet, map: Record<string, number>, cfg: AppConfig): ConvertResult<GrpoLine>
export function convert(table: 'returns', sheet: RawSheet, map: Record<string, number>, cfg: AppConfig): ConvertResult<ReturnLine>
export function convert(table: TableKey, sheet: RawSheet, map: Record<string, number>, cfg: AppConfig): ConvertResult<PoLine | GrpoLine | ReturnLine> {
  const fields = FIELDS[table]
  const out: (PoLine | GrpoLine | ReturnLine)[] = []
  const reasons: Record<string, number> = {}
  let originDefaulted = 0
  const miss = (why: string) => (reasons[why] = (reasons[why] ?? 0) + 1)

  for (const r of sheet.rows) {
    const obj: Record<string, unknown> = {}
    let bad: string | null = null
    for (const f of fields) {
      const i = map[f.key] ?? -1
      const c = i >= 0 ? (r[i] ?? null) : null
      let v: unknown
      if (f.kind === 'date') v = parseDay(c, cfg.data.dateOrder)
      else if (f.kind === 'number') v = parseNumber(c, cfg.format.locale)
      else if (f.kind === 'origin') {
        v = parseOrigin(c, cfg)
        if (v === null) {
          originDefaulted++
          v = cfg.data.defaultOrigin
        }
      } else v = text(c)
      if (f.required && (v === null || v === '')) {
        bad = `Missing or unreadable ${f.label.toLowerCase()}`
        break
      }
      obj[f.key] = v ?? (f.kind === 'text' ? '' : null)
    }
    if (bad) {
      miss(bad)
      continue
    }
    out.push(obj as unknown as PoLine | GrpoLine | ReturnLine)
  }
  const skipped = Object.values(reasons).reduce((a, b) => a + b, 0)
  return { rows: out, skipped, reasons, originDefaulted }
}
