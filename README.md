# Vendor Performance

Ranks material vendors on SAP B1 purchasing data (PO, GRPO, returns) so Purchasing can shortlist, renegotiate and act on problem vendors with evidence. It implements the PRD in *ITG – eProc Project Charter* and follows the Global Design System (one green per screen, hairlines instead of shadows, mono for anything compared down a column, light and dark token sets).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # formula and parser unit tests (Vitest)
npm run build      # type-check + production build into dist/
```

It is a static client-side app. The data stays in the browser (IndexedDB) and the configuration is saved per browser (localStorage), as CF-7 asks. You can host `dist/` on any static web server.

## Data

The upload accepts the **combined SAP extract** (one row per GRPO receipt with PR, PO and return fields on the row, as in `Kode Vendor … Return Flag`) or three separate PO / GRPO / return extracts. For the combined extract:

- A PO line is identified by PO DocNum + PO LineNum. A blank LineNum is SAP line 0, and with that rule every PO line resolves to one item and one quantity.
- Line Total and PO Qty repeat on every receipt row, so they are taken once per PO line and never summed across rows.
- A row is a receipt when it has a GRPO DocNum and GRPO Date. Rows with a received quantity but no GRPO number or date are reported and not counted.
- Import / Local is read from the vendor group name (`V. Import …` → Import, otherwise Local).
- Dates with an impossible year (e.g. `07/05/0206`) are reported and left empty.

Reconciliation against the real extract (not committed):

```bash
VP_SAMPLE=/path/to/extract.xlsx npx vitest run src/reconcile
```

With the default vendor-group exclusions this reproduces all six PRD allowance examples (Hardware 19/42, Packaging 18/29, Sparepart 6/35 d) and the 117 return rows. A full-scope recompute takes about 110 ms.

## Screens

| Tab | PRD |
|-----|-----|
| Scorecard | SC-1 … SC-10: stat cards, PO-link coverage, legend, filters, Plain / Ranks, frozen header + # / Vendor columns, header tooltips (purpose · formula · SAP source), 10/20/50 paging, vendor detail sheet |
| Vendors with issues | IS-1 … IS-5: cards, still-in-use / severity / issue-type filters, reasons in words, count badge, copy shortlist |
| Configuration | CF-1 … CF-7, plus cards, columns, every label, number/date format, field mapping, JSON import/export |
| How scoring works | Formulas rendered from the *applied* configuration, so the explanation cannot drift from the numbers |
| Upload | CSV / XLSX upload, auto-mapping by SAP header names, reconciliation totals, CSV templates, demo data |

## Everything is configuration

`src/config/types.ts` defines one `AppConfig` and `src/config/defaults.ts` holds the defaults from the PRD table. The Configuration tab edits a draft; **Save** applies it and stores it in the browser; **Export JSON** shares it.

| Area | What can be changed |
|------|---------------------|
| Formulas | clock (PO→GRPO / PR→GRPO), required-date pass route, allowance per Level 1 × origin (empty = extract median), fallback allowance, lead statistic (mean/median), fill cap per line, weights 0–5 for Lead time, Fill, On time and vs Required date (GRPO − PR required date; weight 0 by default), tie method, missing-value rank, rank population |
| Verdict formulas | lead-time reference R (scope median, or median of the vendor's own materials × origin), Fast / Typical multiples of R, Complete / Near-full %, On-time / Mixed %, By-required-date / Slightly-late days. Independent of the issue thresholds |
| Issue flags | late %, slow × R, short-fill % and serious %, returns %, thin sample, words, colours, reason templates, on/off |
| Share | basis (number of POs (default), PO lines, or spend), share of the vendor's own vendor group (default) or the whole scope, inside the selected Level 1–4; top share % |
| Still in use | reference date (newest PO in data, newest PO or GRPO, today, or a fixed date), activity (last PO, last GRPO, or either), window in days, optional "open PO lines count as in use". Each vendor shows the rule applied to its own dates |
| Cards | label, metric (from `src/config/metrics.ts`), format, hint template with `{metric}` placeholders, tooltip, accent rule, order, visibility, add/remove |
| Columns | header, tooltip purpose / formula / SAP source, order, visibility |
| Labels | every visible string (search-and-edit table) |
| Bins | edges per measure × origin (PR→Required, PR→PO, PO→GRPO, Required date→GRPO, which accepts negative edges), with a preview histogram |
| Format | locale, currency prefix, compact units (rb / jt / M / T), decimals, date style |
| Data mapping | header aliases per field, Import/Local values, date order |

## Code map

```
src/config/   AppConfig type, defaults, metric catalogue, load/save/merge
src/data/     canonical row schema, CSV/XLSX parsing + mapping, IndexedDB, demo generator
src/engine/   prepare (joins) → clockReceipts (allowances, on time) → computeScope (ranks, verdicts, flags, metrics)
src/ui/       primitives (tooltip, toggle, dialog…), DataTable, Histogram, shared cells
src/tabs/     one file per tab + vendor detail sheet
src/styles/   design tokens (light/dark) and component CSS
```

## Open points (defaults ship, sign-off needed)

0. **Vendor groups.** Service & Maintenance, Fixed Asset, GA Material, Internal Group and Expedition are left out by default because the PRD ranks material vendors. Leaving out those groups, or leaving out receipts with zero net received, reproduces the PRD medians equally well, so the data alone cannot settle this.

1. **Weights (M1).** Default is 1 / 1 / 1.
2. **Allowance.** The PRD states both "local 1 month, import 3 months" and "median of the extract". The median is the default; 30 / 90 days applies only when a material has no history.
3. **Bin edges.** These are placeholders. NF-1 (bin counts match the workbook) cannot be checked until the source workbook's bins are supplied.
4. **Ranking details.** Tie method, missing-value rank, and whether Min PO lines narrows the rank population.
5. **Slow flag across origins.** A scope that mixes Import and Local vendors shares one median, so Import vendors tend to read as Slow. Scoping by vendor group usually separates them.
6. **The "vendor formulas file"** referenced in the PRD was not available. Formulas follow the PRD text.
