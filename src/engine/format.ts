import type { AppConfig, FormatKey } from '../config/types'
import { dayToDate, type Day } from '../data/schema'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function makeFormatter(cfg: AppConfig) {
  const f = cfg.format
  const num = (x: number, d: number) => {
    try {
      return x.toLocaleString(f.locale, { minimumFractionDigits: d, maximumFractionDigits: d })
    } catch {
      // An invalid locale tag typed on the Configuration tab must not blank the app.
      return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    }
  }

  const money = (x: number) => {
    const unit = f.moneyUnits.find((u) => Math.abs(x) >= u.at)
    return unit ? `${f.currencyPrefix}${num(x / unit.at, f.moneyDecimals)}${unit.suffix}` : `${f.currencyPrefix}${num(x, 0)}`
  }

  const date = (d: Day) => {
    const dt = dayToDate(d)
    const y = dt.getUTCFullYear()
    const m = dt.getUTCMonth()
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    if (f.dateStyle === 'yyyy-MM-dd') return `${y}-${String(m + 1).padStart(2, '0')}-${dd}`
    if (f.dateStyle === 'dd/MM/yyyy') return `${dd}/${String(m + 1).padStart(2, '0')}/${y}`
    return `${dd} ${MONTHS[m]} ${y}`
  }

  const fmt = (value: unknown, kind: FormatKey): string => {
    if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) return '—'
    if (typeof value !== 'number') return String(value)
    if (!Number.isFinite(value)) return '—'
    switch (kind) {
      case 'int': return num(value, 0)
      case 'money': return money(value)
      case 'moneyFull': return `${f.currencyPrefix}${num(value, 0)}`
      case 'days': return `${num(value, f.daysDecimals)}${f.daysSuffix}`
      case 'pct': return `${num(value * 100, f.pctDecimals)}%`
      case 'multiple': return `${num(value, 2)}×`
      case 'date': return date(value)
      default: return String(value)
    }
  }

  return { fmt, money, date, num }
}

export type Formatter = ReturnType<typeof makeFormatter>
