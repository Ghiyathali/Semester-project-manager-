/**
 * Places Scrum ceremonies into the student's actual free time.
 *
 * Durations scale with sprint length (the Scrum Guide's timeboxes are written
 * for a one-month sprint and a full team; a solo two-week sprint needs less),
 * and every ceremony is booked out of the same slot book the capacity numbers
 * come from, so overhead is never counted twice.
 */
import { CEREMONY_LABEL } from '../types'
import type { DateStr, PlannedCeremony, PlanWarning, SprintWindow } from '../types'
import type { Booking, SlotBook } from './slotbook'

export interface CeremonyOptions {
  includeDailyStandup: boolean
  /** Sprint indices that close a UP phase and therefore get a gate review. */
  phaseGateSprints: Map<number, string>
}

const DAILY_MINUTES = 15
const GATE_MINUTES = 60

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

/** Timeboxes for a solo student, scaled from a two-week baseline. */
export function ceremonyMinutes(sprintDays: number): {
  planning: number
  review: number
  retrospective: number
} {
  const scale = sprintDays / 14
  return {
    planning: clamp(90 * scale, 45, 180),
    review: clamp(60 * scale, 30, 120),
    retrospective: clamp(45 * scale, 20, 90)
  }
}

function toCeremony(
  booking: Booking,
  kind: PlannedCeremony['kind'],
  sprintIndex: number | null,
  title: string,
  notes: string
): PlannedCeremony {
  return {
    kind,
    sprintIndex,
    date: booking.date,
    start: booking.start,
    end: booking.end,
    minutes: booking.minutes,
    title,
    notes
  }
}

/**
 * Book the ceremonies for one sprint. Bookings happen back-to-front so the
 * closing ceremonies claim the end of the sprint before planning takes the
 * front: gate review, then review + retrospective as one adjacent block, then
 * planning, then the optional daily check-ins on whatever is left.
 */
export function placeCeremonies(
  sprint: SprintWindow,
  book: SlotBook,
  options: CeremonyOptions
): { ceremonies: PlannedCeremony[]; warnings: PlanWarning[] } {
  const ceremonies: PlannedCeremony[] = []
  const warnings: PlanWarning[] = []
  const box = ceremonyMinutes(sprint.days)
  const label = `Sprint ${sprint.index + 1}`

  const gatePhase = options.phaseGateSprints.get(sprint.index)
  if (gatePhase) {
    const booking = book.reserveLatest(sprint.start, sprint.end, GATE_MINUTES, { minMinutes: 30 })
    if (booking) {
      ceremonies.push(
        toCeremony(
          booking,
          'phase-gate',
          sprint.index,
          `${gatePhase} gate review`,
          'Check the phase objectives against the evidence, then decide: proceed, adjust scope, or repeat.'
        )
      )
    }
  }

  // One block for review + retrospective keeps them adjacent, as in a real sprint.
  const closingMinutes = box.review + box.retrospective
  const closing = book.reserveLatest(sprint.start, sprint.end, closingMinutes, { minMinutes: 30 })
  if (closing) {
    const splitAt = Math.round((closing.minutes * box.review) / closingMinutes)
    const reviewEnd = addMinutesToTime(closing.start, splitAt)
    ceremonies.push(
      toCeremony(
        { ...closing, end: reviewEnd, minutes: splitAt },
        'review',
        sprint.index,
        `${label} Review`,
        'Demo what is actually done against the sprint goal. Update the backlog with what you learned.'
      )
    )
    ceremonies.push(
      toCeremony(
        { ...closing, start: reviewEnd, minutes: closing.minutes - splitAt },
        'retrospective',
        sprint.index,
        `${label} Retrospective`,
        'What helped, what got in the way, one concrete change for the next sprint.'
      )
    )
  } else {
    warnings.push({
      code: 'no-room-for-review',
      severity: 'warning',
      message: `${label} has no free time left for a review and retrospective.`,
      hint: 'Add availability in that sprint, or make the sprint longer.'
    })
  }

  const planning = book.reserveEarliest(sprint.start, sprint.end, box.planning, { minMinutes: 30 })
  if (planning) {
    ceremonies.push(
      toCeremony(
        planning,
        'planning',
        sprint.index,
        `${label} Planning`,
        'Pick a sprint goal, then pull only as many items as the net capacity supports.'
      )
    )
  } else {
    warnings.push({
      code: 'no-room-for-planning',
      severity: 'warning',
      message: `${label} has no free time for sprint planning.`,
      hint: 'Add availability at the start of that sprint.'
    })
  }

  if (options.includeDailyStandup) {
    for (const date of book.activeDates(sprint.start, sprint.end)) {
      const booking = book.reserveEarliest(date, date, DAILY_MINUTES, { minMinutes: 10 })
      if (booking) {
        ceremonies.push(
          toCeremony(
            booking,
            'daily',
            sprint.index,
            'Daily check-in',
            'Yesterday, today, blockers. Working alone this is a two-minute note to yourself.'
          )
        )
      }
    }
  }

  ceremonies.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  return { ceremonies, warnings }
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function ceremonyHoursIn(
  ceremonies: PlannedCeremony[],
  start: DateStr,
  end: DateStr
): number {
  const minutes = ceremonies
    .filter((c) => c.date >= start && c.date <= end)
    .reduce((sum, c) => sum + c.minutes, 0)
  return Math.round((minutes / 60) * 100) / 100
}

export { CEREMONY_LABEL }
