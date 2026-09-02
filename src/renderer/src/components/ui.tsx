/** Shared presentational primitives. Deliberately small and unstyled-ish. */
import { useEffect, useRef, type ReactNode } from 'react'

import { PHASE_LABEL, type PhaseKind, type PlanWarning } from '@core/types'

export const PHASE_CLASS: Record<PhaseKind, { text: string; bg: string; border: string; dot: string }> =
  {
    inception: {
      text: 'text-inception',
      bg: 'bg-inception/10',
      border: 'border-inception/30',
      dot: 'bg-inception'
    },
    elaboration: {
      text: 'text-elaboration',
      bg: 'bg-elaboration/10',
      border: 'border-elaboration/30',
      dot: 'bg-elaboration'
    },
    construction: {
      text: 'text-construction',
      bg: 'bg-construction/10',
      border: 'border-construction/30',
      dot: 'bg-construction'
    },
    transition: {
      text: 'text-transition',
      bg: 'bg-transition/10',
      border: 'border-transition/30',
      dot: 'bg-transition'
    }
  }

export function Card({
  title,
  actions,
  children,
  className = ''
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
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

export function StatTile({
  label,
  value,
  hint,
  tone = 'default'
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'danger'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-ink'
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`stat mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  )
}

export function PhaseBadge({ phase, className = '' }: { phase: PhaseKind; className?: string }) {
  const style = PHASE_CLASS[phase]
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
  tone = 'accent',
  className = ''
}: {
  value: number
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
  className?: string
}) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`
  const bar =
    tone === 'ok'
      ? 'bg-ok'
      : tone === 'warn'
        ? 'bg-warn'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-accent'
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken ${className}`}>
      <div className={`h-full rounded-full ${bar}`} style={{ width }} />
    </div>
  )
}

export function WarningList({ warnings }: { warnings: PlanWarning[] }) {
  if (warnings.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-ink-muted">
        No problems found with this plan.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-line">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className="flex gap-3 px-4 py-2.5">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              warning.severity === 'error'
                ? 'bg-danger'
                : warning.severity === 'warning'
                  ? 'bg-warn'
                  : 'bg-ink-faint'
            }`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm">{warning.message}</p>
            {warning.hint && <p className="mt-0.5 text-xs text-ink-muted">{warning.hint}</p>}
          </div>
        </li>
      ))}
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
        className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`}
      >
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
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

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <Toolbar>{actions}</Toolbar>}
    </header>
  )
}
