/**
 * Turns the student's weekly availability pattern plus one-off exceptions into
 * a concrete list of time slots across the project window.
 *
 * This is the foundation of every honest number in the app: sprint capacity,
 * total available hours and where ceremonies can be placed all derive from it.
 */
import { eachDay, hoursBetween, minutesOf, round2, timeStrOf, weekdayOf } from '../dates'
import type { AvailabilityRule, DateStr, ExceptionDay, TimeSlot } from '../types'
import { normalize, subtract, union, type Range } from './intervals'

export interface ExpandOptions {
  from: DateStr
  to: DateStr
  rules: AvailabilityRule[]
  exceptions: ExceptionDay[]
}

const FULL_DAY: Range = { start: 0, end: 24 * 60 }

function toRange(start: string, end: string): Range {
  return { start: minutesOf(start), end: minutesOf(end) }
}

function slotsFromRanges(date: DateStr, ranges: Range[]): TimeSlot[] {
  return ranges.map((r) => {
    const start = timeStrOf(r.start)
    const end = timeStrOf(r.end)
    return { date, start, end, hours: round2(hoursBetween(start, end)) }
  })
}

/**
 * Expand `[from, to]` into concrete slots.
 *
 * Order of operations per day: weekly rules -> add `extra` exceptions ->
 * remove `blackout` exceptions. Blackouts win, so "I can normally work
 * Tuesday evenings, but I have an exam that Tuesday" behaves as expected even
 * if an `extra` was also added that day.
 */
export function expandAvailability({ from, to, rules, exceptions }: ExpandOptions): TimeSlot[] {
  const byDate = new Map<DateStr, ExceptionDay[]>()
  for (const ex of exceptions) {
    const list = byDate.get(ex.date) ?? []
    list.push(ex)
    byDate.set(ex.date, list)
  }

  const rulesByWeekday = new Map<number, Range[]>()
  for (const rule of rules) {
    const list = rulesByWeekday.get(rule.weekday) ?? []
    list.push(toRange(rule.start, rule.end))
    rulesByWeekday.set(rule.weekday, list)
  }

  const slots: TimeSlot[] = []
  for (const date of eachDay(from, to)) {
    let ranges = normalize(rulesByWeekday.get(weekdayOf(date)) ?? [])
    const dayExceptions = byDate.get(date) ?? []

    const extras = dayExceptions
      .filter((e) => e.kind === 'extra')
      .map((e) => toRange(e.start ?? '00:00', e.end ?? '24:00'))
    if (extras.length) ranges = union(ranges, extras)

    const blackouts = dayExceptions
      .filter((e) => e.kind === 'blackout')
      .map((e) => (e.start && e.end ? toRange(e.start, e.end) : FULL_DAY))
    if (blackouts.length) ranges = subtract(ranges, blackouts)

    slots.push(...slotsFromRanges(date, ranges))
  }
  return slots
}

export function slotsWithin(slots: TimeSlot[], start: DateStr, end: DateStr): TimeSlot[] {
  return slots.filter((s) => s.date >= start && s.date <= end)
}

export function totalHours(slots: TimeSlot[]): number {
  return round2(slots.reduce((sum, s) => sum + s.hours, 0))
}

export function workingDays(slots: TimeSlot[]): number {
  return new Set(slots.map((s) => s.date)).size
}

/** Hours grouped by ISO date, for the "weeks with no availability" check and charts. */
export function hoursByDate(slots: TimeSlot[]): Map<DateStr, number> {
  const map = new Map<DateStr, number>()
  for (const s of slots) map.set(s.date, round2((map.get(s.date) ?? 0) + s.hours))
  return map
}
