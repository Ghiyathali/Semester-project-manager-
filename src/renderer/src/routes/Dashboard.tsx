import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { PHASE_INTENT, PHASE_LABEL } from '@core/types'

import { Card, EmptyState, PageHeader, PhaseBadge, ProgressBar, StatTile, WarningList } from '../components/ui'
import {
  agenda,
  currentPhase,
  currentSprint,
  daysToDeadline,
  itemsInSprint,
  overdue,
  projectProgress,
  projectSlots,
  projection,
  slotsOn,
  today
} from '../lib/derive'
import { formatDate, formatHours, formatPoints, formatRange, pluralise, relativeDays } from '../lib/format'
import { useStore } from '../store/useStore'

const VERDICT: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'default'; note: string }> = {
  ahead: { label: 'On track', tone: 'ok', note: 'More build time left than estimated work.' },
  tight: { label: 'Tight', tone: 'warn', note: 'Enough time, with almost no slack.' },
  behind: { label: 'Behind', tone: 'danger', note: 'Estimated work exceeds the time left.' },
  unknown: { label: 'No estimates', tone: 'default', note: 'Add hour estimates to your items.' }
}

export function Dashboard() {
  const snapshot = useStore((state) => state.snapshot)
  const toggleCeremony = useStore((state) => state.toggleCeremony)
  const now = today()

  const derived = useMemo(() => {
    if (!snapshot) return null
    const slots = projectSlots(snapshot)
    return {
      slots,
      sprint: currentSprint(snapshot, now),
      phase: currentPhase(snapshot, now),
      forecast: projection(snapshot, slots, now),
      progress: projectProgress(snapshot, now),
      upcoming: agenda(snapshot, now, 14),
      late: overdue(snapshot, now),
      todaySlots: slotsOn(slots, now)
    }
  }, [snapshot, now])

  if (!snapshot || !derived) return null

  const { sprint, phase, forecast, progress, upcoming, late, todaySlots } = derived
  const sprintItems = sprint ? itemsInSprint(snapshot, sprint.id) : []
  const sprintDone = sprintItems.filter((item) => item.status === 'done')
  const committedHours = sprintItems.reduce((sum, item) => sum + item.estimateHours, 0)
  const daysLeft = daysToDeadline(snapshot, now)
  const todayCeremonies = snapshot.ceremonies.filter((ceremony) => ceremony.date === now)
  const verdict = VERDICT[forecast.verdict]

  return (
    <div className="space-y-4">
      <PageHeader
        title={snapshot.project.name}
        description={snapshot.project.description || snapshot.project.course}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Deadline"
          value={daysLeft >= 0 ? `${daysLeft} d` : 'Passed'}
          hint={`${formatDate(snapshot.project.deadlineDate)} - ${relativeDays(daysLeft)}`}
          tone={daysLeft < 0 ? 'danger' : daysLeft < 14 ? 'warn' : 'default'}
        />
        <StatTile
          label="Current phase"
          value={phase ? PHASE_LABEL[phase.kind] : '-'}
          hint={phase ? formatRange(phase.startDate, phase.endDate) : undefined}
        />
        <StatTile
          label="Sprint"
          value={sprint ? `${sprint.position + 1} / ${snapshot.sprints.length}` : '-'}
          hint={sprint ? formatRange(sprint.startDate, sprint.endDate) : undefined}
        />
        <StatTile
          label="Outlook"
          value={verdict.label}
          tone={verdict.tone}
          hint={`${formatHours(forecast.remainingCapacityHours)} left vs ${formatHours(forecast.remainingHours)} estimated`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card
            title="Today"
            actions={<span className="text-xs text-ink-muted">{formatDate(now, { year: 'numeric' })}</span>}
          >
            {todaySlots.length === 0 && todayCeremonies.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-muted">
                No working time planned today. Enjoy it, or add a one-off session in Setup.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {todayCeremonies.map((ceremony) => (
                  <li key={ceremony.id} className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={ceremony.done}
                      onChange={(event) => void toggleCeremony(ceremony.id, event.target.checked)}
                      aria-label={`Mark ${ceremony.title} done`}
                    />
                    <span className="w-24 shrink-0 text-sm tabular-nums text-ink-muted">
                      {ceremony.start}-{ceremony.end}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm ${ceremony.done ? 'text-ink-faint line-through' : ''}`}>
                        {ceremony.title}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{ceremony.notes}</p>
                    </div>
                  </li>
                ))}
                {todaySlots.map((slot, index) => (
                  <li key={index} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-2 w-2 rounded-full bg-accent/60" aria-hidden />
                    <span className="w-24 shrink-0 text-sm tabular-nums text-ink-muted">
                      {slot.start}-{slot.end}
                    </span>
                    <span className="text-sm">Working time - {formatHours(slot.hours)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {sprint && (
            <Card
              title={`${sprint.name} - current sprint`}
              actions={
                <Link className="btn btn-sm" to="/board">
                  Open board
                </Link>
              }
            >
              <div className="space-y-3 px-4 py-3">
                <p className="text-sm text-ink-muted">{sprint.goal}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-ink-muted">Items done</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {sprintDone.length} / {sprintItems.length}
                    </p>
                    <ProgressBar
                      className="mt-1"
                      value={sprintItems.length ? sprintDone.length / sprintItems.length : 0}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">Committed vs capacity</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {formatHours(committedHours)} / {formatHours(sprint.netCapacityHours)}
                    </p>
                    <ProgressBar
                      className="mt-1"
                      tone={committedHours > sprint.netCapacityHours ? 'warn' : 'accent'}
                      value={
                        sprint.netCapacityHours ? committedHours / sprint.netCapacityHours : 0
                      }
                    />
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted">Points</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {formatPoints(sprintDone.reduce((sum, item) => sum + item.points, 0))} /{' '}
                      {formatPoints(sprintItems.reduce((sum, item) => sum + item.points, 0))}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {pluralise(sprint.workingDays, 'working day')} in this sprint
                    </p>
                  </div>
                </div>
                {committedHours > sprint.netCapacityHours && sprint.netCapacityHours > 0 && (
                  <p className="rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
                    You have committed {formatHours(committedHours - sprint.netCapacityHours)} more
                    than this sprint can hold. Move something to the backlog now rather than
                    discovering it on the last day.
                  </p>
                )}
              </div>
            </Card>
          )}

          <Card
            title="Next two weeks"
            actions={
              <Link className="btn btn-sm" to="/calendar">
                Calendar
              </Link>
            }
          >
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                description="No ceremonies, milestones or deliverables fall in the next fortnight."
              />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 12).map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="flex items-baseline gap-3 px-4 py-2">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-ink-muted">
                      {formatDate(entry.date)}
                    </span>
                    <span
                      className={`chip shrink-0 ${
                        entry.kind === 'deadline'
                          ? 'bg-danger/10 text-danger'
                          : entry.kind === 'milestone'
                            ? 'bg-accent/10 text-accent'
                            : 'bg-surface-sunken text-ink-muted'
                      }`}
                    >
                      {entry.kind}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${entry.done ? 'text-ink-faint line-through' : ''}`}>
                      {entry.title}
                    </span>
                    {entry.time && (
                      <span className="text-xs tabular-nums text-ink-muted">{entry.time}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {phase && (
            <Card title="What this phase is for">
              <div className="px-4 py-3">
                <PhaseBadge phase={phase.kind} />
                <p className="mt-2 text-sm text-ink-muted">{PHASE_INTENT[phase.kind]}</p>
              </div>
            </Card>
          )}

          <Card title="Progress">
            <div className="space-y-3 px-4 py-3">
              <div>
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>Time elapsed</span>
                  <span className="tabular-nums">{Math.round(progress.timeFraction * 100)}%</span>
                </div>
                <ProgressBar className="mt-1" value={progress.timeFraction} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>Work completed</span>
                  <span className="tabular-nums">{Math.round(progress.workFraction * 100)}%</span>
                </div>
                <ProgressBar
                  className="mt-1"
                  tone={progress.workFraction + 0.1 < progress.timeFraction ? 'warn' : 'ok'}
                  value={progress.workFraction}
                />
              </div>
              <p className="text-xs text-ink-muted">{verdict.note}</p>
            </div>
          </Card>

          {(late.artifacts.length > 0 || late.milestones.length > 0) && (
            <Card title="Overdue">
              <ul className="divide-y divide-line">
                {late.milestones.map((milestone) => (
                  <li key={`m-${milestone.id}`} className="px-4 py-2">
                    <p className="text-sm text-danger">{milestone.name}</p>
                    <p className="text-xs text-ink-muted">was due {formatDate(milestone.date)}</p>
                  </li>
                ))}
                {late.artifacts.slice(0, 6).map((artifact) => (
                  <li key={`a-${artifact.id}`} className="px-4 py-2">
                    <p className="text-sm">{artifact.name}</p>
                    <p className="text-xs text-ink-muted">was due {formatDate(artifact.dueDate)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {snapshot.warnings.length > 0 && (
            <Card title="Plan checks">
              <WarningList warnings={snapshot.warnings.slice(0, 5)} />
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
