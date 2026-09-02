/**
 * Cuts the project window into sprints.
 *
 * Rules, in order:
 *  1. The first sprint starts on the project start date.
 *  2. If sprints are week-aligned and the length is a whole number of weeks,
 *     the first sprint is trimmed so that every later sprint begins on the
 *     configured week start - unless that lead-in would be shorter than three
 *     days, in which case it is absorbed into the first full sprint instead.
 *  3. A trailing remainder shorter than half a sprint is merged into the
 *     previous sprint rather than left as a stub.
 */
import { addDays, inclusiveDays, minDate, nextWeekdayOnOrAfter } from '../dates'
import type { DateStr, SprintWindow } from '../types'

export interface CutSprintsOptions {
  start: DateStr
  deadline: DateStr
  sprintLengthDays: number
  weekStartsOn: number
  alignToWeek: boolean
}

/** Below this the lead-in sprint is not worth having on its own. */
const MIN_LEAD_IN_DAYS = 3

export function cutSprints({
  start,
  deadline,
  sprintLengthDays,
  weekStartsOn,
  alignToWeek
}: CutSprintsOptions): SprintWindow[] {
  const length = Math.max(1, Math.round(sprintLengthDays))
  if (deadline < start) return []

  const bounds: Array<{ start: DateStr; end: DateStr }> = []
  let cursor = start

  if (alignToWeek && length % 7 === 0) {
    const nextStart = nextWeekdayOnOrAfter(start, weekStartsOn)
    if (nextStart !== start) {
      const leadIn = inclusiveDays(start, addDays(nextStart, -1))
      if (leadIn >= MIN_LEAD_IN_DAYS) {
        // Short opening sprint that ends the day before the next week start.
        bounds.push({ start, end: minDate(addDays(nextStart, -1), deadline) })
        cursor = nextStart
      } else {
        // Too short to stand alone: glue it onto the first full sprint.
        const end = minDate(addDays(nextStart, length - 1), deadline)
        bounds.push({ start, end })
        cursor = addDays(end, 1)
      }
    }
  }

  while (cursor <= deadline) {
    const end = minDate(addDays(cursor, length - 1), deadline)
    bounds.push({ start: cursor, end })
    cursor = addDays(end, 1)
  }

  // Absorb a stub final sprint into its predecessor.
  if (bounds.length > 1) {
    const last = bounds[bounds.length - 1]
    if (inclusiveDays(last.start, last.end) < length / 2) {
      bounds[bounds.length - 2].end = last.end
      bounds.pop()
    }
  }

  return bounds.map((b, i) => ({
    index: i,
    start: b.start,
    end: b.end,
    days: inclusiveDays(b.start, b.end)
  }))
}

export function sprintContaining(sprints: SprintWindow[], date: DateStr): SprintWindow | undefined {
  return sprints.find((s) => date >= s.start && date <= s.end)
}
