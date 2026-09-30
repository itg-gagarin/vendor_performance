import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { Tip } from './primitives'

export interface Col<R> {
  id: string
  header: ReactNode
  tip?: ReactNode
  num?: boolean
  /** Sort key; omit to make the column unsortable. Nulls always sort last. */
  sort?: (r: R) => number | string | null
  render: (r: R) => ReactNode
  /** Frozen columns need a fixed width so their sticky offsets are known. */
  frozenWidth?: number
  tdClass?: string
}

export interface SortState {
  id: string
  dir: 'asc' | 'desc'
}

interface Props<R> {
  rows: R[]
  cols: Col<R>[]
  rowKey: (r: R) => string
  defaultSort: SortState
  pageSizes: number[]
  pageSizeDefault: number
  onRowClick?: (r: R) => void
  empty: ReactNode
  labels: { rows: string; of: string; perPage: string; prev: string; next: string }
  /** Receives the fully sorted rows (all pages), e.g. for copy. */
  onSorted?: (rows: R[]) => void
  resetKey?: string
}

export function DataTable<R>({ rows, cols, rowKey, defaultSort, pageSizes, pageSizeDefault, onRowClick, empty, labels, onSorted, resetKey }: Props<R>) {
  const [sort, setSort] = useState<SortState>(defaultSort)
  const [size, setSize] = useState(pageSizes.includes(pageSizeDefault) ? pageSizeDefault : pageSizes[0])
  const [page, setPage] = useState(0)

  // Back to the first page whenever filters, scope, sort or page size change.
  const signature = `${resetKey}|${sort.id}|${sort.dir}|${size}`
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) {
    setSeen(signature)
    setPage(0)
  }

  const sorted = useMemo(() => {
    const col = cols.find((c) => c.id === sort.id)
    if (!col?.sort) return rows
    const key = col.sort
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows
      .map((r) => ({ r, k: key(r) }))
      .sort((a, b) => {
        if (a.k === null && b.k === null) return 0
        if (a.k === null) return 1
        if (b.k === null) return -1
        if (typeof a.k === 'number' && typeof b.k === 'number') return (a.k - b.k) * dir
        return String(a.k).localeCompare(String(b.k)) * dir
      })
      .map((x) => x.r)
  }, [rows, cols, sort])

  useEffect(() => {
    onSorted?.(sorted)
  }, [sorted, onSorted])

  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pages - 1)
  const slice = sorted.slice(current * size, current * size + size)

  // Sticky offsets for frozen columns.
  const lefts: (number | undefined)[] = []
  let acc = 0
  let lastFrozen = -1
  cols.forEach((c, i) => {
    if (c.frozenWidth !== undefined && (i === 0 || lefts[i - 1] !== undefined)) {
      lefts.push(acc)
      acc += c.frozenWidth
      lastFrozen = i
    } else lefts.push(undefined)
  })

  const frozenStyle = (i: number) =>
    lefts[i] === undefined ? undefined : { left: lefts[i], minWidth: cols[i].frozenWidth, maxWidth: cols[i].frozenWidth, width: cols[i].frozenWidth }
  const frozenClass = (i: number) => (lefts[i] === undefined ? '' : ` frozen${i === lastFrozen ? ' frozen-edge' : ''}`)

  const toggle = (c: Col<R>) => {
    if (!c.sort) return
    setSort((s) => (s.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: c.num ? 'desc' : 'asc' }))
  }

  return (
    <div>
      <div className="table-frame">
        <table className="dt">
          <thead>
            <tr>
              {cols.map((c, i) => {
                const active = sort.id === c.id
                return (
                  <th
                    key={c.id}
                    className={`${c.num ? 'num' : ''}${c.sort ? ' sortable' : ''}${frozenClass(i)}`}
                    style={frozenStyle(i)}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={() => toggle(c)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(c))}
                    tabIndex={c.sort ? 0 : undefined}
                    scope="col"
                  >
                    <Tip content={c.tip}>
                      <span className="th-inner">
                        {c.header}
                        {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </span>
                    </Tip>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={cols.length} style={{ whiteSpace: 'normal' }}>
                  <div className="empty">{empty}</div>
                </td>
              </tr>
            ) : (
              slice.map((r) => (
                <tr
                  key={rowKey(r)}
                  className={onRowClick ? 'clickable' : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {cols.map((c, i) => (
                    <td key={c.id} className={`${c.num ? 'num' : ''}${c.tdClass ? ` ${c.tdClass}` : ''}${frozenClass(i)}`} style={frozenStyle(i)}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="mono">
          {sorted.length === 0 ? 0 : current * size + 1}–{Math.min(sorted.length, (current + 1) * size)} {labels.of} {sorted.length} {labels.rows}
        </span>
        <div className="row-tight">
          <span>{labels.perPage}</span>
          <div className="segmented" role="group" aria-label={labels.perPage} style={{ height: 28 }}>
            {pageSizes.map((s) => (
              <button key={s} type="button" aria-pressed={s === size} onClick={() => setSize(s)}>
                {s}
              </button>
            ))}
          </div>
          <button className="btn btn-sm btn-icon" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label={labels.prev}>
            <ChevronLeft size={16} />
          </button>
          <span className="mono">
            {current + 1}/{pages}
          </span>
          <button className="btn btn-sm btn-icon" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label={labels.next}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
