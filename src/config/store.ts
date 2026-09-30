import { CONFIG_VERSION, DEFAULT_CONFIG } from './defaults'
import type { AppConfig, ColumnConfig } from './types'

const KEY = 'vp.config.v1'

type Json = Record<string, unknown>

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Recursive merge: objects merge key by key, arrays and scalars from `over` win. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) {
    return (over === undefined ? base : over) as T
  }
  const out: Json = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Json)[k]
    out[k] = isPlainObject(b) && isPlainObject(v) ? deepMerge(b, v) : v === undefined ? b : v
  }
  return out as T
}

/** Keep the user's order and edits, but never lose a column added in a newer default set. */
function reconcileColumns<K extends string>(saved: ColumnConfig<K>[], defaults: ColumnConfig<K>[]): ColumnConfig<K>[] {
  const known = new Map(defaults.map((c) => [c.id, c]))
  const out = saved.filter((c) => known.has(c.id)).map((c) => deepMerge(known.get(c.id)!, c))
  for (const d of defaults) if (!out.some((c) => c.id === d.id)) out.push(d)
  return out
}

export function normalizeConfig(raw: unknown): AppConfig {
  const merged = deepMerge(DEFAULT_CONFIG, raw)
  merged.columns.scorecard = reconcileColumns(merged.columns.scorecard, DEFAULT_CONFIG.columns.scorecard)
  merged.columns.issues = reconcileColumns(merged.columns.issues, DEFAULT_CONFIG.columns.issues)
  merged.version = CONFIG_VERSION
  return merged
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    return normalizeConfig(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(cfg: AppConfig): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg))
    return true
  } catch {
    return false
  }
}

export function clearSavedConfig() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: defaults still apply for this session */
  }
}

/** Every string leaf under labels, as dotted paths, for the label editor. */
export function flattenLabels(obj: unknown, prefix = ''): { path: string; value: string }[] {
  if (typeof obj === 'string') return [{ path: prefix, value: obj }]
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flattenLabels(v, `${prefix}.${i}`))
  if (isPlainObject(obj)) return Object.entries(obj).flatMap(([k, v]) => flattenLabels(v, prefix ? `${prefix}.${k}` : k))
  return []
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const clone = structuredClone(obj) as Json
  let cur: Json = clone
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] as Json
  cur[keys[keys.length - 1]] = value
  return clone as T
}
