/**
 * The Unified Process deliverables, grouped by phase.
 *
 * This screen answers "what am I actually supposed to hand in, and when" - the
 * part of UP students most often discover too late. Only the phase you are in
 * is expanded; the rest stay folded, because seeing all twenty-odd deliverables
 * at once is what made this page unreadable.
 */
import { useState } from 'react'

import {
  DISCIPLINE_LABEL,
  MILESTONE_META,
  PHASE_INTENT,
  type ArtifactStatus,
  type Discipline
} from '@core/types'
import type { ArtifactRecord } from '@shared/models'

import {
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PhaseBadge,
  ProgressBar
} from '../components/ui'
import { formatDate, formatRange } from '../lib/format'
import { currentPhase, today } from '../lib/derive'
import { useStore } from '../store/useStore'

const STATUSES: ArtifactStatus[] = ['not_started', 'in_progress', 'in_review', 'done']
const STATUS_LABEL: Record<ArtifactStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done'
}

export function Artifacts() {
  const snapshot = useStore((state) => state.snapshot)
  const saveArtifact = useStore((state) => state.saveArtifact)
  const saveMilestone = useStore((state) => state.saveMilestone)
  const [editing, setEditing] = useState<ArtifactRecord | null>(null)
  const [showOptional, setShowOptional] = useState(true)
  const now = today()

  if (!snapshot) return null

  if (snapshot.artifacts.length === 0) {
    return (
      <div>
        <PageHeader title="Deliverables" />
        <Card>
          <EmptyState
            title="No deliverables yet"
            description="Generate a plan in Setup and the standard Unified Process deliverables are scheduled for you."
          />
        </Card>
      </div>
    )
  }

  const activePhase = currentPhase(snapshot, now)
  const visible = snapshot.artifacts.filter((a) => showOptional || !a.isOptional)
  const done = visible.filter((a) => a.status === 'done').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deliverables"
        phase={activePhase?.kind}
        description="Standard Unified Process artifacts, dated against the gate they belong to. Delete anything your course does not require."
        actions={
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={showOptional}
              onChange={(event) => setShowOptional(event.target.checked)}
            />
            Show optional
          </label>
        }
      />

      <div className="rounded-xl border border-line bg-surface-raised px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium">Overall progress</span>
          <span className="text-[13px] tabular-nums text-ink-muted">
            {done} of {visible.length} complete
          </span>
        </div>
        <ProgressBar className="mt-2.5" thick tone="page" value={done / (visible.length || 1)} />
      </div>

      <div className="space-y-3">
        {snapshot.phases.map((phase) => {
          const artifacts = visible.filter((artifact) => artifact.phaseKind === phase.kind)
          const milestone = snapshot.milestones.find((m) => m.phaseKind === phase.kind)
          const phaseDone = artifacts.filter((a) => a.status === 'done').length
          const isCurrent = activePhase?.kind === phase.kind
          const late = artifacts.filter((a) => a.dueDate < now && a.status !== 'done').length

          return (
            <details key={phase.id} open={isCurrent} className="card group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <span
                  className="text-ink-faint transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  &rsaquo;
                </span>
                <PhaseBadge phase={phase.kind} />
                <span className="hidden text-xs tabular-nums text-ink-muted sm:inline">
                  {formatRange(phase.startDate, phase.endDate)}
                </span>
                <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                  {late > 0 && <span className="text-danger">{late} overdue</span>}
                  <span className="text-ink-muted">
                    {phaseDone}/{artifacts.length}
                  </span>
                </span>
              </summary>

              <p className="border-t border-line px-4 py-2.5 text-xs leading-snug text-ink-muted">
                {PHASE_INTENT[phase.kind]}
              </p>

              {milestone && (
                <label className="flex cursor-pointer items-start gap-3 border-t border-line bg-surface-sunken/60 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={milestone.status === 'done'}
                    onChange={(event) =>
                      void saveMilestone({
                        id: milestone.id,
                        status: event.target.checked ? 'done' : 'pending'
                      })
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{milestone.name}</p>
                    <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                      {MILESTONE_META[milestone.kind as keyof typeof MILESTONE_META]?.question ??
                        milestone.description}
                    </p>
                  </div>
                  <span
                    className={`ml-auto shrink-0 text-xs tabular-nums ${
                      milestone.date < now && milestone.status !== 'done'
                        ? 'text-danger'
                        : 'text-ink-muted'
                    }`}
                  >
                    {formatDate(milestone.date)}
                  </span>
                </label>
              )}

              <ul className="divide-y divide-line border-t border-line">
                {artifacts.map((artifact) => {
                  const isLate = artifact.dueDate < now && artifact.status !== 'done'
                  return (
                    <li key={artifact.id} className="row-hover flex items-start gap-3 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={artifact.status === 'done'}
                        onChange={(event) =>
                          void saveArtifact({
                            id: artifact.id,
                            status: event.target.checked ? 'done' : 'in_progress'
                          })
                        }
                        aria-label={`Mark ${artifact.name} done`}
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          className={`text-left text-[13px] hover:text-page ${
                            artifact.status === 'done' ? 'text-ink-muted line-through' : ''
                          }`}
                          onClick={() => setEditing(artifact)}
                        >
                          {artifact.name}
                        </button>
                        <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                          {DISCIPLINE_LABEL[artifact.discipline as Discipline] ??
                            artifact.discipline}
                          {artifact.isOptional && ' · optional'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xs tabular-nums ${isLate ? 'text-danger' : 'text-ink-muted'}`}
                        >
                          {formatDate(artifact.dueDate)}
                        </p>
                        <p className="text-xs text-ink-faint">{STATUS_LABEL[artifact.status]}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </details>
          )
        })}
      </div>

      <ArtifactEditor artifact={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function ArtifactEditor({
  artifact,
  onClose
}: {
  artifact: ArtifactRecord | null
  onClose: () => void
}) {
  const saveArtifact = useStore((state) => state.saveArtifact)
  const [draft, setDraft] = useState<Partial<ArtifactRecord>>({})
  const current = { ...artifact, ...draft }

  function close() {
    setDraft({})
    onClose()
  }

  return (
    <Modal
      open={artifact !== null}
      title={artifact?.name ?? ''}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!artifact) return
              await saveArtifact({
                id: artifact.id,
                name: current.name,
                dueDate: current.dueDate,
                description: current.description,
                status: current.status,
                link: current.link
              })
              close()
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <input
            className="input"
            value={current.name ?? ''}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label="Due date">
          <input
            className="input"
            type="date"
            value={current.dueDate ?? ''}
            onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <select
            className="input"
            value={current.status ?? 'not_started'}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as ArtifactStatus })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Link or file path"
          className="sm:col-span-2"
          hint="Where the document lives — a path in your repo, an Overleaf link, anything."
        >
          <input
            className="input"
            value={current.link ?? ''}
            onChange={(event) => setDraft({ ...draft, link: event.target.value })}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input min-h-[4.5rem]"
            value={current.description ?? ''}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs leading-snug text-ink-muted">
        Editing a deliverable marks it as yours — a later re-plan will move the generated ones but
        leave this one where you put it.
      </p>
    </Modal>
  )
}
