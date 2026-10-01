import { CRITERIA } from '../config/types'
import { useUi } from '../ui/context'

// Every number on this page is read from the applied configuration, so the
// explanation can never drift from what the scorecard is doing.

export function HowTab() {
  const { cfg, f } = useUi()
  const H = cfg.labels.how
  const I = cfg.issues
  const V = cfg.verdicts
  const S = cfg.scoring
  const C = cfg.labels.criteria
  const U = cfg.inUse
  const SH = cfg.spend
  const clock = cfg.onTime.clock === 'PO_GRPO' ? 'GRPO date − PO date' : 'GRPO date − PR date'
  const R = V.lead.basis === 'scopeMedian' ? 'R = median of vendor lead times in scope (M)' : "R = mean over the vendor's receipts of the extract median for that receipt's Level 1 material and origin"
  const basisWord = SH.basis === 'poCount' ? 'POs' : SH.basis === 'poLines' ? 'PO lines' : 'spend'

  return (
    <div className="stack-section">
      <div className="card prose">
        <h3>{H.title}</h3>
        <p>{H.intro}</p>
        <div className="formula">
          Score = {CRITERIA.map((c) => `${S.weights[c] ?? 0} × rank(${C[c]})`).join(' + ')}{'\n'}
          Lowest score = rank 1. Ties on score: higher purchase value first.
        </div>
        <ul className="small">
          <li>Rank population: {S.rankPopulation === 'scope' ? 'every vendor in scope' : 'vendors in scope that pass the Min PO lines filter'}.</li>
          <li>Tied values share a rank: {S.tieMethod === 'min' ? 'competition (1, 2, 2, 4)' : S.tieMethod === 'average' ? 'average (1, 2.5, 2.5, 4)' : 'dense (1, 2, 2, 3)'}.</li>
          <li>A vendor with no value for a criterion takes the {S.missingRank === 'worst' ? 'worst' : 'median'} rank for it.</li>
          <li>A criterion with weight 0 is shown with its verdict and colour but does not change the score.</li>
        </ul>
      </div>

      <div className="grid-2">
        <div className="card prose">
          <h4>1. {C.lead}</h4>
          <p className="small">{S.leadStat === 'mean' ? 'Mean' : 'Median'} days per receipt on the configured clock. Receipts without a PO link have no start date and are left out.</p>
          <div className="formula">
            clock days = {clock}{'\n'}
            {C.lead} = {S.leadStat === 'mean' ? 'Σ clock days ÷ receipts with a PO link' : 'median(clock days of receipts with a PO link)'}{'\n'}
            {R}
          </div>
          <p className="small muted">Verdict: {V.lead.fast.label} ≤ {V.lead.fastMultiple} × R · {V.lead.typical.label} ≤ {V.lead.slowMultiple} × R · {V.lead.slow.label} above.</p>
        </div>

        <div className="card prose">
          <h4>2. {C.fill}</h4>
          <p className="small">Only PO lines with at least one receipt count, so orders still on their way do not look short.</p>
          <div className="formula">
            {C.fill} = Σ received on PO lines with ≥ 1 receipt{'\n'}      ÷ Σ ordered on those same lines{S.capFillAtOrdered ? '\n(received capped at ordered per line)' : ''}
          </div>
          <p className="small muted">Verdict: {V.fill.complete.label} ≥ {V.fill.completeAt}% · {V.fill.near.label} ≥ {V.fill.nearAt}% · {V.fill.short.label} below.</p>
        </div>

        <div className="card prose">
          <h4>3. {C.onTime}</h4>
          <p className="small">
            A receipt is on time when its clock days are inside the allowance for its Level 1 material and origin
            {cfg.onTime.requiredDateCounts ? ', or when it arrives by the PR required date' : ''}.
          </p>
          <div className="formula">
            on time(r) = clock days ≤ A(material, origin){cfg.onTime.requiredDateCounts ? '\n          OR GRPO date ≤ PR required date' : ''}{'\n'}
            {C.onTime} = on-time receipts ÷ receipts with a PO link{'\n'}
            default A(m, o) = median clock days of all receipts of m and o in the extract
          </div>
          <p className="small muted">
            Fallback when a material has no history: Local {cfg.onTime.fallbackAllowance.Local} d, Import {cfg.onTime.fallbackAllowance.Import} d. Verdict: {V.onTime.onTime.label} ≥ {V.onTime.onTimeAt}% · {V.onTime.mixed.label} ≥ {V.onTime.mixedAt}% · {V.onTime.late.label} below.
          </p>
        </div>

        <div className="card prose">
          <h4>4. {C.reqSlip}</h4>
          <p className="small">How many days after the PR required date the goods arrive. Negative means early. Receipts without a PO link or a required date are left out.</p>
          <div className="formula">
            slip(r) = GRPO date − PR required date{'\n'}
            {C.reqSlip} = Σ slip ÷ receipts with a required date
          </div>
          <p className="small muted">
            Verdict: {V.reqSlip.onDate.label} ≤ {V.reqSlip.onDateAt} d · {V.reqSlip.slight.label} ≤ {V.reqSlip.slightAt} d · {V.reqSlip.late.label} above. Weight {S.weights.reqSlip ?? 0}
            {(S.weights.reqSlip ?? 0) === 0 ? ' (shown, not scored).' : '.'}
          </p>
        </div>

        <div className="card prose">
          <h4>5. Issue rules</h4>
          <p className="small">A flag needs at least {I.thinSample} receipts behind it, except Returns.</p>
          <div className="table-frame no-max" style={{ borderTop: 0 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Condition</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>{I.flags.late.label}</td><td className="mono">{C.onTime} &lt; {I.latePct}%</td><td>{I.severity.serious.label}</td></tr>
                <tr><td>{I.flags.slow.label}</td><td className="mono">{C.lead} &gt; {I.slowMultiple} × R</td><td>{I.severity.warning.label}</td></tr>
                <tr><td>{I.flags.shortFill.label}</td><td className="mono">{C.fill} &lt; {I.shortFillPct}%</td><td>{I.severity.warning.label}; {I.severity.serious.label.toLowerCase()} &lt; {I.shortFillSeriousPct}%</td></tr>
                <tr><td>{I.flags.returns.label}</td><td className="mono">Σ returned ÷ Σ net received &gt; {I.returnsPct}%</td><td>{I.severity.warning.label}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card prose">
          <h4>6. {cfg.labels.config.inUseTitle}</h4>
          <p className="small">Decides whether a vendor is “{cfg.labels.legend.stillInUse}” or “{cfg.labels.legend.notInUse}”. The Vendors with issues tab uses it to separate problem vendors that still need action.</p>
          <div className="formula">
            reference = {cfg.labels.inUse.reference[U.reference]}{U.reference === 'fixed' && U.fixedDate ? ` (${U.fixedDate})` : ''}{'\n'}
            activity(v) = {cfg.labels.inUse.activity[U.activity].toLowerCase()} of v in scope{'\n'}
            {cfg.labels.legend.stillInUse}(v) = reference − activity(v) ≤ {U.days} d{U.openPoCounts ? '\n               OR v has open PO lines' : ''}
          </div>
          <p className="small muted">Each vendor shows this rule applied to its own dates in the detail sheet and in the Status column.</p>
        </div>

        <div className="card prose">
          <h4>7. Scope, share and review threshold</h4>
          <ul className="small">
            <li>Scope = vendor group × Level 1–4 material path. “{cfg.labels.scope.allImport}” and “{cfg.labels.scope.allLocal}” select every vendor group of that origin. Every rank, median, quartile and share is computed inside the scope.</li>
            <li>
              Share = the vendor&apos;s {basisWord} ÷ {basisWord} of all vendors {SH.partition === 'vendorGroup' ? 'in its vendor group' : 'in scope'}, within the selected item-group levels. “Top {SH.topSharePct}%” takes the vendors with the largest Share
              first{SH.partition === 'vendorGroup' ? ' in each vendor group' : ''} and keeps adding until together they reach {SH.topSharePct}%, including the vendor that crosses it.
            </li>
            <li>Review threshold: ≥ {cfg.review.minPoLines} PO lines {cfg.review.combine === 'any' ? 'or' : 'and'} ≥ {f.fmt(cfg.review.minValue, 'money')}.</li>
            <li>Cell colour = quartile of the criterion rank inside the rank population.</li>
          </ul>
        </div>

        <div className="card prose">
          <h4>8. Open points to agree</h4>
          <p className="small">The PRD leaves these open. The platform ships a default for each; confirm or change them on Configuration before relying on ranks.</p>
          <ul className="small">
            <li className="placeholder-note">Weighting policy (milestone M1): currently {CRITERIA.map((c) => S.weights[c] ?? 0).join(' / ')}.</li>
            <li className="placeholder-note">Allowance: the PRD cites both “local 1 month, import 3 months” and “median of the extract”. Default is the extract median, with {cfg.onTime.fallbackAllowance.Local} / {cfg.onTime.fallbackAllowance.Import} days only as the no-history fallback.</li>
            <li className="placeholder-note">Bin edges per measure and origin: placeholders until the source workbook's bins are supplied (NF-1 reconciliation).</li>
            <li className="placeholder-note">Tie handling, missing-value rank and rank population.</li>
            <li className="placeholder-note">Returns denominator: net received = received − returned in scope, matched by vendor and item.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
