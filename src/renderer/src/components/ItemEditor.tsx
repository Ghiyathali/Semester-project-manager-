import { useEffect, useState } from 'react'

import { DISCIPLINE_LABEL, type Discipline, type ItemStatus, type ItemType } from '@core/types'
import type { BacklogItemRecord, SprintRecord } from '@shared/models'

import { Field, Modal } from './ui'
import { formatRange } from '../lib/format'
import { useStore } from '../store/useStore'

const TYPES: ItemType[] = ['story', 'task', 'bug', 'spike']
const STATUSES: ItemStatus[] = ['backlog', 'todo', 'in_progress', 'done']
const STATUS_LABEL: Record<ItemStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done'
}

/** Fibonacci-ish scale, the usual Scrum default. */
const POINTS = [0, 1, 2, 3, 5, 8, 13, 21]

export interface ItemDraft extends Partial<BacklogItemRecord> {
  id?: number
}

export function ItemEditor({
  open,
  item,
  sprints,
  onClose
}: {
  open: boolean
  item: ItemDraft | null
  sprints: SprintRecord[]
  onClose: () => void
}) {
  const saveItem = useStore((state) => state.saveItem)
  const deleteItem = useStore((state) => state.deleteItem)
  const busy = useStore((state) => state.busy)
  const [draft, setDraft] = useState<ItemDraft>({})

  useEffect(() => {
    setDraft(
      item ?? {
        title: '',
        description: '',
        acceptanceCriteria: '',
        type: 'story',
        discipline: 'implementation',
        points: 3,
        estimateHours: 4,
        status: 'backlog',
        sprintId: null
      }
    )
  }, [item])

  if (!open) return null

  const patch = (fields: ItemDraft) => setDraft((current) => ({ ...current, ...fields }))

  async function onSave() {
    if (!draft.title || draft.title.trim().length === 0) return
    await saveItem({
      id: draft.id,
      title: draft.title.trim(),
      description: draft.description ?? '',
      acceptanceCriteria: draft.acceptanceCriteria ?? '',
      type: draft.type,
      discipline: draft.discipline,
      points: Number(draft.points ?? 0),
      estimateHours: Number(draft.estimateHours ?? 0),
      status: draft.status,
      sprintId: draft.sprintId ?? null
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={draft.id ? 'Edit item' : 'New backlog item'}
      onClose={onClose}
      wide
      footer={
        <>
          {draft.id && (
            <button
              className="btn btn-danger mr-auto"
              disabled={busy}
              onClick={async () => {
                await deleteItem(draft.id as number)
                onClose()
              }}
            >
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !draft.title?.trim()}
            onClick={onSave}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2">
          <input
            className="input"
            autoFocus
            value={draft.title ?? ''}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </Field>

        <Field label="Type">
          <select
            className="input"
            value={draft.type ?? 'story'}
            onChange={(event) => patch({ type: event.target.value as ItemType })}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="UP discipline">
          <select
            className="input"
            value={draft.discipline ?? 'implementation'}
            onChange={(event) => patch({ discipline: event.target.value as Discipline })}
          >
            {Object.entries(DISCIPLINE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Story points" hint="Relative size, for velocity.">
          <select
            className="input"
            value={String(draft.points ?? 0)}
            onChange={(event) => patch({ points: Number(event.target.value) })}
          >
            {POINTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Estimate (hours)" hint="Drives the capacity and deadline projection.">
          <input
            className="input"
            type="number"
            min={0}
            step={0.5}
            value={draft.estimateHours ?? 0}
            onChange={(event) => patch({ estimateHours: Number(event.target.value) })}
          />
        </Field>

        <Field label="Sprint">
          <select
            className="input"
            value={draft.sprintId ?? ''}
            onChange={(event) =>
              patch({ sprintId: event.target.value === '' ? null : Number(event.target.value) })
            }
          >
            <option value="">Backlog (no sprint)</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name} - {formatRange(sprint.startDate, sprint.endDate)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            className="input"
            value={draft.status ?? 'backlog'}
            onChange={(event) => patch({ status: event.target.value as ItemStatus })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description" className="sm:col-span-2">
          <textarea
            className="input min-h-[4.5rem]"
            value={draft.description ?? ''}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>

        <Field
          label="Acceptance criteria"
          className="sm:col-span-2"
          hint="What has to be true for this to count as done."
        >
          <textarea
            className="input min-h-[4.5rem]"
            value={draft.acceptanceCriteria ?? ''}
            onChange={(event) => patch({ acceptanceCriteria: event.target.value })}
          />
        </Field>
      </div>
    </Modal>
  )
}

export { STATUS_LABEL }
