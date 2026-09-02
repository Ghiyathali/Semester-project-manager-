/**
 * Integration test over the real SQLite file: migrations, plan persistence,
 * re-planning, export and import. No Electron involved - every module under
 * test takes its paths as parameters.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_PHASE_RATIOS, type PlanInput } from '@core/types'
import type { CreateProjectPayload } from '@shared/ipc'

import { closeDatabase, openDatabase, transaction } from '../db/connection'
import * as backlog from '../db/repositories/backlog'
import * as planRepo from '../db/repositories/plan'
import * as projects from '../db/repositories/projects'
import { buildIcs } from './icsService'
import { createProject, replan, snapshot } from './planService'
import { exportProject, importProject } from './portability'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-test-'))
const dbFile = path.join(tempDir, 'test.db')

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    startDate: '2026-09-07',
    deadlineDate: '2026-12-18',
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
    exceptions: [],
    deadlines: [{ title: 'Hand-in', date: '2026-12-18', kind: 'hand-in', isHard: true }],
    ectsCredits: 15,
    ...overrides
  }
}

function payload(overrides: Partial<CreateProjectPayload> = {}): CreateProjectPayload {
  return {
    name: 'Bachelor project',
    course: 'SW6',
    description: 'Warehouse routing',
    timezone: 'Europe/Copenhagen',
    plan: planInput(),
    seedBacklog: true,
    ...overrides
  }
}

async function open(): Promise<void> {
  await openDatabase({ file: dbFile, resourcesPath: tempDir, appPath: process.cwd() })
}

beforeAll(async () => {
  await open()
})

afterAll(() => {
  closeDatabase()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('creating a project', () => {
  it('writes a complete plan and reads it back', () => {
    const id = createProject(payload())
    const data = snapshot(id)

    expect(data.project.name).toBe('Bachelor project')
    expect(data.sprints).toHaveLength(7)
    expect(data.phases.map((p) => p.kind)).toEqual([
      'inception',
      'elaboration',
      'construction',
      'transition'
    ])
    expect(data.milestones.map((m) => m.kind)).toEqual(['LCO', 'LCA', 'IOC', 'PR'])
    expect(data.ceremonies.length).toBeGreaterThan(20)
    expect(data.artifacts.length).toBeGreaterThan(15)
    expect(data.items.length).toBeGreaterThan(10)
    expect(data.availability).toHaveLength(3)
  })

  it('links sprints to their phase and items to their sprint', () => {
    const id = projects.listProjects()[0].id
    const data = snapshot(id)
    const phaseIds = new Set(data.phases.map((p) => p.id))
    const sprintIds = new Set(data.sprints.map((s) => s.id))

    for (const sprint of data.sprints) expect(phaseIds.has(sprint.phaseId as number)).toBe(true)
    for (const artifact of data.artifacts) expect(phaseIds.has(artifact.phaseId as number)).toBe(true)
    for (const item of data.items) {
      if (item.sprintId !== null) expect(sprintIds.has(item.sprintId)).toBe(true)
    }
  })

  it('records an event for every seeded item so burndowns have history', () => {
    const id = projects.listProjects()[0].id
    const data = snapshot(id)
    expect(data.events.length).toBe(data.items.length)
  })

  it('survives a close and reopen', async () => {
    const before = snapshot(projects.listProjects()[0].id)
    closeDatabase()
    await open()
    const after = snapshot(projects.listProjects()[0].id)
    expect(after.sprints).toHaveLength(before.sprints.length)
    expect(after.items).toHaveLength(before.items.length)
  })
})

describe('re-planning', () => {
  it('reports a diff without writing anything when apply is false', () => {
    const id = projects.listProjects()[0].id
    const before = snapshot(id)

    const diff = replan({
      projectId: id,
      plan: planInput({ deadlineDate: '2027-01-15' }),
      apply: false
    })

    expect(diff.sprintsAfter).toBeGreaterThan(diff.sprintsBefore)
    expect(snapshot(id).sprints).toHaveLength(before.sprints.length)
    expect(snapshot(id).project.deadlineDate).toBe(before.project.deadlineDate)
  })

  it('keeps hand-edited deliverables and re-attaches backlog items', () => {
    const id = projects.listProjects()[0].id
    const before = snapshot(id)

    // The student pins one deliverable to a date of their own choosing...
    const pinned = before.artifacts[0]
    transaction(() => planRepo.updateArtifact(pinned.id, { dueDate: '2026-09-30' }))

    // ...and has an item sitting on the second sprint.
    const item = before.items.find((i) => i.sprintId !== null)
    expect(item).toBeDefined()
    const itemSprintPosition = before.sprints.find((s) => s.id === item?.sprintId)?.position

    replan({ projectId: id, plan: planInput({ deadlineDate: '2027-01-15' }), apply: true })
    const after = snapshot(id)

    expect(after.project.deadlineDate).toBe('2027-01-15')
    expect(after.sprints.length).toBeGreaterThan(before.sprints.length)

    const stillPinned = after.artifacts.find((a) => a.name === pinned.name)
    expect(stillPinned?.dueDate).toBe('2026-09-30')
    expect(stillPinned?.isUserModified).toBe(true)
    // The preserved row is re-linked to the rebuilt phase, not left dangling.
    expect(stillPinned?.phaseId).not.toBeNull()
    expect(after.phases.some((p) => p.id === stillPinned?.phaseId)).toBe(true)

    const movedItem = after.items.find((i) => i.title === item?.title)
    const newSprint = after.sprints.find((s) => s.id === movedItem?.sprintId)
    expect(newSprint?.position).toBe(itemSprintPosition)
  })

  it('returns items to the backlog when their sprint disappears', () => {
    const id = createProject(payload({ name: 'Shrinking project' }))
    const before = snapshot(id)
    const lastSprint = before.sprints[before.sprints.length - 1]

    transaction(() =>
      backlog.insertItem({ projectId: id, title: 'Late work', sprintId: lastSprint.id, points: 3 })
    )

    replan({ projectId: id, plan: planInput({ deadlineDate: '2026-10-05' }), apply: true })
    const after = snapshot(id)

    expect(after.sprints.length).toBeLessThan(before.sprints.length)
    expect(after.items.find((i) => i.title === 'Late work')?.sprintId).toBeNull()
  })

  it('flags a stale plan when the inputs change without re-planning', () => {
    const id = createProject(payload({ name: 'Drifting project' }))
    expect(snapshot(id).warnings.map((w) => w.code)).not.toContain('plan-stale')

    transaction(() => projects.updatePlanSettings(id, planInput({ deadlineDate: '2027-02-01' })))
    expect(snapshot(id).warnings.map((w) => w.code)).toContain('plan-stale')
  })
})

describe('exports', () => {
  it('writes an importable calendar', () => {
    const id = projects.listProjects().find((p) => p.name === 'Bachelor project')!.id
    const data = snapshot(id)
    const ics = buildIcs(data, { includeWorkSlots: false })

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('Sprint 1 Planning')
    expect(ics).toContain('Milestone:')
    // Floating local times: no trailing Z on the timed events.
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}\r?\n/)

    const withSlots = buildIcs(data, { includeWorkSlots: true })
    expect(countOccurrences(withSlots, 'BEGIN:VEVENT')).toBeGreaterThan(
      countOccurrences(ics, 'BEGIN:VEVENT')
    )
  })

  it('round-trips a project through JSON', () => {
    const id = projects.listProjects().find((p) => p.name === 'Bachelor project')!.id
    const original = snapshot(id)
    const exported = exportProject(id)

    const copyId = importProject(JSON.parse(JSON.stringify(exported)))
    const copy = snapshot(copyId)

    expect(copy.project.name).toBe('Bachelor project (imported)')
    expect(copy.sprints).toHaveLength(original.sprints.length)
    expect(copy.phases).toHaveLength(original.phases.length)
    expect(copy.artifacts).toHaveLength(original.artifacts.length)
    expect(copy.items).toHaveLength(original.items.length)
    expect(copy.ceremonies).toHaveLength(original.ceremonies.length)
    // Foreign keys are remapped, not copied.
    expect(copy.sprints[0].id).not.toBe(original.sprints[0].id)
    expect(copy.phases.some((p) => p.id === copy.sprints[0].phaseId)).toBe(true)
  })

  it('refuses a file that is not one of ours', () => {
    expect(() => importProject({ format: 'something-else' })).toThrow(/not a Semester Project/)
  })
})

describe('deleting a project', () => {
  it('removes every related row', () => {
    const id = createProject(payload({ name: 'Doomed project' }))
    expect(snapshot(id).sprints.length).toBeGreaterThan(0)

    transaction(() => projects.deleteProject(id))

    expect(projects.getProject(id)).toBeUndefined()
    expect(planRepo.listSprints(id)).toHaveLength(0)
    expect(planRepo.listArtifacts(id)).toHaveLength(0)
    expect(backlog.listItems(id)).toHaveLength(0)
    expect(backlog.listEvents(id)).toHaveLength(0)
  })
})

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}
