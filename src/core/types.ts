/**
 * Shared domain types.
 *
 * Time model: everything the planner reasons about is **local wall-clock time**.
 * A slot of "Tuesday 18:00-21:00" means three hours as the student experiences
 * them, on both sides of a daylight-saving change. Dates are `YYYY-MM-DD`
 * strings and times are `HH:MM` strings, so the scheduler stays pure and
 * deterministic with no timezone database involved. Conversion to absolute
 * instants happens only at the edges (ICS export), using the project timezone.
 */

/** `YYYY-MM-DD` */
export type DateStr = string
/** `HH:MM`, 24-hour */
export type TimeStr = string

export type PhaseKind = 'inception' | 'elaboration' | 'construction' | 'transition'

export const PHASE_ORDER: PhaseKind[] = ['inception', 'elaboration', 'construction', 'transition']

export const PHASE_LABEL: Record<PhaseKind, string> = {
  inception: 'Inception',
  elaboration: 'Elaboration',
  construction: 'Construction',
  transition: 'Transition'
}

/** What each UP phase is actually for - shown in the UI so the plan teaches, not just schedules. */
export const PHASE_INTENT: Record<PhaseKind, string> = {
  inception:
    'Agree what the project is: scope, vision, the main use cases and the biggest risks. Ends at the LCO gate.',
  elaboration:
    'Prove the architecture. Build an executable skeleton of the risky parts and baseline the requirements. Ends at the LCA gate.',
  construction:
    'Build the remaining functionality sprint by sprint until the system is feature complete and tested. Ends at the IOC gate.',
  transition:
    'Get it into the examiner’s hands: fix defects, finish the report, rehearse the demo, hand in. Ends at the Product Release gate.'
}

export type CeremonyKind = 'planning' | 'daily' | 'review' | 'retrospective' | 'phase-gate'

export const CEREMONY_LABEL: Record<CeremonyKind, string> = {
  planning: 'Sprint Planning',
  daily: 'Daily Check-in',
  review: 'Sprint Review',
  retrospective: 'Sprint Retrospective',
  'phase-gate': 'Phase Gate Review'
}

/** The four Unified Process lifecycle milestones, one per phase. */
export type MilestoneKind = 'LCO' | 'LCA' | 'IOC' | 'PR' | 'custom'

export const MILESTONE_META: Record<
  Exclude<MilestoneKind, 'custom'>,
  { name: string; phase: PhaseKind; question: string }
> = {
  LCO: {
    name: 'Lifecycle Objectives',
    phase: 'inception',
    question: 'Do we agree on scope, cost and the key risks? Is the project worth doing?'
  },
  LCA: {
    name: 'Lifecycle Architecture',
    phase: 'elaboration',
    question: 'Is the architecture stable and proven by running code? Are the big risks retired?'
  },
  IOC: {
    name: 'Initial Operational Capability',
    phase: 'construction',
    question: 'Is the product complete and tested enough to put in front of real users?'
  },
  PR: {
    name: 'Product Release',
    phase: 'transition',
    question: 'Is it handed in, deployed and documented? Are the stakeholders satisfied?'
  }
}

/** UP disciplines - used to tag both backlog items and deliverables. */
export type Discipline =
  | 'business-modeling'
  | 'requirements'
  | 'analysis-design'
  | 'implementation'
  | 'test'
  | 'deployment'
  | 'project-management'
  | 'configuration-management'
  | 'environment'

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  'business-modeling': 'Business Modeling',
  requirements: 'Requirements',
  'analysis-design': 'Analysis & Design',
  implementation: 'Implementation',
  test: 'Test',
  deployment: 'Deployment',
  'project-management': 'Project Management',
  'configuration-management': 'Configuration & Change Mgmt',
  environment: 'Environment'
}

export type ItemType = 'story' | 'task' | 'bug' | 'spike'
export type ItemStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type ArtifactStatus = 'not_started' | 'in_progress' | 'in_review' | 'done'
export type DeadlineKind = 'hand-in' | 'presentation' | 'exam' | 'custom'

/** A concrete block of time the student said they can work. */
export interface TimeSlot {
  date: DateStr
  start: TimeStr
  end: TimeStr
  /** Duration in hours, wall-clock. */
  hours: number
}

/** A repeating weekly availability window. */
export interface AvailabilityRule {
  weekday: number // 0 = Sunday .. 6 = Saturday
  start: TimeStr
  end: TimeStr
}

/**
 * A one-off deviation from the weekly pattern.
 * `blackout` without times clears the whole day (exam, holiday, trip).
 * `blackout` with times clears only that window.
 * `extra` adds a window on top of the weekly pattern.
 */
export interface ExceptionDay {
  date: DateStr
  kind: 'blackout' | 'extra'
  start?: TimeStr
  end?: TimeStr
  reason?: string
}

export type PhaseRatios = Record<PhaseKind, number>

/** Calendar-time split recommended for a student project following UP. */
export const DEFAULT_PHASE_RATIOS: PhaseRatios = {
  inception: 0.1,
  elaboration: 0.3,
  construction: 0.5,
  transition: 0.1
}

export interface FixedDeadline {
  title: string
  date: DateStr
  kind: DeadlineKind
  isHard: boolean
}

export interface PlanInput {
  startDate: DateStr
  deadlineDate: DateStr
  sprintLengthDays: number
  weekStartsOn: number
  alignSprintsToWeek: boolean
  phaseRatios: PhaseRatios
  includeDailyStandup: boolean
  availability: AvailabilityRule[]
  exceptions: ExceptionDay[]
  deadlines: FixedDeadline[]
  /** Optional: ECTS credits for the course, used for the effort-budget warning. */
  ectsCredits?: number
}

export interface SprintWindow {
  index: number
  start: DateStr
  end: DateStr
  days: number
}

export interface PlannedCeremony {
  kind: CeremonyKind
  sprintIndex: number | null
  date: DateStr
  start: TimeStr
  end: TimeStr
  minutes: number
  title: string
  notes: string
}

export interface PlannedSprint extends SprintWindow {
  phase: PhaseKind
  name: string
  goal: string
  /** Raw availability inside the sprint window. */
  capacityHours: number
  /** Hours consumed by ceremonies. */
  ceremonyHours: number
  /** capacityHours - ceremonyHours: what is actually left for building. */
  netCapacityHours: number
  workingDays: number
}

export interface PlannedPhase {
  kind: PhaseKind
  /** Phases absorbed into this one when the timeline was too short for all four. */
  mergedFrom: PhaseKind[]
  start: DateStr
  end: DateStr
  sprintIndices: number[]
  goal: string
  capacityHours: number
}

export interface PlannedMilestone {
  kind: MilestoneKind
  name: string
  phase: PhaseKind
  date: DateStr
  description: string
}

export interface PlannedArtifact {
  name: string
  phase: PhaseKind
  discipline: Discipline
  dueDate: DateStr
  description: string
  optional: boolean
}

export interface PlannedBacklogItem {
  title: string
  description: string
  type: ItemType
  discipline: Discipline
  points: number
  estimateHours: number
  phase: PhaseKind
  sprintIndex: number | null
}

export type WarningSeverity = 'info' | 'warning' | 'error'

export interface PlanWarning {
  code: string
  severity: WarningSeverity
  message: string
  hint?: string
}

export interface PlanTotals {
  availableHours: number
  ceremonyHours: number
  netHours: number
  calendarDays: number
  calendarWeeks: number
  workingDays: number
  sprintCount: number
  averageHoursPerWeek: number
}

export interface GeneratedPlan {
  input: PlanInput
  /** Every hour the student said they can work. */
  slots: TimeSlot[]
  /** What is left of those hours once ceremonies are booked - the real build time. */
  freeSlots: TimeSlot[]
  phases: PlannedPhase[]
  sprints: PlannedSprint[]
  ceremonies: PlannedCeremony[]
  milestones: PlannedMilestone[]
  artifacts: PlannedArtifact[]
  backlog: PlannedBacklogItem[]
  totals: PlanTotals
  warnings: PlanWarning[]
}
