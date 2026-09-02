/**
 * Sprint board.
 *
 * Three columns, drag between them. The header keeps committed hours next to
 * the sprint's real net capacity, because over-committing is the failure mode
 * this whole app exists to prevent.
 */
import { useMemo, useState } from 'react'

import type { ItemStatus } from '@core/types'
import type { BacklogItemRecord } from '@shared/models'

import { ItemEditor, STATUS_LABEL, type ItemDraft } from '../components/ItemEditor'
import { Card, EmptyState, PageHeader, PhaseBadge, ProgressBar } from '../components/ui'
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

  async function onDrop(status: ItemStatus, event: React.DragEvent) {
    event.preventDefault()
    setDragOver(null)
    const id = Number(event.dataTransfer.getData('text/plain'))
    if (!Number.isFinite(id) || !sprint) return
    await moveItem({ id, sprintId: sprint.id, status })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sprint board"
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

      <Card>
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-ink-muted">Phase</p>
            <PhaseBadge phase={phaseOfSprint(snapshot, sprint)} className="mt-1" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Dates</p>
            <p className="mt-1 text-sm tabular-nums">
              {formatRange(sprint.startDate, sprint.endDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Committed vs capacity</p>
            <p className={`mt-1 text-sm tabular-nums ${over ? 'text-warn' : ''}`}>
              {formatHours(committedHours)} / {formatHours(sprint.netCapacityHours)}
            </p>
            <ProgressBar
              className="mt-1"
              tone={over ? 'warn' : 'accent'}
              value={sprint.netCapacityHours ? committedHours / sprint.netCapacityHours : 0}
            />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Points done</p>
            <p className="mt-1 text-sm tabular-nums">
              {formatPoints(donePoints)} / {formatPoints(committedPoints)}
            </p>
            <ProgressBar
              className="mt-1"
              tone="ok"
              value={committedPoints ? donePoints / committedPoints : 0}
            />
          </div>
        </div>
        {over && (
          <p className="border-t border-line bg-warn/10 px-4 py-2 text-xs text-warn">
            Over-committed by {formatHours(committedHours - sprint.netCapacityHours)}. Move the
            lowest-priority item back to the backlog rather than planning to work extra hours you do
            not have.
          </p>
        )}
      </Card>

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
                dragOver === status ? 'border-accent bg-accent/5' : ''
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
        <Card title="Sprint burndown">
          <div className="px-4 py-3">
            <BurndownChart points={burndown} />
          </div>
        </Card>
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
      className="cursor-grab rounded-md border border-line bg-surface-raised px-2.5 py-2 active:cursor-grabbing"
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
