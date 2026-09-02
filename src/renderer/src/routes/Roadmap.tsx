/**
 * The whole project on one timeline: UP phase ribbons, the sprints inside them,
 * weekly capacity, milestones and deadlines, with a line for today.
 *
 * Drawn as plain SVG rather than pulled from a Gantt library - the shape is
 * simple, and it keeps the app free of a heavyweight (and often
 * non-open-source) dependency.
 */
import { useMemo, useState } from 'react'

import { diffDays, eachDay, inclusiveDays, parseDate } from '@core/dates'
import { PHASE_LABEL, type DateStr } from '@core/types'

import { Card, EmptyState, PageHeader, PhaseBadge } from '../components/ui'
import { projectSlots, today, weeklyLoad } from '../lib/derive'
import { formatDate, formatHours, formatRange, pluralise } from '../lib/format'
import { useStore } from '../store/useStore'

const ZOOMS = [
  { label: 'Fit', dayWidth: 0 },
  { label: 'Week', dayWidth: 6 },
  { label: 'Day', dayWidth: 16 }
]

const ROW = {
  months: 0,
  monthsHeight: 18,
  ticks: 20,
  ticksHeight: 14,
  phases: 42,
  phasesHeight: 30,
  sprints: 78,
  sprintsHeight: 28,
  capacity: 114,
  capacityHeight: 40,
  markers: 162,
  markersHeight: 46
}
const CHART_HEIGHT = ROW.markers + ROW.markersHeight

const PHASE_FILL: Record<string, string> = {
  inception: 'rgb(var(--phase-inception))',
  elaboration: 'rgb(var(--phase-elaboration))',
  construction: 'rgb(var(--phase-construction))',
  transition: 'rgb(var(--phase-transition))'
}

export function Roadmap() {
  const snapshot = useStore((state) => state.snapshot)
  const [zoom, setZoom] = useState(0)
  const now = today()

  const model = useMemo(() => {
    if (!snapshot) return null
    const slots = projectSlots(snapshot)
    return { slots, weeks: weeklyLoad(snapshot, slots) }
  }, [snapshot])

  if (!snapshot || !model) return null

  const start = snapshot.project.startDate
  const end = snapshot.project.deadlineDate
  const totalDays = Math.max(1, inclusiveDays(start, end))
  const fitWidth = 1120
  const dayWidth = ZOOMS[zoom].dayWidth || fitWidth / totalDays
  const width = Math.max(fitWidth, totalDays * dayWidth)

  const x = (date: DateStr): number => diffDays(start, date) * dayWidth
  const spanWidth = (from: DateStr, to: DateStr): number =>
    Math.max(2, inclusiveDays(from, to) * dayWidth)

  const months = monthTicks(start, end)
  const maxWeekHours = Math.max(1, ...model.weeks.map((week) => week.plannedHours))

  if (snapshot.sprints.length === 0) {
    return (
      <div>
        <PageHeader title="Roadmap" />
        <Card>
          <EmptyState
            title="No plan yet"
            description="Generate a plan in Setup to see phases, sprints and milestones on a timeline."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Roadmap"
        description={`${formatRange(start, end)} - ${pluralise(snapshot.sprints.length, 'sprint')} across ${pluralise(snapshot.phases.length, 'phase')}.`}
        actions={
          <div className="flex gap-1">
            {ZOOMS.map((option, index) => (
              <button
                key={option.label}
                className={`btn btn-sm ${index === zoom ? 'btn-primary' : ''}`}
                onClick={() => setZoom(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <Card>
        <div className="overflow-x-auto px-4 py-4">
          <svg
            width={width}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
            role="img"
            aria-label="Project timeline"
            className="block"
          >
            {/* Month bands and labels. */}
            {months.map((month, index) => (
              <g key={month.date}>
                <rect
                  x={x(month.date)}
                  y={ROW.ticks}
                  width={spanWidth(month.date, month.end)}
                  height={CHART_HEIGHT - ROW.ticks}
                  fill={index % 2 === 0 ? 'rgb(var(--surface-sunken))' : 'transparent'}
                  opacity={0.6}
                />
                <text
                  x={x(month.date) + 4}
                  y={ROW.months + 12}
                  className="fill-ink-muted"
                  fontSize={11}
                  fontWeight={500}
                >
                  {month.label}
                </text>
              </g>
            ))}

            {/* Weekly capacity, so thin weeks are visible at a glance. */}
            {model.weeks.map((week) => {
              const height = (week.plannedHours / maxWeekHours) * ROW.capacityHeight
              return (
                <rect
                  key={week.weekStart}
                  x={x(week.weekStart) + 1}
                  y={ROW.capacity + (ROW.capacityHeight - height)}
                  width={Math.max(1, 7 * dayWidth - 2)}
                  height={height}
                  rx={1}
                  fill="rgb(var(--accent))"
                  opacity={0.35}
                >
                  <title>
                    {`Week of ${formatDate(week.weekStart)}: ${formatHours(week.plannedHours)} available`}
                  </title>
                </rect>
              )
            })}

            {/* UP phase ribbons. */}
            {snapshot.phases.map((phase) => {
              const w = spanWidth(phase.startDate, phase.endDate)
              return (
                <g key={phase.id}>
                  <rect
                    x={x(phase.startDate)}
                    y={ROW.phases}
                    width={w}
                    height={ROW.phasesHeight}
                    rx={4}
                    fill={PHASE_FILL[phase.kind]}
                    opacity={0.85}
                  >
                    <title>
                      {`${PHASE_LABEL[phase.kind]}: ${formatRange(phase.startDate, phase.endDate)}`}
                    </title>
                  </rect>
                  {w > 70 && (
                    <text
                      x={x(phase.startDate) + 8}
                      y={ROW.phases + 20}
                      fontSize={12}
                      fontWeight={600}
                      fill="white"
                    >
                      {PHASE_LABEL[phase.kind]}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Sprints. */}
            {snapshot.sprints.map((sprint) => {
              const w = spanWidth(sprint.startDate, sprint.endDate)
              const isCurrent = now >= sprint.startDate && now <= sprint.endDate
              return (
                <g key={sprint.id}>
                  <rect
                    x={x(sprint.startDate) + 1}
                    y={ROW.sprints}
                    width={Math.max(2, w - 2)}
                    height={ROW.sprintsHeight}
                    rx={3}
                    fill="rgb(var(--surface-raised))"
                    stroke={isCurrent ? 'rgb(var(--accent))' : 'rgb(var(--line))'}
                    strokeWidth={isCurrent ? 2 : 1}
                  >
                    <title>
                      {`${sprint.name}: ${formatRange(sprint.startDate, sprint.endDate)} - ${formatHours(sprint.netCapacityHours)} to build`}
                    </title>
                  </rect>
                  {w > 44 && (
                    <text
                      x={x(sprint.startDate) + 6}
                      y={ROW.sprints + 18}
                      fontSize={11}
                      className="fill-ink"
                      fontWeight={isCurrent ? 700 : 500}
                    >
                      {`S${sprint.position + 1}`}
                      {w > 110 ? ` - ${formatHours(sprint.netCapacityHours)}` : ''}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Milestones as diamonds, deadlines as flags. */}
            {snapshot.milestones.map((milestone) => (
              <g key={`m-${milestone.id}`} transform={`translate(${x(milestone.date) + dayWidth / 2}, 0)`}>
                <path
                  d={`M 0 ${ROW.markers} l 7 8 l -7 8 l -7 -8 z`}
                  fill={PHASE_FILL[milestone.phaseKind] ?? 'rgb(var(--accent))'}
                >
                  <title>{`${milestone.name} - ${formatDate(milestone.date)}`}</title>
                </path>
                <text
                  x={0}
                  y={ROW.markers + 32}
                  fontSize={10}
                  textAnchor="middle"
                  className="fill-ink-muted"
                  fontWeight={600}
                >
                  {milestone.kind}
                </text>
              </g>
            ))}

            {snapshot.deadlines.map((deadline) => (
              <g key={`d-${deadline.id}`}>
                <line
                  x1={x(deadline.date) + dayWidth / 2}
                  x2={x(deadline.date) + dayWidth / 2}
                  y1={ROW.phases}
                  y2={ROW.markers + 8}
                  stroke="rgb(var(--danger))"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                >
                  <title>{`${deadline.title} - ${formatDate(deadline.date)}`}</title>
                </line>
              </g>
            ))}

            {/* Today. */}
            {now >= start && now <= end && (
              <g>
                <line
                  x1={x(now) + dayWidth / 2}
                  x2={x(now) + dayWidth / 2}
                  y1={ROW.ticks}
                  y2={CHART_HEIGHT}
                  stroke="rgb(var(--accent))"
                  strokeWidth={2}
                />
                <text
                  x={x(now) + dayWidth / 2 + 4}
                  y={ROW.ticks + 11}
                  fontSize={10}
                  fontWeight={700}
                  fill="rgb(var(--accent))"
                >
                  today
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-xs text-ink-muted">
          {snapshot.phases.map((phase) => (
            <PhaseBadge key={phase.id} phase={phase.kind} />
          ))}
          <span className="ml-auto">
            Bars show available hours per week. Diamonds are UP gate milestones; dashed red lines
            are fixed deadlines.
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Phases">
          <ul className="divide-y divide-line">
            {snapshot.phases.map((phase) => (
              <li key={phase.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <PhaseBadge phase={phase.kind} />
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatRange(phase.startDate, phase.endDate)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-muted">{phase.goal}</p>
                {phase.mergedFrom.length > 1 && (
                  <p className="mt-1 text-xs text-warn">
                    Merged phases: {phase.mergedFrom.map((kind) => PHASE_LABEL[kind]).join(' + ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sprints">
          <div className="max-h-[26rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-raised text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr className="border-b border-line">
                  <th className="table-cell font-medium">Sprint</th>
                  <th className="table-cell font-medium">Dates</th>
                  <th className="table-cell text-right font-medium">Build time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snapshot.sprints.map((sprint) => {
                  const isCurrent = now >= sprint.startDate && now <= sprint.endDate
                  return (
                    <tr key={sprint.id} className={isCurrent ? 'bg-accent/5' : ''}>
                      <td className="table-cell">
                        <span className={isCurrent ? 'font-semibold' : ''}>{sprint.name}</span>
                        <p className="mt-0.5 max-w-sm text-xs text-ink-muted">{sprint.goal}</p>
                      </td>
                      <td className="table-cell whitespace-nowrap text-xs tabular-nums text-ink-muted">
                        {formatRange(sprint.startDate, sprint.endDate)}
                      </td>
                      <td className="table-cell whitespace-nowrap text-right tabular-nums">
                        {formatHours(sprint.netCapacityHours)}
                        <span className="block text-xs text-ink-muted">
                          of {formatHours(sprint.capacityHours)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function monthTicks(start: DateStr, end: DateStr): Array<{ date: DateStr; end: DateStr; label: string }> {
  const out: Array<{ date: DateStr; end: DateStr; label: string }> = []
  const days = eachDay(start, end)
  let cursor = 0
  while (cursor < days.length) {
    const first = days[cursor]
    const month = first.slice(0, 7)
    let last = first
    while (cursor < days.length && days[cursor].slice(0, 7) === month) {
      last = days[cursor]
      cursor++
    }
    out.push({
      date: first,
      end: last,
      label: parseDate(first).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      })
    })
  }
  return out
}
