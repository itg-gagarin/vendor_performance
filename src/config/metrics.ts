import type { FormatKey, MetricKey } from './types'

/** Catalogue of scope metrics a card can show, with their natural format. */
export const METRICS: Record<MetricKey, { format: FormatKey; description: string }> = {
  vendorsInScope: { format: 'int', description: 'Vendors with a PO line in scope' },
  vendorsRanked: { format: 'int', description: 'Vendors in the rank population' },
  purchaseValue: { format: 'money', description: 'Σ PO line total in scope' },
  avgLeadTime: { format: 'days', description: 'Mean clock days, receipts with a PO link' },
  scopeMedianLead: { format: 'days', description: 'Median of vendor lead times (M)' },
  onTimeRate: { format: 'pct', description: 'On-time receipts ÷ receipts with a PO link' },
  orderFill: { format: 'pct', description: 'Σ received ÷ Σ ordered on lines with a receipt' },
  poLines: { format: 'int', description: 'PO lines in scope' },
  receipts: { format: 'int', description: 'GRPO lines in scope' },
  linkedReceipts: { format: 'int', description: 'GRPO lines with a lead time' },
  poLinkCoverage: { format: 'pct', description: 'Receipts with a lead time ÷ all receipts' },
  excludedReceipts: { format: 'int', description: 'Receipts left out of lead time' },
  reviewVendors: { format: 'int', description: 'Vendors at or above the review threshold' },
  top80Vendors: { format: 'int', description: 'Vendors inside the top spend share' },
  problemInUse: { format: 'int', description: 'Flagged vendors still in use' },
  problemInUseSerious: { format: 'int', description: 'Flagged vendors still in use, serious' },
  problemNotUsed: { format: 'int', description: 'Flagged vendors no longer used' },
  problemSpend: { format: 'money', description: 'Spend with flagged vendors' },
  problemSpendShare: { format: 'pct', description: 'Spend with flagged vendors ÷ scope spend' },
  mostCommonIssue: { format: 'text', description: 'Flag carried by the most vendors' },
  mostCommonIssueCount: { format: 'int', description: 'Vendors carrying the most common flag' },
  newestPoDate: { format: 'date', description: 'Newest PO date in the data' },
}

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]

export const FORMAT_KEYS: FormatKey[] = ['int', 'money', 'moneyFull', 'days', 'pct', 'date', 'text', 'multiple']
