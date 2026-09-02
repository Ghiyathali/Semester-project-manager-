/**
 * Application state.
 *
 * The whole project loads in one `projects:snapshot` call and every mutation
 * refetches it. For a data set this size that is far simpler than maintaining a
 * client-side cache, and it means the UI can never drift from the database.
 */
import { create } from 'zustand'

import type { PlanInput } from '@core/types'
import type {
  AppInfo,
  CreateProjectPayload,
  MoveItemPayload,
  ReplanPayload,
  SaveArtifactPayload,
  SaveItemPayload,
  SaveMilestonePayload,
  SaveSessionPayload
} from '@shared/ipc'
import type { ProjectSnapshot, ProjectSummary, ReplanDiff } from '@shared/models'

import { call, messageOf } from '../lib/api'

export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'spm.theme'

interface AppState {
  ready: boolean
  busy: boolean
  error: string | null
  info: AppInfo | null
  projects: ProjectSummary[]
  activeId: number | null
  snapshot: ProjectSnapshot | null
  theme: Theme

  boot(): Promise<void>
  refresh(): Promise<void>
  selectProject(id: number | null): Promise<void>
  createProject(payload: CreateProjectPayload): Promise<number>
  deleteProject(id: number): Promise<void>
  updateProject(fields: { name?: string; course?: string; description?: string }): Promise<void>

  replan(payload: Omit<ReplanPayload, 'projectId'>): Promise<ReplanDiff>
  previewPlan(input: PlanInput): Promise<Awaited<ReturnType<typeof call<'plan:preview'>>>>

  saveItem(payload: Omit<SaveItemPayload, 'projectId'>): Promise<void>
  moveItem(payload: MoveItemPayload): Promise<void>
  deleteItem(id: number): Promise<void>
  saveArtifact(payload: SaveArtifactPayload): Promise<void>
  saveMilestone(payload: SaveMilestonePayload): Promise<void>
  toggleCeremony(id: number, done: boolean): Promise<void>
  saveSession(payload: Omit<SaveSessionPayload, 'projectId'>): Promise<void>
  deleteSession(id: number): Promise<void>

  exportIcs(includeWorkSlots: boolean): Promise<string | null>
  exportJson(): Promise<string | null>
  importJson(): Promise<void>

  setTheme(theme: Theme): void
  clearError(): void
}

function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

export const useStore = create<AppState>((set, get) => {
  /** Run a mutation, then reload the snapshot so the UI reflects the database. */
  async function mutate(action: () => Promise<unknown>): Promise<void> {
    set({ busy: true, error: null })
    try {
      await action()
      await get().refresh()
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ busy: false })
    }
  }

  return {
    ready: false,
    busy: false,
    error: null,
    info: null,
    projects: [],
    activeId: null,
    snapshot: null,
    theme: readTheme(),

    async boot() {
      try {
        const [info, projects, activeId] = await Promise.all([
          call('app:info'),
          call('projects:list'),
          call('projects:active')
        ])
        set({ info, projects, activeId })
        if (activeId !== null) {
          set({ snapshot: await call('projects:snapshot', activeId) })
        }
      } catch (error) {
        set({ error: messageOf(error) })
      } finally {
        set({ ready: true })
      }
    },

    async refresh() {
      const { activeId } = get()
      const projects = await call('projects:list')
      if (activeId === null) {
        set({ projects, snapshot: null })
        return
      }
      set({ projects, snapshot: await call('projects:snapshot', activeId) })
    },

    async selectProject(id) {
      set({ busy: true, error: null })
      try {
        await call('projects:setActive', id)
        set({
          activeId: id,
          snapshot: id === null ? null : await call('projects:snapshot', id)
        })
      } catch (error) {
        set({ error: messageOf(error) })
      } finally {
        set({ busy: false })
      }
    },

    async createProject(payload) {
      set({ busy: true, error: null })
      try {
        const id = await call('projects:create', payload)
        set({
          activeId: id,
          projects: await call('projects:list'),
          snapshot: await call('projects:snapshot', id)
        })
        return id
      } catch (error) {
        set({ error: messageOf(error) })
        throw error
      } finally {
        set({ busy: false })
      }
    },

    async deleteProject(id) {
      set({ busy: true, error: null })
      try {
        await call('projects:delete', id)
        const projects = await call('projects:list')
        const nextId = await call('projects:active')
        set({
          projects,
          activeId: nextId,
          snapshot: nextId === null ? null : await call('projects:snapshot', nextId)
        })
      } catch (error) {
        set({ error: messageOf(error) })
      } finally {
        set({ busy: false })
      }
    },

    async updateProject(fields) {
      const id = get().activeId
      if (id === null) return
      await mutate(() => call('projects:update', { id, ...fields }))
    },

    async replan(payload) {
      const projectId = get().activeId
      if (projectId === null) throw new Error('No project selected')
      set({ busy: true, error: null })
      try {
        const diff = await call('plan:replan', { ...payload, projectId })
        if (payload.apply) await get().refresh()
        return diff
      } catch (error) {
        set({ error: messageOf(error) })
        throw error
      } finally {
        set({ busy: false })
      }
    },

    previewPlan(input) {
      return call('plan:preview', input)
    },

    async saveItem(payload) {
      const projectId = get().activeId
      if (projectId === null) return
      await mutate(() => call('items:save', { ...payload, projectId }))
    },

    async moveItem(payload) {
      await mutate(() => call('items:move', payload))
    },

    async deleteItem(id) {
      await mutate(() => call('items:delete', id))
    },

    async saveArtifact(payload) {
      await mutate(() => call('artifacts:save', payload))
    },

    async saveMilestone(payload) {
      await mutate(() => call('milestones:save', payload))
    },

    async toggleCeremony(id, done) {
      await mutate(() => call('ceremonies:toggle', { id, done }))
    },

    async saveSession(payload) {
      const projectId = get().activeId
      if (projectId === null) return
      await mutate(() => call('sessions:save', { ...payload, projectId }))
    },

    async deleteSession(id) {
      await mutate(() => call('sessions:delete', id))
    },

    async exportIcs(includeWorkSlots) {
      const projectId = get().activeId
      if (projectId === null) return null
      const result = await call('export:ics', { projectId, includeWorkSlots })
      if (!result.ok && result.message) set({ error: result.message })
      return result.path ?? null
    },

    async exportJson() {
      const projectId = get().activeId
      if (projectId === null) return null
      const result = await call('export:json', projectId)
      if (!result.ok && result.message) set({ error: result.message })
      return result.path ?? null
    },

    async importJson() {
      set({ busy: true, error: null })
      try {
        const result = await call('import:json')
        if (!result.ok) {
          if (result.message) set({ error: result.message })
          return
        }
        const activeId = await call('projects:active')
        set({
          activeId,
          projects: await call('projects:list'),
          snapshot: activeId === null ? null : await call('projects:snapshot', activeId)
        })
      } catch (error) {
        set({ error: messageOf(error) })
      } finally {
        set({ busy: false })
      }
    },

    setTheme(theme) {
      localStorage.setItem(THEME_KEY, theme)
      applyTheme(theme)
      set({ theme })
    },

    clearError() {
      set({ error: null })
    }
  }
})
