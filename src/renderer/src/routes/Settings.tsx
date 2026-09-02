import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Card, Field, Modal, PageHeader } from '../components/ui'
import { formatDateLong } from '../lib/format'
import { useStore, type Theme } from '../store/useStore'

const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export function Settings() {
  const navigate = useNavigate()
  const snapshot = useStore((state) => state.snapshot)
  const info = useStore((state) => state.info)
  const theme = useStore((state) => state.theme)
  const setTheme = useStore((state) => state.setTheme)
  const updateProject = useStore((state) => state.updateProject)
  const deleteProject = useStore((state) => state.deleteProject)
  const exportJson = useStore((state) => state.exportJson)
  const importJson = useStore((state) => state.importJson)
  const busy = useStore((state) => state.busy)

  const [details, setDetails] = useState<{ name?: string; course?: string; description?: string }>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  if (!snapshot) return null

  const current = {
    name: details.name ?? snapshot.project.name,
    course: details.course ?? snapshot.project.course,
    description: details.description ?? snapshot.project.description
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />

      {saved && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">{saved}</p>
      )}

      <Card title="Project details">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className="input"
              value={current.name}
              onChange={(event) => setDetails({ ...details, name: event.target.value })}
            />
          </Field>
          <Field label="Course">
            <input
              className="input"
              value={current.course}
              onChange={(event) => setDetails({ ...details, course: event.target.value })}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className="input min-h-[4.5rem]"
              value={current.description}
              onChange={(event) => setDetails({ ...details, description: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2 flex gap-2">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                await updateProject(current)
                setDetails({})
                setSaved('Project details saved.')
              }}
            >
              Save
            </button>
            <button className="btn" onClick={() => navigate('/setup')}>
              Change dates, availability or method
            </button>
          </div>
        </div>
      </Card>

      <Card title="Appearance">
        <div className="flex gap-2 px-4 py-4">
          {THEMES.map((option) => (
            <button
              key={option.value}
              className={`btn ${theme === option.value ? 'btn-primary' : ''}`}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Your data">
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-ink-muted">
            Everything lives in a single SQLite file on this machine. Nothing is uploaded anywhere.
            Export to JSON to back it up, move it to another computer, or commit it next to the
            project it describes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                const path = await exportJson()
                if (path) setSaved(`Exported to ${path}`)
              }}
            >
              Export this project (JSON)
            </button>
            <button className="btn" disabled={busy} onClick={() => void importJson()}>
              Import a project
            </button>
          </div>
          {info && (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-xs text-ink-muted">
              <dt>Database</dt>
              <dd className="break-all">{info.databasePath}</dd>
              <dt>App version</dt>
              <dd>
                {info.version} (Electron {info.electron})
              </dd>
              <dt>Created</dt>
              <dd>{formatDateLong(snapshot.project.createdAt.slice(0, 10))}</dd>
              <dt>Last planned</dt>
              <dd>
                {snapshot.project.plannedAt
                  ? formatDateLong(snapshot.project.plannedAt.slice(0, 10))
                  : 'never'}
              </dd>
            </dl>
          )}
        </div>
      </Card>

      <Card title="Danger zone">
        <div className="px-4 py-4">
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete this project
          </button>
          <p className="mt-2 text-xs text-ink-muted">
            Removes the plan, backlog and logged work for {snapshot.project.name}. Export first if
            you might want it back.
          </p>
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        title="Delete this project?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                await deleteProject(snapshot.project.id)
                setConfirmDelete(false)
                navigate('/')
              }}
            >
              Delete permanently
            </button>
          </>
        }
      >
        <p className="text-sm">
          <strong>{snapshot.project.name}</strong> and everything in it - {snapshot.items.length}{' '}
          backlog items, {snapshot.sessions.length} logged sessions and the whole plan - will be
          removed. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
