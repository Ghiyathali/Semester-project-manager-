import { useEffect } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'

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

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/board', label: 'Sprint board' },
  { to: '/backlog', label: 'Backlog' },
  { to: '/artifacts', label: 'UP deliverables' },
  { to: '/progress', label: 'Progress' },
  { to: '/setup', label: 'Setup & re-plan' },
  { to: '/settings', label: 'Settings' }
]

function Sidebar() {
  const projects = useStore((state) => state.projects)
  const activeId = useStore((state) => state.activeId)
  const selectProject = useStore((state) => state.selectProject)
  const snapshot = useStore((state) => state.snapshot)

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-sunken">
      <div className="border-b border-line px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Project</p>
        <select
          className="input mt-1.5"
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
        {snapshot && (
          <p className="mt-1.5 truncate text-xs text-ink-muted" title={snapshot.project.course}>
            {snapshot.project.course || 'No course set'}
          </p>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 font-medium text-accent'
                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <p className="border-t border-line px-3 py-2 text-[11px] leading-tight text-ink-faint">
        SCRUM sprints inside Unified Process phases, laid out on your real calendar.
      </p>
    </nav>
  )
}

function ErrorBanner() {
  const error = useStore((state) => state.error)
  const clearError = useStore((state) => state.clearError)
  if (!error) return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2">
      <p className="text-sm text-danger">{error}</p>
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

  // With no project yet, the only meaningful screens are the welcome page and
  // the setup wizard - so the shell stays out of the way until one exists.
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
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <ErrorBanner />
          <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
