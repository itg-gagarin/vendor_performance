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
| Formulas | clock (PO→GRPO / PR→GRPO), required-date pass route, allowance per Level 1 × origin (empty = extract median), fallback allowance, lead statistic (mean/median), fill cap per line, weights 0–5, tie method, missing-value rank, rank population, top-spend share |
| Verdicts & flags | every edge (fast multiple, complete %, on-time %, late %, slow ×, short-fill %, serious %, returns %, still-in-use days, thin sample), words, colours, flag labels, reason templates, on/off |
| Cards | label, metric (from `src/config/metrics.ts`), format, hint template with `{metric}` placeholders, tooltip, accent rule, order, visibility, add/remove |
| Columns | header, tooltip purpose / formula / SAP source, order, visibility |
| Labels | every visible string (search-and-edit table) |
| Bins | edges per measure × origin, with a preview histogram |
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

1. **Weights (M1).** Default is 1 / 1 / 1.
2. **Allowance.** The PRD states both "local 1 month, import 3 months" and "median of the extract". The median is the default; 30 / 90 days applies only when a material has no history.
3. **Bin edges.** These are placeholders. NF-1 (bin counts match the workbook) cannot be checked until the source workbook's bins are supplied.
4. **Ranking details.** Tie method, missing-value rank, and whether Min PO lines narrows the rank population.
5. **Slow flag across origins.** A scope that mixes Import and Local vendors shares one median, so Import vendors tend to read as Slow. Scoping by vendor group usually separates them.
6. **The "vendor formulas file"** referenced in the PRD was not available. Formulas follow the PRD text.
