/**
 * Shared presentational primitives.
 *
 * The important distinction here is `Card` versus `Section`. A card is a
 * bordered box and should be used for something you act on; a section is a
 * heading with content under it and no box at all. Using cards for everything
 * is what made the first version feel like a wall of identical rectangles.
 */
import { useEffect, useRef, type ReactNode } from 'react'

import { PHASE_LABEL, type PhaseKind, type PlanWarning } from '@core/types'

export const PHASE_CLASS: Record<
  PhaseKind,
  { text: string; bg: string; border: string; dot: string }
> = {
  inception: {
    text: 'text-inception',
    bg: 'bg-inception/12',
    border: 'border-inception/30',
    dot: 'bg-inception'
  },
  elaboration: {
    text: 'text-elaboration',
    bg: 'bg-elaboration/12',
    border: 'border-elaboration/30',
    dot: 'bg-elaboration'
  },
  construction: {
    text: 'text-construction',
    bg: 'bg-construction/12',
    border: 'border-construction/30',
    dot: 'bg-construction'
  },
  transition: {
    text: 'text-transition',
    bg: 'bg-transition/12',
    border: 'border-transition/30',
    dot: 'bg-transition'
  }
}

export function Card({
  title,
  actions,
  children,
  tone = 'default',
  className = ''
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  tone?: 'default' | 'hero' | 'quiet'
  className?: string
}) {
  const base = tone === 'hero' ? 'card-hero' : tone === 'quiet' ? 'card-quiet' : 'card'
  return (
    <section className={`${base} ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

/** A heading with content beneath it, no border. */
export function Section({
  title,
  actions,
  children,
  className = ''
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="section-title">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/**
 * A single number with a label. Deliberately borderless: a row of these reads
 * as one group rather than four competing boxes.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md'
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'page' | 'ok' | 'warn' | 'danger'
  size?: 'md' | 'lg'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-danger'
          : tone === 'page'
            ? 'text-page'
            : 'text-ink'
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`${size === 'lg' ? 'stat-lg' : 'stat'} mt-1.5 ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  )
}

export function PhaseBadge({
  phase,
  className = '',
  subtle = false
}: {
  phase: PhaseKind
  className?: string
  subtle?: boolean
}) {
  const style = PHASE_CLASS[phase]
  if (subtle) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${style.text} ${className}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {PHASE_LABEL[phase]}
      </span>
    )
  }
  return (
    <span className={`chip ${style.bg} ${style.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {PHASE_LABEL[phase]}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
  className = ''
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'page',
  className = '',
  thick = false
}: {
  value: number
  tone?: 'page' | 'ok' | 'warn' | 'danger' | 'muted'
  className?: string
  thick?: boolean
}) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`
  const bar =
    tone === 'ok'
      ? 'bg-ok'
      : tone === 'warn'
        ? 'bg-warn'
        : tone === 'danger'
          ? 'bg-danger'
          : tone === 'muted'
            ? 'bg-ink-faint'
            : 'bg-page'
  return (
    <div
      className={`${thick ? 'h-2' : 'h-1.5'} w-full overflow-hidden rounded-full bg-surface-sunken ${className}`}
    >
      <div className={`h-full rounded-full ${bar}`} style={{ width }} />
    </div>
  )
}

export function WarningList({ warnings, max }: { warnings: PlanWarning[]; max?: number }) {
  if (warnings.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-muted">No problems found with this plan.</p>
  }
  const shown = max ? warnings.slice(0, max) : warnings
  return (
    <ul className="divide-y divide-line">
      {shown.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className="flex gap-3 px-4 py-2.5">
          <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              warning.severity === 'error'
                ? 'bg-danger'
                : warning.severity === 'warning'
                  ? 'bg-warn'
                  : 'bg-ink-faint'
            }`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[13px] leading-snug">{warning.message}</p>
            {warning.hint && (
              <p className="mt-0.5 text-xs leading-snug text-ink-muted">{warning.hint}</p>
            )}
          </div>
        </li>
      ))}
      {max && warnings.length > max && (
        <li className="px-4 py-2 text-xs text-ink-muted">
          and {warnings.length - max} more
        </li>
      )}
    </ul>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-2xl`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>
        )}
      </div>
    </div>
  )
}

/**
 * Page header with a phase-coloured rail. The rail is the main reason a screen
 * reads as belonging to Inception or Construction at a glance.
 */
export function PageHeader({
  title,
  description,
  phase,
  actions
}: {
  title: string
  description?: ReactNode
  phase?: PhaseKind
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-1 w-1 shrink-0 self-stretch rounded-full bg-page" aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{title}</h1>
            {phase && <PhaseBadge phase={phase} />}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-snug text-ink-muted">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
