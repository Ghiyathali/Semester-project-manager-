/**
 * Turns a `PlanInput` into stored rows, and re-plans without trampling the
 * student's own edits.
 */
import { generatePlan } from '@core/scheduler/generatePlan'
import type { GeneratedPlan, PlanInput, PlanWarning } from '@core/types'
import type { CreateProjectPayload, ReplanPayload } from '@shared/ipc'
import type { ProjectSnapshot, ReplanDiff } from '@shared/models'

import { get, transaction } from '../db/connection'
import * as backlog from '../db/repositories/backlog'
import * as planRepo from '../db/repositories/plan'
import * as projects from '../db/repositories/projects'

export function createProject(payload: CreateProjectPayload): number {
  return transaction(() => {
    const projectId = projects.insertProject({
      name: payload.name,
      course: payload.course,
      description: payload.description,
      timezone: payload.timezone,
      plan: payload.plan
    })

    projects.replaceAvailability(projectId, payload.plan.availability)
    projects.replaceExceptions(projectId, payload.plan.exceptions)
    projects.replaceDeadlines(projectId, payload.plan.deadlines)

    const plan = generatePlan(payload.plan)
    const written = planRepo.writePlan(projectId, plan)

    if (payload.seedBacklog) {
      seedBacklog(projectId, plan, written.sprintIdByPosition)
    }

    projects.updatePlanSettings(projectId, payload.plan)
    return projectId
  })
}

function seedBacklog(
  projectId: number,
  plan: GeneratedPlan,
  sprintIdByPosition: Map<number, number>
): void {
  plan.backlog.forEach((item, index) => {
    backlog.insertItem({
      projectId,
      sprintId: item.sprintIndex === null ? null : (sprintIdByPosition.get(item.sprintIndex) ?? null),
      title: item.title,
      description: item.description,
      type: item.type,
      discipline: item.discipline,
      points: item.points,
      estimateHours: item.estimateHours,
      priority: (index + 1) * 10,
      status: 'backlog',
      isGenerated: true
    })
  })
}

/**
 * Compute - and optionally apply - a new plan for an existing project.
 *
 * With `apply: false` nothing is written; the caller gets the diff to show the
 * student before they commit to it.
 */
export function replan(payload: ReplanPayload): ReplanDiff {
  const { projectId, plan: input } = payload
  const fresh = generatePlan(input)
  const diff = diffAgainstStored(projectId, fresh)

  if (!payload.apply) return diff

  return transaction(() => {
    projects.replaceAvailability(projectId, input.availability)
    projects.replaceExceptions(projectId, input.exceptions)
    projects.replaceDeadlines(projectId, input.deadlines)

    const itemPositions = backlog.detachItemsFromSprints(projectId)
    planRepo.clearGeneratedPlan(projectId)
    const written = planRepo.writePlan(projectId, fresh)
    planRepo.relinkPreserved(projectId)

    const unassigned = backlog.reattachItems(itemPositions, written.sprintIdByPosition)
    backlog.relinkSessionsToSprints(projectId)

    if (payload.seedBacklog) seedBacklog(projectId, fresh, written.sprintIdByPosition)

    projects.updatePlanSettings(projectId, input)
    return { ...diff, itemsUnassigned: unassigned }
  })
}

function countOf(sql: string, params: (string | number)[]): number {
  return Number(get<{ n: number }>(sql, params)?.n ?? 0)
}

function diffAgainstStored(projectId: number, fresh: GeneratedPlan): ReplanDiff {
  const sprints = planRepo.listSprints(projectId)
  const milestones = planRepo.listMilestones(projectId)
  const artifacts = planRepo.listArtifacts(projectId)

  const sprintsMoved = fresh.sprints.filter((sprint) => {
    const existing = sprints.find((s) => s.position === sprint.index)
    return !existing || existing.startDate !== sprint.start || existing.endDate !== sprint.end
  }).length

  const milestonesMoved = fresh.milestones.filter((milestone) => {
    const existing = milestones.find((m) => m.kind === milestone.kind)
    return !existing || existing.date !== milestone.date
  }).length

  const artifactsRescheduled = fresh.artifacts.filter((artifact) => {
    const existing = artifacts.find((a) => a.name === artifact.name)
    return !existing || existing.dueDate !== artifact.dueDate
  }).length

  const ceremoniesReplaced = countOf(
    'SELECT COUNT(*) AS n FROM ceremony WHERE project_id = ? AND is_user_modified = 0',
    [projectId]
  )

  const preservedUserEdits =
    countOf(
      'SELECT COUNT(*) AS n FROM milestone WHERE project_id = ? AND is_user_modified = 1',
      [projectId]
    ) +
    countOf(
      'SELECT COUNT(*) AS n FROM artifact WHERE project_id = ? AND is_user_modified = 1',
      [projectId]
    ) +
    countOf(
      'SELECT COUNT(*) AS n FROM ceremony WHERE project_id = ? AND is_user_modified = 1',
      [projectId]
    )

  // Items sitting on a sprint position the new plan no longer has go back to
  // the backlog rather than following a sprint that moved out from under them.
  const itemsUnassigned = countOf(
    `SELECT COUNT(*) AS n FROM backlog_item i
       JOIN sprint s ON s.id = i.sprint_id
      WHERE i.project_id = ? AND s.position >= ?`,
    [projectId, fresh.sprints.length]
  )

  return {
    sprintsBefore: sprints.length,
    sprintsAfter: fresh.sprints.length,
    sprintsMoved,
    milestonesMoved,
    artifactsRescheduled,
    ceremoniesReplaced,
    preservedUserEdits,
    itemsUnassigned,
    warnings: fresh.warnings
  }
}

export function snapshot(projectId: number): ProjectSnapshot {
  const project = projects.getProject(projectId)
  if (!project) throw new Error(`No project with id ${projectId}`)

  const input = projects.planInputFor(project)
  const warnings = warningsFor(projectId, input)

  return {
    project,
    availability: projects.listAvailability(projectId),
    exceptions: projects.listExceptions(projectId),
    deadlines: projects.listDeadlines(projectId),
    phases: planRepo.listPhases(projectId),
    sprints: planRepo.listSprints(projectId),
    ceremonies: planRepo.listCeremonies(projectId),
    milestones: planRepo.listMilestones(projectId),
    artifacts: planRepo.listArtifacts(projectId),
    items: backlog.listItems(projectId),
    events: backlog.listEvents(projectId),
    sessions: backlog.listSessions(projectId),
    warnings
  }
}

/**
 * Warnings are recomputed on load rather than stored, so they stay true as the
 * project moves. Regenerating also reveals when the stored plan has gone stale
 * because the inputs changed without a re-plan.
 */
function warningsFor(projectId: number, input: PlanInput): PlanWarning[] {
  const fresh = generatePlan(input)
  const stored = planRepo.listSprints(projectId)
  const warnings = [...fresh.warnings]

  const stale =
    stored.length !== fresh.sprints.length ||
    fresh.sprints.some((sprint) => {
      const existing = stored.find((s) => s.position === sprint.index)
      return !existing || existing.startDate !== sprint.start || existing.endDate !== sprint.end
    })

  if (stale && stored.length > 0) {
    warnings.unshift({
      code: 'plan-stale',
      severity: 'warning',
      message: 'Your dates or availability have changed since this plan was generated.',
      hint: 'Open Setup and re-plan to bring sprints, ceremonies and deadlines back in line.'
    })
  }

  return warnings
}

export function previewPlan(input: PlanInput): GeneratedPlan {
  return generatePlan(input)
}
