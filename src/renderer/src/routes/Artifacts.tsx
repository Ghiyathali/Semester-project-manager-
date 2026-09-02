/**
 * The Unified Process deliverables, grouped by phase.
 *
 * This is the screen that answers "what am I actually supposed to hand in, and
 * when" - the part of UP that students most often discover too late.
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

import { Card, EmptyState, Field, Modal, PageHeader, PhaseBadge, ProgressBar } from '../components/ui'
import { formatDate, formatRange } from '../lib/format'
import { today } from '../lib/derive'
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
        <PageHeader title="UP deliverables" />
        <Card>
          <EmptyState
            title="No deliverables yet"
            description="Generate a plan in Setup and the standard Unified Process deliverables are scheduled for you."
          />
        </Card>
      </div>
    )
  }

  const done = snapshot.artifacts.filter((a) => a.status === 'done').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="UP deliverables"
        description="Standard Unified Process artifacts, dated against the gate they belong to. Delete anything your course does not require."
        actions={
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={showOptional}
              onChange={(event) => setShowOptional(event.target.checked)}
            />
            Show optional
          </label>
        }
      />

      <Card>
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-ink-muted">
              <span>Deliverables complete</span>
              <span className="tabular-nums">
                {done} / {snapshot.artifacts.length}
              </span>
            </div>
            <ProgressBar className="mt-1.5" tone="ok" value={done / snapshot.artifacts.length} />
          </div>
        </div>
      </Card>

      {snapshot.phases.map((phase) => {
        const artifacts = snapshot.artifacts
          .filter((artifact) => artifact.phaseKind === phase.kind)
          .filter((artifact) => showOptional || !artifact.isOptional)
        const milestone = snapshot.milestones.find((m) => m.phaseKind === phase.kind)

        return (
          <Card
            key={phase.id}
            title={
              <span className="flex items-center gap-2">
                <PhaseBadge phase={phase.kind} />
                <span className="text-xs font-normal text-ink-muted">
                  {formatRange(phase.startDate, phase.endDate)}
                </span>
              </span>
            }
            actions={
              milestone && (
                <span className="text-xs text-ink-muted">
                  Gate {milestone.kind} on {formatDate(milestone.date)}
                </span>
              )
            }
          >
            <p className="border-b border-line px-4 py-2 text-xs text-ink-muted">
              {PHASE_INTENT[phase.kind]}
            </p>

            {milestone && (
              <div className="flex items-start gap-3 border-b border-line bg-surface-sunken/60 px-4 py-2.5">
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
                  aria-label={`Mark ${milestone.name} passed`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{milestone.name}</p>
                  <p className="text-xs text-ink-muted">
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
              </div>
            )}

            <ul className="divide-y divide-line">
              {artifacts.map((artifact) => {
                const late = artifact.dueDate < now && artifact.status !== 'done'
                return (
                  <li key={artifact.id} className="flex items-start gap-3 px-4 py-2.5">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className={`text-left text-sm hover:text-accent ${
                            artifact.status === 'done' ? 'text-ink-muted line-through' : ''
                          }`}
                          onClick={() => setEditing(artifact)}
                        >
                          {artifact.name}
                        </button>
                        {artifact.isOptional && (
                          <span className="chip bg-surface-sunken text-ink-muted">optional</span>
                        )}
                        <span className="chip bg-surface-sunken text-ink-muted">
                          {DISCIPLINE_LABEL[artifact.discipline as Discipline] ?? artifact.discipline}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">{artifact.description}</p>
                      {artifact.link && (
                        <p className="mt-0.5 truncate text-xs text-accent">{artifact.link}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-xs tabular-nums ${late ? 'text-danger' : 'text-ink-muted'}`}>
                        {formatDate(artifact.dueDate)}
                      </p>
                      <p className="text-xs text-ink-faint">{STATUS_LABEL[artifact.status]}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}

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

  return (
    <Modal
      open={artifact !== null}
      title={artifact?.name ?? ''}
      onClose={() => {
        setDraft({})
        onClose()
      }}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              setDraft({})
              onClose()
            }}
          >
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
              setDraft({})
              onClose()
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
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as ArtifactStatus })
            }
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
          hint="Where the document lives - a path in your repo, an Overleaf link, anything."
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
      <p className="mt-3 text-xs text-ink-muted">
        Editing a deliverable marks it as yours - a later re-plan will move the generated ones but
        leave this one where you put it.
      </p>
    </Modal>
  )
}
