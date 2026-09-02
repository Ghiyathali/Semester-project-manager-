/**
 * Everything the screens need that is computed rather than stored.
 *
 * The scheduler core is pure TypeScript with no Electron or Node dependencies,
 * so the renderer can import it directly and recompute availability here instead
 * of shipping it over IPC.
 */
import { addDays, diffDays, eachDay, inclusiveDays, round2, todayStr } from '@core/dates'
import { expandAvailability, hoursByDate } from '@core/scheduler/availability'
import { normalize, subtract, type Range } from '@core/scheduler/intervals'
import type { DateStr, ItemStatus, PhaseKind, TimeSlot } from '@core/types'
import type {
  ArtifactRecord,
  BacklogItemRecord,
  CeremonyRecord,
  DeadlineRecord,
  ItemEventRecord,
  MilestoneRecord,
  PhaseRecord,
  ProjectSnapshot,
  SprintRecord
} from '@shared/models'

export function today(): DateStr {
  return todayStr()
}

/** Concrete working slots for the whole project, recomputed from the stored rules. */
export function projectSlots(snapshot: ProjectSnapshot): TimeSlot[] {
  return expandAvailability({
    from: snapshot.project.startDate,
    to: snapshot.project.deadlineDate,
    rules: snapshot.availability.map((a) => ({
      weekday: a.weekday,
      start: a.start,
      end: a.end
    })),
    exceptions: snapshot.exceptions.map((e) => ({
      date: e.date,
      kind: e.kind,
      start: e.start ?? undefined,
      end: e.end ?? undefined,
      reason: e.reason
    }))
  })
}

/**
 * The working time left once ceremonies are removed - what the calendar shows
 * as "free to build" so nothing is ever double-booked on screen.
 */
export function freeSlots(slots: TimeSlot[], ceremonies: CeremonyRecord[]): TimeSlot[] {
  const minutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  const label = (value: number): string =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

  const busyByDate = new Map<DateStr, Range[]>()
  for (const ceremony of ceremonies) {
    const list = busyByDate.get(ceremony.date) ?? []
    list.push({ start: minutes(ceremony.start), end: minutes(ceremony.end) })
    busyByDate.set(ceremony.date, list)
  }

  const freeByDate = new Map<DateStr, Range[]>()
  for (const slot of slots) {
    const list = freeByDate.get(slot.date) ?? []
    list.push({ start: minutes(slot.start), end: minutes(slot.end) })
    freeByDate.set(slot.date, list)
  }

  const out: TimeSlot[] = []
  for (const [date, ranges] of [...freeByDate.entries()].sort()) {
    for (const range of subtract(normalize(ranges), busyByDate.get(date) ?? [])) {
      out.push({
        date,
        start: label(range.start),
        end: label(range.end),
        hours: round2((range.end - range.start) / 60)
      })
    }
  }
  return out
}

export function slotsOn(slots: TimeSlot[], date: DateStr): TimeSlot[] {
  return slots.filter((slot) => slot.date === date)
}

export function currentSprint(snapshot: ProjectSnapshot, date = today()): SprintRecord | null {
  return (
    snapshot.sprints.find((s) => date >= s.startDate && date <= s.endDate) ??
    snapshot.sprints.find((s) => s.startDate > date) ??
    snapshot.sprints[snapshot.sprints.length - 1] ??
    null
  )
}

export function currentPhase(snapshot: ProjectSnapshot, date = today()): PhaseRecord | null {
  return (
    snapshot.phases.find((p) => date >= p.startDate && date <= p.endDate) ??
    snapshot.phases.find((p) => p.startDate > date) ??
    snapshot.phases[snapshot.phases.length - 1] ??
    null
  )
}

export function phaseOfSprint(snapshot: ProjectSnapshot, sprint: SprintRecord): PhaseKind {
  return snapshot.phases.find((p) => p.id === sprint.phaseId)?.kind ?? 'construction'
}

export function itemsInSprint(snapshot: ProjectSnapshot, sprintId: number | null): BacklogItemRecord[] {
  return snapshot.items.filter((item) => item.sprintId === sprintId)
}

export function daysToDeadline(snapshot: ProjectSnapshot, date = today()): number {
  return diffDays(date, snapshot.project.deadlineDate)
}

/**
 * The item's status at the end of `date`, reconstructed from its event history.
 * Falls back to the current status for items created before any events existed.
 */
function statusOn(
  item: BacklogItemRecord,
  events: ItemEventRecord[],
  date: DateStr
): ItemStatus | null {
  const cutoff = `${date}T23:59:59.999Z`
  const mine = events.filter((e) => e.itemId === item.id && e.at <= cutoff)
  if (mine.length === 0) return item.createdAt.slice(0, 10) <= date ? 'backlog' : null
  return mine[mine.length - 1].toStatus
}

export interface BurndownPoint {
  date: DateStr
  label: string
  ideal: number
  remaining: number | null
}

/**
 * Sprint burndown in story points.
 *
 * The ideal line steps down on the days the student actually works, not on
 * every calendar day - a burndown that assumes weekend progress on a plan that
 * has no weekend slots is just a guilt machine.
 */
export function sprintBurndown(
  snapshot: ProjectSnapshot,
  sprint: SprintRecord,
  slots: TimeSlot[],
  now = today()
): BurndownPoint[] {
  const items = itemsInSprint(snapshot, sprint.id)
  const total = round2(items.reduce((sum, item) => sum + item.points, 0))
  const days = eachDay(sprint.startDate, sprint.endDate)
  const hours = hoursByDate(slots)
  const workingDays = days.filter((day) => (hours.get(day) ?? 0) > 0)
  const workingTotal = workingDays.length || 1

  let consumed = 0
  return days.map((date) => {
    if ((hours.get(date) ?? 0) > 0) consumed++
    const ideal = round2(Math.max(0, total * (1 - consumed / workingTotal)))
    const remaining =
      date > now
        ? null
        : round2(
            items.reduce(
              (sum, item) => sum + (statusOn(item, snapshot.events, date) === 'done' ? 0 : item.points),
              0
            )
          )
    return { date, label: date.slice(5), ideal, remaining }
  })
}

export interface SprintStats {
  sprint: SprintRecord
  phase: PhaseKind
  committedPoints: number
  completedPoints: number
  committedHours: number
  loggedHours: number
  itemCount: number
  doneCount: number
  isPast: boolean
  isCurrent: boolean
}

export function sprintStats(snapshot: ProjectSnapshot, date = today()): SprintStats[] {
  return snapshot.sprints.map((sprint) => {
    const items = itemsInSprint(snapshot, sprint.id)
    const done = items.filter((item) => item.status === 'done')
    const logged = snapshot.sessions
      .filter((session) => session.date >= sprint.startDate && session.date <= sprint.endDate)
      .reduce((sum, session) => sum + session.hours, 0)

    return {
      sprint,
      phase: phaseOfSprint(snapshot, sprint),
      committedPoints: round2(items.reduce((sum, item) => sum + item.points, 0)),
      completedPoints: round2(done.reduce((sum, item) => sum + item.points, 0)),
      committedHours: round2(items.reduce((sum, item) => sum + item.estimateHours, 0)),
      loggedHours: round2(logged),
      itemCount: items.length,
      doneCount: done.length,
      isPast: sprint.endDate < date,
      isCurrent: date >= sprint.startDate && date <= sprint.endDate
    }
  })
}

export interface Projection {
  remainingHours: number
  remainingCapacityHours: number
  remainingPoints: number
  velocity: number | null
  sprintsLeft: number
  /** How many hours of build time are left over (negative means short). */
  slackHours: number
  verdict: 'ahead' | 'tight' | 'behind' | 'unknown'
}

/**
 * The honest question: is there enough working time left for the work left?
 *
 * Estimated hours are compared against remaining net capacity, because for a
 * solo student hours are the binding constraint - velocity in points is a
 * secondary signal that only becomes meaningful after two or three sprints.
 */
export function projection(
  snapshot: ProjectSnapshot,
  slots: TimeSlot[],
  date = today()
): Projection {
  const open = snapshot.items.filter((item) => item.status !== 'done')
  const remainingHours = round2(open.reduce((sum, item) => sum + item.estimateHours, 0))
  const remainingPoints = round2(open.reduce((sum, item) => sum + item.points, 0))

  const futureSlots = slots.filter((slot) => slot.date >= date)
  const grossCapacity = futureSlots.reduce((sum, slot) => sum + slot.hours, 0)
  const ceremonyHours =
    snapshot.ceremonies
      .filter((ceremony) => ceremony.date >= date)
      .reduce((sum, ceremony) => sum + ceremony.minutes, 0) / 60
  const remainingCapacityHours = round2(Math.max(0, grossCapacity - ceremonyHours))

  const completed = sprintStats(snapshot, date).filter((s) => s.isPast && s.itemCount > 0)
  const velocity =
    completed.length > 0
      ? round2(completed.reduce((sum, s) => sum + s.completedPoints, 0) / completed.length)
      : null

  const slackHours = round2(remainingCapacityHours - remainingHours)
  const ratio = remainingHours === 0 ? Infinity : remainingCapacityHours / remainingHours

  let verdict: Projection['verdict'] = 'unknown'
  if (remainingHours === 0 && open.length === 0) verdict = 'ahead'
  else if (open.every((item) => item.estimateHours === 0)) verdict = 'unknown'
  else if (ratio >= 1.25) verdict = 'ahead'
  else if (ratio >= 1) verdict = 'tight'
  else verdict = 'behind'

  return {
    remainingHours,
    remainingCapacityHours,
    remainingPoints,
    velocity,
    sprintsLeft: snapshot.sprints.filter((sprint) => sprint.endDate >= date).length,
    slackHours,
    verdict
  }
}

export type AgendaKind = 'ceremony' | 'milestone' | 'artifact' | 'deadline'

export interface AgendaEntry {
  kind: AgendaKind
  id: number
  date: DateStr
  time?: string
  title: string
  detail: string
  phase?: PhaseKind
  done?: boolean
}

/** Everything with a date, merged and sorted - the "what is coming" list. */
export function agenda(snapshot: ProjectSnapshot, from: DateStr, days: number): AgendaEntry[] {
  const to = addDays(from, days)
  const entries: AgendaEntry[] = []

  for (const ceremony of snapshot.ceremonies) {
    if (ceremony.date < from || ceremony.date > to) continue
    entries.push({
      kind: 'ceremony',
      id: ceremony.id,
      date: ceremony.date,
      time: ceremony.start,
      title: ceremony.title,
      detail: `${ceremony.start}-${ceremony.end}`,
      done: ceremony.done
    })
  }
  for (const milestone of snapshot.milestones) {
    if (milestone.date < from || milestone.date > to) continue
    entries.push({
      kind: 'milestone',
      id: milestone.id,
      date: milestone.date,
      title: milestone.name,
      detail: milestone.description,
      phase: milestone.phaseKind
    })
  }
  for (const artifact of snapshot.artifacts) {
    if (artifact.dueDate < from || artifact.dueDate > to) continue
    entries.push({
      kind: 'artifact',
      id: artifact.id,
      date: artifact.dueDate,
      title: artifact.name,
      detail: artifact.description,
      phase: artifact.phaseKind,
      done: artifact.status === 'done'
    })
  }
  for (const deadline of snapshot.deadlines) {
    if (deadline.date < from || deadline.date > to) continue
    entries.push({
      kind: 'deadline',
      id: deadline.id,
      date: deadline.date,
      title: deadline.title,
      detail: deadline.isHard ? 'Hard deadline' : 'Soft deadline'
    })
  }

  return entries.sort((a, b) =>
    (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))
  )
}

/** Deliverables and milestones already past their date and not finished. */
export function overdue(snapshot: ProjectSnapshot, date = today()) {
  return {
    artifacts: snapshot.artifacts.filter((a) => a.dueDate < date && a.status !== 'done'),
    milestones: snapshot.milestones.filter((m) => m.date < date && m.status !== 'done')
  }
}

export interface WeeklyLoad {
  weekStart: DateStr
  plannedHours: number
  loggedHours: number
}

export function weeklyLoad(snapshot: ProjectSnapshot, slots: TimeSlot[]): WeeklyLoad[] {
  const weekStartsOn = snapshot.project.weekStartsOn
  const buckets = new Map<DateStr, WeeklyLoad>()

  const keyOf = (date: DateStr): DateStr => {
    const parsed = new Date(`${date}T00:00:00Z`)
    const delta = (parsed.getUTCDay() - weekStartsOn + 7) % 7
    return addDays(date, -delta)
  }
  const bucket = (date: DateStr): WeeklyLoad => {
    const key = keyOf(date)
    let existing = buckets.get(key)
    if (!existing) {
      existing = { weekStart: key, plannedHours: 0, loggedHours: 0 }
      buckets.set(key, existing)
    }
    return existing
  }

  for (const slot of slots) bucket(slot.date).plannedHours += slot.hours
  for (const session of snapshot.sessions) bucket(session.date).loggedHours += session.hours

  return [...buckets.values()]
    .map((week) => ({
      ...week,
      plannedHours: round2(week.plannedHours),
      loggedHours: round2(week.loggedHours)
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

export function projectProgress(snapshot: ProjectSnapshot, date = today()) {
  const elapsed = inclusiveDays(snapshot.project.startDate, date)
  const total = inclusiveDays(snapshot.project.startDate, snapshot.project.deadlineDate)
  const timeFraction = Math.max(0, Math.min(1, elapsed / Math.max(1, total)))

  const points = snapshot.items.reduce((sum, item) => sum + item.points, 0)
  const donePoints = snapshot.items
    .filter((item) => item.status === 'done')
    .reduce((sum, item) => sum + item.points, 0)
  const workFraction = points === 0 ? 0 : donePoints / points

  return { timeFraction, workFraction, points: round2(points), donePoints: round2(donePoints) }
}

export type { ArtifactRecord, CeremonyRecord, DeadlineRecord, MilestoneRecord }
