import { Link } from 'react-router-dom'

import { PHASE_INTENT, PHASE_ORDER } from '@core/types'

import { Card, PhaseBadge } from '../components/ui'
import { useStore } from '../store/useStore'

export function Welcome() {
  const importJson = useStore((state) => state.importJson)
  const busy = useStore((state) => state.busy)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Semester Project Manager</h1>
        <p className="mt-2 text-ink-muted">
          Tell it when you can actually work and when the project is due. It lays out the Unified
          Process phases, cuts them into Scrum sprints, books the ceremonies into your real free
          slots and tracks whether you are on course for the deadline.
        </p>
      </header>

      <Card title="The four phases it plans for">
        <ul className="divide-y divide-line">
          {PHASE_ORDER.map((kind) => (
            <li key={kind} className="px-4 py-3">
              <PhaseBadge phase={kind} />
              <p className="mt-1.5 text-sm text-ink-muted">{PHASE_INTENT[kind]}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary" to="/setup">
          Plan a new project
        </Link>
        <button className="btn" disabled={busy} onClick={() => void importJson()}>
          Import a project file
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        Everything is stored locally on this machine. No account, no server, no telemetry.
      </p>
    </div>
  )
}
