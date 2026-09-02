/**
 * JSON export / import.
 *
 * The database is a local file the student owns, but a plain JSON dump is what
 * makes the data genuinely portable: readable, diffable, safe to commit next to
 * the project it describes, and independent of this app's schema version.
 */
import { DEFAULT_PHASE_RATIOS, type PhaseRatios } from '@core/types'
import type { ProjectSnapshot } from '@shared/models'

import { run, toSql, transaction } from '../db/connection'
import * as projects from '../db/repositories/projects'
import { snapshot } from './planService'

export const EXPORT_FORMAT = 'semester-project-manager/project'
export const EXPORT_VERSION = 1

export interface ProjectExport {
  format: string
  version: number
  exportedAt: string
  snapshot: ProjectSnapshot
}

export function exportProject(projectId: number): ProjectExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot: snapshot(projectId)
  }
}

/** Import a previously exported project as a new project. Returns its id. */
export function importProject(raw: unknown): number {
  const parsed = raw as Partial<ProjectExport>
  if (!parsed || parsed.format !== EXPORT_FORMAT || !parsed.snapshot) {
    throw new Error('That file is not a Semester Project Manager export.')
  }
  if ((parsed.version ?? 0) > EXPORT_VERSION) {
    throw new Error('That export was made by a newer version of the app.')
  }

  const data = parsed.snapshot
  return transaction(() => {
    const projectId = projects.insertProject({
      name: `${data.project.name} (imported)`,
      course: data.project.course,
      description: data.project.description,
      timezone: data.project.timezone,
      plan: {
        startDate: data.project.startDate,
        deadlineDate: data.project.deadlineDate,
        sprintLengthDays: data.project.sprintLengthDays,
        weekStartsOn: data.project.weekStartsOn,
        alignSprintsToWeek: data.project.alignSprintsToWeek,
        phaseRatios: sanitiseRatios(data.project.phaseRatios),
        includeDailyStandup: data.project.includeDailyStandup,
        availability: [],
        exceptions: [],
        deadlines: [],
        ectsCredits: data.project.ectsCredits ?? undefined
      }
    })

    projects.replaceAvailability(
      projectId,
      data.availability.map((a) => ({ weekday: a.weekday, start: a.start, end: a.end }))
    )
    projects.replaceExceptions(
      projectId,
      data.exceptions.map((e) => ({
        date: e.date,
        kind: e.kind,
        start: e.start ?? undefined,
        end: e.end ?? undefined,
        reason: e.reason
      }))
    )
    projects.replaceDeadlines(
      projectId,
      data.deadlines.map((d) => ({ title: d.title, date: d.date, kind: d.kind, isHard: d.isHard }))
    )

    const phaseIds = new Map<number, number>()
    data.phases.forEach((phase, position) => {
      const id = run(
        `INSERT INTO phase (project_id, kind, merged_from, position, start_date, end_date, goal, status)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          projectId,
          phase.kind,
          JSON.stringify(phase.mergedFrom),
          position,
          phase.startDate,
          phase.endDate,
          phase.goal,
          phase.status
        ]
      )
      phaseIds.set(phase.id, id)
    })

    const sprintIds = new Map<number, number>()
    for (const sprint of data.sprints) {
      const id = run(
        `INSERT INTO sprint (
           project_id, phase_id, position, name, start_date, end_date, goal,
           capacity_hours, ceremony_hours, net_capacity_hours, working_days, status
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId,
          toSql(sprint.phaseId === null ? null : (phaseIds.get(sprint.phaseId) ?? null)),
          sprint.position,
          sprint.name,
          sprint.startDate,
          sprint.endDate,
          sprint.goal,
          sprint.capacityHours,
          sprint.ceremonyHours,
          sprint.netCapacityHours,
          sprint.workingDays,
          sprint.status
        ]
      )
      sprintIds.set(sprint.id, id)
    }

    for (const ceremony of data.ceremonies) {
      run(
        `INSERT INTO ceremony (project_id, sprint_id, kind, title, date, start_time, end_time, minutes, notes, done)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId,
          toSql(ceremony.sprintId === null ? null : (sprintIds.get(ceremony.sprintId) ?? null)),
          ceremony.kind,
          ceremony.title,
          ceremony.date,
          ceremony.start,
          ceremony.end,
          ceremony.minutes,
          ceremony.notes,
          toSql(ceremony.done)
        ]
      )
    }

    for (const milestone of data.milestones) {
      run(
        `INSERT INTO milestone (project_id, phase_id, phase_kind, kind, name, date, description, status, is_user_modified)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          projectId,
          toSql(milestone.phaseId === null ? null : (phaseIds.get(milestone.phaseId) ?? null)),
          milestone.phaseKind,
          milestone.kind,
          milestone.name,
          milestone.date,
          milestone.description,
          milestone.status,
          toSql(milestone.isUserModified)
        ]
      )
    }

    for (const artifact of data.artifacts) {
      run(
        `INSERT INTO artifact (project_id, phase_id, phase_kind, name, discipline, due_date, description, status, is_optional, link, is_user_modified)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId,
          toSql(artifact.phaseId === null ? null : (phaseIds.get(artifact.phaseId) ?? null)),
          artifact.phaseKind,
          artifact.name,
          artifact.discipline,
          artifact.dueDate,
          artifact.description,
          artifact.status,
          toSql(artifact.isOptional),
          artifact.link,
          toSql(artifact.isUserModified)
        ]
      )
    }

    const itemIds = new Map<number, number>()
    for (const item of data.items) {
      const id = run(
        `INSERT INTO backlog_item (
           project_id, sprint_id, title, description, acceptance_criteria, type, discipline,
           points, estimate_hours, priority, status, created_at, updated_at, done_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          projectId,
          toSql(item.sprintId === null ? null : (sprintIds.get(item.sprintId) ?? null)),
          item.title,
          item.description,
          item.acceptanceCriteria,
          item.type,
          item.discipline,
          item.points,
          item.estimateHours,
          item.priority,
          item.status,
          item.createdAt,
          item.updatedAt,
          toSql(item.doneAt)
        ]
      )
      itemIds.set(item.id, id)
    }

    for (const event of data.events) {
      const itemId = itemIds.get(event.itemId)
      if (itemId === undefined) continue
      run(
        'INSERT INTO item_event (item_id, project_id, from_status, to_status, points, at) VALUES (?,?,?,?,?,?)',
        [itemId, projectId, toSql(event.fromStatus), event.toStatus, event.points, event.at]
      )
    }

    for (const session of data.sessions) {
      run(
        'INSERT INTO work_session (project_id, item_id, sprint_id, date, hours, note) VALUES (?,?,?,?,?,?)',
        [
          projectId,
          toSql(session.itemId === null ? null : (itemIds.get(session.itemId) ?? null)),
          toSql(session.sprintId === null ? null : (sprintIds.get(session.sprintId) ?? null)),
          session.date,
          session.hours,
          session.note
        ]
      )
    }

    return projectId
  })
}

function sanitiseRatios(ratios: unknown): PhaseRatios {
  const source = (ratios ?? {}) as Partial<PhaseRatios>
  const merged = { ...DEFAULT_PHASE_RATIOS, ...source }
  for (const key of Object.keys(merged) as (keyof PhaseRatios)[]) {
    const value = Number(merged[key])
    merged[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_PHASE_RATIOS[key]
  }
  return merged
}
