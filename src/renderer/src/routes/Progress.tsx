/**
 * Are you on track?
 *
 * Velocity in points is here because Scrum asks for it, but the number that
 * actually decides whether a solo student makes the deadline is hours: work
 * left versus working time left. That is the headline.
 */
import { useMemo, useState } from 'react'

import { BurndownChart, VelocityChart, WeeklyLoadChart } from '../components/charts'
import { Card, EmptyState, Field, Modal, PageHeader, Section, Stat } from '../components/ui'
import {
  currentPhase,
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

const VERDICT_LABEL = {
  ahead: 'On track',
  tight: 'Tight',
  behind: 'Behind',
  unknown: 'No estimates'
} as const

export function Progress() {
  const snapshot = useStore((state) => state.snapshot)
  const saveSession = useStore((state) => state.saveSession)
  const deleteSession = useStore((state) => state.deleteSession)
  const now = today()

  const [sprintId, setSprintId] = useState<number | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const model = useMemo(() => {
    if (!snapshot) return null
    const slots = projectSlots(snapshot)
    return {
      slots,
      stats: sprintStats(snapshot, now),
      forecast: projection(snapshot, slots, now),
      weeks: weeklyLoad(snapshot, slots),
      phase: currentPhase(snapshot, now)
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
  const selected =
    snapshot.sprints.find((s) => s.id === (sprintId ?? active?.id)) ?? snapshot.sprints[0]
  const burndown = sprintBurndown(snapshot, selected, model.slots, now)
  const { forecast } = model
  const loggedTotal = snapshot.sessions.reduce((sum, session) => sum + session.hours, 0)

  return (
    <div className="space-y-7">
      <PageHeader
        title="Progress"
        phase={model.phase?.kind}
        description="Burndown and velocity, and the question that matters near the end: is there enough time left for the work left?"
        actions={
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
            Log work
          </button>
        }
      />

      <div className="grid gap-5 rounded-xl border border-line bg-surface-raised px-5 py-4 sm:grid-cols-4">
        <Stat
          label="Work remaining"
          value={formatHours(forecast.remainingHours)}
          hint={`${formatPoints(forecast.remainingPoints)} points open`}
        />
        <Stat
          label="Build time left"
          value={formatHours(forecast.remainingCapacityHours)}
          hint={`${forecast.sprintsLeft} sprint(s) to go`}
        />
        <Stat
          label="Slack"
          value={`${forecast.slackHours >= 0 ? '+' : ''}${formatHours(forecast.slackHours)}`}
          tone={VERDICT_TONE[forecast.verdict]}
          hint={VERDICT_LABEL[forecast.verdict]}
        />
        <Stat
          label="Velocity"
          value={forecast.velocity === null ? '—' : formatPoints(forecast.velocity)}
          hint={forecast.velocity === null ? 'after your first full sprint' : 'points per sprint'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Sprint burndown"
          actions={
            <select
              className="input w-auto py-1 text-xs font-normal"
              value={selected.id}
              onChange={(event) => setSprintId(Number(event.target.value))}
            >
              {snapshot.sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>
          }
        >
          <div className="card px-4 py-4">
            <BurndownChart points={burndown} />
            <p className="mt-3 text-xs leading-snug text-ink-muted">
              The planned line steps down only on days you actually work, so a quiet weekend does
              not count as falling behind.
            </p>
          </div>
        </Section>

        <Section title="Velocity">
          <div className="card px-4 py-4">
            <VelocityChart stats={model.stats} />
            <p className="mt-3 text-xs leading-snug text-ink-muted">
              Completed points per sprint. Two or three sprints in, this becomes a usable predictor
              of what you can take on.
            </p>
          </div>
        </Section>
      </div>

      <Section title="Hours available vs logged">
        <div className="card px-4 py-4">
          <WeeklyLoadChart weeks={model.weeks} />
          <p className="mt-3 text-xs leading-snug text-ink-muted">
            {formatHours(loggedTotal)} logged so far. If logged hours sit consistently below
            available ones, the plan is optimistic — fix the availability grid rather than the
            estimates.
          </p>
        </div>
      </Section>

      <Section title="Sprint by sprint">
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="table-cell font-medium">Sprint</th>
                <th className="table-cell text-right font-medium">Points</th>
                <th className="table-cell text-right font-medium">Committed</th>
                <th className="table-cell text-right font-medium">Capacity</th>
                <th className="table-cell text-right font-medium">Logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {model.stats.map((entry) => (
                <tr key={entry.sprint.id} className={entry.isCurrent ? 'bg-page/[0.06]' : ''}>
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
      </Section>

      <LogWorkModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSave={saveSession}
        onDelete={deleteSession}
        sessions={snapshot.sessions}
        defaultDate={now}
      />
    </div>
  )
}

function LogWorkModal({
  open,
  onClose,
  onSave,
  onDelete,
  sessions,
  defaultDate
}: {
  open: boolean
  onClose: () => void
  onSave: (payload: { date: string; hours: number; note: string }) => Promise<void>
  onDelete: (id: number) => Promise<void>
  sessions: Array<{ id: number; date: string; hours: number; note: string }>
  defaultDate: string
}) {
  const [log, setLog] = useState({ date: defaultDate, hours: '2', note: '' })

  return (
    <Modal
      open={open}
      title="Log work"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            disabled={!Number(log.hours)}
            onClick={async () => {
              await onSave({
                date: log.date,
                hours: Number(log.hours),
                note: log.note.trim()
              })
              setLog({ ...log, note: '' })
            }}
          >
            Add entry
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_7rem_1fr]">
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
      </div>

      {sessions.length > 0 && (
        <div className="mt-4">
          <p className="label">Recent entries</p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {sessions.slice(0, 30).map((session) => (
              <li key={session.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-ink-muted">
                  {formatDate(session.date)}
                </span>
                <span className="w-12 shrink-0 tabular-nums">{session.hours} h</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{session.note}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void onDelete(session.id)}
                  aria-label="Delete entry"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
