/**
 * Backlog items, their status history and logged work.
 *
 * Every status change writes an `item_event`. That history is what lets the
 * burndown chart show where the work actually stood on day 4 of a sprint,
 * rather than only where it stands today.
 */
import type { ItemStatus } from '@core/types'
import type { BacklogItemRecord, ItemEventRecord, WorkSessionRecord } from '@shared/models'

import { all, get, run, toSql } from '../connection'

type Row = Record<string, unknown>

function toItem(row: Row): BacklogItemRecord {
  return {
    id: Number(row.id),
    sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
    title: String(row.title),
    description: String(row.description ?? ''),
    acceptanceCriteria: String(row.acceptance_criteria ?? ''),
    type: String(row.type) as BacklogItemRecord['type'],
    discipline: String(row.discipline) as BacklogItemRecord['discipline'],
    points: Number(row.points),
    estimateHours: Number(row.estimate_hours),
    priority: Number(row.priority),
    status: String(row.status) as ItemStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    doneAt: row.done_at === null ? null : String(row.done_at)
  }
}

export function listItems(projectId: number): BacklogItemRecord[] {
  return all<Row>(
    `SELECT * FROM backlog_item WHERE project_id = ?
      ORDER BY priority, id`,
    [projectId]
  ).map(toItem)
}

export function getItem(id: number): BacklogItemRecord | undefined {
  const row = get<Row>('SELECT * FROM backlog_item WHERE id = ?', [id])
  return row ? toItem(row) : undefined
}

export interface ItemInput {
  projectId: number
  sprintId?: number | null
  title?: string
  description?: string
  acceptanceCriteria?: string
  type?: BacklogItemRecord['type']
  discipline?: BacklogItemRecord['discipline']
  points?: number
  estimateHours?: number
  priority?: number
  status?: ItemStatus
  isGenerated?: boolean
}

export function insertItem(input: ItemInput): number {
  const now = new Date().toISOString()
  const status = input.status ?? 'backlog'
  const id = run(
    `INSERT INTO backlog_item (
       project_id, sprint_id, title, description, acceptance_criteria, type, discipline,
       points, estimate_hours, priority, status, created_at, updated_at, done_at, is_generated
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.projectId,
      toSql(input.sprintId ?? null),
      input.title ?? 'Untitled',
      input.description ?? '',
      input.acceptanceCriteria ?? '',
      input.type ?? 'story',
      input.discipline ?? 'implementation',
      input.points ?? 0,
      input.estimateHours ?? 0,
      input.priority ?? nextPriority(input.projectId),
      status,
      now,
      now,
      status === 'done' ? now : null,
      toSql(input.isGenerated ?? false)
    ]
  )
  recordEvent(id, input.projectId, null, status, input.points ?? 0)
  return id
}

export function updateItem(id: number, fields: ItemInput): void {
  const existing = getItem(id)
  if (!existing) return

  const columns: Record<string, string> = {
    sprintId: 'sprint_id',
    title: 'title',
    description: 'description',
    acceptanceCriteria: 'acceptance_criteria',
    type: 'type',
    discipline: 'discipline',
    points: 'points',
    estimateHours: 'estimate_hours',
    priority: 'priority',
    status: 'status'
  }

  const sets: string[] = []
  const params: (string | number | null | Uint8Array)[] = []
  for (const [key, column] of Object.entries(columns)) {
    const value = (fields as unknown as Record<string, unknown>)[key]
    if (value !== undefined) {
      sets.push(`${column} = ?`)
      params.push(toSql(value))
    }
  }

  const now = new Date().toISOString()
  if (fields.status !== undefined && fields.status !== existing.status) {
    sets.push('done_at = ?')
    params.push(fields.status === 'done' ? now : null)
  }
  if (sets.length === 0) return

  sets.push('updated_at = ?')
  params.push(now, id)
  run(`UPDATE backlog_item SET ${sets.join(', ')} WHERE id = ?`, params)

  if (fields.status !== undefined && fields.status !== existing.status) {
    recordEvent(id, projectIdOf(id), existing.status, fields.status, fields.points ?? existing.points)
  }
}

export function deleteItem(id: number): void {
  run('DELETE FROM item_event WHERE item_id = ?', [id])
  run('UPDATE work_session SET item_id = NULL WHERE item_id = ?', [id])
  run('DELETE FROM backlog_item WHERE id = ?', [id])
}

/** Detach every item from its sprint - used before a re-plan rebuilds sprints. */
export function detachItemsFromSprints(projectId: number): Map<number, number> {
  const positions = new Map<number, number>()
  const rows = all<Row>(
    `SELECT i.id AS id, s.position AS position
       FROM backlog_item i JOIN sprint s ON s.id = i.sprint_id
      WHERE i.project_id = ?`,
    [projectId]
  )
  for (const row of rows) positions.set(Number(row.id), Number(row.position))
  run('UPDATE backlog_item SET sprint_id = NULL WHERE project_id = ?', [projectId])
  return positions
}

/** Put items back on the sprint that now occupies the position they were on. */
export function reattachItems(
  positions: Map<number, number>,
  sprintIdByPosition: Map<number, number>
): number {
  let unassigned = 0
  for (const [itemId, position] of positions) {
    const sprintId = sprintIdByPosition.get(position)
    if (sprintId === undefined) {
      unassigned++
      continue
    }
    run('UPDATE backlog_item SET sprint_id = ? WHERE id = ?', [sprintId, itemId])
  }
  return unassigned
}

export function listEvents(projectId: number): ItemEventRecord[] {
  return all<Row>('SELECT * FROM item_event WHERE project_id = ? ORDER BY at', [projectId]).map(
    (row) => ({
      id: Number(row.id),
      itemId: Number(row.item_id),
      fromStatus: row.from_status === null ? null : (String(row.from_status) as ItemStatus),
      toStatus: String(row.to_status) as ItemStatus,
      points: Number(row.points),
      at: String(row.at)
    })
  )
}

function recordEvent(
  itemId: number,
  projectId: number,
  from: ItemStatus | null,
  to: ItemStatus,
  points: number
): void {
  if (!projectId) return
  run(
    'INSERT INTO item_event (item_id, project_id, from_status, to_status, points, at) VALUES (?,?,?,?,?,?)',
    [itemId, projectId, toSql(from), to, points, new Date().toISOString()]
  )
}

function projectIdOf(itemId: number): number {
  const row = get<Row>('SELECT project_id FROM backlog_item WHERE id = ?', [itemId])
  return row ? Number(row.project_id) : 0
}

function nextPriority(projectId: number): number {
  const row = get<Row>('SELECT MAX(priority) AS max FROM backlog_item WHERE project_id = ?', [
    projectId
  ])
  return (row && row.max !== null ? Number(row.max) : 0) + 10
}

export function listSessions(projectId: number): WorkSessionRecord[] {
  return all<Row>('SELECT * FROM work_session WHERE project_id = ? ORDER BY date DESC, id DESC', [
    projectId
  ]).map((row) => ({
    id: Number(row.id),
    itemId: row.item_id === null ? null : Number(row.item_id),
    sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
    date: String(row.date),
    hours: Number(row.hours),
    note: String(row.note ?? '')
  }))
}

export interface SessionInput {
  projectId: number
  itemId?: number | null
  sprintId?: number | null
  date?: string
  hours?: number
  note?: string
}

export function upsertSession(id: number | undefined, input: SessionInput): number {
  if (id) {
    run('UPDATE work_session SET item_id = ?, sprint_id = ?, date = ?, hours = ?, note = ? WHERE id = ?', [
      toSql(input.itemId ?? null),
      toSql(input.sprintId ?? null),
      input.date ?? new Date().toISOString().slice(0, 10),
      input.hours ?? 0,
      input.note ?? '',
      id
    ])
    return id
  }
  return run(
    'INSERT INTO work_session (project_id, item_id, sprint_id, date, hours, note) VALUES (?,?,?,?,?,?)',
    [
      input.projectId,
      toSql(input.itemId ?? null),
      toSql(input.sprintId ?? null),
      input.date ?? new Date().toISOString().slice(0, 10),
      input.hours ?? 0,
      input.note ?? ''
    ]
  )
}

export function deleteSession(id: number): void {
  run('DELETE FROM work_session WHERE id = ?', [id])
}

/** Link every unassigned session to whichever sprint covers its date. */
export function relinkSessionsToSprints(projectId: number): void {
  run(
    `UPDATE work_session
        SET sprint_id = (
          SELECT s.id FROM sprint s
           WHERE s.project_id = work_session.project_id
             AND work_session.date BETWEEN s.start_date AND s.end_date
        )
      WHERE project_id = ?`,
    [projectId]
  )
}
