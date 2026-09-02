/**
 * A mutable view over the student's free time.
 *
 * Ceremonies are booked into real gaps, and the booked minutes disappear from
 * the remaining free time - so a sprint's "net capacity" is genuinely the hours
 * left for building after Scrum overhead, not a number pulled from the air.
 */
import { hoursBetween, round2, timeStrOf } from '../dates'
import type { DateStr, TimeSlot } from '../types'
import { normalize, subtract, totalMinutes, type Range } from './intervals'

export interface Booking {
  date: DateStr
  start: string
  end: string
  minutes: number
}

export interface ReserveOptions {
  /** Refuse to book anything shorter than this when the ideal duration will not fit. */
  minMinutes?: number
}

export class SlotBook {
  private byDate = new Map<DateStr, Range[]>()

  constructor(slots: TimeSlot[]) {
    for (const slot of slots) {
      const [sh, sm] = slot.start.split(':').map(Number)
      const [eh, em] = slot.end.split(':').map(Number)
      const list = this.byDate.get(slot.date) ?? []
      list.push({ start: sh * 60 + sm, end: eh * 60 + em })
      this.byDate.set(slot.date, list)
    }
    for (const [date, ranges] of this.byDate) this.byDate.set(date, normalize(ranges))
  }

  /** Dates that still have free time, ascending. */
  activeDates(from?: DateStr, to?: DateStr): DateStr[] {
    return [...this.byDate.entries()]
      .filter(([date, ranges]) => ranges.length > 0 && (!from || date >= from) && (!to || date <= to))
      .map(([date]) => date)
      .sort()
  }

  freeMinutes(from?: DateStr, to?: DateStr): number {
    let sum = 0
    for (const [date, ranges] of this.byDate) {
      if (from && date < from) continue
      if (to && date > to) continue
      sum += totalMinutes(ranges)
    }
    return sum
  }

  private book(date: DateStr, start: number, end: number): Booking {
    const ranges = this.byDate.get(date) ?? []
    this.byDate.set(date, subtract(ranges, [{ start, end }]))
    return {
      date,
      start: timeStrOf(start),
      end: timeStrOf(end),
      minutes: end - start
    }
  }

  /**
   * Book `minutes` at the earliest point in `[from, to]` that can hold it,
   * anchored to the start of the chosen gap.
   */
  reserveEarliest(
    from: DateStr,
    to: DateStr,
    minutes: number,
    { minMinutes = 15 }: ReserveOptions = {}
  ): Booking | null {
    for (const date of this.activeDates(from, to)) {
      const range = (this.byDate.get(date) ?? []).find((r) => r.end - r.start >= minutes)
      if (range) return this.book(date, range.start, range.start + minutes)
    }
    return this.reserveBestEffort(from, to, minutes, minMinutes, 'start')
  }

  /**
   * Book `minutes` at the latest point in `[from, to]` that can hold it,
   * anchored to the end of the chosen gap.
   */
  reserveLatest(
    from: DateStr,
    to: DateStr,
    minutes: number,
    { minMinutes = 15 }: ReserveOptions = {}
  ): Booking | null {
    for (const date of this.activeDates(from, to).reverse()) {
      const ranges = [...(this.byDate.get(date) ?? [])].reverse()
      const range = ranges.find((r) => r.end - r.start >= minutes)
      if (range) return this.book(date, range.end - minutes, range.end)
    }
    return this.reserveBestEffort(from, to, minutes, minMinutes, 'end')
  }

  /** Nothing was big enough: take the largest gap and shrink the booking to fit. */
  private reserveBestEffort(
    from: DateStr,
    to: DateStr,
    minutes: number,
    minMinutes: number,
    anchor: 'start' | 'end'
  ): Booking | null {
    let best: { date: DateStr; range: Range } | null = null
    for (const date of this.activeDates(from, to)) {
      for (const range of this.byDate.get(date) ?? []) {
        const size = range.end - range.start
        if (size < minMinutes) continue
        if (!best || size > best.range.end - best.range.start) best = { date, range }
      }
    }
    if (!best) return null
    const size = Math.min(minutes, best.range.end - best.range.start)
    return anchor === 'start'
      ? this.book(best.date, best.range.start, best.range.start + size)
      : this.book(best.date, best.range.end - size, best.range.end)
  }

  /** What is left after all bookings, back in `TimeSlot` form. */
  remainingSlots(): TimeSlot[] {
    const out: TimeSlot[] = []
    for (const date of [...this.byDate.keys()].sort()) {
      for (const range of this.byDate.get(date) ?? []) {
        const start = timeStrOf(range.start)
        const end = timeStrOf(range.end)
        out.push({ date, start, end, hours: round2(hoursBetween(start, end)) })
      }
    }
    return out
  }
}
