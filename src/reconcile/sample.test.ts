import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults'
import { autoMap, convertFlat, type Cell, type RawSheet } from '../data/parse'
import type { Dataset } from '../data/schema'
import { clockReceipts, computeScope, EMPTY_SCOPE } from '../engine/compute'
import { prepare } from '../engine/prepare'

// NF-1 reconciliation against the real SAP extract. The workbook is company
// data and is not committed: run with VP_SAMPLE=/path/to/extract.xlsx npm test
const file = process.env.VP_SAMPLE

describe.skipIf(!file || !existsSync(file))('SAP extract reconciliation', () => {
  it('reproduces the PRD figures', async () => {
    const { default: readXlsxFile } = await import('read-excel-file/node')
    const [first] = await readXlsxFile(file!)
    const data = first.data as unknown as Cell[][]
    const sheet: RawSheet = { name: first.sheet, headers: data[0].map(String), rows: data.slice(1) }
    const { data: parts, report } = convertFlat(sheet, autoMap(sheet.headers, 'flat', DEFAULT_CONFIG.data.fieldAliases.flat), DEFAULT_CONFIG)
    const ds: Dataset = { ...parts, source: file!, loadedAt: '', isDemo: false }
    console.log(report)

    expect(report.skipped).toBe(0)
    // PRD: "Returns are rare (117 rows)"
    expect(parts.returns).toHaveLength(117)

    // PRD: default allowance examples, PO clock.
    const p = prepare(ds)
    const ck = clockReceipts(p, DEFAULT_CONFIG)
    const med = (l1: string, o: 'Local' | 'Import') => ck.allowances.find((a) => a.level1 === l1 && a.origin === o)?.median
    expect([med('Raw Material Hardware', 'Local'), med('Raw Material Hardware', 'Import')]).toEqual([19, 42])
    expect([med('Raw Material Packaging', 'Local'), med('Raw Material Packaging', 'Import')]).toEqual([18, 29])
    expect([med('Sparepart', 'Local'), med('Sparepart', 'Import')]).toEqual([6, 35])

    // NF-2: scope / configuration change under 300 ms.
    const t = performance.now()
    const res = computeScope(p, DEFAULT_CONFIG, EMPTY_SCOPE, { minPoLines: 3 }, clockReceipts(p, DEFAULT_CONFIG))
    const ms = performance.now() - t
    console.log({ ms, vendors: res.rows.length, metrics: res.metrics, exclusions: res.exclusions })
    expect(ms).toBeLessThan(300)
  }, 120_000)
})
