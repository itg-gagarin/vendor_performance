import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Moon, Sun, SunMoon, Upload } from 'lucide-react'
import { loadConfig, saveConfig } from './config/store'
import { GROUP_ALL_IMPORT, GROUP_ALL_LOCAL, type AppConfig } from './config/types'
import { buildDemoDataset } from './data/demo'
import { loadDataset, saveDataset } from './data/persist'
import type { Dataset } from './data/schema'
import { clockReceipts, computeScope, EMPTY_SCOPE, interpolate, type Scope, type VendorRow } from './engine/compute'
import { makeFormatter } from './engine/format'
import { prepare } from './engine/prepare'
import { ConfigTab } from './tabs/ConfigTab'
import { HowTab } from './tabs/HowTab'
import { Issues } from './tabs/Issues'
import { Scorecard } from './tabs/Scorecard'
import { UploadTab } from './tabs/UploadTab'
import { VendorSheet } from './tabs/VendorSheet'
import { Ctx } from './ui/context'
import { CopyFallback, CountBadge, Help, Pill, useCopy, useToast } from './ui/primitives'

type Tab = 'scorecard' | 'issues' | 'config' | 'how' | 'upload'
type Theme = 'system' | 'light' | 'dark'
const TABS: Tab[] = ['scorecard', 'issues', 'config', 'how', 'upload']

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* preference is per-session only */
  }
}

export default function App() {
  const [cfg, setCfg] = useState<AppConfig>(loadConfig)
  const [draft, setDraft] = useState<AppConfig>(cfg)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [booting, setBooting] = useState(true)
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE)
  const [minPoLines, setMinPoLines] = useState(cfg.filters.minPoLinesDefault)
  const [tab, setTabState] = useState<Tab>(() => readPref('vp.tab', TABS, 'scorecard'))
  const [theme, setTheme] = useState<Theme>(() => readPref('vp.theme', ['system', 'light', 'dark'] as const, 'system'))
  const [openCode, setOpenCode] = useState<string | null>(null)
  const toast = useToast()
  const { copy, fallback, closeFallback } = useCopy()

  const setTab = (t: Tab) => {
    setTabState(t)
    writePref('vp.tab', t)
  }

  useEffect(() => {
    loadDataset().then((ds) => {
      // The hosted demo opens on sample data so the first view shows the tool working.
      setDataset(ds ?? (import.meta.env.VITE_AUTO_DEMO === '1' ? buildDemoDataset() : null))
      setBooting(false)
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    writePref('vp.theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = cfg.labels.app.title
  }, [cfg.labels.app.title])

  const f = useMemo(() => makeFormatter(cfg), [cfg])
  const prepared = useMemo(() => (dataset ? prepare(dataset) : null), [dataset])
  const clock = useMemo(() => (prepared ? clockReceipts(prepared, cfg) : null), [prepared, cfg])
  const res = useMemo(() => (prepared && clock ? computeScope(prepared, cfg, scope, { minPoLines }, clock) : null), [prepared, cfg, scope, minPoLines, clock])
  const openRow: VendorRow | null = useMemo(() => res?.rows.find((r) => r.code === openCode) ?? null, [res, openCode])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(cfg), [draft, cfg])
  const L = cfg.labels

  const changeData = (ds: Dataset | null) => {
    setDataset(ds)
    setScope(EMPTY_SCOPE)
    setOpenCode(null)
    saveDataset(ds)
  }

  const onCopy = useCallback(
    async (text: string, count: number) => {
      if (await copy(text)) toast.show(interpolate(L.actions.copied, { count }))
    },
    [copy, toast, L.actions.copied],
  )

  const save = () => {
    const ok = saveConfig(draft)
    setCfg(draft)
    if (!draft.filters.minPoLinesOptions.includes(minPoLines)) setMinPoLines(draft.filters.minPoLinesDefault)
    toast.show(ok ? L.config.savedAt : 'Applied for this session only: browser storage is blocked.')
  }

  // Scope options cascade: each level lists only children of the level above.
  const tree = prepared?.tree
  const l2 = tree && scope.level1 ? [...(tree.paths.get(scope.level1)?.keys() ?? [])].filter(Boolean).sort() : []
  const l3 = tree && scope.level1 && scope.level2 ? [...(tree.paths.get(scope.level1)?.get(scope.level2)?.keys() ?? [])].filter(Boolean).sort() : []
  const l4 = tree && scope.level1 && scope.level2 && scope.level3 ? [...(tree.paths.get(scope.level1)?.get(scope.level2)?.get(scope.level3) ?? [])].filter(Boolean).sort() : []
  const scopeKey = Object.values(scope).join('|')
  const setLevel = (k: keyof Scope, v: string) =>
    setScope((s) => {
      const next = { ...s, [k]: v }
      const order: (keyof Scope)[] = ['level1', 'level2', 'level3', 'level4']
      const i = order.indexOf(k)
      if (i >= 0) for (const j of order.slice(i + 1)) next[j] = ''
      return next
    })

  const scopeSelect = (k: keyof Scope, label: string, options: string[], locked: string | null, allLabel: string) => (
    <label className="field scope-field" key={k}>
      <span className="label">{label}</span>
      <select className="select" value={scope[k]} onChange={(e) => setLevel(k, e.target.value)} disabled={locked !== null}>
        {locked !== null ? (
          <option value="">{locked}</option>
        ) : (
          <>
            <option value="">{allLabel}</option>
            {k === 'vendorGroup' ? (
              <>
                <option value={GROUP_ALL_IMPORT}>{L.scope.allImport}</option>
                <option value={GROUP_ALL_LOCAL}>{L.scope.allLocal}</option>
                <optgroup label={L.scope.groupsHeading}>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))
            )}
          </>
        )}
      </select>
    </label>
  )
  const lockedUntil = (n: number, parent: string) => (parent ? null : interpolate(L.scope.chooseFirst, { n }))
  const excludedGroups = new Set(cfg.data.excludedVendorGroups)
  const scopeActive = Object.values(scope).some(Boolean)
  const showScope = prepared && (tab === 'scorecard' || tab === 'issues' || tab === 'config')

  const needsData = !dataset || !res || !prepared
  const themeIcon = theme === 'light' ? <Sun size={16} /> : theme === 'dark' ? <Moon size={16} /> : <SunMoon size={16} />

  return (
    <Ctx.Provider value={{ cfg, f }}>
      <div className="shell">
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="topbar">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="6" fill="var(--text-default)" />
              <rect x="7" y="17" width="4" height="8" rx="1" fill="var(--text-faint)" />
              <rect x="14" y="12" width="4" height="13" rx="1" fill="var(--text-faint)" />
              <rect x="21" y="7" width="4" height="18" rx="1" fill="var(--brand-advance)" />
            </svg>
            <div className="stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="brand-title">{L.app.title}</span>
              <span className="brand-sub">{L.app.subtitle}</span>
            </div>
          </div>
          <div className="topbar-spacer" />
          {dataset && (
            <span className="row-tight small muted">
              {dataset.isDemo && <Pill tone="amber">Demo data</Pill>}
              {res?.metrics.newestPoDate != null && (
                <span>
                  Newest PO <span className="mono">{f.fmt(res.metrics.newestPoDate, 'date')}</span>
                </span>
              )}
            </span>
          )}
          <button
            className="btn btn-icon btn-ghost"
            aria-label={`Theme: ${theme}`}
            title={`Theme: ${theme}`}
            onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
          >
            {themeIcon}
          </button>
        </header>

        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {L.tabs[t]}
              {t === 'issues' && res && <CountBadge count={res.metrics.problemInUse} />}
              {t === 'config' && dirty && <span className="dot" style={{ background: 'var(--brand-commit)' }} aria-label="Unsaved changes" />}
            </button>
          ))}
        </nav>

        <main id="main" className="main">
          {showScope && prepared && (
            <div className="card scopebar" role="search" aria-label="Scope">
              {scopeSelect('vendorGroup', L.scope.vendorGroup, prepared.tree.groups.filter((g) => !excludedGroups.has(g)), null, L.scope.allGroups)}
              {scopeSelect('level1', L.scope.level1, prepared.level1s, null, L.scope.all)}
              {scopeSelect('level2', L.scope.level2, l2, lockedUntil(1, scope.level1), L.scope.all)}
              {scopeSelect('level3', L.scope.level3, l3, lockedUntil(2, scope.level2), L.scope.all)}
              {scopeSelect('level4', L.scope.level4, l4, lockedUntil(3, scope.level3), L.scope.all)}
              <span className="row-tight scope-actions">
                <button className="btn" onClick={() => setScope(EMPTY_SCOPE)} disabled={!scopeActive}>
                  {L.scope.clear}
                </button>
                <Help tip={L.scope.tip} />
              </span>
            </div>
          )}
          {booting ? null : needsData && (tab === 'scorecard' || tab === 'issues') ? (
            <div className="card">
              <div className="empty">
                <div className="empty-title">{L.empty.noData}</div>
                <p>{L.empty.noDataHint}</p>
                <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-4)' }}>
                  <button className="btn" onClick={() => setTab('upload')}>
                    <Upload size={16} /> {L.tabs.upload}
                  </button>
                  <button className="btn btn-advance" onClick={() => changeData(buildDemoDataset())}>
                    <Database size={16} /> {L.actions.loadDemo}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {!booting && dataset?.isDemo && (tab === 'scorecard' || tab === 'issues') && (
            <div className="note note-warn">
              <span>
                {L.upload.demoNote}{' '}
                <button className="btn btn-sm" onClick={() => setTab('upload')}>
                  <Upload size={14} /> {L.tabs.upload}
                </button>
              </span>
            </div>
          )}
          {booting || (needsData && (tab === 'scorecard' || tab === 'issues')) ? null : tab === 'scorecard' && res ? (
            <Scorecard res={res} minPoLines={minPoLines} setMinPoLines={setMinPoLines} onOpen={(r) => setOpenCode(r.code)} onCopy={onCopy} scopeKey={scopeKey} />
          ) : tab === 'issues' && res ? (
            <Issues res={res} onOpen={(r) => setOpenCode(r.code)} onCopy={onCopy} scopeKey={scopeKey} />
          ) : tab === 'config' ? (
            <ConfigTab draft={draft} setDraft={setDraft} dirty={dirty} onSave={save} onDiscard={() => setDraft(cfg)} prepared={prepared} scope={scope} minPoLines={minPoLines} appliedRes={res} />
          ) : tab === 'how' ? (
            <HowTab />
          ) : (
            <UploadTab dataset={dataset} onLoad={changeData} onDemo={() => changeData(buildDemoDataset())} onClear={() => changeData(null)} />
          )}
        </main>

        {openRow && res && prepared && <VendorSheet row={openRow} res={res} prepared={prepared} onClose={() => setOpenCode(null)} />}
        {fallback !== null && <CopyFallback text={fallback} title={L.actions.copyFallbackTitle} hint={L.actions.copyFallbackHint} closeLabel={L.actions.close} onClose={closeFallback} />}
        {toast.node}
      </div>
    </Ctx.Provider>
  )
}
