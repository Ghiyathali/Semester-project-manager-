/**
 * The planner.
 *
 * Given a start date, a deadline and an honest description of when the student
 * can work, produce a complete SCRUM-inside-UP plan laid out on real calendar
 * dates: phases, sprints, ceremonies in actual free slots, gate milestones,
 * deliverable due dates and a starter backlog.
 *
 * Pure and deterministic - the same input always yields the same plan, which is
 * what makes it testable and what makes "re-plan" show a meaningful diff.
 */
import { addDays, inclusiveDays, maxDate, round2 } from '../dates'
import { ARTIFACT_TEMPLATES, BACKLOG_TEMPLATES, PHASE_GOALS } from '../up/templates'
import {
  MILESTONE_META,
  PHASE_LABEL,
  type DateStr,
  type GeneratedPlan,
  type MilestoneKind,
  type PhaseKind,
  type PlanInput,
  type PlannedArtifact,
  type PlannedBacklogItem,
  type PlannedCeremony,
  type PlannedMilestone,
  type PlannedPhase,
  type PlannedSprint,
  type PlanWarning
} from '../types'
import { expandAvailability, slotsWithin, totalHours, workingDays } from './availability'
import { ceremonyHoursIn, placeCeremonies } from './ceremonies'
import { allocatePhases } from './phases'
import { cutSprints } from './sprints'
import { SlotBook } from './slotbook'
import { validatePlan } from './validate'

const GATE_BY_PHASE: Record<PhaseKind, Exclude<MilestoneKind, 'custom'>> = {
  inception: 'LCO',
  elaboration: 'LCA',
  construction: 'IOC',
  transition: 'PR'
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const slots = expandAvailability({
    from: input.startDate,
    to: input.deadlineDate,
    rules: input.availability,
    exceptions: input.exceptions
  })

  const sprintWindows = cutSprintWindows(input)
  const { allocations, phaseBySprint, warnings: phaseWarnings } = allocatePhases(
    sprintWindows,
    input.phaseRatios
  )

  // Sprints that close a phase get a gate review booked before the retrospective.
  const phaseGateSprints = new Map<number, string>()
  for (const allocation of allocations) {
    const last = allocation.sprintIndices[allocation.sprintIndices.length - 1]
    if (last !== undefined) phaseGateSprints.set(last, PHASE_LABEL[allocation.kind])
  }

  const book = new SlotBook(slots)
  const ceremonies: PlannedCeremony[] = []
  const warnings: PlanWarning[] = [...phaseWarnings]

  for (const window of sprintWindows) {
    const result = placeCeremonies(window, book, {
      includeDailyStandup: input.includeDailyStandup,
      phaseGateSprints
    })
    ceremonies.push(...result.ceremonies)
    warnings.push(...result.warnings)
  }
  ceremonies.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  const sprints: PlannedSprint[] = sprintWindows.map((window) => {
    const phase = phaseBySprint.get(window.index) ?? 'construction'
    const within = slotsWithin(slots, window.start, window.end)
    const capacityHours = totalHours(within)
    const overhead = ceremonyHoursIn(ceremonies, window.start, window.end)
    const allocation = allocations.find((a) => a.sprintIndices.includes(window.index))
    const isLastOfPhase =
      allocation?.sprintIndices[allocation.sprintIndices.length - 1] === window.index
    const isFirstOfPhase = allocation?.sprintIndices[0] === window.index

    return {
      ...window,
      phase,
      name: `Sprint ${window.index + 1}`,
      goal: sprintGoal(phase, isFirstOfPhase, isLastOfPhase),
      capacityHours,
      ceremonyHours: overhead,
      netCapacityHours: round2(Math.max(0, capacityHours - overhead)),
      workingDays: workingDays(within)
    }
  })

  const phases: PlannedPhase[] = allocations.map((allocation) => {
    const within = slotsWithin(slots, allocation.start, allocation.end)
    return {
      kind: allocation.kind,
      mergedFrom: allocation.members,
      start: allocation.start,
      end: allocation.end,
      sprintIndices: allocation.sprintIndices,
      goal: allocation.members.map((m) => PHASE_GOALS[m]).join(' '),
      capacityHours: totalHours(within)
    }
  })

  const workingDates = new Set(slots.map((s) => s.date))
  const milestones: PlannedMilestone[] = []
  const artifacts: PlannedArtifact[] = []
  const backlog: PlannedBacklogItem[] = []

  for (const phase of phases) {
    // The gate belongs to the last UP phase folded into this allocation.
    const lastMember = phase.mergedFrom[phase.mergedFrom.length - 1]
    const gateKind = GATE_BY_PHASE[lastMember]
    const meta = MILESTONE_META[gateKind]
    const absorbed = phase.mergedFrom
      .slice(0, -1)
      .map((m) => MILESTONE_META[GATE_BY_PHASE[m]].name)

    milestones.push({
      kind: gateKind,
      name: `${gateKind} - ${meta.name}`,
      phase: phase.kind,
      date: phase.end,
      description: absorbed.length
        ? `${meta.question} (also covers ${absorbed.join(', ')}, merged into this phase.)`
        : meta.question
    })

    for (const member of phase.mergedFrom) {
      for (const template of ARTIFACT_TEMPLATES[member]) {
        const ideal = addDays(phase.end, -template.dueBeforeGateDays)
        artifacts.push({
          name: template.name,
          phase: phase.kind,
          discipline: template.discipline,
          dueDate: snapToWorkingDay(maxDate(ideal, phase.start), phase.start, workingDates),
          description: template.description,
          optional: template.optional
        })
      }

      const firstSprint = phase.sprintIndices[0] ?? null
      for (const template of BACKLOG_TEMPLATES[member]) {
        backlog.push({
          title: template.title,
          description: template.description,
          type: template.type,
          discipline: template.discipline,
          points: template.points,
          estimateHours: template.estimateHours,
          phase: phase.kind,
          sprintIndex: firstSprint
        })
      }
    }
  }

  artifacts.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  milestones.sort((a, b) => a.date.localeCompare(b.date))

  const availableHours = totalHours(slots)
  const ceremonyHours = round2(ceremonies.reduce((sum, c) => sum + c.minutes, 0) / 60)
  const calendarDays = Math.max(0, inclusiveDays(input.startDate, input.deadlineDate))
  const calendarWeeks = round2(calendarDays / 7)
  const netHours = round2(Math.max(0, availableHours - ceremonyHours))

  const totals = {
    availableHours,
    ceremonyHours,
    netHours,
    calendarDays,
    calendarWeeks,
    workingDays: workingDays(slots),
    sprintCount: sprints.length,
    averageHoursPerWeek: calendarWeeks > 0 ? round2(availableHours / calendarWeeks) : 0
  }

  warnings.push(...validatePlan({ input, slots, sprints, totals }))

  return {
    input,
    slots,
    freeSlots: book.remainingSlots(),
    phases,
    sprints,
    ceremonies,
    milestones,
    artifacts,
    backlog,
    totals,
    warnings: dedupeWarnings(warnings)
  }
}

function sprintGoal(phase: PhaseKind, isFirst: boolean, isLast: boolean): string {
  if (isLast) {
    const gate = GATE_BY_PHASE[phase]
    return `Close ${PHASE_LABEL[phase]} and pass the ${gate} gate: ${MILESTONE_META[gate].question}`
  }
  if (isFirst) return `Start ${PHASE_LABEL[phase]}. ${PHASE_GOALS[phase]}`
  return `Continue ${PHASE_LABEL[phase]}. ${PHASE_GOALS[phase]}`
}

/**
 * Pull a due date back to the nearest earlier day the student actually works,
 * so deliverables never fall due on a day with no time to finish them.
 */
function snapToWorkingDay(date: DateStr, floor: DateStr, workingDates: Set<DateStr>): DateStr {
  if (workingDates.size === 0) return date
  let cursor = date
  for (let i = 0; i < 60 && cursor >= floor; i++) {
    if (workingDates.has(cursor)) return cursor
    cursor = addDays(cursor, -1)
  }
  return date
}

function cutSprintWindows(input: PlanInput) {
  return cutSprints({
    start: input.startDate,
    deadline: input.deadlineDate,
    sprintLengthDays: input.sprintLengthDays,
    weekStartsOn: input.weekStartsOn,
    alignToWeek: input.alignSprintsToWeek
  })
}

function dedupeWarnings(warnings: PlanWarning[]): PlanWarning[] {
  const seen = new Set<string>()
  const out: PlanWarning[] = []
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(warning)
  }
  return out.sort((a, b) => rank(b.severity) - rank(a.severity))
}

function rank(severity: PlanWarning['severity']): number {
  return severity === 'error' ? 2 : severity === 'warning' ? 1 : 0
}
