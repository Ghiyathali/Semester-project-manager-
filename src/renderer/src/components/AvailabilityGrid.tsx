/**
 * The weekly availability grid.
 *
 * Click or drag to paint the half-hours you can actually work. This is the
 * single most important input in the app: every capacity number, every sprint
 * commitment and every ceremony slot is derived from what gets painted here, so
 * it is worth being pessimistic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { minutesOf, timeStrOf } from '@core/dates'
import type { AvailabilityRule } from '@core/types'

import { weekdayName } from '../lib/format'

const SLOT_MINUTES = 30
const DAY_START_MINUTES = 6 * 60
const DAY_END_MINUTES = 24 * 60
const SLOTS_PER_DAY = (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES

type Painted = Set<string>

const keyOf = (weekday: number, slot: number): string => `${weekday}:${slot}`

export function rulesToPainted(rules: AvailabilityRule[]): Painted {
  const painted: Painted = new Set()
  for (const rule of rules) {
    const from = Math.max(DAY_START_MINUTES, minutesOf(rule.start))
    const to = Math.min(DAY_END_MINUTES, minutesOf(rule.end))
    for (let minute = from; minute < to; minute += SLOT_MINUTES) {
      painted.add(keyOf(rule.weekday, (minute - DAY_START_MINUTES) / SLOT_MINUTES))
    }
  }
  return painted
}

/** Merge contiguous painted half-hours back into as few rules as possible. */
export function paintedToRules(painted: Painted): AvailabilityRule[] {
  const rules: AvailabilityRule[] = []
  for (let weekday = 0; weekday < 7; weekday++) {
    let runStart: number | null = null
    for (let slot = 0; slot <= SLOTS_PER_DAY; slot++) {
      const filled = slot < SLOTS_PER_DAY && painted.has(keyOf(weekday, slot))
      if (filled && runStart === null) runStart = slot
      if (!filled && runStart !== null) {
        rules.push({
          weekday,
          start: timeStrOf(DAY_START_MINUTES + runStart * SLOT_MINUTES),
          end: timeStrOf(DAY_START_MINUTES + slot * SLOT_MINUTES)
        })
        runStart = null
      }
    }
  }
  return rules
}

export function paintedHours(painted: Painted): number {
  return (painted.size * SLOT_MINUTES) / 60
}

const PRESETS: Array<{ label: string; build: () => Painted }> = [
  {
    label: 'Weekday evenings',
    build: () => paint([1, 2, 3, 4, 5], '18:00', '21:00')
  },
  {
    label: 'Tue/Thu evenings + Sat morning',
    build: () => {
      const set = paint([2, 4], '18:00', '21:00')
      for (const key of paint([6], '10:00', '14:00')) set.add(key)
      return set
    }
  },
  {
    label: 'Weekend days',
    build: () => paint([0, 6], '10:00', '16:00')
  }
]

function paint(weekdays: number[], start: string, end: string): Painted {
  return rulesToPainted(weekdays.map((weekday) => ({ weekday, start, end })))
}

export function AvailabilityGrid({
  rules,
  onChange
}: {
  rules: AvailabilityRule[]
  onChange: (rules: AvailabilityRule[]) => void
}) {
  const [painted, setPainted] = useState<Painted>(() => rulesToPainted(rules))
  const signature = useMemo(() => JSON.stringify(rules), [rules])
  const lastEmitted = useRef(signature)

  /**
   * Painting is a rubber-band selection anchored on the cell where the drag
   * started, recomputed from a snapshot of the grid on every move. Painting only
   * the cell under the cursor would leave gaps whenever the pointer moves faster
   * than mouseenter fires.
   */
  const drag = useRef<{ weekday: number; slot: number; mode: boolean; base: Painted } | null>(null)

  // Re-sync when the caller swaps in a different rule set (preset, project load).
  useEffect(() => {
    if (signature !== lastEmitted.current) {
      setPainted(rulesToPainted(rules))
      lastEmitted.current = signature
    }
  }, [signature, rules])

  const commit = useCallback(
    (next: Painted) => {
      setPainted(next)
      const nextRules = paintedToRules(next)
      lastEmitted.current = JSON.stringify(nextRules)
      onChange(nextRules)
    },
    [onChange]
  )

  useEffect(() => {
    const stop = () => {
      drag.current = null
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const paintTo = (weekday: number, slot: number) => {
    const anchor = drag.current
    if (!anchor) return
    const next = new Set(anchor.base)
    const [dayFrom, dayTo] = minMax(anchor.weekday, weekday)
    const [slotFrom, slotTo] = minMax(anchor.slot, slot)
    for (let d = dayFrom; d <= dayTo; d++) {
      for (let s = slotFrom; s <= slotTo; s++) {
        if (anchor.mode) next.add(keyOf(d, s))
        else next.delete(keyOf(d, s))
      }
    }
    commit(next)
  }

  const startDrag = (weekday: number, slot: number) => {
    drag.current = {
      weekday,
      slot,
      mode: !painted.has(keyOf(weekday, slot)),
      base: new Set(painted)
    }
    paintTo(weekday, slot)
  }

  const total = paintedHours(painted)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="btn btn-sm"
            onClick={() => commit(preset.build())}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => commit(new Set())}>
          Clear
        </button>
        <span className="ml-auto text-sm tabular-nums text-ink-muted">
          {total.toFixed(1)} h per week
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <div className="min-w-[560px] select-none">
          <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-line bg-surface-sunken">
            <div />
            {Array.from({ length: 7 }, (_, weekday) => (
              <div
                key={weekday}
                className="px-1 py-1.5 text-center text-xs font-medium text-ink-muted"
              >
                {weekdayName(weekday, true)}
              </div>
            ))}
          </div>

          {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => {
            const minutes = DAY_START_MINUTES + slot * SLOT_MINUTES
            const onHour = minutes % 60 === 0
            return (
              <div
                key={slot}
                className={`grid grid-cols-[3.5rem_repeat(7,1fr)] ${
                  onHour ? 'border-t border-line' : ''
                }`}
              >
                <div className="pr-2 text-right text-[10px] leading-4 text-ink-faint">
                  {onHour ? timeStrOf(minutes) : ''}
                </div>
                {Array.from({ length: 7 }, (_, weekday) => {
                  const isOn = painted.has(keyOf(weekday, slot))
                  return (
                    <button
                      key={weekday}
                      type="button"
                      tabIndex={-1}
                      aria-label={`${weekdayName(weekday)} ${timeStrOf(minutes)}`}
                      aria-pressed={isOn}
                      className={`h-4 border-l border-line transition-colors ${
                        isOn ? 'bg-accent/70' : 'bg-surface-raised hover:bg-accent/20'
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        startDrag(weekday, slot)
                      }}
                      onMouseEnter={() => paintTo(weekday, slot)}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Drag to paint the half-hours you can realistically work - dragging across days and times
        fills the whole block. Be honest rather than ambitious: every capacity figure in the app is
        built from this grid.
      </p>
    </div>
  )
}

function minMax(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}
