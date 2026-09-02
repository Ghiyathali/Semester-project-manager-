/**
 * Calendar export.
 *
 * Times are written as *floating* local times - no timezone, no UTC conversion.
 * That matches how the plan is built (see the note in `core/types.ts`): "Tuesday
 * 18:00" should stay 18:00 in whatever calendar the student imports it into.
 */
import { createEvents, type DateArray, type EventAttributes } from 'ics'

import { generatePlan } from '@core/scheduler/generatePlan'
import { addDays } from '@core/dates'
import { CEREMONY_LABEL, PHASE_LABEL, type DateStr, type TimeStr } from '@core/types'
import type { ProjectSnapshot } from '@shared/models'

function dateParts(date: DateStr): DateArray {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

function dateTimeParts(date: DateStr, time: TimeStr): DateArray {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return [y, m, d, h, min]
}

export interface IcsOptions {
  includeWorkSlots: boolean
}

export function buildIcs(snapshot: ProjectSnapshot, options: IcsOptions): string {
  const { project } = snapshot
  const events: EventAttributes[] = []
  const common = {
    calName: `${project.name} - project plan`,
    productId: 'semester-project-manager',
    startInputType: 'local' as const,
    startOutputType: 'local' as const,
    endInputType: 'local' as const,
    endOutputType: 'local' as const
  }

  for (const ceremony of snapshot.ceremonies) {
    events.push({
      ...common,
      uid: `ceremony-${ceremony.id}@semester-project-manager`,
      title: ceremony.title,
      description: ceremony.notes,
      categories: [CEREMONY_LABEL[ceremony.kind] ?? 'Ceremony'],
      start: dateTimeParts(ceremony.date, ceremony.start),
      end: dateTimeParts(ceremony.date, ceremony.end),
      status: ceremony.done ? 'CONFIRMED' : 'TENTATIVE'
    })
  }

  for (const milestone of snapshot.milestones) {
    events.push({
      ...common,
      uid: `milestone-${milestone.id}@semester-project-manager`,
      title: `Milestone: ${milestone.name}`,
      description: `${PHASE_LABEL[milestone.phaseKind] ?? ''} gate. ${milestone.description}`.trim(),
      categories: ['UP milestone'],
      start: dateParts(milestone.date),
      end: dateParts(addDays(milestone.date, 1))
    })
  }

  for (const artifact of snapshot.artifacts) {
    events.push({
      ...common,
      uid: `artifact-${artifact.id}@semester-project-manager`,
      title: `Due: ${artifact.name}`,
      description: artifact.description,
      categories: ['UP deliverable'],
      start: dateParts(artifact.dueDate),
      end: dateParts(addDays(artifact.dueDate, 1))
    })
  }

  for (const deadline of snapshot.deadlines) {
    events.push({
      ...common,
      uid: `deadline-${deadline.id}@semester-project-manager`,
      title: `${deadline.isHard ? 'DEADLINE' : 'Deadline'}: ${deadline.title}`,
      description: deadline.notes,
      categories: ['Deadline'],
      start: dateParts(deadline.date),
      end: dateParts(addDays(deadline.date, 1))
    })
  }

  if (options.includeWorkSlots) {
    // Free slots are the availability that ceremonies did not already claim, so
    // importing both never produces a double-booked calendar.
    const plan = generatePlan(planInputFrom(snapshot))
    plan.freeSlots.forEach((slot, index) => {
      events.push({
        ...common,
        uid: `slot-${project.id}-${index}@semester-project-manager`,
        title: `Work on ${project.name}`,
        categories: ['Project work'],
        start: dateTimeParts(slot.date, slot.start),
        end: dateTimeParts(slot.date, slot.end),
        transp: 'TRANSPARENT'
      })
    })
  }

  const { error, value } = createEvents(events)
  if (error) throw error
  return value ?? ''
}

function planInputFrom(snapshot: ProjectSnapshot) {
  const { project } = snapshot
  return {
    startDate: project.startDate,
    deadlineDate: project.deadlineDate,
    sprintLengthDays: project.sprintLengthDays,
    weekStartsOn: project.weekStartsOn,
    alignSprintsToWeek: project.alignSprintsToWeek,
    phaseRatios: project.phaseRatios,
    includeDailyStandup: project.includeDailyStandup,
    availability: snapshot.availability.map((a) => ({
      weekday: a.weekday,
      start: a.start,
      end: a.end
    })),
    exceptions: snapshot.exceptions.map((e) => ({
      date: e.date,
      kind: e.kind,
      start: e.start ?? undefined,
      end: e.end ?? undefined,
      reason: e.reason
    })),
    deadlines: snapshot.deadlines.map((d) => ({
      title: d.title,
      date: d.date,
      kind: d.kind,
      isHard: d.isHard
    })),
    ectsCredits: project.ectsCredits ?? undefined
  }
}
