import { useMemo, useState } from 'react'

import { DISCIPLINE_LABEL, type Discipline, type ItemStatus } from '@core/types'

import { ItemEditor, STATUS_LABEL, type ItemDraft } from '../components/ItemEditor'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { formatHours, formatPoints, formatRange } from '../lib/format'
import { useStore } from '../store/useStore'

type Filter = 'all' | 'unassigned' | ItemStatus

export function Backlog() {
  const snapshot = useStore((state) => state.snapshot)
  const moveItem = useStore((state) => state.moveItem)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ItemDraft | null>(null)

  const sprintName = useMemo(() => {
    const map = new Map<number, string>()
    for (const sprint of snapshot?.sprints ?? []) map.set(sprint.id, sprint.name)
    return map
  }, [snapshot])

  if (!snapshot) return null

  const query = search.trim().toLowerCase()
  const items = snapshot.items.filter((item) => {
    if (filter === 'unassigned' && item.sprintId !== null) return false
    if (filter !== 'all' && filter !== 'unassigned' && item.status !== filter) return false
    if (query && !`${item.title} ${item.description}`.toLowerCase().includes(query)) return false
    return true
  })

  const totalPoints = items.reduce((sum, item) => sum + item.points, 0)
  const totalHours = items.reduce((sum, item) => sum + item.estimateHours, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Product backlog"
        description="Everything the project might contain. Pull items into a sprint only when there is capacity for them."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            Add item
          </button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <input
            className="input w-56"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {(['all', 'unassigned', 'backlog', 'todo', 'in_progress', 'done'] as Filter[]).map(
            (option) => (
              <button
                key={option}
                className={`btn btn-sm ${filter === option ? 'btn-primary' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option === 'all'
                  ? 'All'
                  : option === 'unassigned'
                    ? 'No sprint'
                    : STATUS_LABEL[option as ItemStatus]}
              </button>
            )
          )}
          <span className="ml-auto text-xs tabular-nums text-ink-muted">
            {items.length} items - {formatPoints(totalPoints)} pts - {formatHours(totalHours)}
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description="Add items as you discover them. Anything you are not sure about yet belongs in the backlog rather than in a sprint."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="table-cell font-medium">Item</th>
                  <th className="table-cell font-medium">Discipline</th>
                  <th className="table-cell text-right font-medium">Points</th>
                  <th className="table-cell text-right font-medium">Hours</th>
                  <th className="table-cell font-medium">Sprint</th>
                  <th className="table-cell font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-sunken/60">
                    <td className="table-cell">
                      <button
                        className="text-left text-sm hover:text-accent"
                        onClick={() => setEditing(item)}
                      >
                        <span className={item.status === 'done' ? 'text-ink-muted line-through' : ''}>
                          {item.title}
                        </span>
                      </button>
                      <p className="mt-0.5 max-w-md truncate text-xs text-ink-muted">
                        {item.description}
                      </p>
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-ink-muted">
                      {DISCIPLINE_LABEL[item.discipline as Discipline] ?? item.discipline}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatPoints(item.points)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {item.estimateHours ? formatHours(item.estimateHours) : '-'}
                    </td>
                    <td className="table-cell">
                      <select
                        className="input py-1 text-xs"
                        value={item.sprintId ?? ''}
                        onChange={(event) =>
                          void moveItem({
                            id: item.id,
                            sprintId: event.target.value === '' ? null : Number(event.target.value)
                          })
                        }
                      >
                        <option value="">Backlog</option>
                        {snapshot.sprints.map((sprint) => (
                          <option key={sprint.id} value={sprint.id}>
                            {sprint.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-cell">
                      <select
                        className="input py-1 text-xs"
                        value={item.status}
                        onChange={(event) =>
                          void moveItem({
                            id: item.id,
                            sprintId: item.sprintId,
                            status: event.target.value as ItemStatus
                          })
                        }
                      >
                        {(['backlog', 'todo', 'in_progress', 'done'] as ItemStatus[]).map(
                          (status) => (
                            <option key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </option>
                          )
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Sprint load">
        <ul className="divide-y divide-line">
          {snapshot.sprints.map((sprint) => {
            const assigned = snapshot.items.filter((item) => item.sprintId === sprint.id)
            const hours = assigned.reduce((sum, item) => sum + item.estimateHours, 0)
            const over = hours > sprint.netCapacityHours
            return (
              <li key={sprint.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-20 shrink-0 font-medium">{sprintName.get(sprint.id)}</span>
                <span className="w-44 shrink-0 text-xs tabular-nums text-ink-muted">
                  {formatRange(sprint.startDate, sprint.endDate)}
                </span>
                <span className="flex-1 text-xs text-ink-muted">{assigned.length} items</span>
                <span className={`tabular-nums ${over ? 'text-warn' : 'text-ink-muted'}`}>
                  {formatHours(hours)} / {formatHours(sprint.netCapacityHours)}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>

      <ItemEditor
        open={editing !== null}
        item={editing}
        sprints={snapshot.sprints}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
