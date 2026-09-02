/**
 * Sanity checks on a generated plan.
 *
 * These are surfaced as warnings rather than thrown, because a student with an
 * unrealistic timeline still needs to see the plan - they just need to be told
 * the truth about it.
 */
import { addDays, eachDay, inclusiveDays, round2, startOfWeek } from '../dates'
import type {
  GeneratedPlan,
  PlanInput,
  PlannedSprint,
  PlanWarning,
  TimeSlot
} from '../types'
import { hoursByDate } from './availability'

/** European norm: one ECTS credit is about 27 hours of student work. */
export const HOURS_PER_ECTS = 27

export interface ValidateContext {
  input: PlanInput
  slots: TimeSlot[]
  sprints: PlannedSprint[]
  totals: GeneratedPlan['totals']
}

export function validatePlan({ input, slots, sprints, totals }: ValidateContext): PlanWarning[] {
  const warnings: PlanWarning[] = []

  if (input.deadlineDate < input.startDate) {
    warnings.push({
      code: 'inverted-range',
      severity: 'error',
      message: 'The deadline is before the start date.'
    })
    return warnings
  }

  if (input.availability.length === 0) {
    warnings.push({
      code: 'no-availability',
      severity: 'error',
      message: 'No weekly working time is defined, so the plan has no capacity at all.',
      hint: 'Add at least one weekly slot in Setup.'
    })
    return warnings
  }

  if (sprints.length === 0) {
    warnings.push({
      code: 'no-sprints',
      severity: 'error',
      message: 'The timeline is too short to contain a single sprint.'
    })
    return warnings
  }

  // Effort budget against the course size.
  if (input.ectsCredits && input.ectsCredits > 0) {
    const expected = input.ectsCredits * HOURS_PER_ECTS
    if (totals.netHours < expected * 0.75) {
      warnings.push({
        code: 'under-budget',
        severity: 'warning',
        message: `You have ${totals.netHours} h of working time planned, but ${input.ectsCredits} ECTS normally implies around ${expected} h.`,
        hint: 'Add weekly slots, start earlier, or agree a smaller scope with your supervisor.'
      })
    } else if (totals.netHours > expected * 1.6) {
      warnings.push({
        code: 'over-budget',
        severity: 'info',
        message: `You have planned ${totals.netHours} h against an expected ${expected} h for ${input.ectsCredits} ECTS.`,
        hint: 'Comfortable buffer - or a sign the availability grid is more optimistic than your real week.'
      })
    }
  }

  if (totals.averageHoursPerWeek < 4) {
    warnings.push({
      code: 'thin-weeks',
      severity: 'warning',
      message: `An average of ${totals.averageHoursPerWeek} h per week is very little to keep momentum on a project.`,
      hint: 'Two or three fixed sessions a week beat one long catch-up day.'
    })
  } else if (totals.averageHoursPerWeek > 45) {
    warnings.push({
      code: 'unrealistic-weeks',
      severity: 'info',
      message: `${totals.averageHoursPerWeek} h per week is close to a full-time job on top of your studies.`,
      hint: 'Plans built on optimistic availability tend to slip in week 4.'
    })
  }

  // Weeks with no availability at all.
  const byDate = hoursByDate(slots)
  const weekTotals = new Map<string, number>()
  for (const date of eachDay(input.startDate, input.deadlineDate)) {
    const key = startOfWeek(date, input.weekStartsOn)
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + (byDate.get(date) ?? 0))
  }
  const emptyWeeks = [...weekTotals.entries()].filter(([, hours]) => hours === 0).map(([key]) => key)
  if (emptyWeeks.length > 0) {
    const shown = emptyWeeks.slice(0, 3).join(', ')
    warnings.push({
      code: 'empty-weeks',
      severity: 'warning',
      message: `${emptyWeeks.length} week${emptyWeeks.length === 1 ? '' : 's'} in the timeline have no working time (from ${shown}${emptyWeeks.length > 3 ? ', ...' : ''}).`,
      hint: 'Fine if those are holidays or exam weeks - the plan already routes work around them.'
    })
  }

  // Sprints that cannot hold any real work.
  for (const sprint of sprints) {
    if (sprint.netCapacityHours <= 0) {
      warnings.push({
        code: 'empty-sprint',
        severity: 'warning',
        message: `${sprint.name} (${sprint.start} to ${sprint.end}) has no working time left after ceremonies.`,
        hint: 'Consider merging it with a neighbour by using a longer sprint length.'
      })
    } else if (sprint.netCapacityHours < 4) {
      warnings.push({
        code: 'thin-sprint',
        severity: 'info',
        message: `${sprint.name} only has ${sprint.netCapacityHours} h of build time.`,
        hint: 'Plan a single small goal for it rather than a full sprint of work.'
      })
    }
  }

  // Fixed deadlines outside the project window, or after the planned end.
  for (const deadline of input.deadlines) {
    if (deadline.date < input.startDate || deadline.date > input.deadlineDate) {
      warnings.push({
        code: 'deadline-outside-window',
        severity: 'warning',
        message: `"${deadline.title}" on ${deadline.date} falls outside the project timeline.`,
        hint: 'Move the project start or end so the plan covers it.'
      })
    }
  }

  // A transition phase with no slack is the classic student failure mode.
  const transitionSprints = sprints.filter((s) => s.phase === 'transition')
  if (transitionSprints.length > 0) {
    const transitionDays = transitionSprints.reduce((sum, s) => sum + s.days, 0)
    const totalDays = inclusiveDays(input.startDate, input.deadlineDate)
    if (transitionDays / totalDays < 0.06) {
      warnings.push({
        code: 'thin-transition',
        severity: 'warning',
        message: `Only ${transitionDays} day${transitionDays === 1 ? '' : 's'} are reserved for Transition (report, packaging, rehearsal).`,
        hint: 'Raise the Transition ratio in Setup - finishing always takes longer than expected.'
      })
    }
  }

  // The plan should reach the deadline, not stop short of it.
  const lastSprint = sprints[sprints.length - 1]
  if (lastSprint.end < input.deadlineDate) {
    warnings.push({
      code: 'plan-stops-early',
      severity: 'info',
      message: `The last sprint ends on ${lastSprint.end}, ${inclusiveDays(addDays(lastSprint.end, 1), input.deadlineDate)} day(s) before the deadline.`
    })
  }

  return warnings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}

function severityRank(severity: PlanWarning['severity']): number {
  return severity === 'error' ? 2 : severity === 'warning' ? 1 : 0
}

export function summariseHours(slots: TimeSlot[]): number {
  return round2(slots.reduce((sum, s) => sum + s.hours, 0))
}
