import { useEffect, useMemo } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'

import { PHASE_LABEL } from '@core/types'

import { currentPhase, today } from './lib/derive'
import { applyTheme, useStore } from './store/useStore'
import { Artifacts } from './routes/Artifacts'
import { Backlog } from './routes/Backlog'
import { Board } from './routes/Board'
import { CalendarView } from './routes/CalendarView'
import { Dashboard } from './routes/Dashboard'
import { Progress } from './routes/Progress'
import { Roadmap } from './routes/Roadmap'
import { Settings } from './routes/Settings'
import { Setup } from './routes/Setup'
import { Welcome } from './routes/Welcome'

// Grouped so the sidebar reads as four short lists rather than one column of
// nine equally-weighted links.
const NAV = [
  {
    group: 'Plan',
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/roadmap', label: 'Roadmap' },
      { to: '/calendar', label: 'Calendar' }
    ]
  },
  {
    group: 'Work',
    items: [
      { to: '/board', label: 'Sprint board' },
      { to: '/backlog', label: 'Backlog' },
      { to: '/artifacts', label: 'Deliverables' }
    ]
  },
  {
    group: 'Track',
    items: [{ to: '/progress', label: 'Progress' }]
  },
  {
    group: 'Project',
    items: [
      { to: '/setup', label: 'Setup & re-plan' },
      { to: '/settings', label: 'Settings' }
    ]
  }
]

function Sidebar() {
  const projects = useStore((state) => state.projects)
  const activeId = useStore((state) => state.activeId)
  const selectProject = useStore((state) => state.selectProject)
  const snapshot = useStore((state) => state.snapshot)
  const phase = snapshot ? currentPhase(snapshot, today()) : null

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-line bg-surface-sunken">
      <div className="px-3 pb-3 pt-3.5">
        <select
          className="input"
          value={activeId ?? ''}
          onChange={(event) =>
            void selectProject(event.target.value === '' ? null : Number(event.target.value))
          }
          aria-label="Active project"
        >
          {projects.length === 0 && <option value="">No projects yet</option>}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {phase && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-page" aria-hidden />
            {PHASE_LABEL[phase.kind]}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {NAV.map((section) => (
          <div key={section.group} className="mb-3">
            <p className="eyebrow px-2.5 pb-1">{section.group}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `block rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                        isActive
                          ? 'bg-page/12 font-medium text-page'
                          : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

function ErrorBanner() {
  const error = useStore((state) => state.error)
  const clearError = useStore((state) => state.clearError)
  if (!error) return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-danger/40 bg-danger/10 px-5 py-2">
      <p className="text-[13px] text-danger">{error}</p>
      <button className="btn btn-ghost btn-sm" onClick={clearError}>
        Dismiss
      </button>
    </div>
  )
}

export default function App() {
  const ready = useStore((state) => state.ready)
  const boot = useStore((state) => state.boot)
  const theme = useStore((state) => state.theme)
  const activeId = useStore((state) => state.activeId)
  const snapshot = useStore((state) => state.snapshot)

  // The colour of the phase the project is in right now. Everything downstream
  // reads it through the `--page` custom property.
  const phaseKind = useMemo(
    () => (snapshot ? (currentPhase(snapshot, today())?.kind ?? null) : null),
    [snapshot]
  )

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    applyTheme(theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme(theme)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">
        Opening your project database...
      </div>
    )
  }

  if (activeId === null) {
    return (
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="flex h-full flex-col">
          <ErrorBanner />
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Welcome />} />
          </Routes>
        </div>
      </HashRouter>
    )
  }

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex h-full" data-phase={phaseKind ?? undefined}>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <ErrorBanner />
          <main className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <div className="mx-auto max-w-6xl">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/roadmap" element={<Roadmap />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/board" element={<Board />} />
                <Route path="/backlog" element={<Backlog />} />
                <Route path="/artifacts" element={<Artifacts />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
