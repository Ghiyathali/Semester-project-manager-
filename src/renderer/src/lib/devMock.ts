/**
 * In-browser development mock.
 *
 * When the renderer is opened directly in a browser (`npm run dev:web`) there is
 * no Electron preload, so `window.api` does not exist. This installs an
 * in-memory stand-in backed by the real scheduler, seeded with a project that is
 * already half-finished - which makes it possible to work on the UI, including
 * burndown and velocity charts, without launching the desktop app.
 *
 * It is never bundled into a production build: the only call site is guarded by
 * `import.meta.env.DEV`.
 */
import { addDays, todayStr } from '@core/dates'
import { generatePlan } from '@core/scheduler/generatePlan'
import {
  DEFAULT_PHASE_RATIOS,
  type GeneratedPlan,
  type ItemStatus,
  type PlanInput
} from '@core/types'
import type { IpcChannel } from '@shared/ipc'
import type {
  BacklogItemRecord,
  ItemEventRecord,
  ProjectSnapshot,
  WorkSessionRecord
} from '@shared/models'

const NOW = todayStr()

function demoInput(): PlanInput {
  const start = addDays(NOW, -63)
  const deadline = addDays(NOW, 42)
  return {
    startDate: start,
    deadlineDate: deadline,
    sprintLengthDays: 14,
    weekStartsOn: 1,
    alignSprintsToWeek: true,
    phaseRatios: DEFAULT_PHASE_RATIOS,
    includeDailyStandup: false,
    availability: [
      { weekday: 2, start: '18:00', end: '21:00' },
      { weekday: 4, start: '18:00', end: '21:00' },
      { weekday: 6, start: '10:00', end: '14:00' }
    ],
    exceptions: [
      { date: addDays(NOW, -21), kind: 'blackout', reason: 'Exam' },
      { date: addDays(NOW, -19), kind: 'blackout', reason: 'Exam' }
    ],
    deadlines: [
      { title: 'Hand-in', date: deadline, kind: 'hand-in', isHard: true },
      { title: 'Final presentation', date: addDays(deadline, -3), kind: 'presentation', isHard: true }
    ],
    ectsCredits: 15
  }
}

let nextId = 1
const id = (): number => nextId++

function materialise(input: PlanInput, plan: GeneratedPlan, name: string): ProjectSnapshot {
  const phases = plan.phases.map((phase, index) => ({
    id: id(),
    kind: phase.kind,
    mergedFrom: phase.mergedFrom,
    position: index,
    startDate: phase.start,
    endDate: phase.end,
    goal: phase.goal,
    status: 'planned',
    isUserModified: false
  }))
  const phaseId = (kind: string) => phases.find((p) => p.kind === kind)?.id ?? null

  const sprints = plan.sprints.map((sprint) => ({
    id: id(),
    phaseId: phaseId(sprint.phase),
    position: sprint.index,
    name: sprint.name,
    startDate: sprint.start,
    endDate: sprint.end,
    goal: sprint.goal,
    capacityHours: sprint.capacityHours,
    ceremonyHours: sprint.ceremonyHours,
    netCapacityHours: sprint.netCapacityHours,
    workingDays: sprint.workingDays,
    status: 'planned',
    isUserModified: false
  }))
  const sprintId = (index: number | null) =>
    index === null ? null : (sprints.find((s) => s.position === index)?.id ?? null)

  const items: BacklogItemRecord[] = []
  const events: ItemEventRecord[] = []

  plan.backlog.forEach((template, index) => {
    const sprint = sprints.find((s) => s.id === sprintId(template.sprintIndex))
    // Anything scheduled well before today is treated as finished, so the demo
    // has a believable history for the charts to draw.
    const finished = sprint ? sprint.endDate < NOW : false
    const inProgress = !finished && sprint ? sprint.startDate <= NOW && sprint.endDate >= NOW : false
    const status: ItemStatus = finished
      ? index % 7 === 0
        ? 'todo'
        : 'done'
      : inProgress
        ? index % 3 === 0
          ? 'in_progress'
          : 'todo'
        : 'backlog'

    const itemId = id()
    const createdAt = `${sprint?.startDate ?? input.startDate}T09:00:00.000Z`
    const doneAt = status === 'done' ? `${sprint?.endDate ?? NOW}T18:00:00.000Z` : null

    items.push({
      id: itemId,
      sprintId: sprint?.id ?? null,
      title: template.title,
      description: template.description,
      acceptanceCriteria: '',
      type: template.type,
      discipline: template.discipline,
      points: template.points,
      estimateHours: template.estimateHours,
      priority: (index + 1) * 10,
      status,
      createdAt,
      updatedAt: createdAt,
      doneAt
    })
    events.push({ id: id(), itemId, fromStatus: null, toStatus: 'backlog', points: template.points, at: createdAt })
    if (doneAt) {
      events.push({ id: id(), itemId, fromStatus: 'todo', toStatus: 'done', points: template.points, at: doneAt })
    }
  })

  const sessions: WorkSessionRecord[] = plan.slots
    .filter((slot) => slot.date < NOW)
    .filter((_, index) => index % 2 === 0)
    .map((slot) => ({
      id: id(),
      itemId: null,
      sprintId: sprints.find((s) => slot.date >= s.startDate && slot.date <= s.endDate)?.id ?? null,
      date: slot.date,
      hours: Math.round(slot.hours * 0.8 * 4) / 4,
      note: 'Worked on the project'
    }))

  return {
    project: {
      id: 1,
      name,
      course: 'SW6 Bachelor Project',
      description: 'Route optimisation for a small warehouse.',
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
      timezone: 'Europe/Copenhagen',
      sprintLengthDays: input.sprintLengthDays,
      weekStartsOn: input.weekStartsOn,
      alignSprintsToWeek: input.alignSprintsToWeek,
      includeDailyStandup: input.includeDailyStandup,
      phaseRatios: input.phaseRatios,
      ectsCredits: input.ectsCredits ?? null,
      createdAt: `${input.startDate}T09:00:00.000Z`,
      updatedAt: `${NOW}T09:00:00.000Z`,
      plannedAt: `${input.startDate}T09:00:00.000Z`
    },
    availability: input.availability.map((rule) => ({ id: id(), ...rule })),
    exceptions: input.exceptions.map((exception) => ({
      id: id(),
      date: exception.date,
      kind: exception.kind,
      start: exception.start ?? null,
      end: exception.end ?? null,
      reason: exception.reason ?? ''
    })),
    deadlines: input.deadlines.map((deadline) => ({ id: id(), ...deadline, notes: '' })),
    phases,
    sprints,
    ceremonies: plan.ceremonies.map((ceremony) => ({
      id: id(),
      sprintId: sprintId(ceremony.sprintIndex),
      kind: ceremony.kind,
      title: ceremony.title,
      date: ceremony.date,
      start: ceremony.start,
      end: ceremony.end,
      minutes: ceremony.minutes,
      notes: ceremony.notes,
      done: ceremony.date < NOW
    })),
    milestones: plan.milestones.map((milestone) => ({
      id: id(),
      phaseId: phaseId(milestone.phase),
      phaseKind: milestone.phase,
      kind: milestone.kind,
      name: milestone.name,
      date: milestone.date,
      description: milestone.description,
      status: milestone.date < NOW ? 'done' : 'pending',
      isUserModified: false
    })),
    artifacts: plan.artifacts.map((artifact, index) => ({
      id: id(),
      phaseId: phaseId(artifact.phase),
      phaseKind: artifact.phase,
      name: artifact.name,
      discipline: artifact.discipline,
      dueDate: artifact.dueDate,
      description: artifact.description,
      status: artifact.dueDate < NOW ? (index % 5 === 0 ? 'in_progress' : 'done') : 'not_started',
      isOptional: artifact.optional,
      link: '',
      isUserModified: false
    })),
    items,
    events,
    sessions,
    warnings: plan.warnings
  }
}

export function installDevMock(): void {
  const input = demoInput()
  let state = materialise(input, generatePlan(input), 'Warehouse routing (demo)')
  let planInput = input

  const findItem = (itemId: number) => state.items.find((item) => item.id === itemId)

  const api = {
    async call(channel: IpcChannel, payload?: unknown): Promise<unknown> {
      switch (channel) {
        case 'app:info':
          return {
            version: '0.1.0-dev',
            electron: 'browser mock',
            databasePath: '(in-memory demo data)',
            userDataPath: '(browser)'
          }
        case 'projects:list':
          return [
            {
              id: state.project.id,
              name: state.project.name,
              course: state.project.course,
              startDate: state.project.startDate,
              deadlineDate: state.project.deadlineDate,
              updatedAt: state.project.updatedAt
            }
          ]
        case 'projects:active':
          return state.project.id
        case 'projects:snapshot':
          return structuredClone(state)
        case 'projects:setActive':
          return undefined
        case 'projects:update': {
          const fields = payload as Record<string, string>
          state.project = { ...state.project, ...fields }
          return undefined
        }
        case 'plan:preview':
          return generatePlan(payload as PlanInput)
        case 'plan:replan': {
          const { plan, apply } = payload as { plan: PlanInput; apply: boolean }
          const fresh = generatePlan(plan)
          const before = state.sprints.length
          if (apply) {
            planInput = plan
            state = materialise(plan, fresh, state.project.name)
          }
          return {
            sprintsBefore: before,
            sprintsAfter: fresh.sprints.length,
            sprintsMoved: fresh.sprints.length,
            milestonesMoved: fresh.milestones.length,
            artifactsRescheduled: fresh.artifacts.length,
            ceremoniesReplaced: fresh.ceremonies.length,
            preservedUserEdits: 0,
            itemsUnassigned: 0,
            warnings: fresh.warnings
          }
        }
        case 'items:save': {
          const fields = payload as Partial<BacklogItemRecord> & { id?: number }
          if (fields.id) {
            const existing = findItem(fields.id)
            if (existing) Object.assign(existing, fields)
            return fields.id
          }
          const newId = id()
          state.items.push({
            id: newId,
            sprintId: fields.sprintId ?? null,
            title: fields.title ?? 'Untitled',
            description: fields.description ?? '',
            acceptanceCriteria: fields.acceptanceCriteria ?? '',
            type: fields.type ?? 'story',
            discipline: fields.discipline ?? 'implementation',
            points: fields.points ?? 0,
            estimateHours: fields.estimateHours ?? 0,
            priority: 1000,
            status: fields.status ?? 'backlog',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            doneAt: null
          })
          return newId
        }
        case 'items:move': {
          const fields = payload as { id: number; sprintId: number | null; status?: ItemStatus }
          const existing = findItem(fields.id)
          if (existing) {
            existing.sprintId = fields.sprintId
            if (fields.status) {
              existing.status = fields.status
              existing.doneAt = fields.status === 'done' ? new Date().toISOString() : null
              state.events.push({
                id: id(),
                itemId: existing.id,
                fromStatus: null,
                toStatus: fields.status,
                points: existing.points,
                at: new Date().toISOString()
              })
            }
          }
          return undefined
        }
        case 'items:delete':
          state.items = state.items.filter((item) => item.id !== payload)
          return undefined
        case 'artifacts:save': {
          const fields = payload as { id: number } & Record<string, unknown>
          const artifact = state.artifacts.find((a) => a.id === fields.id)
          if (artifact) Object.assign(artifact, fields, { isUserModified: true })
          return undefined
        }
        case 'milestones:save': {
          const fields = payload as { id: number } & Record<string, unknown>
          const milestone = state.milestones.find((m) => m.id === fields.id)
          if (milestone) Object.assign(milestone, fields, { isUserModified: true })
          return undefined
        }
        case 'ceremonies:toggle': {
          const fields = payload as { id: number; done: boolean }
          const ceremony = state.ceremonies.find((c) => c.id === fields.id)
          if (ceremony) ceremony.done = fields.done
          return undefined
        }
        case 'sessions:save': {
          const fields = payload as Partial<WorkSessionRecord>
          const newId = id()
          state.sessions.unshift({
            id: newId,
            itemId: null,
            sprintId: null,
            date: fields.date ?? NOW,
            hours: fields.hours ?? 0,
            note: fields.note ?? ''
          })
          return newId
        }
        case 'sessions:delete':
          state.sessions = state.sessions.filter((session) => session.id !== payload)
          return undefined
        case 'export:ics':
        case 'export:json':
          return { ok: false, message: 'File export needs the desktop app.' }
        case 'import:json':
          return { ok: false, message: 'Import needs the desktop app.' }
        default:
          return undefined
      }
    }
  }

  Object.defineProperty(window, 'api', { value: api, writable: false })
  console.info(
    `[dev mock] Running without Electron. Demo project spans ${planInput.startDate} to ${planInput.deadlineDate}.`
  )
}
