/**
 * Charts. Deliberately plain: one accent line for the truth, one grey dashed
 * line for the plan, and enough axis labels to read a number off.
 *
 * Animation is disabled throughout: Recharts animates marks up from zero, and
 * under React 18's StrictMode double-render that animation can be interrupted,
 * leaving bars and lines invisible.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import type { BurndownPoint, SprintStats, WeeklyLoad } from '../lib/derive'
import { formatDate } from '../lib/format'

const AXIS = {
  stroke: 'rgb(var(--line))',
  tick: { fill: 'rgb(var(--ink-muted))', fontSize: 11 }
}

const TOOLTIP = {
  contentStyle: {
    background: 'rgb(var(--surface-raised))',
    border: '1px solid rgb(var(--line))',
    borderRadius: '0.375rem',
    fontSize: '12px',
    color: 'rgb(var(--ink))'
  },
  labelStyle: { color: 'rgb(var(--ink-muted))' }
}

export function BurndownChart({ points }: { points: BurndownPoint[] }) {
  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Nothing to burn down yet.</p>
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" {...AXIS} tickLine={false} minTickGap={16} />
          <YAxis {...AXIS} tickLine={false} allowDecimals={false} />
          <Tooltip {...TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            isAnimationActive={false}
            name="Planned"
            type="monotone"
            dataKey="ideal"
            stroke="rgb(var(--ink-faint))"
            strokeDasharray="4 4"
            dot={false}
            strokeWidth={1.5}
          />
          <Line
            isAnimationActive={false}
            name="Remaining"
            type="monotone"
            dataKey="remaining"
            stroke="rgb(var(--page))"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function VelocityChart({ stats }: { stats: SprintStats[] }) {
  const data = stats.map((entry) => ({
    name: `S${entry.sprint.position + 1}`,
    committed: entry.committedPoints,
    completed: entry.completedPoints
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="name" {...AXIS} tickLine={false} />
          <YAxis {...AXIS} tickLine={false} allowDecimals={false} />
          <Tooltip {...TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar isAnimationActive={false} name="Committed" dataKey="committed" fill="rgb(var(--ink-faint))" radius={[2, 2, 0, 0]} />
          <Bar isAnimationActive={false} name="Completed" dataKey="completed" fill="rgb(var(--page))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function WeeklyLoadChart({ weeks }: { weeks: WeeklyLoad[] }) {
  const data = weeks.map((week) => ({
    name: formatDate(week.weekStart, { weekday: undefined, day: 'numeric', month: 'short' }),
    planned: week.plannedHours,
    logged: week.loggedHours
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="name" {...AXIS} tickLine={false} minTickGap={12} />
          <YAxis {...AXIS} tickLine={false} />
          <Tooltip {...TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar isAnimationActive={false} name="Available" dataKey="planned" fill="rgb(var(--ink-faint))" radius={[2, 2, 0, 0]} />
          <Bar isAnimationActive={false} name="Logged" dataKey="logged" fill="rgb(var(--page))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
