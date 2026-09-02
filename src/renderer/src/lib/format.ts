/** Display helpers. Everything here is presentation only. */
import { parseDate } from '@core/dates'
import type { DateStr } from '@core/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayName(weekday: number, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[((weekday % 7) + 7) % 7]
}

/** `Mon 7 Sep` - short enough for a table, unambiguous enough for a plan. */
export function formatDate(date: DateStr, options: Intl.DateTimeFormatOptions = {}): string {
  return parseDate(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...options
  })
}

export function formatDateLong(date: DateStr): string {
  return formatDate(date, { year: 'numeric' })
}

export function formatRange(start: DateStr, end: DateStr): string {
  return `${formatDate(start)} - ${formatDate(end)}`
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '-'
  const rounded = Math.round(hours * 10) / 10
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} h`
}

export function formatPoints(points: number): string {
  const rounded = Math.round(points * 10) / 10
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "in 12 days" / "3 days ago" / "today" */
export function relativeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}
