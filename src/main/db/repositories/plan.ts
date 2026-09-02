/**
 * The generated half of a project: phases, sprints, ceremonies, milestones and
 * UP deliverables.
 *
 * Rows carry `is_generated` and `is_user_modified`. A re-plan wipes and rewrites
 * generated rows the student has not touched, and leaves edited ones alone - so
 * changing your availability in week 6 never silently deletes the sprint goal
 * you wrote in week 2.
 */
import type { GeneratedPlan, PhaseKind } from '@core/types'
import type {
  ArtifactRecord,
  CeremonyRecord,
  MilestoneRecord,
  PhaseRecord,
  SprintRecord
} from '@shared/models'

import { all, bool, run, toSql } from '../connection'

type Row = Record<string, unknown>

export function listPhases(projectId: number): PhaseRecord[] {
  return all<Row>('SELECT * FROM phase WHERE project_id = ? ORDER BY position', [projectId]).map(
    (row) => ({
      id: Number(row.id),
      kind: String(row.kind) as PhaseKind,
      mergedFrom: safeArray(row.merged_from),
      position: Number(row.position),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      goal: String(row.goal ?? ''),
      status: String(row.status ?? 'planned'),
      isUserModified: bool(row.is_user_modified as never)
    })
  )
}

export function listSprints(projectId: number): SprintRecord[] {
  return all<Row>('SELECT * FROM sprint WHERE project_id = ? ORDER BY position', [projectId]).map(
    (row) => ({
      id: Number(row.id),
      phaseId: row.phase_id === null ? null : Number(row.phase_id),
      position: Number(row.position),
      name: String(row.name),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      goal: String(row.goal ?? ''),
      capacityHours: Number(row.capacity_hours),
      ceremonyHours: Number(row.ceremony_hours),
      netCapacityHours: Number(row.net_capacity_hours),
      workingDays: Number(row.working_days),
      status: String(row.status ?? 'planned'),
      isUserModified: bool(row.is_user_modified as never)
    })
  )
}

export function listCeremonies(projectId: number): CeremonyRecord[] {
  return all<Row>(
    'SELECT * FROM ceremony WHERE project_id = ? ORDER BY date, start_time',
    [projectId]
  ).map((row) => ({
    id: Number(row.id),
    sprintId: row.sprint_id === null ? null : Number(row.sprint_id),
    kind: String(row.kind) as CeremonyRecord['kind'],
    title: String(row.title),
    date: String(row.date),
    start: String(row.start_time),
    end: String(row.end_time),
    minutes: Number(row.minutes),
    notes: String(row.notes ?? ''),
    done: bool(row.done as never)
  }))
}

export function listMilestones(projectId: number): MilestoneRecord[] {
  return all<Row>('SELECT * FROM milestone WHERE project_id = ? ORDER BY date', [projectId]).map(
    (row) => ({
      id: Number(row.id),
      phaseId: row.phase_id === null ? null : Number(row.phase_id),
      phaseKind: String(row.phase_kind) as PhaseKind,
      kind: String(row.kind) as MilestoneRecord['kind'],
      name: String(row.name),
      date: String(row.date),
      description: String(row.description ?? ''),
      status: String(row.status ?? 'pending'),
      isUserModified: bool(row.is_user_modified as never)
    })
  )
}

export function listArtifacts(projectId: number): ArtifactRecord[] {
  return all<Row>('SELECT * FROM artifact WHERE project_id = ? ORDER BY due_date, name', [
    projectId
  ]).map((row) => ({
    id: Number(row.id),
    phaseId: row.phase_id === null ? null : Number(row.phase_id),
    phaseKind: String(row.phase_kind) as PhaseKind,
    name: String(row.name),
    discipline: String(row.discipline) as ArtifactRecord['discipline'],
    dueDate: String(row.due_date),
    description: String(row.description ?? ''),
    status: String(row.status) as ArtifactRecord['status'],
    isOptional: bool(row.is_optional as never),
    link: String(row.link ?? ''),
    isUserModified: bool(row.is_user_modified as never)
  }))
}

/** Wipe the generated rows that the student has not edited. */
export function clearGeneratedPlan(projectId: number): void {
  run('DELETE FROM ceremony WHERE project_id = ? AND is_user_modified = 0', [projectId])
  run('DELETE FROM artifact WHERE project_id = ? AND is_user_modified = 0 AND is_generated = 1', [
    projectId
  ])
  run('DELETE FROM milestone WHERE project_id = ? AND is_user_modified = 0 AND is_generated = 1', [
    projectId
  ])
  // Sprints and phases are always rewritten; backlog items are detached first
  // by the caller so nothing the student wrote is lost.
  run('DELETE FROM sprint WHERE project_id = ?', [projectId])
  run('DELETE FROM phase WHERE project_id = ?', [projectId])
}

export interface WrittenPlan {
  phaseIdByKind: Map<PhaseKind, number>
  sprintIdByPosition: Map<number, number>
}

/** Write a freshly generated plan. Returns the new ids, keyed by their plan position. */
export function writePlan(projectId: number, plan: GeneratedPlan): WrittenPlan {
  const phaseIdByKind = new Map<PhaseKind, number>()
  const sprintIdByPosition = new Map<number, number>()

  plan.phases.forEach((phase, position) => {
    const id = run(
      `INSERT INTO phase (project_id, kind, merged_from, position, start_date, end_date, goal)
       VALUES (?,?,?,?,?,?,?)`,
      [
        projectId,
        phase.kind,
        JSON.stringify(phase.mergedFrom),
        position,
        phase.start,
        phase.end,
        phase.goal
      ]
    )
    phaseIdByKind.set(phase.kind, id)
  })

  for (const sprint of plan.sprints) {
    const phaseId = phaseIdByKind.get(sprint.phase) ?? null
    const id = run(
      `INSERT INTO sprint (
         project_id, phase_id, position, name, start_date, end_date, goal,
         capacity_hours, ceremony_hours, net_capacity_hours, working_days
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        projectId,
        toSql(phaseId),
        sprint.index,
        sprint.name,
        sprint.start,
        sprint.end,
        sprint.goal,
        sprint.capacityHours,
        sprint.ceremonyHours,
        sprint.netCapacityHours,
        sprint.workingDays
      ]
    )
    sprintIdByPosition.set(sprint.index, id)
  }

  for (const ceremony of plan.ceremonies) {
    run(
      `INSERT INTO ceremony (
         project_id, sprint_id, kind, title, date, start_time, end_time, minutes, notes
       ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        projectId,
        toSql(ceremony.sprintIndex === null ? null : sprintIdByPosition.get(ceremony.sprintIndex)),
        ceremony.kind,
        ceremony.title,
        ceremony.date,
        ceremony.start,
        ceremony.end,
        ceremony.minutes,
        ceremony.notes
      ]
    )
  }

  for (const milestone of plan.milestones) {
    run(
      `INSERT INTO milestone (project_id, phase_id, phase_kind, kind, name, date, description)
       VALUES (?,?,?,?,?,?,?)`,
      [
        projectId,
        toSql(phaseIdByKind.get(milestone.phase) ?? null),
        milestone.phase,
        milestone.kind,
        milestone.name,
        milestone.date,
        milestone.description
      ]
    )
  }

  for (const artifact of plan.artifacts) {
    run(
      `INSERT INTO artifact (
         project_id, phase_id, phase_kind, name, discipline, due_date, description, is_optional
       ) VALUES (?,?,?,?,?,?,?,?)`,
      [
        projectId,
        toSql(phaseIdByKind.get(artifact.phase) ?? null),
        artifact.phase,
        artifact.name,
        artifact.discipline,
        artifact.dueDate,
        artifact.description,
        toSql(artifact.optional)
      ]
    )
  }

  return { phaseIdByKind, sprintIdByPosition }
}

/**
 * Re-point rows the student edited at the rebuilt phase and sprint rows.
 *
 * Phases and sprints are dropped and recreated on every re-plan, so any id held
 * by a preserved row is stale afterwards. Rather than rely on SQLite's
 * ON DELETE SET NULL firing, the links are simply recomputed from scratch:
 * deliverables and milestones by the phase kind they belong to, ceremonies by
 * the sprint whose window contains their date.
 */
export function relinkPreserved(projectId: number): void {
  for (const table of ['milestone', 'artifact']) {
    run(
      `UPDATE ${table}
          SET phase_id = (
            SELECT p.id FROM phase p
             WHERE p.project_id = ${table}.project_id AND p.kind = ${table}.phase_kind
          )
        WHERE project_id = ?`,
      [projectId]
    )
  }

  run(
    `UPDATE ceremony
        SET sprint_id = (
          SELECT s.id FROM sprint s
           WHERE s.project_id = ceremony.project_id
             AND ceremony.date BETWEEN s.start_date AND s.end_date
        )
      WHERE project_id = ?`,
    [projectId]
  )
}

export function updateArtifact(id: number, fields: Partial<ArtifactRecord>): void {
  const map: Record<string, string> = {
    name: 'name',
    discipline: 'discipline',
    dueDate: 'due_date',
    description: 'description',
    status: 'status',
    isOptional: 'is_optional',
    link: 'link'
  }
  applyUpdate('artifact', id, fields as Record<string, unknown>, map)
}

export function updateMilestone(id: number, fields: Partial<MilestoneRecord>): void {
  const map: Record<string, string> = {
    name: 'name',
    date: 'date',
    description: 'description',
    status: 'status'
  }
  applyUpdate('milestone', id, fields as Record<string, unknown>, map)
}

export function setCeremonyDone(id: number, done: boolean): void {
  run('UPDATE ceremony SET done = ? WHERE id = ?', [toSql(done), id])
}

/** Shared UPDATE builder that also stamps the row as user-modified. */
function applyUpdate(
  table: string,
  id: number,
  fields: Record<string, unknown>,
  columns: Record<string, string>
): void {
  const sets: string[] = []
  const params: (string | number | null | Uint8Array)[] = []
  for (const [key, column] of Object.entries(columns)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`)
      params.push(toSql(fields[key]))
    }
  }
  if (sets.length === 0) return
  sets.push('is_user_modified = 1')
  params.push(id)
  run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, params)
}

function safeArray(raw: unknown): PhaseKind[] {
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? (parsed as PhaseKind[]) : []
  } catch {
    return []
  }
}
