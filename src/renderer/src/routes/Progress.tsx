/**
 * Are you on track?
 *
 * Velocity in points is shown because Scrum asks for it, but the number that
 * actually decides whether a solo student makes the deadline is hours: work
 * left versus working time left.
 */
import { useMemo, useState } from 'react'

import { BurndownChart, VelocityChart, WeeklyLoadChart } from '../components/charts'
import { Card, EmptyState, Field, PageHeader, StatTile } from '../components/ui'
import {
  currentSprint,
  projectSlots,
  projection,
  sprintBurndown,
  sprintStats,
  today,
  weeklyLoad
} from '../lib/derive'
import { formatDate, formatHours, formatPoints, formatRange } from '../lib/format'
import { useStore } from '../store/useStore'

const VERDICT_TONE = {
  ahead: 'ok',
  tight: 'warn',
  behind: 'danger',
  unknown: 'default'
} as const

export function Progress() {
  const snapshot = useStore((state) => state.snapshot)
  const saveSession = useStore((state) => state.saveSession)
  const deleteSession = useStore((state) => state.deleteSession)
  const now = today()

  const [sprintId, setSprintId] = useState<number | null>(null)
  const [log, setLog] = useState({ date: now, hours: '2', note: '' })

  const model = useMemo(() => {
    if (!snapshot) return null
    const slots = projectSlots(snapshot)
    return {
      slots,
      stats: sprintStats(snapshot, now),
      forecast: projection(snapshot, slots, now),
      weeks: weeklyLoad(snapshot, slots)
    }
  }, [snapshot, now])

  if (!snapshot || !model) return null

  if (snapshot.sprints.length === 0) {
    return (
      <div>
        <PageHeader title="Progress" />
        <Card>
          <EmptyState title="No plan yet" description="Generate a plan to start tracking progress." />
        </Card>
      </div>
    )
  }

  const active = currentSprint(snapshot, now)
  const selected = snapshot.sprints.find((s) => s.id === (sprintId ?? active?.id)) ?? snapshot.sprints[0]
  const burndown = sprintBurndown(snapshot, selected, model.slots, now)
  const { forecast } = model
  const loggedTotal = snapshot.sessions.reduce((sum, session) => sum + session.hours, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Progress"
        description="Burndown, velocity and the only question that matters near the end: is there enough time left?"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Work remaining"
          value={formatHours(forecast.remainingHours)}
          hint={`${formatPoints(forecast.remainingPoints)} points still open`}
        />
        <StatTile
          label="Build time left"
          value={formatHours(forecast.remainingCapacityHours)}
          hint={`across ${forecast.sprintsLeft} remaining sprint(s)`}
        />
        <StatTile
          label="Slack"
          value={`${forecast.slackHours >= 0 ? '+' : ''}${formatHours(forecast.slackHours)}`}
          tone={VERDICT_TONE[forecast.verdict]}
          hint={forecast.slackHours >= 0 ? 'spare time' : 'short by this much'}
        />
        <StatTile
          label="Velocity"
          value={forecast.velocity === null ? '-' : formatPoints(forecast.velocity)}
          hint={forecast.velocity === null ? 'after your first full sprint' : 'points per sprint'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Sprint burndown"
          actions={
            <select
              className="input w-auto py-1 text-xs"
              value={selected.id}
              onChange={(event) => setSprintId(Number(event.target.value))}
            >
              {snapshot.sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name} - {formatRange(sprint.startDate, sprint.endDate)}
                </option>
              ))}
            </select>
          }
        >
          <div className="px-4 py-3">
            <BurndownChart points={burndown} />
            <p className="mt-2 text-xs text-ink-muted">
              The planned line steps down only on days you actually work, so a quiet weekend is not
              counted as falling behind.
            </p>
          </div>
        </Card>

        <Card title="Velocity">
          <div className="px-4 py-3">
            <VelocityChart stats={model.stats} />
            <p className="mt-2 text-xs text-ink-muted">
              Completed points per sprint. Two or three sprints in, this becomes a usable predictor
              of what you can take on.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Hours: available vs logged">
        <div className="px-4 py-3">
          <WeeklyLoadChart weeks={model.weeks} />
          <p className="mt-2 text-xs text-ink-muted">
            Logged {formatHours(loggedTotal)} so far. If logged hours sit consistently below
            available ones, the plan is optimistic - fix the availability grid rather than the
            estimates.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Sprint by sprint">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="table-cell font-medium">Sprint</th>
                  <th className="table-cell text-right font-medium">Points</th>
                  <th className="table-cell text-right font-medium">Committed h</th>
                  <th className="table-cell text-right font-medium">Capacity h</th>
                  <th className="table-cell text-right font-medium">Logged h</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {model.stats.map((entry) => (
                  <tr key={entry.sprint.id} className={entry.isCurrent ? 'bg-accent/5' : ''}>
                    <td className="table-cell">
                      <span className={entry.isCurrent ? 'font-semibold' : ''}>
                        {entry.sprint.name}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {formatRange(entry.sprint.startDate, entry.sprint.endDate)}
                      </span>
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatPoints(entry.completedPoints)} / {formatPoints(entry.committedPoints)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatHours(entry.committedHours)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatHours(entry.sprint.netCapacityHours)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatHours(entry.loggedHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Log work">
          <div className="space-y-3 px-4 py-3">
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={log.date}
                onChange={(event) => setLog({ ...log, date: event.target.value })}
              />
            </Field>
            <Field label="Hours">
              <input
                className="input"
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={log.hours}
                onChange={(event) => setLog({ ...log, hours: event.target.value })}
              />
            </Field>
            <Field label="Note">
              <input
                className="input"
                placeholder="What you worked on"
                value={log.note}
                onChange={(event) => setLog({ ...log, note: event.target.value })}
              />
            </Field>
            <button
              className="btn btn-primary w-full"
              disabled={!Number(log.hours)}
              onClick={async () => {
                await saveSession({
                  date: log.date,
                  hours: Number(log.hours),
                  note: log.note.trim()
                })
                setLog({ ...log, note: '' })
              }}
            >
              Log
            </button>

            {snapshot.sessions.length > 0 && (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
                {snapshot.sessions.slice(0, 30).map((session) => (
                  <li key={session.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                    <span className="w-20 shrink-0 tabular-nums text-ink-muted">
                      {formatDate(session.date)}
                    </span>
                    <span className="w-12 shrink-0 tabular-nums">{session.hours} h</span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{session.note}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void deleteSession(session.id)}
                      aria-label="Delete entry"
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
