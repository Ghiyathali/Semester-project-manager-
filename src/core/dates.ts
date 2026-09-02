/**
 * Pure calendar helpers over `YYYY-MM-DD` / `HH:MM` strings.
 *
 * All arithmetic goes through UTC-midnight `Date` objects so that the host
 * machine's timezone can never shift a date by a day. Nothing here is
 * timezone-aware on purpose - see the note in `types.ts`.
 */
import type { DateStr, TimeStr } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export const MS_PER_DAY = 86_400_000

export function isDateStr(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(parseDate(value).getTime())
}

export function isTimeStr(value: string): boolean {
  return TIME_RE.test(value)
}

/** Parse `YYYY-MM-DD` into a Date pinned at UTC midnight. */
export function parseDate(date: DateStr): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

export function toDateStr(date: Date): DateStr {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Today's date in the *host's* local timezone, as a date string. */
export function todayStr(now: Date = new Date()): DateStr {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: DateStr, days: number): DateStr {
  return toDateStr(new Date(parseDate(date).getTime() + days * MS_PER_DAY))
}

/** Whole days from `a` to `b`. Negative when `b` precedes `a`. */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_PER_DAY)
}

/** Inclusive day count of the range `[a, b]`. */
export function inclusiveDays(a: DateStr, b: DateStr): number {
  return diffDays(a, b) + 1
}

/** 0 = Sunday .. 6 = Saturday */
export function weekdayOf(date: DateStr): number {
  return parseDate(date).getUTCDay()
}

export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b
}

export function isAfter(a: DateStr, b: DateStr): boolean {
  return a > b
}

export function isWithin(date: DateStr, start: DateStr, end: DateStr): boolean {
  return date >= start && date <= end
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a <= b ? a : b
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a >= b ? a : b
}

/** Every date in `[from, to]`, inclusive. Empty when the range is inverted. */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  if (from > to) return out
  let cursor = from
  // Guard against pathological ranges (a plan should never span >10 years).
  for (let i = 0; cursor <= to && i < 4000; i++) {
    out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
}

/** The most recent `weekStartsOn` weekday on or before `date`. */
export function startOfWeek(date: DateStr, weekStartsOn: number): DateStr {
  const delta = (weekdayOf(date) - weekStartsOn + 7) % 7
  return addDays(date, -delta)
}

/** The next `weekday` strictly after `date`, or `date` itself when it already matches. */
export function nextWeekdayOnOrAfter(date: DateStr, weekday: number): DateStr {
  const delta = (weekday - weekdayOf(date) + 7) % 7
  return addDays(date, delta)
}

/** Stable key for grouping by week, e.g. `2026-W37`. */
export function weekKey(date: DateStr, weekStartsOn: number): string {
  return startOfWeek(date, weekStartsOn)
}

export function minutesOf(time: TimeStr): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function timeStrOf(minutes: number): TimeStr {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(time: TimeStr, minutes: number): TimeStr {
  return timeStrOf(minutesOf(time) + minutes)
}

export function hoursBetween(start: TimeStr, end: TimeStr): number {
  return (minutesOf(end) - minutesOf(start)) / 60
}

/** Round to two decimals - hours are displayed, so avoid float dust. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
