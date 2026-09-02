/**
 * Month / week / day / list calendar.
 *
 * Uses only the MIT-licensed FullCalendar packages - the timeline views are a
 * paid add-on, which is why the roadmap is hand-drawn SVG instead.
 */
import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import type { EventClickArg, EventInput } from '@fullcalendar/core'

import { addDays } from '@core/dates'
import { PHASE_LABEL, type PhaseKind } from '@core/types'

import { Card, Modal, PageHeader } from '../components/ui'
import { currentPhase, freeSlots, phaseOfSprint, projectSlots, today } from '../lib/derive'
import { formatDate, formatHours } from '../lib/format'
import { useStore } from '../store/useStore'

const PHASE_COLOR: Record<PhaseKind, string> = {
  inception: 'rgb(var(--phase-inception))',
  elaboration: 'rgb(var(--phase-elaboration))',
  construction: 'rgb(var(--phase-construction))',
  transition: 'rgb(var(--phase-transition))'
}

interface Detail {
  title: string
  when: string
  body: string
  ceremonyId?: number
  done?: boolean
}

export function CalendarView() {
  const snapshot = useStore((state) => state.snapshot)
  const toggleCeremony = useStore((state) => state.toggleCeremony)
  const exportIcs = useStore((state) => state.exportIcs)

  const [showWorkSlots, setShowWorkSlots] = useState(true)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [exported, setExported] = useState<string | null>(null)

  const events = useMemo<EventInput[]>(() => {
    if (!snapshot) return []
    const phaseBySprintId = new Map<number, PhaseKind>(
      snapshot.sprints.map((sprint) => [sprint.id, phaseOfSprint(snapshot, sprint)])
    )
    const list: EventInput[] = []

    for (const ceremony of snapshot.ceremonies) {
      const phase = ceremony.sprintId ? phaseBySprintId.get(ceremony.sprintId) : undefined
      const color = phase ? PHASE_COLOR[phase] : 'rgb(var(--page))'
      list.push({
        id: `ceremony-${ceremony.id}`,
        title: ceremony.title,
        start: `${ceremony.date}T${ceremony.start}`,
        end: `${ceremony.date}T${ceremony.end}`,
        backgroundColor: color,
        borderColor: color,
        textColor: '#fff',
        classNames: ceremony.done ? ['opacity-60'] : [],
        extendedProps: {
          detail: {
            title: ceremony.title,
            when: `${formatDate(ceremony.date)} ${ceremony.start}-${ceremony.end}`,
            body: ceremony.notes,
            ceremonyId: ceremony.id,
            done: ceremony.done
          } satisfies Detail
        }
      })
    }

    for (const milestone of snapshot.milestones) {
      list.push({
        id: `milestone-${milestone.id}`,
        title: `${milestone.kind} - ${milestone.name.replace(/^[A-Z]+ - /, '')}`,
        start: milestone.date,
        end: addDays(milestone.date, 1),
        allDay: true,
        backgroundColor: PHASE_COLOR[milestone.phaseKind] ?? 'rgb(var(--page))',
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: {
          detail: {
            title: milestone.name,
            when: `${formatDate(milestone.date)} - ${PHASE_LABEL[milestone.phaseKind] ?? ''} gate`,
            body: milestone.description
          } satisfies Detail
        }
      })
    }

    for (const artifact of snapshot.artifacts) {
      list.push({
        id: `artifact-${artifact.id}`,
        title: `Due: ${artifact.name}`,
        start: artifact.dueDate,
        end: addDays(artifact.dueDate, 1),
        allDay: true,
        display: 'block',
        backgroundColor: 'transparent',
        borderColor: 'rgb(var(--line))',
        textColor: artifact.status === 'done' ? 'rgb(var(--ink-faint))' : 'rgb(var(--ink))',
        extendedProps: {
          detail: {
            title: artifact.name,
            when: `Due ${formatDate(artifact.dueDate)}`,
            body: artifact.description
          } satisfies Detail
        }
      })
    }

    for (const deadline of snapshot.deadlines) {
      list.push({
        id: `deadline-${deadline.id}`,
        title: deadline.title,
        start: deadline.date,
        end: addDays(deadline.date, 1),
        allDay: true,
        backgroundColor: 'rgb(var(--danger))',
        borderColor: 'transparent',
        textColor: '#fff',
        extendedProps: {
          detail: {
            title: deadline.title,
            when: formatDate(deadline.date),
            body: deadline.isHard ? 'Hard deadline.' : 'Soft deadline.'
          } satisfies Detail
        }
      })
    }

    if (showWorkSlots) {
      const free = freeSlots(projectSlots(snapshot), snapshot.ceremonies)
      free.forEach((slot, index) => {
        list.push({
          id: `slot-${index}`,
          title: `Work - ${formatHours(slot.hours)}`,
          start: `${slot.date}T${slot.start}`,
          end: `${slot.date}T${slot.end}`,
          display: 'background',
          backgroundColor: 'rgb(var(--page) / 0.18)'
        })
      })
    }

    return list
  }, [snapshot, showWorkSlots])

  if (!snapshot) return null

  const onEventClick = (arg: EventClickArg) => {
    const found = arg.event.extendedProps.detail as Detail | undefined
    if (found) setDetail(found)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        phase={currentPhase(snapshot, today())?.kind}
        description="Ceremonies sit inside your declared working time. Shaded blocks are the hours left to build in."
        actions={
          <>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={showWorkSlots}
                onChange={(event) => setShowWorkSlots(event.target.checked)}
              />
              Show working time
            </label>
            <button className="btn" onClick={async () => setExported(await exportIcs(true))}>
              Export .ics
            </button>
          </>
        }
      />

      {exported && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
          Calendar written to {exported}
        </p>
      )}

      <Card>
        <div className="px-3 py-3">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
            initialView="dayGridMonth"
            initialDate={clampToProject(snapshot.project.startDate, snapshot.project.deadlineDate)}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
            }}
            buttonText={{
              today: 'Today',
              month: 'Month',
              week: 'Week',
              day: 'Day',
              list: 'List'
            }}
            events={events}
            eventClick={onEventClick}
            firstDay={snapshot.project.weekStartsOn}
            height="auto"
            nowIndicator
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            expandRows
            dayMaxEventRows={4}
            weekNumbers
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          />
        </div>
      </Card>

      <Modal
        open={detail !== null}
        title={detail?.title ?? ''}
        onClose={() => setDetail(null)}
        footer={
          detail?.ceremonyId !== undefined ? (
            <button
              className="btn btn-primary"
              onClick={async () => {
                await toggleCeremony(detail.ceremonyId as number, !detail.done)
                setDetail(null)
              }}
            >
              {detail.done ? 'Mark as not done' : 'Mark as done'}
            </button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-2">
            <p className="text-sm tabular-nums text-ink-muted">{detail.when}</p>
            {detail.body && <p className="text-sm">{detail.body}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Open on today when today is inside the project, otherwise on the start date. */
function clampToProject(start: string, end: string): string {
  const now = today()
  if (now < start) return start
  if (now > end) return end
  return now
}
