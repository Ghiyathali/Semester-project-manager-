import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { diffDays, inclusiveDays } from '@core/dates'
import { PHASE_INTENT } from '@core/types'

import { Card, PageHeader, ProgressBar, Section, Stat } from '../components/ui'
import {
  agenda,
  currentPhase,
  currentSprint,
  daysToDeadline,
  itemsInSprint,
  overdue,
  projectSlots,
  projection,
  slotsOn,
  today
} from '../lib/derive'
import { formatDate, formatHours, formatPoints, formatRange, relativeDays } from '../lib/format'
import { useStore } from '../store/useStore'

const VERDICT = {
  ahead: { label: 'On track', tone: 'ok' as const },
  tight: { label: 'Tight', tone: 'warn' as const },
  behind: { label: 'Behind', tone: 'danger' as const },
  unknown: { label: 'Unknown', tone: 'default' as const }
}

export function Dashboard() {
  const snapshot = useStore((state) => state.snapshot)
  const toggleCeremony = useStore((state) => state.toggleCeremony)
  const now = today()

  const model = useMemo(() => {
    if (!snapshot) return null
    const slots = projectSlots(snapshot)
    return {
      slots,
      sprint: currentSprint(snapshot, now),
      phase: currentPhase(snapshot, now),
      forecast: projection(snapshot, slots, now),
      upcoming: agenda(snapshot, now, 14),
      late: overdue(snapshot, now)
    }
  }, [snapshot, now])

  if (!snapshot || !model) return null

  const { slots, sprint, phase, forecast, upcoming, late } = model
  const sprintItems = sprint ? itemsInSprint(snapshot, sprint.id) : []
  const doneItems = sprintItems.filter((item) => item.status === 'done')
  const committedHours = sprintItems.reduce((sum, item) => sum + item.estimateHours, 0)
  const daysLeft = daysToDeadline(snapshot, now)
  const verdict = VERDICT[forecast.verdict]

  const todaySlots = slotsOn(slots, now)
  const todayCeremonies = snapshot.ceremonies.filter((c) => c.date === now)
  // If there is nothing today, the useful question is "when next?".
  const nextWorkingDate = slots.find((slot) => slot.date > now)?.date ?? null

  // One list instead of two cards: things that are late, then things that are wrong.
  const attention = [
    ...late.milestones.map((m) => ({
      key: `m${m.id}`,
      text: m.name,
      detail: `Milestone was due ${formatDate(m.date)}`,
      tone: 'danger' as const
    })),
    ...late.artifacts.map((a) => ({
      key: `a${a.id}`,
      text: a.name,
      detail: `Was due ${formatDate(a.dueDate)}`,
      tone: 'warn' as const
    })),
    ...snapshot.warnings.map((w, i) => ({
      key: `w${i}`,
      text: w.message,
      detail: w.hint ?? '',
      tone: w.severity === 'error' ? ('danger' as const) : ('muted' as const)
    }))
  ]

  return (
    <div className="space-y-7">
      <PageHeader
        title={snapshot.project.name}
        phase={phase?.kind}
        description={phase ? PHASE_INTENT[phase.kind] : snapshot.project.description}
      />

      {/* The hero: what you are supposed to be doing right now. */}
      {sprint && (
        <Card tone="hero" className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">
                Current sprint &middot; {formatRange(sprint.startDate, sprint.endDate)}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                {sprint.name}
                <span className="ml-2 text-sm font-normal text-ink-muted">
                  of {snapshot.sprints.length}
                </span>
              </h2>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-ink-muted">
                {sprint.goal}
              </p>
            </div>
            <Link className="btn btn-primary" to="/board">
              Open sprint board
            </Link>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <div>
              <Stat
                label="Time to build this sprint"
                value={formatHours(sprint.netCapacityHours)}
                tone="page"
              />
              <ProgressBar
                className="mt-2"
                thick
                tone={committedHours > sprint.netCapacityHours ? 'warn' : 'page'}
                value={sprint.netCapacityHours ? committedHours / sprint.netCapacityHours : 0}
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                {formatHours(committedHours)} committed
                {committedHours > sprint.netCapacityHours &&
                  ` · over by ${formatHours(committedHours - sprint.netCapacityHours)}`}
              </p>
            </div>

            <div>
              <Stat
                label="Items done"
                value={`${doneItems.length} / ${sprintItems.length}`}
                hint={`${formatPoints(doneItems.reduce((s, i) => s + i.points, 0))} of ${formatPoints(sprintItems.reduce((s, i) => s + i.points, 0))} points`}
              />
            </div>

            <div>
              <Stat
                label="Sprint ends"
                value={
                  diffDays(now, sprint.endDate) >= 0 ? `${diffDays(now, sprint.endDate)} d` : 'ended'
                }
                hint={`${inclusiveDays(sprint.startDate, sprint.endDate)} day sprint · ${sprint.workingDays} working days`}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Project-level numbers, grouped as one band rather than four boxes. */}
      <div className="grid gap-5 rounded-xl border border-line bg-surface-raised px-5 py-4 sm:grid-cols-3">
        <Stat
          label="Until hand-in"
          value={daysLeft >= 0 ? `${daysLeft} d` : 'Passed'}
          tone={daysLeft < 0 ? 'danger' : daysLeft < 14 ? 'warn' : 'default'}
          hint={`${formatDate(snapshot.project.deadlineDate)} · ${relativeDays(daysLeft)}`}
        />
        <Stat
          label="Work left vs time left"
          value={verdict.label}
          tone={verdict.tone}
          hint={`${formatHours(forecast.remainingHours)} estimated, ${formatHours(forecast.remainingCapacityHours)} available`}
        />
        <Stat
          label="Slack"
          value={`${forecast.slackHours >= 0 ? '+' : ''}${formatHours(forecast.slackHours)}`}
          tone={forecast.slackHours >= 0 ? 'ok' : 'danger'}
          hint={forecast.slackHours >= 0 ? 'spare build time' : 'short by this much'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Today"
          actions={
            <span className="text-xs font-normal text-ink-muted">
              {formatDate(now, { year: 'numeric' })}
            </span>
          }
        >
          <div className="card divide-y divide-line">
            {todayCeremonies.length === 0 && todaySlots.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-muted">
                No working time planned today.
                {nextWorkingDate && ` Next session is ${formatDate(nextWorkingDate)}.`}
              </p>
            ) : (
              <>
                {todayCeremonies.map((ceremony) => (
                  <label key={ceremony.id} className="row row-hover cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ceremony.done}
                      onChange={(event) => void toggleCeremony(ceremony.id, event.target.checked)}
                    />
                    <span className="w-24 shrink-0 text-xs tabular-nums text-ink-muted">
                      {ceremony.start}&ndash;{ceremony.end}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        ceremony.done ? 'text-ink-faint line-through' : ''
                      }`}
                    >
                      {ceremony.title}
                    </span>
                  </label>
                ))}
                {todaySlots.map((slot, index) => (
                  <div key={index} className="row">
                    <span className="h-1.5 w-1.5 rounded-full bg-page" aria-hidden />
                    <span className="w-24 shrink-0 text-xs tabular-nums text-ink-muted">
                      {slot.start}&ndash;{slot.end}
                    </span>
                    <span className="text-[13px]">Working time</span>
                    <span className="ml-auto text-xs tabular-nums text-ink-muted">
                      {formatHours(slot.hours)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="section-title mt-5">
            <h2>Coming up</h2>
            <Link className="text-xs font-normal text-page hover:underline" to="/calendar">
              Calendar
            </Link>
          </div>
          <div className="card divide-y divide-line">
            {upcoming.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-muted">
                Nothing scheduled in the next fortnight.
              </p>
            ) : (
              upcoming.slice(0, 7).map((entry) => (
                <div key={`${entry.kind}-${entry.id}`} className="row">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-ink-muted">
                    {formatDate(entry.date)}
                  </span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      entry.kind === 'deadline'
                        ? 'bg-danger'
                        : entry.kind === 'milestone'
                          ? 'bg-page'
                          : 'bg-ink-faint'
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      entry.done ? 'text-ink-faint line-through' : ''
                    }`}
                  >
                    {entry.title}
                  </span>
                  {entry.time && (
                    <span className="text-xs tabular-nums text-ink-muted">{entry.time}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </Section>

        <Section
          title="Needs attention"
          actions={
            attention.length > 0 ? (
              <span className="text-xs font-normal text-ink-muted">{attention.length}</span>
            ) : undefined
          }
        >
          <div className="card divide-y divide-line">
            {attention.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-muted">
                Nothing overdue and no problems with the plan.
              </p>
            ) : (
              attention.slice(0, 8).map((entry) => (
                <div key={entry.key} className="flex gap-3 px-4 py-2.5">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      entry.tone === 'danger'
                        ? 'bg-danger'
                        : entry.tone === 'warn'
                          ? 'bg-warn'
                          : 'bg-ink-faint'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug">{entry.text}</p>
                    {entry.detail && (
                      <p className="mt-0.5 text-xs leading-snug text-ink-muted">{entry.detail}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {attention.length > 8 && (
              <p className="px-4 py-2 text-xs text-ink-muted">
                and {attention.length - 8} more
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
