/**
 * Sprint board.
 *
 * Three columns, drag between them. The header keeps committed hours next to
 * the sprint's real net capacity, because over-committing is the failure mode
 * this whole app exists to prevent.
 */
import { useMemo, useState } from 'react'

import { diffDays } from '@core/dates'
import type { ItemStatus } from '@core/types'
import type { BacklogItemRecord } from '@shared/models'

import { ItemEditor, STATUS_LABEL, type ItemDraft } from '../components/ItemEditor'
import { Card, EmptyState, PageHeader, ProgressBar, Section, Stat } from '../components/ui'
import { currentSprint, itemsInSprint, phaseOfSprint, sprintBurndown, projectSlots, today } from '../lib/derive'
import { formatHours, formatPoints, formatRange } from '../lib/format'
import { useStore } from '../store/useStore'
import { BurndownChart } from '../components/charts'

const COLUMNS: ItemStatus[] = ['todo', 'in_progress', 'done']

export function Board() {
  const snapshot = useStore((state) => state.snapshot)
  const moveItem = useStore((state) => state.moveItem)
  const now = today()

  const active = snapshot ? currentSprint(snapshot, now) : null
  const [sprintId, setSprintId] = useState<number | null>(null)
  const [editing, setEditing] = useState<ItemDraft | null>(null)
  const [dragOver, setDragOver] = useState<ItemStatus | null>(null)

  const selectedId = sprintId ?? active?.id ?? null
  const sprint = snapshot?.sprints.find((s) => s.id === selectedId) ?? null

  const burndown = useMemo(() => {
    if (!snapshot || !sprint) return []
    return sprintBurndown(snapshot, sprint, projectSlots(snapshot), now)
  }, [snapshot, sprint, now])

  if (!snapshot) return null

  if (!sprint) {
    return (
      <div>
        <PageHeader title="Sprint board" />
        <Card>
          <EmptyState
            title="No sprints yet"
            description="Generate a plan in Setup and the sprints will appear here."
          />
        </Card>
      </div>
    )
  }

  const items = itemsInSprint(snapshot, sprint.id)
  const committedHours = items.reduce((sum, item) => sum + item.estimateHours, 0)
  const committedPoints = items.reduce((sum, item) => sum + item.points, 0)
  const donePoints = items
    .filter((item) => item.status === 'done')
    .reduce((sum, item) => sum + item.points, 0)
  const over = committedHours > sprint.netCapacityHours
  const daysLeft = diffDays(now, sprint.endDate)

  async function onDrop(status: ItemStatus, event: React.DragEvent) {
    event.preventDefault()
    setDragOver(null)
    const id = Number(event.dataTransfer.getData('text/plain'))
    if (!Number.isFinite(id) || !sprint) return
    await moveItem({ id, sprintId: sprint.id, status })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sprint board"
        phase={phaseOfSprint(snapshot, sprint)}
        description={sprint.goal}
        actions={
          <>
            <select
              className="input w-auto"
              value={sprint.id}
              onChange={(event) => setSprintId(Number(event.target.value))}
            >
              {snapshot.sprints.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} - {formatRange(option.startDate, option.endDate)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ sprintId: sprint.id, status: 'todo' })}
            >
              Add item
            </button>
          </>
        }
      />

      <div className="rounded-xl border border-line bg-surface-raised px-5 py-4">
        <div className="grid gap-5 sm:grid-cols-3">
          <Stat
            label="Committed vs capacity"
            value={`${formatHours(committedHours)} / ${formatHours(sprint.netCapacityHours)}`}
            tone={over ? 'warn' : 'page'}
          />
          <Stat
            label="Points done"
            value={`${formatPoints(donePoints)} / ${formatPoints(committedPoints)}`}
          />
          <Stat
            label="Sprint ends"
            value={daysLeft >= 0 ? `${daysLeft} d` : 'ended'}
            hint={formatRange(sprint.startDate, sprint.endDate)}
          />
        </div>
        <ProgressBar
          className="mt-4"
          thick
          tone={over ? 'warn' : 'page'}
          value={sprint.netCapacityHours ? committedHours / sprint.netCapacityHours : 0}
        />
        {over && (
          <p className="mt-2.5 text-xs leading-snug text-warn">
            Over-committed by {formatHours(committedHours - sprint.netCapacityHours)}. Move the
            lowest-priority item back to the backlog rather than planning to work hours you do not
            have.
          </p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((status) => {
          const columnItems = items.filter((item) => item.status === status)
          return (
            <section
              key={status}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(status)
              }}
              onDragLeave={() => setDragOver((current) => (current === status ? null : current))}
              onDrop={(event) => void onDrop(status, event)}
              className={`card min-h-[16rem] transition-colors ${
                dragOver === status ? 'border-page bg-page/5' : ''
              }`}
            >
              <header className="card-header">
                <h2 className="card-title">{STATUS_LABEL[status]}</h2>
                <span className="text-xs tabular-nums text-ink-muted">
                  {columnItems.length} - {formatHours(columnItems.reduce((s, i) => s + i.estimateHours, 0))}
                </span>
              </header>
              <ul className="space-y-2 p-2">
                {columnItems.map((item) => (
                  <ItemCard key={item.id} item={item} onEdit={() => setEditing(item)} />
                ))}
                {columnItems.length === 0 && (
                  <li className="px-2 py-6 text-center text-xs text-ink-faint">
                    Drag items here
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>

      {items.length > 0 && (
        <Section title="Sprint burndown">
          <div className="card px-4 py-4">
            <BurndownChart points={burndown} />
          </div>
        </Section>
      )}

      <ItemEditor
        open={editing !== null}
        item={editing}
        sprints={snapshot.sprints}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function ItemCard({ item, onEdit }: { item: BacklogItemRecord; onEdit: () => void }) {
  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(item.id))}
      className="cursor-grab rounded-lg border border-line bg-surface-raised px-2.5 py-2 transition-colors hover:border-line-strong active:cursor-grabbing"
      onDoubleClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm ${item.status === 'done' ? 'text-ink-muted line-through' : ''}`}>
          {item.title}
        </p>
        <button className="btn btn-ghost btn-sm shrink-0" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <span className="chip bg-surface-sunken">{item.type}</span>
        {item.points > 0 && <span className="tabular-nums">{formatPoints(item.points)} pts</span>}
        {item.estimateHours > 0 && (
          <span className="tabular-nums">{formatHours(item.estimateHours)}</span>
        )}
      </div>
    </li>
  )
}
