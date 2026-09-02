/**
 * Projects and the inputs the planner reads: weekly availability, one-off
 * exceptions and fixed deadlines.
 */
import { DEFAULT_PHASE_RATIOS, type PhaseRatios, type PlanInput } from '@core/types'
import type {
  AvailabilityRuleRecord,
  DeadlineRecord,
  ExceptionDayRecord,
  ProjectRecord,
  ProjectSummary
} from '@shared/models'

import { all, bool, get, run, toSql } from '../connection'

type Row = Record<string, unknown>

function parseRatios(raw: unknown): PhaseRatios {
  try {
    const parsed = JSON.parse(String(raw)) as Partial<PhaseRatios>
    return { ...DEFAULT_PHASE_RATIOS, ...parsed }
  } catch {
    return { ...DEFAULT_PHASE_RATIOS }
  }
}

function toProject(row: Row): ProjectRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    course: String(row.course ?? ''),
    description: String(row.description ?? ''),
    startDate: String(row.start_date),
    deadlineDate: String(row.deadline_date),
    timezone: String(row.timezone ?? 'UTC'),
    sprintLengthDays: Number(row.sprint_length_days),
    weekStartsOn: Number(row.week_starts_on),
    alignSprintsToWeek: bool(row.align_sprints_to_week as never),
    includeDailyStandup: bool(row.include_daily_standup as never),
    phaseRatios: parseRatios(row.phase_ratios),
    ectsCredits: row.ects_credits === null ? null : Number(row.ects_credits),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    plannedAt: row.planned_at === null ? null : String(row.planned_at)
  }
}

export function listProjects(): ProjectSummary[] {
  return all<Row>(
    `SELECT id, name, course, start_date, deadline_date, updated_at
       FROM project ORDER BY updated_at DESC`
  ).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    course: String(row.course ?? ''),
    startDate: String(row.start_date),
    deadlineDate: String(row.deadline_date),
    updatedAt: String(row.updated_at)
  }))
}

export function getProject(id: number): ProjectRecord | undefined {
  const row = get<Row>('SELECT * FROM project WHERE id = ?', [id])
  return row ? toProject(row) : undefined
}

export interface NewProject {
  name: string
  course: string
  description: string
  timezone: string
  plan: PlanInput
}

export function insertProject(input: NewProject): number {
  const now = new Date().toISOString()
  const { plan } = input
  return run(
    `INSERT INTO project (
       name, course, description, start_date, deadline_date, timezone,
       sprint_length_days, week_starts_on, align_sprints_to_week,
       include_daily_standup, phase_ratios, ects_credits, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.name,
      input.course,
      input.description,
      plan.startDate,
      plan.deadlineDate,
      input.timezone,
      plan.sprintLengthDays,
      plan.weekStartsOn,
      toSql(plan.alignSprintsToWeek),
      toSql(plan.includeDailyStandup),
      JSON.stringify(plan.phaseRatios),
      toSql(plan.ectsCredits ?? null),
      now,
      now
    ]
  )
}

export function updateProjectDetails(
  id: number,
  fields: Partial<Pick<ProjectRecord, 'name' | 'course' | 'description' | 'timezone'>>
): void {
  const sets: string[] = []
  const params: (string | number | null)[] = []
  for (const key of ['name', 'course', 'description', 'timezone'] as const) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`)
      params.push(String(fields[key]))
    }
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(new Date().toISOString(), id)
  run(`UPDATE project SET ${sets.join(', ')} WHERE id = ?`, params)
}

/** Persist the planning inputs after a re-plan, so the project reproduces its plan. */
export function updatePlanSettings(id: number, plan: PlanInput): void {
  run(
    `UPDATE project SET
       start_date = ?, deadline_date = ?, sprint_length_days = ?, week_starts_on = ?,
       align_sprints_to_week = ?, include_daily_standup = ?, phase_ratios = ?,
       ects_credits = ?, planned_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      plan.startDate,
      plan.deadlineDate,
      plan.sprintLengthDays,
      plan.weekStartsOn,
      toSql(plan.alignSprintsToWeek),
      toSql(plan.includeDailyStandup),
      JSON.stringify(plan.phaseRatios),
      toSql(plan.ectsCredits ?? null),
      new Date().toISOString(),
      new Date().toISOString(),
      id
    ]
  )
}

export function touchProject(id: number): void {
  run('UPDATE project SET updated_at = ? WHERE id = ?', [new Date().toISOString(), id])
}

export function deleteProject(id: number): void {
  // Explicit cascade: sql.js honours PRAGMA foreign_keys, but being deliberate
  // here keeps the delete correct even if that pragma is ever lost.
  for (const table of [
    'work_session',
    'item_event',
    'backlog_item',
    'artifact',
    'milestone',
    'ceremony',
    'sprint',
    'phase',
    'deadline',
    'exception_day',
    'availability_rule'
  ]) {
    run(`DELETE FROM ${table} WHERE project_id = ?`, [id])
  }
  run('DELETE FROM project WHERE id = ?', [id])
}

export function listAvailability(projectId: number): AvailabilityRuleRecord[] {
  return all<Row>(
    `SELECT id, weekday, start_time, end_time FROM availability_rule
      WHERE project_id = ? ORDER BY weekday, start_time`,
    [projectId]
  ).map((row) => ({
    id: Number(row.id),
    weekday: Number(row.weekday),
    start: String(row.start_time),
    end: String(row.end_time)
  }))
}

export function replaceAvailability(projectId: number, rules: PlanInput['availability']): void {
  run('DELETE FROM availability_rule WHERE project_id = ?', [projectId])
  for (const rule of rules) {
    run(
      'INSERT INTO availability_rule (project_id, weekday, start_time, end_time) VALUES (?,?,?,?)',
      [projectId, rule.weekday, rule.start, rule.end]
    )
  }
}

export function listExceptions(projectId: number): ExceptionDayRecord[] {
  return all<Row>(
    `SELECT id, date, kind, start_time, end_time, reason FROM exception_day
      WHERE project_id = ? ORDER BY date`,
    [projectId]
  ).map((row) => ({
    id: Number(row.id),
    date: String(row.date),
    kind: String(row.kind) as ExceptionDayRecord['kind'],
    start: row.start_time === null ? null : String(row.start_time),
    end: row.end_time === null ? null : String(row.end_time),
    reason: String(row.reason ?? '')
  }))
}

export function replaceExceptions(projectId: number, exceptions: PlanInput['exceptions']): void {
  run('DELETE FROM exception_day WHERE project_id = ?', [projectId])
  for (const exception of exceptions) {
    run(
      `INSERT INTO exception_day (project_id, date, kind, start_time, end_time, reason)
       VALUES (?,?,?,?,?,?)`,
      [
        projectId,
        exception.date,
        exception.kind,
        toSql(exception.start ?? null),
        toSql(exception.end ?? null),
        exception.reason ?? ''
      ]
    )
  }
}

export function listDeadlines(projectId: number): DeadlineRecord[] {
  return all<Row>(
    `SELECT id, title, date, kind, is_hard, notes FROM deadline
      WHERE project_id = ? ORDER BY date`,
    [projectId]
  ).map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    date: String(row.date),
    kind: String(row.kind) as DeadlineRecord['kind'],
    isHard: bool(row.is_hard as never),
    notes: String(row.notes ?? '')
  }))
}

export function replaceDeadlines(projectId: number, deadlines: PlanInput['deadlines']): void {
  run('DELETE FROM deadline WHERE project_id = ?', [projectId])
  for (const deadline of deadlines) {
    run('INSERT INTO deadline (project_id, title, date, kind, is_hard) VALUES (?,?,?,?,?)', [
      projectId,
      deadline.title,
      deadline.date,
      deadline.kind,
      toSql(deadline.isHard)
    ])
  }
}

/** Rebuild the exact `PlanInput` a project was planned from. */
export function planInputFor(project: ProjectRecord): PlanInput {
  return {
    startDate: project.startDate,
    deadlineDate: project.deadlineDate,
    sprintLengthDays: project.sprintLengthDays,
    weekStartsOn: project.weekStartsOn,
    alignSprintsToWeek: project.alignSprintsToWeek,
    phaseRatios: project.phaseRatios,
    includeDailyStandup: project.includeDailyStandup,
    availability: listAvailability(project.id).map((r) => ({
      weekday: r.weekday,
      start: r.start,
      end: r.end
    })),
    exceptions: listExceptions(project.id).map((e) => ({
      date: e.date,
      kind: e.kind,
      start: e.start ?? undefined,
      end: e.end ?? undefined,
      reason: e.reason
    })),
    deadlines: listDeadlines(project.id).map((d) => ({
      title: d.title,
      date: d.date,
      kind: d.kind,
      isHard: d.isHard
    })),
    ectsCredits: project.ectsCredits ?? undefined
  }
}

export function getSetting(key: string): string | null {
  const row = get<Row>('SELECT value FROM meta WHERE key = ?', [key])
  return row ? String(row.value) : null
}

export function setSetting(key: string, value: string | null): void {
  if (value === null) {
    run('DELETE FROM meta WHERE key = ?', [key])
    return
  }
  run('INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = ?', [
    key,
    value,
    value
  ])
}
