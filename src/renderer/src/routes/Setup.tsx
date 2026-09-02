/**
 * Project setup and re-planning.
 *
 * The same screen creates a project and re-plans an existing one. The plan
 * preview on the right recomputes as you type, so the consequences of a shorter
 * sprint or an exam week are visible before anything is committed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { addDays, todayStr } from '@core/dates'
import {
  DEFAULT_PHASE_RATIOS,
  PHASE_LABEL,
  PHASE_ORDER,
  type ExceptionDay,
  type FixedDeadline,
  type GeneratedPlan,
  type PhaseKind,
  type PhaseRatios,
  type PlanInput
} from '@core/types'
import type { ReplanDiff } from '@shared/models'

import { AvailabilityGrid } from '../components/AvailabilityGrid'
import { Card, Field, Modal, PageHeader, PhaseBadge, WarningList } from '../components/ui'
import { formatDate, formatHours, formatRange, pluralise, weekdayName } from '../lib/format'
import { useStore } from '../store/useStore'

const STEPS = ['Project', 'Dates', 'Availability', 'Interruptions', 'Method'] as const

interface FormState {
  name: string
  course: string
  description: string
  timezone: string
  ectsCredits: string
  startDate: string
  deadlineDate: string
  deadlines: FixedDeadline[]
  availability: PlanInput['availability']
  exceptions: ExceptionDay[]
  sprintLengthDays: number
  weekStartsOn: number
  alignSprintsToWeek: boolean
  includeDailyStandup: boolean
  phaseRatios: PhaseRatios
  seedBacklog: boolean
}

function defaultForm(): FormState {
  const start = todayStr()
  return {
    name: '',
    course: '',
    description: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ectsCredits: '15',
    startDate: start,
    deadlineDate: addDays(start, 104),
    deadlines: [],
    availability: [
      { weekday: 2, start: '18:00', end: '21:00' },
      { weekday: 4, start: '18:00', end: '21:00' },
      { weekday: 6, start: '10:00', end: '14:00' }
    ],
    exceptions: [],
    sprintLengthDays: 14,
    weekStartsOn: 1,
    alignSprintsToWeek: true,
    includeDailyStandup: false,
    phaseRatios: { ...DEFAULT_PHASE_RATIOS },
    seedBacklog: true
  }
}

/** Ratios are entered as percentages; normalise so they always sum to 1. */
function normaliseRatios(ratios: PhaseRatios): PhaseRatios {
  const sum = PHASE_ORDER.reduce((total, kind) => total + (ratios[kind] || 0), 0)
  if (sum <= 0) return { ...DEFAULT_PHASE_RATIOS }
  return PHASE_ORDER.reduce((out, kind) => {
    out[kind] = ratios[kind] / sum
    return out
  }, {} as PhaseRatios)
}

function toPlanInput(form: FormState): PlanInput {
  const ects = Number(form.ectsCredits)
  const handIn: FixedDeadline = {
    title: 'Hand-in',
    date: form.deadlineDate,
    kind: 'hand-in',
    isHard: true
  }
  const deadlines = form.deadlines.some((d) => d.date === handIn.date && d.kind === 'hand-in')
    ? form.deadlines
    : [handIn, ...form.deadlines]

  return {
    startDate: form.startDate,
    deadlineDate: form.deadlineDate,
    sprintLengthDays: form.sprintLengthDays,
    weekStartsOn: form.weekStartsOn,
    alignSprintsToWeek: form.alignSprintsToWeek,
    phaseRatios: normaliseRatios(form.phaseRatios),
    includeDailyStandup: form.includeDailyStandup,
    availability: form.availability,
    exceptions: form.exceptions,
    deadlines,
    ectsCredits: Number.isFinite(ects) && ects > 0 ? ects : undefined
  }
}

export function Setup() {
  const navigate = useNavigate()
  const snapshot = useStore((state) => state.snapshot)
  const busy = useStore((state) => state.busy)
  const createProject = useStore((state) => state.createProject)
  const updateProject = useStore((state) => state.updateProject)
  const replan = useStore((state) => state.replan)
  const previewPlan = useStore((state) => state.previewPlan)

  const isEdit = snapshot !== null
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [preview, setPreview] = useState<GeneratedPlan | null>(null)
  const [diff, setDiff] = useState<ReplanDiff | null>(null)
  const [validation, setValidation] = useState<string | null>(null)

  // Prefill from the active project so "re-plan" starts from what exists today.
  useEffect(() => {
    if (!snapshot) return
    setForm({
      name: snapshot.project.name,
      course: snapshot.project.course,
      description: snapshot.project.description,
      timezone: snapshot.project.timezone,
      ectsCredits: snapshot.project.ectsCredits ? String(snapshot.project.ectsCredits) : '',
      startDate: snapshot.project.startDate,
      deadlineDate: snapshot.project.deadlineDate,
      deadlines: snapshot.deadlines.map((d) => ({
        title: d.title,
        date: d.date,
        kind: d.kind,
        isHard: d.isHard
      })),
      availability: snapshot.availability.map((a) => ({
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
      })),
      sprintLengthDays: snapshot.project.sprintLengthDays,
      weekStartsOn: snapshot.project.weekStartsOn,
      alignSprintsToWeek: snapshot.project.alignSprintsToWeek,
      includeDailyStandup: snapshot.project.includeDailyStandup,
      phaseRatios: snapshot.project.phaseRatios,
      seedBacklog: false
    })
  }, [snapshot])

  const planInput = useMemo(() => toPlanInput(form), [form])

  // Live preview, debounced so painting the grid does not fire a call per cell.
  useEffect(() => {
    if (form.deadlineDate < form.startDate) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      previewPlan(planInput)
        .then((plan) => {
          if (!cancelled) setPreview(plan)
        })
        .catch(() => {
          if (!cancelled) setPreview(null)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [planInput, previewPlan, form.startDate, form.deadlineDate])

  const patch = useCallback((fields: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...fields }))
  }, [])

  const setAvailability = useCallback(
    (availability: PlanInput['availability']) => patch({ availability }),
    [patch]
  )

  function validate(): string | null {
    if (form.name.trim().length === 0) return 'Give the project a name.'
    if (form.deadlineDate <= form.startDate) return 'The deadline must be after the start date.'
    if (form.availability.length === 0) return 'Paint at least one working slot in the week.'
    return null
  }

  async function onCreate() {
    const problem = validate()
    setValidation(problem)
    if (problem) return
    await createProject({
      name: form.name.trim(),
      course: form.course.trim(),
      description: form.description.trim(),
      timezone: form.timezone,
      plan: planInput,
      seedBacklog: form.seedBacklog
    })
    navigate('/')
  }

  async function onPreviewReplan() {
    const problem = validate()
    setValidation(problem)
    if (problem) return
    setDiff(await replan({ plan: planInput, apply: false }))
  }

  async function onApplyReplan() {
    await replan({ plan: planInput, apply: true, seedBacklog: form.seedBacklog })
    await updateProject({
      name: form.name.trim(),
      course: form.course.trim(),
      description: form.description.trim()
    })
    setDiff(null)
    navigate('/roadmap')
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Setup & re-plan' : 'New project'}
        description={
          isEdit
            ? 'Change the inputs and re-plan. Sprints, ceremonies and deadlines are rebuilt; anything you edited by hand is kept.'
            : 'Describe when you can work and when it is due. The app lays out UP phases, sprints and ceremonies on your real calendar.'
        }
      />

      <ol className="mb-5 flex flex-wrap gap-1.5">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                index === step
                  ? 'bg-page text-white'
                  : 'bg-surface-sunken text-ink-muted hover:text-ink'
              }`}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {step === 0 && <ProjectStep form={form} patch={patch} />}
          {step === 1 && <DatesStep form={form} patch={patch} />}
          {step === 2 && (
            <Card title="When can you work?">
              <div className="px-4 py-4">
                <AvailabilityGrid rules={form.availability} onChange={setAvailability} />
              </div>
            </Card>
          )}
          {step === 3 && <ExceptionsStep form={form} patch={patch} />}
          {step === 4 && <MethodStep form={form} patch={patch} isEdit={isEdit} />}

          {validation && (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {validation}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                Next
              </button>
            ) : isEdit ? (
              <button className="btn btn-primary" disabled={busy} onClick={onPreviewReplan}>
                Review changes
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={onCreate}>
                Create project & generate plan
              </button>
            )}
          </div>
        </div>

        <PlanPreview plan={preview} />
      </div>

      <Modal
        open={diff !== null}
        title="Re-plan this project?"
        onClose={() => setDiff(null)}
        footer={
          <>
            <button className="btn" onClick={() => setDiff(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={onApplyReplan}>
              Apply new plan
            </button>
          </>
        }
      >
        {diff && <DiffSummary diff={diff} />}
      </Modal>
    </div>
  )
}

function ProjectStep({
  form,
  patch
}: {
  form: FormState
  patch: (fields: Partial<FormState>) => void
}) {
  return (
    <Card title="What are you building?">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
        <Field label="Project name" className="sm:col-span-2">
          <input
            className="input"
            value={form.name}
            placeholder="Bachelor project: warehouse routing"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Course">
          <input
            className="input"
            value={form.course}
            placeholder="SW6 Bachelor Project"
            onChange={(event) => patch({ course: event.target.value })}
          />
        </Field>
        <Field label="ECTS credits" hint="Used to sanity-check your hours against the workload.">
          <input
            className="input"
            type="number"
            min={0}
            max={120}
            value={form.ectsCredits}
            onChange={(event) => patch({ ectsCredits: event.target.value })}
          />
        </Field>
        <Field label="Short description" className="sm:col-span-2">
          <textarea
            className="input min-h-[4.5rem]"
            value={form.description}
            placeholder="One or two sentences on what the project is about."
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
      </div>
    </Card>
  )
}

function DatesStep({
  form,
  patch
}: {
  form: FormState
  patch: (fields: Partial<FormState>) => void
}) {
  const [draft, setDraft] = useState<FixedDeadline>({
    title: '',
    date: form.startDate,
    kind: 'presentation',
    isHard: true
  })

  return (
    <div className="space-y-4">
      <Card title="Project window">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="Start date">
            <input
              className="input"
              type="date"
              value={form.startDate}
              onChange={(event) => patch({ startDate: event.target.value })}
            />
          </Field>
          <Field label="Hand-in deadline">
            <input
              className="input"
              type="date"
              value={form.deadlineDate}
              onChange={(event) => patch({ deadlineDate: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Other fixed dates" >
        <div className="px-4 py-4">
          <p className="mb-3 text-sm text-ink-muted">
            Presentations, supervisor meetings, mid-term reviews - anything that cannot move. The
            hand-in deadline above is added automatically.
          </p>
          {form.deadlines.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-md border border-line">
              {form.deadlines.map((deadline, index) => (
                <li key={index} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm">{deadline.title}</span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {formatDate(deadline.date)}
                  </span>
                  <span className="chip bg-surface-sunken text-ink-muted">{deadline.kind}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      patch({ deadlines: form.deadlines.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]">
            <input
              className="input"
              placeholder="Mid-term presentation"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <input
              className="input"
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
            <select
              className="input"
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as FixedDeadline['kind'] })
              }
            >
              <option value="presentation">Presentation</option>
              <option value="exam">Exam</option>
              <option value="hand-in">Hand-in</option>
              <option value="custom">Other</option>
            </select>
            <button
              className="btn"
              disabled={draft.title.trim().length === 0}
              onClick={() => {
                patch({ deadlines: [...form.deadlines, { ...draft, title: draft.title.trim() }] })
                setDraft({ ...draft, title: '' })
              }}
            >
              Add
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ExceptionsStep({
  form,
  patch
}: {
  form: FormState
  patch: (fields: Partial<FormState>) => void
}) {
  const [draft, setDraft] = useState<{ from: string; to: string; kind: ExceptionDay['kind']; reason: string }>(
    { from: form.startDate, to: form.startDate, kind: 'blackout', reason: '' }
  )

  function addRange() {
    const added: ExceptionDay[] = []
    let cursor = draft.from
    for (let i = 0; cursor <= draft.to && i < 400; i++) {
      added.push({ date: cursor, kind: draft.kind, reason: draft.reason.trim() })
      cursor = addDays(cursor, 1)
    }
    const existing = form.exceptions.filter((e) => !added.some((a) => a.date === e.date))
    patch({ exceptions: [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date)) })
    setDraft({ ...draft, reason: '' })
  }

  return (
    <Card title="Weeks you cannot work">
      <div className="px-4 py-4">
        <p className="mb-3 text-sm text-ink-muted">
          Exam periods, holidays, a week away. The planner routes work around these instead of
          quietly assuming you will catch up.
        </p>

        <div className="grid gap-2 sm:grid-cols-[9rem_9rem_9rem_1fr_auto]">
          <Field label="From">
            <input
              className="input"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              className="input"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as ExceptionDay['kind'] })
              }
            >
              <option value="blackout">Unavailable</option>
              <option value="extra">Extra full day</option>
            </select>
          </Field>
          <Field label="Reason">
            <input
              className="input"
              placeholder="Exam week"
              value={draft.reason}
              onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <button className="btn" disabled={draft.to < draft.from} onClick={addRange}>
              Add
            </button>
          </div>
        </div>

        {form.exceptions.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {form.exceptions.map((exception) => (
              <li key={exception.date} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-32 text-sm tabular-nums">{formatDate(exception.date)}</span>
                <span
                  className={`chip ${
                    exception.kind === 'blackout'
                      ? 'bg-danger/10 text-danger'
                      : 'bg-ok/10 text-ok'
                  }`}
                >
                  {exception.kind === 'blackout' ? 'Unavailable' : 'Extra day'}
                </span>
                <span className="flex-1 truncate text-sm text-ink-muted">{exception.reason}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    patch({ exceptions: form.exceptions.filter((e) => e.date !== exception.date) })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function MethodStep({
  form,
  patch,
  isEdit
}: {
  form: FormState
  patch: (fields: Partial<FormState>) => void
  isEdit: boolean
}) {
  const percent = (kind: PhaseKind) => Math.round(form.phaseRatios[kind] * 100)
  const sum = PHASE_ORDER.reduce((total, kind) => total + percent(kind), 0)

  return (
    <div className="space-y-4">
      <Card title="Sprints">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="Sprint length" hint="Two weeks suits most semester projects.">
            <select
              className="input"
              value={form.sprintLengthDays}
              onChange={(event) => patch({ sprintLengthDays: Number(event.target.value) })}
            >
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={21}>3 weeks</option>
              <option value={28}>4 weeks</option>
            </select>
          </Field>
          <Field label="Week starts on">
            <select
              className="input"
              value={form.weekStartsOn}
              onChange={(event) => patch({ weekStartsOn: Number(event.target.value) })}
            >
              {[1, 0, 6].map((weekday) => (
                <option key={weekday} value={weekday}>
                  {weekdayName(weekday)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.alignSprintsToWeek}
              onChange={(event) => patch({ alignSprintsToWeek: event.target.checked })}
            />
            <span>
              Align sprints to the week
              <span className="block text-xs text-ink-muted">
                Sprints start on the same weekday every time, which is easier to keep track of.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.includeDailyStandup}
              onChange={(event) => patch({ includeDailyStandup: event.target.checked })}
            />
            <span>
              Schedule a daily check-in
              <span className="block text-xs text-ink-muted">
                15 minutes at the start of each working day. Useful for building the habit; noisy if
                you already keep notes.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card title="How the semester is split between UP phases">
        <div className="px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {PHASE_ORDER.map((kind) => (
              <div key={kind}>
                <PhaseBadge phase={kind} className="mb-1" />
                <div className="flex items-center gap-1">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    value={percent(kind)}
                    onChange={(event) =>
                      patch({
                        phaseRatios: {
                          ...form.phaseRatios,
                          [kind]: Math.max(0, Number(event.target.value)) / 100
                        }
                      })
                    }
                  />
                  <span className="text-sm text-ink-muted">%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Currently {sum}%{sum !== 100 && ' - values are normalised, so relative sizes are what matter'}
            . The defaults (10/30/50/10) follow the classic UP effort profile. Each phase always
            gets at least one whole sprint.
          </p>
          <button
            className="btn btn-sm mt-2"
            onClick={() => patch({ phaseRatios: { ...DEFAULT_PHASE_RATIOS } })}
          >
            Reset to defaults
          </button>
        </div>
      </Card>

      <Card title="Starter backlog">
        <label className="flex items-start gap-2 px-4 py-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.seedBacklog}
            onChange={(event) => patch({ seedBacklog: event.target.checked })}
          />
          <span>
            {isEdit ? 'Add the suggested UP starter items again' : 'Seed the backlog with suggested UP tasks'}
            <span className="block text-xs text-ink-muted">
              A handful of real tasks per phase - vision document, architecture spike, report
              chapters - so the board is not empty on day one. Edit or delete them freely.
            </span>
          </span>
        </label>
      </Card>
    </div>
  )
}

function PlanPreview({ plan }: { plan: GeneratedPlan | null }) {
  if (!plan) {
    return (
      <Card title="Plan preview" className="h-fit xl:sticky xl:top-0">
        <p className="px-4 py-6 text-sm text-ink-muted">
          Set a start date and a deadline to see the generated plan.
        </p>
      </Card>
    )
  }

  const { totals } = plan
  return (
    <div className="h-fit space-y-4 xl:sticky xl:top-0">
      <Card title="Plan preview">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <dt className="text-ink-muted">Sprints</dt>
          <dd className="text-right tabular-nums">{totals.sprintCount}</dd>
          <dt className="text-ink-muted">Calendar</dt>
          <dd className="text-right tabular-nums">{totals.calendarWeeks.toFixed(1)} weeks</dd>
          <dt className="text-ink-muted">Working time</dt>
          <dd className="text-right tabular-nums">{formatHours(totals.availableHours)}</dd>
          <dt className="text-ink-muted">Scrum overhead</dt>
          <dd className="text-right tabular-nums">-{formatHours(totals.ceremonyHours)}</dd>
          <dt className="font-medium">Time to build</dt>
          <dd className="text-right font-medium tabular-nums">{formatHours(totals.netHours)}</dd>
          <dt className="text-ink-muted">Average week</dt>
          <dd className="text-right tabular-nums">{formatHours(totals.averageHoursPerWeek)}</dd>
        </dl>
      </Card>

      <Card title="Phases">
        <ul className="divide-y divide-line">
          {plan.phases.map((phase) => (
            <li key={phase.kind} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <PhaseBadge phase={phase.kind} />
                <span className="text-xs tabular-nums text-ink-muted">
                  {pluralise(phase.sprintIndices.length, 'sprint')}
                </span>
              </div>
              <p className="mt-1 text-xs tabular-nums text-ink-muted">
                {formatRange(phase.start, phase.end)} - {formatHours(phase.capacityHours)}
              </p>
              {phase.mergedFrom.length > 1 && (
                <p className="mt-1 text-xs text-warn">
                  Merged: {phase.mergedFrom.map((kind) => PHASE_LABEL[kind]).join(' + ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Checks (${plan.warnings.length})`}>
        <WarningList warnings={plan.warnings} />
      </Card>
    </div>
  )
}

function DiffSummary({ diff }: { diff: ReplanDiff }) {
  const rows: Array<[string, string]> = [
    ['Sprints', `${diff.sprintsBefore} -> ${diff.sprintsAfter}`],
    ['Sprints whose dates change', String(diff.sprintsMoved)],
    ['Milestones that move', String(diff.milestonesMoved)],
    ['Deliverables rescheduled', String(diff.artifactsRescheduled)],
    ['Ceremonies rebuilt', String(diff.ceremoniesReplaced)],
    ['Your own edits kept', String(diff.preservedUserEdits)],
    ['Items returning to the backlog', String(diff.itemsUnassigned)]
  ]

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted">
        Backlog items, logged work and anything you edited by hand are preserved. Items on a sprint
        that no longer exists go back to the backlog.
      </p>
      {diff.warnings.length > 0 && (
        <div className="rounded-md border border-line">
          <WarningList warnings={diff.warnings} />
        </div>
      )}
    </div>
  )
}
