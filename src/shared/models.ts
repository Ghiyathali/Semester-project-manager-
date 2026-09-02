/**
 * The records that cross the process boundary.
 *
 * These are camelCase views of the SQLite rows; the repositories own the
 * mapping so no snake_case ever reaches the renderer.
 */
import type {
  ArtifactStatus,
  CeremonyKind,
  DateStr,
  DeadlineKind,
  Discipline,
  ItemStatus,
  ItemType,
  MilestoneKind,
  PhaseKind,
  PhaseRatios,
  PlanWarning,
  TimeStr
} from '@core/types'

export interface ProjectRecord {
  id: number
  name: string
  course: string
  description: string
  startDate: DateStr
  deadlineDate: DateStr
  timezone: string
  sprintLengthDays: number
  weekStartsOn: number
  alignSprintsToWeek: boolean
  includeDailyStandup: boolean
  phaseRatios: PhaseRatios
  ectsCredits: number | null
  createdAt: string
  updatedAt: string
  plannedAt: string | null
}

export interface AvailabilityRuleRecord {
  id: number
  weekday: number
  start: TimeStr
  end: TimeStr
}

export interface ExceptionDayRecord {
  id: number
  date: DateStr
  kind: 'blackout' | 'extra'
  start: TimeStr | null
  end: TimeStr | null
  reason: string
}

export interface DeadlineRecord {
  id: number
  title: string
  date: DateStr
  kind: DeadlineKind
  isHard: boolean
  notes: string
}

export interface PhaseRecord {
  id: number
  kind: PhaseKind
  mergedFrom: PhaseKind[]
  position: number
  startDate: DateStr
  endDate: DateStr
  goal: string
  status: string
  isUserModified: boolean
}

export interface SprintRecord {
  id: number
  phaseId: number | null
  position: number
  name: string
  startDate: DateStr
  endDate: DateStr
  goal: string
  capacityHours: number
  ceremonyHours: number
  netCapacityHours: number
  workingDays: number
  status: string
  isUserModified: boolean
}

export interface CeremonyRecord {
  id: number
  sprintId: number | null
  kind: CeremonyKind
  title: string
  date: DateStr
  start: TimeStr
  end: TimeStr
  minutes: number
  notes: string
  done: boolean
}

export interface MilestoneRecord {
  id: number
  phaseId: number | null
  phaseKind: PhaseKind
  kind: MilestoneKind
  name: string
  date: DateStr
  description: string
  status: string
  isUserModified: boolean
}

export interface ArtifactRecord {
  id: number
  phaseId: number | null
  phaseKind: PhaseKind
  name: string
  discipline: Discipline
  dueDate: DateStr
  description: string
  status: ArtifactStatus
  isOptional: boolean
  link: string
  isUserModified: boolean
}

export interface BacklogItemRecord {
  id: number
  sprintId: number | null
  title: string
  description: string
  acceptanceCriteria: string
  type: ItemType
  discipline: Discipline
  points: number
  estimateHours: number
  priority: number
  status: ItemStatus
  createdAt: string
  updatedAt: string
  doneAt: string | null
}

export interface ItemEventRecord {
  id: number
  itemId: number
  fromStatus: ItemStatus | null
  toStatus: ItemStatus
  points: number
  at: string
}

export interface WorkSessionRecord {
  id: number
  itemId: number | null
  sprintId: number | null
  date: DateStr
  hours: number
  note: string
}

/** Everything the renderer needs about one project, fetched in a single call. */
export interface ProjectSnapshot {
  project: ProjectRecord
  availability: AvailabilityRuleRecord[]
  exceptions: ExceptionDayRecord[]
  deadlines: DeadlineRecord[]
  phases: PhaseRecord[]
  sprints: SprintRecord[]
  ceremonies: CeremonyRecord[]
  milestones: MilestoneRecord[]
  artifacts: ArtifactRecord[]
  items: BacklogItemRecord[]
  events: ItemEventRecord[]
  sessions: WorkSessionRecord[]
  /** Warnings from the last plan generation, recomputed on load. */
  warnings: PlanWarning[]
}

export interface ProjectSummary {
  id: number
  name: string
  course: string
  startDate: DateStr
  deadlineDate: DateStr
  updatedAt: string
}

/** What changed when a plan is regenerated, shown before anything is written. */
export interface ReplanDiff {
  sprintsBefore: number
  sprintsAfter: number
  sprintsMoved: number
  milestonesMoved: number
  artifactsRescheduled: number
  ceremoniesReplaced: number
  preservedUserEdits: number
  itemsUnassigned: number
  warnings: PlanWarning[]
}
