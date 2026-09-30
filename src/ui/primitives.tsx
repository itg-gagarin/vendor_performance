import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ColumnTip, Tone } from '../config/types'

// ---------------------------------------------------------------- Tooltip

export function Tip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current || !tipRef.current) return
    const r = ref.current.getBoundingClientRect()
    const t = tipRef.current.getBoundingClientRect()
    const margin = 8
    let x = r.left + r.width / 2 - t.width / 2
    x = Math.max(margin, Math.min(x, window.innerWidth - t.width - margin))
    let y = r.bottom + 6
    if (y + t.height > window.innerHeight - margin) y = r.top - t.height - 6
    setPos({ x, y })
  }, [open])

  if (!content) return <>{children}</>
  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false)
        setPos(null)
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false)
        setPos(null)
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="tooltip"
            style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}

export function Help({ tip, label = 'Help' }: { tip: ReactNode; label?: string }) {
  return (
    <Tip content={tip}>
      <button type="button" className="help" aria-label={label} onClick={(e) => e.stopPropagation()}>
        ?
      </button>
    </Tip>
  )
}

export function ColumnTipContent({ tip }: { tip: ColumnTip }) {
  return (
    <dl style={{ margin: 0 }}>
      <dt>Purpose</dt>
      <dd>{tip.purpose}</dd>
      {tip.formula && tip.formula !== '—' && (
        <>
          <dt>Formula</dt>
          <dd>{tip.formula}</dd>
        </>
      )}
      <dt>SAP source</dt>
      <dd>{tip.source}</dd>
    </dl>
  )
}

// ---------------------------------------------------------------- Status

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="pill" data-tone={tone}>
      {children}
    </span>
  )
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="badge">{count > 9 ? '9+' : count}</span>
}

// ---------------------------------------------------------------- Controls

export function Toggle({ checked, onChange, label, tip }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; tip?: ReactNode }) {
  return (
    <span className="row-tight">
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track" aria-hidden />
        <span>{label}</span>
      </label>
      {tip && <Help tip={tip} />}
    </span>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, tip, children, error }: { label: ReactNode; tip?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="field" onClick={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
      <span className="label">
        {label}
        {tip && <Help tip={tip} />}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  allowEmpty = false,
  placeholder,
  width,
  ariaLabel,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  allowEmpty?: boolean
  placeholder?: string
  width?: number
  ariaLabel?: string
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  const n = text.trim() === '' ? null : Number(text.replace(',', '.'))
  const invalid =
    (n === null && !allowEmpty) || (n !== null && (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)))
  return (
    <input
      className="input input-sm input-num"
      style={width ? { width } : undefined}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      title={invalid ? `Allowed: ${min ?? '−∞'} to ${max ?? '∞'}` : undefined}
      step={step}
      onChange={(e) => {
        setText(e.target.value)
        const t = e.target.value.trim()
        if (t === '') {
          if (allowEmpty) onChange(null)
          return
        }
        const v = Number(t.replace(',', '.'))
        if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v)
      }}
    />
  )
}

// ---------------------------------------------------------------- Overlays

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEscape(onClose)
  return createPortal(
    <>
      <div className="scrim scrim-dialog" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head">
          <h4>{title}</h4>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
        {actions && <div className="row" style={{ justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </>,
    document.body,
  )
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2400)
    return () => clearTimeout(t)
  }, [msg])
  const node = msg ? createPortal(<div className="toast" role="status">{msg}</div>, document.body) : null
  return { show: setMsg, node }
}

/** Clipboard copy with the NF-7 fallback: a dialog with the text selected. */
export function useCopy() {
  const [fallback, setFallback] = useState<string | null>(null)
  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      setFallback(text)
      return false
    }
  }, [])
  return { copy, fallback, closeFallback: () => setFallback(null) }
}

export function CopyFallback({ text, title, hint, closeLabel, onClose }: { text: string; title: string; hint: string; closeLabel: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.select(), [])
  return (
    <Dialog title={title} onClose={onClose} actions={<button className="btn" onClick={onClose}>{closeLabel}</button>}>
      <p className="small muted">{hint}</p>
      <textarea ref={ref} className="input" rows={10} readOnly value={text} />
    </Dialog>
  )
}

/** True below the phone breakpoint, where frozen columns must give way to data. */
export function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const h = () => setNarrow(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return narrow
}
