import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { autoMap, convert, guessTable, parseDay, parseNumber, parseOrigin, type RawSheet } from './parse'
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
