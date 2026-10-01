// The whole platform is driven by one AppConfig object. Every card, column,
// label, threshold, formula parameter, bin and colour tone lives here, so
// Purchasing can change behaviour from the Configuration tab without a release.

export type Origin = 'Import' | 'Local'
export const ORIGINS: Origin[] = ['Local', 'Import']

/** Semantic tones from the design system. Colour is state or ownership, never mood. */
export type Tone = 'neutral' | 'advance' | 'commit' | 'sales' | 'amber' | 'emerald' | 'red'

export type Severity = 'serious' | 'warning'

/** reqSlip = GRPO date − PR required date (days; negative = early). */
export type Criterion = 'lead' | 'fill' | 'onTime' | 'reqSlip'
export const CRITERIA: Criterion[] = ['lead', 'fill', 'onTime', 'reqSlip']

export type Clock = 'PO_GRPO' | 'PR_GRPO'

/** Lead-time profiles shown as distributions (PRD goal 4). */
export type Measure = 'prToRequired' | 'prToPo' | 'poToGrpo' | 'requiredToGrpo'
export const MEASURES: Measure[] = ['prToRequired', 'prToPo', 'poToGrpo', 'requiredToGrpo']
/** Measures whose values can be negative (arriving before the reference date). */
export const SIGNED_MEASURES: Measure[] = ['requiredToGrpo']

/** Scope values for the vendor-group selector that match by origin instead of group name. */
export const GROUP_ALL_IMPORT = '@import'
export const GROUP_ALL_LOCAL = '@local'

export type FlagKey = 'late' | 'slow' | 'shortFill' | 'returns'
export const FLAGS: FlagKey[] = ['late', 'slow', 'shortFill', 'returns']

export type FormatKey = 'int' | 'money' | 'moneyFull' | 'days' | 'signedDays' | 'pct' | 'date' | 'text' | 'multiple'

/** Metrics available to cards and hint templates, computed per scope. */
export type MetricKey =
  | 'vendorsInScope'
  | 'vendorsRanked'
  | 'purchaseValue'
  | 'avgLeadTime'
  | 'scopeMedianLead'
  | 'onTimeRate'
  | 'orderFill'
  | 'poLines'
  | 'receipts'
  | 'linkedReceipts'
  | 'poLinkCoverage'
  | 'excludedReceipts'
  | 'reviewVendors'
  | 'top80Vendors'
  | 'problemInUse'
  | 'problemInUseSerious'
  | 'problemNotUsed'
  | 'problemSpend'
  | 'problemSpendShare'
  | 'mostCommonIssue'
  | 'mostCommonIssueCount'
  | 'newestPoDate'
  | 'avgReqSlip'
  | 'shareBasisLabel'
  | 'inUseReferenceDate'

export interface TileConfig {
  id: string
  label: string
  metric: MetricKey
  format: FormatKey
  /** Template; `{metricKey}` placeholders are replaced with formatted metric values. */
  hint: string
  tooltip: string
  /** Colour of the 3px top rule. The number itself always stays ink. */
  accent: Tone
  visible: boolean
}

export interface ColumnTip {
  purpose: string
  formula: string
  source: string
}

export type ScoreColumnKey =
  | 'rank' | 'vendor' | 'lead' | 'fill' | 'onTime' | 'reqSlip' | 'score' | 'issues'
  | 'lastPo' | 'value' | 'poCount' | 'share' | 'cumShare' | 'poLines' | 'receipts'

export type IssueColumnKey =
  | 'vendor' | 'flags' | 'status' | 'lastPo' | 'onTime' | 'lead' | 'fill' | 'reqSlip' | 'returns'
  | 'openRows' | 'value' | 'receipts'

export interface ColumnConfig<K extends string = string> {
  id: K
  label: string
  tip: ColumnTip
  visible: boolean
}

export interface FilterLabel {
  label: string
  tip: string
}

export interface VerdictBand {
  label: string
  tone: Tone
}

export interface FlagConfig {
  label: string
  /** Template with {value} {threshold} {serious} {median} {receipts}. */
  reason: string
  enabled: boolean
}

export interface BinSet {
  /** Ascending upper edges in days. Bins: ≤e0, e0+1–e1, …, >eN. */
  Local: number[]
  Import: number[]
}

export interface Allowance {
  /** Days; null means "use the extract median" (the documented default). */
  Local: number | null
  Import: number | null
}

export type LeadBasis = 'scopeMedian' | 'mixMedian'
export type ShareBasis = 'poCount' | 'poLines' | 'value'

export interface FieldAliases {
  [field: string]: string[]
}

export interface AppConfig {
  version: number

  // ---- Formulas & policy -------------------------------------------------
  scoring: {
    weights: Record<Criterion, number>
    /** How ties share a rank: competition 1,2,2,4 · average 1,2.5,2.5,4 · dense 1,2,2,3 */
    tieMethod: 'min' | 'average' | 'dense'
    /** Vendors with no measurable value for a criterion. */
    missingRank: 'worst' | 'median'
    /** Population ranks are computed over. */
    rankPopulation: 'minPoLines' | 'scope'
    /** Lead-time aggregate per vendor. PRD: mean. */
    leadStat: 'mean' | 'median'
    /** Cap received quantity at ordered quantity per PO line when computing fill. */
    capFillAtOrdered: boolean
  }
  onTime: {
    clock: Clock
    requiredDateCounts: boolean
    /** Used when a material/origin has no history to take a median from. */
    fallbackAllowance: Record<Origin, number>
    allowances: Record<string, Allowance>
  }
  verdicts: {
    lead: {
      /**
       * Reference R the vendor's lead time is compared with.
       * scopeMedian: median of vendor lead times in scope (PRD).
       * mixMedian: the vendor's own material × origin medians, weighted by its receipts.
       */
      basis: LeadBasis
      fastMultiple: number
      slowMultiple: number
      fast: VerdictBand
      typical: VerdictBand
      slow: VerdictBand
    }
    fill: { completeAt: number; nearAt: number; complete: VerdictBand; near: VerdictBand; short: VerdictBand }
    onTime: { onTimeAt: number; mixedAt: number; onTime: VerdictBand; mixed: VerdictBand; late: VerdictBand }
    reqSlip: { onDateAt: number; slightAt: number; onDate: VerdictBand; slight: VerdictBand; late: VerdictBand }
    noData: string
  }
  issues: {
    latePct: number
    slowMultiple: number
    shortFillPct: number
    shortFillSeriousPct: number
    returnsPct: number
    thinSample: number
    flags: Record<FlagKey, FlagConfig>
    severity: Record<Severity, VerdictBand>
  }
  review: {
    minPoLines: number
    minValue: number
    combine: 'any' | 'all'
  }
  spend: {
    topSharePct: number
    /** What the share and cumulative share count. */
    basis: ShareBasis
    /** Share of the vendor's own vendor group, or of the whole scope. */
    partition: 'vendorGroup' | 'scope'
  }
  inUse: {
    /** Date the window is measured back from. */
    reference: 'newestPo' | 'newestActivity' | 'today' | 'fixed'
    /** yyyy-mm-dd, used when reference = fixed. */
    fixedDate: string
    /** Which of the vendor's dates counts as its latest activity. */
    activity: 'lastPo' | 'lastGrpo' | 'lastAny'
    days: number
    /** A vendor with PO lines still open counts as in use regardless of the window. */
    openPoCounts: boolean
  }
  quartiles: {
    /** Tone for quartile 1 (best) … 4 (worst) of each criterion in scope. */
    tones: [Tone, Tone, Tone, Tone]
    labels: [string, string, string, string]
  }
  bins: Record<Measure, BinSet>

  // ---- Filters -----------------------------------------------------------
  filters: {
    minPoLinesOptions: number[]
    minPoLinesDefault: number
    stillInUseDefault: boolean
    pageSizes: number[]
    pageSizeDefault: number
  }

  // ---- Cards & columns ---------------------------------------------------
  tiles: {
    scorecard: TileConfig[]
    issues: TileConfig[]
  }
  columns: {
    scorecard: ColumnConfig<ScoreColumnKey>[]
    issues: ColumnConfig<IssueColumnKey>[]
  }

  // ---- Formatting --------------------------------------------------------
  format: {
    locale: string
    currencyPrefix: string
    /** Compact money units, largest first. */
    moneyUnits: { at: number; suffix: string }[]
    moneyDecimals: number
    pctDecimals: number
    daysDecimals: number
    dateStyle: 'dd MMM yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy'
    daysSuffix: string
  }

  // ---- Data mapping ------------------------------------------------------
  data: {
    fieldAliases: {
      flat: FieldAliases
      po: FieldAliases
      grpo: FieldAliases
      returns: FieldAliases
    }
    importValues: string[]
    localValues: string[]
    defaultOrigin: Origin
    /** Vendor groups left out of every scope, median and rank (non-material vendors). */
    excludedVendorGroups: string[]
    dateOrder: 'auto' | 'DMY' | 'MDY' | 'YMD'
  }

  // ---- Every visible string ---------------------------------------------
  labels: Labels
}

export interface Labels {
  app: { title: string; subtitle: string }
  tabs: { scorecard: string; issues: string; config: string; how: string; upload: string }
  scope: {
    vendorGroup: string
    allGroups: string
    allImport: string
    allLocal: string
    groupsHeading: string
    chooseFirst: string
    clear: string
    level1: string
    level2: string
    level3: string
    level4: string
    all: string
    tip: string
  }
  filters: {
    find: FilterLabel
    minPoLines: FilterLabel
    reviewOnly: FilterLabel
    top80: FilterLabel
    issueOnly: FilterLabel
    stillInUse: FilterLabel
    severity: FilterLabel
    severityAny: string
    severitySerious: string
    issueType: FilterLabel
    issueTypeAny: string
  }
  modes: { plain: string; ranks: string; tip: string }
  /** Still-in-use rule. reason placeholders: {activity} {date} {days} {reference} {refDate} {window} {verdict} {open} */
  inUse: {
    reason: string
    openReason: string
    activity: Record<'lastPo' | 'lastGrpo' | 'lastAny', string>
    reference: Record<'newestPo' | 'newestActivity' | 'today' | 'fixed', string>
  }
  share: { basis: Record<'poCount' | 'poLines' | 'value', string>; partition: Record<'vendorGroup' | 'scope', string> }
  criteria: Record<'lead' | 'fill' | 'onTime' | 'reqSlip', string>
  leadBasis: Record<LeadBasis, string>
  actions: {
    copyShortlist: string
    copied: string
    copyFallbackTitle: string
    copyFallbackHint: string
    close: string
    save: string
    reset: string
    discard: string
    exportJson: string
    importJson: string
    loadData: string
    loadDemo: string
    clearData: string
  }
  coverage: {
    title: string
    template: string
    exclusionsTitle: string
    reasons: Record<ExclusionReason, string>
  }
  legend: {
    title: string
    verdicts: string
    quartiles: string
    flags: string
    marks: string
    thresholdDot: string
    thinMark: string
    thinMarkLabel: string
    groupChip: string
    stillInUse: string
    notInUse: string
  }
  table: {
    empty: string
    emptyIssues: string
    rows: string
    of: string
    perPage: string
    prev: string
    next: string
    daysAgo: string
    noIssues: string
  }
  detail: {
    issues: string
    lastPo: string
    lastGrpo: string
    status: string
    openRows: string
    scoreRank: string
    criteria: string
    profiles: string
    topItems: string
    relationship: string
    firstPo: string
    firstGrpo: string
    span: string
    measured: string
    rank: string
    weight: string
    quartile: string
    receipts: string
    item: string
    value: string
    qty: string
    measures: Record<Measure, string>
    noProfile: string
  }
  config: Record<string, string>
  how: Record<string, string>
  upload: Record<string, string>
  empty: { noData: string; noDataHint: string }
}

export type ExclusionReason = 'noPoLink' | 'poNotFound' | 'negativeDays' | 'noPrDate'
