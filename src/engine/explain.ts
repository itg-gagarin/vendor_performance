import type { AppConfig } from '../config/types'

// Formula text that depends on configuration choices is generated here, not
// stored as label text, so a tooltip can never describe a different
// calculation from the one the engine runs.

export function shareFormulas(cfg: AppConfig) {
  const { basis, partition, topSharePct } = cfg.spend
  const unit = basis === 'poCount' ? 'number of POs' : basis === 'poLines' ? 'number of PO lines' : 'spend (Σ line total)'
  const group = partition === 'vendorGroup' ? 'all vendors in the same vendor group' : 'all vendors in the scope'
  const within = 'counting only PO lines inside the selected Level 1–4'
  return {
    share: `Vendor's ${unit} ÷ ${unit} of ${group}, ${within}.`,
    cumShare: `Sort ${group} by ${unit}, largest first; Cum. share = running total of Share down to and including this vendor.`,
    top: `Keeps vendors from the top of each ${partition === 'vendorGroup' ? 'vendor group' : 'scope'} until the running share reaches ${topSharePct}%, including the vendor that crosses it.`,
  }
}
