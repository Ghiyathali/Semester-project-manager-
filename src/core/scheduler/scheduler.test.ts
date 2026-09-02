import { describe, expect, it } from 'vitest'

import { addDays, diffDays, inclusiveDays, startOfWeek, weekdayOf } from '../dates'
import { DEFAULT_PHASE_RATIOS, type PlanInput } from '../types'
import { expandAvailability, totalHours } from './availability'
import { generatePlan } from './generatePlan'
import { normalize, subtract, union } from './intervals'
import { allocatePhases } from './phases'
import { cutSprints } from './sprints'

/**
 * A realistic autumn semester: starts Monday 7 September 2026, hand-in Friday
 * 18 December 2026. The student works Tuesday and Thursday evenings and
 * Saturday mornings - 10 hours a week.
 */
function semesterInput(overrides: Partial<PlanInput> = {}): PlanInput {
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

describe('interval algebra', () => {
  it('merges touching and overlapping ranges', () => {
    expect(normalize([{ start: 60, end: 120 }, { start: 100, end: 180 }])).toEqual([
      { start: 60, end: 180 }
    ])
    expect(normalize([{ start: 60, end: 120 }, { start: 120, end: 180 }])).toEqual([
      { start: 60, end: 180 }
    ])
  })

  it('splits a range when a cut lands in the middle', () => {
    expect(subtract([{ start: 0, end: 600 }], [{ start: 200, end: 300 }])).toEqual([
      { start: 0, end: 200 },
      { start: 300, end: 600 }
    ])
  })

  it('drops zero-length and inverted ranges', () => {
    expect(union([{ start: 100, end: 100 }], [{ start: 300, end: 200 }])).toEqual([])
  })
})

describe('availability expansion', () => {
  it('produces one slot per matching weekday', () => {
    const slots = expandAvailability({
      from: '2026-09-07',
      to: '2026-09-13',
      rules: [{ weekday: 2, start: '18:00', end: '21:00' }],
      exceptions: []
    })
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ date: '2026-09-08', start: '18:00', end: '21:00', hours: 3 })
  })

  it('clears a whole day for an untimed blackout', () => {
    const slots = expandAvailability({
      from: '2026-09-07',
      to: '2026-09-13',
      rules: [{ weekday: 2, start: '18:00', end: '21:00' }],
      exceptions: [{ date: '2026-09-08', kind: 'blackout', reason: 'Exam' }]
    })
    expect(slots).toHaveLength(0)
  })

  it('splits a slot around a timed blackout', () => {
    const slots = expandAvailability({
      from: '2026-09-08',
      to: '2026-09-08',
      rules: [{ weekday: 2, start: '10:00', end: '18:00' }],
      exceptions: [{ date: '2026-09-08', kind: 'blackout', start: '12:00', end: '13:00' }]
    })
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ['10:00', '12:00'],
      ['13:00', '18:00']
    ])
    expect(totalHours(slots)).toBe(7)
  })

  it('lets a blackout override an extra session on the same day', () => {
    const slots = expandAvailability({
      from: '2026-09-09',
      to: '2026-09-09',
      rules: [],
      exceptions: [
        { date: '2026-09-09', kind: 'extra', start: '09:00', end: '17:00' },
        { date: '2026-09-09', kind: 'blackout', reason: 'Sick' }
      ]
    })
    expect(slots).toHaveLength(0)
  })

  it('keeps wall-clock durations across a daylight-saving change', () => {
    // European clocks go back on Sunday 25 October 2026.
    const slots = expandAvailability({
      from: '2026-10-20',
      to: '2026-11-03',
      rules: [{ weekday: 6, start: '10:00', end: '14:00' }],
      exceptions: []
    })
    expect(slots.map((s) => s.date)).toEqual(['2026-10-24', '2026-10-31'])
    expect(slots.every((s) => s.hours === 4)).toBe(true)
  })
})

describe('sprint cutting', () => {
  it('cuts a 14-week semester into whole sprints and absorbs the stub', () => {
    const sprints = cutSprints({
      start: '2026-09-07',
      deadline: '2026-12-18',
      sprintLengthDays: 14,
      weekStartsOn: 1,
      alignToWeek: true
    })
    expect(sprints).toHaveLength(7)
    expect(sprints[0].start).toBe('2026-09-07')
    expect(sprints[sprints.length - 1].end).toBe('2026-12-18')
    // No gaps and no overlaps.
    for (let i = 1; i < sprints.length; i++) {
      expect(diffDays(sprints[i - 1].end, sprints[i].start)).toBe(1)
    }
    // The absorbed remainder makes the last sprint longer, not shorter.
    expect(sprints[sprints.length - 1].days).toBeGreaterThanOrEqual(14)
  })

  it('trims the first sprint so later sprints start on the week start', () => {
    const sprints = cutSprints({
      start: '2026-09-09', // a Wednesday
      deadline: '2026-12-18',
      sprintLengthDays: 14,
      weekStartsOn: 1,
      alignToWeek: true
    })
    expect(sprints[0].start).toBe('2026-09-09')
    expect(sprints[1].start).toBe('2026-09-14')
    expect(weekdayOf(sprints[1].start)).toBe(1)
    for (const sprint of sprints.slice(1, -1)) expect(weekdayOf(sprint.start)).toBe(1)
  })

  it('absorbs a lead-in shorter than three days instead of leaving a stub', () => {
    const sprints = cutSprints({
      start: '2026-09-12', // Saturday, two days before the next Monday
      deadline: '2026-10-31',
      sprintLengthDays: 14,
      weekStartsOn: 1,
      alignToWeek: true
    })
    expect(sprints[0].start).toBe('2026-09-12')
    expect(sprints[0].days).toBe(16)
    expect(sprints[1].start).toBe('2026-09-28')
  })

  it('returns nothing when the deadline precedes the start', () => {
    expect(
      cutSprints({
        start: '2026-10-01',
        deadline: '2026-09-01',
        sprintLengthDays: 14,
        weekStartsOn: 1,
        alignToWeek: true
      })
    ).toEqual([])
  })
})

describe('phase allocation', () => {
  const windows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      index: i,
      start: addDays('2026-09-07', i * 14),
      end: addDays('2026-09-07', i * 14 + 13),
      days: 14
    }))

  it('splits seven sprints as 1 / 2 / 3 / 1', () => {
    const { allocations } = allocatePhases(windows(7), DEFAULT_PHASE_RATIOS)
    expect(allocations.map((a) => a.kind)).toEqual([
      'inception',
      'elaboration',
      'construction',
      'transition'
    ])
    expect(allocations.map((a) => a.sprintIndices.length)).toEqual([1, 2, 3, 1])
  })

  it('gives every phase at least one sprint at the minimum viable length', () => {
    const { allocations, warnings } = allocatePhases(windows(4), DEFAULT_PHASE_RATIOS)
    expect(allocations.map((a) => a.sprintIndices.length)).toEqual([1, 1, 1, 1])
    expect(warnings).toHaveLength(0)
  })

  it('merges phases and warns when there are fewer than four sprints', () => {
    const { allocations, warnings } = allocatePhases(windows(3), DEFAULT_PHASE_RATIOS)
    expect(allocations.map((a) => a.kind)).toEqual(['elaboration', 'construction', 'transition'])
    expect(allocations[0].members).toEqual(['inception', 'elaboration'])
    expect(warnings.map((w) => w.code)).toContain('phases-merged')
  })

  it('assigns every sprint to exactly one phase', () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const { allocations, phaseBySprint } = allocatePhases(windows(n), DEFAULT_PHASE_RATIOS)
      const assigned = allocations.flatMap((a) => a.sprintIndices)
      expect(new Set(assigned).size).toBe(n)
      expect(phaseBySprint.size).toBe(n)
    }
  })
})

describe('generatePlan', () => {
  const plan = generatePlan(semesterInput())

  it('lays out the whole timeline in sprints inside UP phases', () => {
    expect(plan.sprints).toHaveLength(7)
    expect(plan.phases.map((p) => p.kind)).toEqual([
      'inception',
      'elaboration',
      'construction',
      'transition'
    ])
    expect(plan.phases[0].start).toBe('2026-09-07')
    expect(plan.phases[plan.phases.length - 1].end).toBe('2026-12-18')
    // Phases are contiguous.
    for (let i = 1; i < plan.phases.length; i++) {
      expect(diffDays(plan.phases[i - 1].end, plan.phases[i].start)).toBe(1)
    }
  })

  it('reports a believable time budget', () => {
    // 10 h a week over ~14.7 weeks.
    expect(plan.totals.availableHours).toBeGreaterThan(130)
    expect(plan.totals.availableHours).toBeLessThan(155)
    expect(plan.totals.averageHoursPerWeek).toBeCloseTo(10, 0)
    expect(plan.totals.netHours).toBeLessThan(plan.totals.availableHours)
    expect(plan.totals.netHours + plan.totals.ceremonyHours).toBeCloseTo(
      plan.totals.availableHours,
      1
    )
  })

  it('only ever books ceremonies inside declared availability', () => {
    const byDate = new Map<string, Array<{ start: string; end: string }>>()
    for (const slot of plan.slots) {
      const list = byDate.get(slot.date) ?? []
      list.push({ start: slot.start, end: slot.end })
      byDate.set(slot.date, list)
    }
    expect(plan.ceremonies.length).toBeGreaterThan(0)
    for (const ceremony of plan.ceremonies) {
      const ranges = byDate.get(ceremony.date)
      expect(ranges, `no availability on ${ceremony.date}`).toBeDefined()
      const inside = ranges!.some((r) => ceremony.start >= r.start && ceremony.end <= r.end)
      expect(inside, `${ceremony.title} at ${ceremony.date} ${ceremony.start}`).toBe(true)
    }
  })

  it('never double-books two ceremonies', () => {
    const byDate = new Map<string, typeof plan.ceremonies>()
    for (const ceremony of plan.ceremonies) {
      const list = byDate.get(ceremony.date) ?? []
      list.push(ceremony)
      byDate.set(ceremony.date, list)
    }
    for (const list of byDate.values()) {
      const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start >= sorted[i - 1].end).toBe(true)
      }
    }
  })

  it('gives every sprint planning, review and retrospective', () => {
    for (const sprint of plan.sprints) {
      const kinds = plan.ceremonies
        .filter((c) => c.sprintIndex === sprint.index)
        .map((c) => c.kind)
      expect(kinds).toContain('planning')
      expect(kinds).toContain('review')
      expect(kinds).toContain('retrospective')
    }
  })

  it('puts a gate review and a milestone at the end of every phase', () => {
    expect(plan.milestones.map((m) => m.kind)).toEqual(['LCO', 'LCA', 'IOC', 'PR'])
    for (const phase of plan.phases) {
      const milestone = plan.milestones.find((m) => m.phase === phase.kind)
      expect(milestone?.date).toBe(phase.end)
    }
    expect(plan.ceremonies.filter((c) => c.kind === 'phase-gate')).toHaveLength(4)
  })

  it('orders ceremonies within a sprint: planning first, retrospective last', () => {
    for (const sprint of plan.sprints) {
      const mine = plan.ceremonies
        .filter((c) => c.sprintIndex === sprint.index && c.kind !== 'daily')
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      expect(mine[0].kind).toBe('planning')
      const review = mine.findIndex((c) => c.kind === 'review')
      const retro = mine.findIndex((c) => c.kind === 'retrospective')
      expect(review).toBeGreaterThan(0)
      expect(retro).toBe(review + 1)
    }
  })

  it('schedules deliverables inside their phase, on days the student works', () => {
    const workingDates = new Set(plan.slots.map((s) => s.date))
    for (const artifact of plan.artifacts) {
      const phase = plan.phases.find((p) => p.kind === artifact.phase)!
      expect(artifact.dueDate >= phase.start).toBe(true)
      expect(artifact.dueDate <= phase.end).toBe(true)
      expect(workingDates.has(artifact.dueDate)).toBe(true)
    }
    expect(plan.artifacts.some((a) => a.name === 'Vision Document')).toBe(true)
    expect(plan.artifacts.some((a) => a.name === 'Software Architecture Document')).toBe(true)
  })

  it('seeds a starter backlog attached to the first sprint of each phase', () => {
    expect(plan.backlog.length).toBeGreaterThan(10)
    for (const item of plan.backlog) {
      const phase = plan.phases.find((p) => p.kind === item.phase)!
      expect(phase.sprintIndices[0]).toBe(item.sprintIndex)
    }
  })

  it('is deterministic', () => {
    expect(generatePlan(semesterInput())).toEqual(generatePlan(semesterInput()))
  })
})

describe('generatePlan under pressure', () => {
  it('drops the capacity of a blacked-out sprint without moving any boundary', () => {
    const base = generatePlan(semesterInput())
    const examWeek = ['2026-10-20', '2026-10-22', '2026-10-24'].map((date) => ({
      date,
      kind: 'blackout' as const,
      reason: 'Exam'
    }))
    const withExams = generatePlan(semesterInput({ exceptions: examWeek }))

    expect(withExams.sprints.map((s) => [s.start, s.end])).toEqual(
      base.sprints.map((s) => [s.start, s.end])
    )
    const affected = withExams.sprints.find((s) => s.start <= '2026-10-20' && s.end >= '2026-10-24')!
    const before = base.sprints.find((s) => s.index === affected.index)!
    expect(affected.capacityHours).toBeLessThan(before.capacityHours)
    expect(withExams.totals.availableHours).toBeCloseTo(base.totals.availableHours - 10, 1)
  })

  it('warns and merges phases on a three-week timeline', () => {
    const plan = generatePlan(
      semesterInput({ startDate: '2026-09-07', deadlineDate: '2026-09-27', ectsCredits: 5 })
    )
    expect(plan.sprints.length).toBeLessThan(4)
    expect(plan.warnings.map((w) => w.code)).toContain('phases-merged')
    // Merged phases keep the deliverables of everything they absorbed.
    expect(plan.artifacts.some((a) => a.name === 'Vision Document')).toBe(true)
    expect(plan.artifacts.some((a) => a.name === 'Final Report')).toBe(true)
  })

  it('flags a plan with far too few hours for the credits', () => {
    const plan = generatePlan(
      semesterInput({
        availability: [{ weekday: 6, start: '10:00', end: '12:00' }],
        ectsCredits: 20
      })
    )
    expect(plan.warnings.map((w) => w.code)).toContain('under-budget')
    expect(plan.warnings.map((w) => w.code)).toContain('thin-weeks')
  })

  it('refuses to pretend a plan exists with no availability', () => {
    const plan = generatePlan(semesterInput({ availability: [] }))
    expect(plan.warnings[0]).toMatchObject({ code: 'no-availability', severity: 'error' })
    expect(plan.totals.availableHours).toBe(0)
  })

  it('handles a one-week project without crashing', () => {
    const plan = generatePlan(
      semesterInput({ startDate: '2026-09-07', deadlineDate: '2026-09-13', ectsCredits: 2 })
    )
    expect(plan.sprints).toHaveLength(1)
    expect(plan.phases).toHaveLength(1)
    expect(plan.phases[0].mergedFrom).toHaveLength(4)
    expect(plan.milestones).toHaveLength(1)
    expect(plan.milestones[0].kind).toBe('PR')
  })
})

describe('date helpers', () => {
  it('is immune to the host timezone', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDays('2026-09-07', '2026-12-18')).toBe(102)
    expect(inclusiveDays('2026-09-07', '2026-12-18')).toBe(103)
  })

  it('finds the start of the week for both Monday and Sunday conventions', () => {
    expect(startOfWeek('2026-09-10', 1)).toBe('2026-09-07')
    expect(startOfWeek('2026-09-10', 0)).toBe('2026-09-06')
  })
})
