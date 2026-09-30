import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { autoMap, convert, convertFlat, guessTable, parseDay, parseNumber, parseOrigin, type Cell, type RawSheet } from './parse'
import { dayFromYMD } from './schema'

describe('parseDay', () => {
  const d = dayFromYMD(2026, 3, 5)
  it.each([
    ['2026-03-05', d],
    ['05/03/2026', d],
    ['05.03.2026', d],
    ['5 Mar 2026', d],
    ['05-Mei-2026', dayFromYMD(2026, 5, 5)],
    [20260305, d],
    [46086, d], // Excel serial
  ])('%s', (input, expected) => {
    expect(parseDay(input as string | number, 'auto')).toBe(expected)
  })
  it('respects MDY', () => expect(parseDay('03/05/2026', 'MDY')).toBe(d))
  it('auto-detects month-first when the day is > 12', () => expect(parseDay('03/25/2026', 'auto')).toBe(dayFromYMD(2026, 3, 25)))
})

describe('parseNumber', () => {
  it.each([
    ['1.234.567,89', 'id-ID', 1234567.89],
    ['1,234,567.89', 'en-US', 1234567.89],
    ['1.234', 'id-ID', 1234],
    ['1.5', 'en-US', 1.5],
    ['Rp 50.000.000', 'id-ID', 50000000],
    ['(1,200)', 'en-US', -1200],
    ['12,5', 'id-ID', 12.5],
  ])('%s (%s)', (input, locale, expected) => expect(parseNumber(input, locale)).toBeCloseTo(expected))
})

describe('mapping', () => {
  it('maps SAP B1 field names through aliases', () => {
    const headers = ['DocNum', 'LineNum', 'DocDate', 'CardCode', 'CardName', 'ItemCode', 'Dscription', 'U_Level1', 'Quantity', 'LineTotal', 'U_Origin']
    const m = autoMap(headers, 'po', DEFAULT_CONFIG.data.fieldAliases.po)
    expect(m.poDoc).toBe(0)
    expect(m.poDate).toBe(2)
    expect(m.level1).toBe(7)
    expect(m.lineValue).toBe(9)
    expect(m.origin).toBe(10)
  })

  it('guesses the table and converts rows, reporting skipped ones', () => {
    const sheet: RawSheet = {
      name: 'GRPO',
      headers: ['GRPO No', 'GRPO Date', 'Vendor Code', 'Item Code', 'Qty Received', 'PO No', 'PO Line'],
      rows: [
        ['G1', '2026-01-10', 'V1', 'I1', '10', 'P1', '0'],
        ['G2', '', 'V1', 'I1', '5', 'P1', '0'],
      ],
    }
    expect(guessTable(sheet, DEFAULT_CONFIG)).toBe('grpo')
    const res = convert('grpo', sheet, autoMap(sheet.headers, 'grpo', DEFAULT_CONFIG.data.fieldAliases.grpo), DEFAULT_CONFIG)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].qtyReceived).toBe(10)
    expect(res.skipped).toBe(1)
  })

  it('normalises origin values', () => {
    expect(parseOrigin('IMPORT', DEFAULT_CONFIG)).toBe('Import')
    expect(parseOrigin('Lokal', DEFAULT_CONFIG)).toBe('Local')
    expect(parseOrigin('', DEFAULT_CONFIG)).toBeNull()
  })
})

describe('combined extract', () => {
  const headers = ['Kode Vendor', 'Nama Vendor', 'Vendor Group', 'Level 1 (Item Group)', 'Cat2 Name', 'Cat3 Name', 'Cat4 Name', 'PR DocNum', 'PR Date', 'PR Required Date', 'PR Qty', 'PO DocNum', 'PO LineNum', 'PO Date', 'Item Code', 'Item Description', 'PO Qty', 'Line Total', 'GRPO Qty (this receipt)', 'GRPO Line Status', 'GRPO Doc Status', 'GRPO DocNum', 'GRPO Date', 'Returned Qty (this receipt)', 'Return Date', 'Return Reason Code', 'Return Reason', 'Net Received (this receipt)', 'Return Flag']
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  const row = (line: number | null, qty: number, grpo: number | null, date: string | null, got: number, ret = 0, req: Cell = d('2026-03-18')): Cell[] => [
    'VLP00001', 'ABADI DJAJA, CV', 'V. Local Production', 'Raw Material Board', 'PVC SHEET', 3, 'NONE', 260000887, d('2026-03-11'), req, qty,
    260002223, line, d('2026-03-12'), `RB.${line ?? 0}`, 'Pvc Sheet', qty, qty * 1000, got, grpo ? 'C' : null, grpo ? 'C' : null, grpo, date ? d(date) : null,
    ret, ret ? d('2026-03-30') : null, null, null, got - ret, ret ? 'Has return' : null,
  ]
  const sheet: RawSheet = {
    name: 'Sheet1',
    headers,
    rows: [
      row(null, 4550, 260003689, '2026-03-24', 1000),
      row(null, 4550, 260004021, '2026-04-02', 250, 50),
      row(1, 10, null, null, 0, 0, '07/05/0206'),
      row(2, 5, null, null, 5),
    ],
  }

  it('is recognised as a combined extract', () => expect(guessTable(sheet, DEFAULT_CONFIG)).toBe('flat'))

  it('splits rows into PO lines, receipts and returns without double counting line values', () => {
    const map = autoMap(sheet.headers, 'flat', DEFAULT_CONFIG.data.fieldAliases.flat)
    const { data, report } = convertFlat(sheet, map, DEFAULT_CONFIG)
    expect(data.po).toHaveLength(3)
    expect(data.po[0].poLine).toBe('0') // blank LineNum is SAP line 0
    expect(data.po[0].lineValue).toBe(4_550_000) // taken once, not per receipt row
    expect(data.po[0].level3).toBe('3')
    expect(data.po[0].origin).toBe('Local')
    expect(data.grpo).toHaveLength(2)
    expect(data.grpo.every((g) => g.poLine === '0' && g.poDoc === '260002223')).toBe(true)
    expect(data.returns).toEqual([expect.objectContaining({ qtyReturned: 50, vendorCode: 'VLP00001' })])
    expect(data.po[1].prRequiredDate).toBeNull() // year 0206 typo
    expect(report.warnings['Unreadable PR required date (left empty)']).toBe(1)
    expect(report.warnings['Received quantity without a GRPO number or date (not counted as a receipt)']).toBe(1)
    expect(report.originByGroup['V. Local Production']).toBe('Local')
  })
})
