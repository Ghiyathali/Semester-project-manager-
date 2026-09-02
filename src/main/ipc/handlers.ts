/**
 * IPC handlers.
 *
 * Every payload is validated with zod before it reaches the database: the
 * renderer is the least trusted part of an Electron app, and a schema at the
 * boundary is cheaper than defensive checks in every repository.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'

import type { IpcChannel } from '@shared/ipc'
import { databasePath, persist, transaction } from '../db/connection'
import * as backlog from '../db/repositories/backlog'
import * as planRepo from '../db/repositories/plan'
import * as projects from '../db/repositories/projects'
import { buildIcs } from '../services/icsService'
import { createProject, previewPlan, replan, snapshot } from '../services/planService'
import { exportProject, importProject } from '../services/portability'

const ACTIVE_PROJECT_KEY = 'activeProjectId'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
const timeStr = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'Expected HH:MM')

const phaseRatios = z.object({
  inception: z.number().min(0).max(1),
  elaboration: z.number().min(0).max(1),
  construction: z.number().min(0).max(1),
  transition: z.number().min(0).max(1)
})

const planInput = z.object({
  startDate: dateStr,
  deadlineDate: dateStr,
  sprintLengthDays: z.number().int().min(1).max(90),
  weekStartsOn: z.number().int().min(0).max(6),
  alignSprintsToWeek: z.boolean(),
  phaseRatios,
  includeDailyStandup: z.boolean(),
  availability: z.array(
    z.object({ weekday: z.number().int().min(0).max(6), start: timeStr, end: timeStr })
  ),
  exceptions: z.array(
    z.object({
      date: dateStr,
      kind: z.enum(['blackout', 'extra']),
      start: timeStr.optional(),
      end: timeStr.optional(),
      reason: z.string().max(200).optional()
    })
  ),
  deadlines: z.array(
    z.object({
      title: z.string().min(1).max(200),
      date: dateStr,
      kind: z.enum(['hand-in', 'presentation', 'exam', 'custom']),
      isHard: z.boolean()
    })
  ),
  ectsCredits: z.number().min(0).max(120).optional()
})

const itemFields = {
  sprintId: z.number().int().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  acceptanceCriteria: z.string().max(5000).optional(),
  type: z.enum(['story', 'task', 'bug', 'spike']).optional(),
  discipline: z.string().max(60).optional(),
  points: z.number().min(0).max(1000).optional(),
  estimateHours: z.number().min(0).max(1000).optional(),
  priority: z.number().int().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional()
}

type Handler = (payload: never) => unknown | Promise<unknown>

const handlers: Partial<Record<IpcChannel, Handler>> = {}

function handle(channel: IpcChannel, fn: Handler): void {
  handlers[channel] = fn
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    databasePath: databasePath(),
    userDataPath: app.getPath('userData')
  }))

  handle('projects:list', () => projects.listProjects())

  handle('projects:active', () => {
    const raw = projects.getSetting(ACTIVE_PROJECT_KEY)
    const id = raw === null ? null : Number(raw)
    if (id === null || !projects.getProject(id)) return projects.listProjects()[0]?.id ?? null
    return id
  })

  handle('projects:setActive', (payload: never) => {
    const id = z.number().int().nullable().parse(payload)
    transaction(() => projects.setSetting(ACTIVE_PROJECT_KEY, id === null ? null : String(id)))
  })

  handle('projects:create', (payload: never) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(200),
        course: z.string().max(200),
        description: z.string().max(5000),
        timezone: z.string().max(80),
        plan: planInput,
        seedBacklog: z.boolean()
      })
      .parse(payload)
    const id = createProject(parsed)
    transaction(() => projects.setSetting(ACTIVE_PROJECT_KEY, String(id)))
    return id
  })

  handle('projects:snapshot', (payload: never) => snapshot(z.number().int().parse(payload)))

  handle('projects:update', (payload: never) => {
    const parsed = z
      .object({
        id: z.number().int(),
        name: z.string().min(1).max(200).optional(),
        course: z.string().max(200).optional(),
        description: z.string().max(5000).optional(),
        timezone: z.string().max(80).optional()
      })
      .parse(payload)
    transaction(() => projects.updateProjectDetails(parsed.id, parsed))
  })

  handle('projects:delete', (payload: never) => {
    const id = z.number().int().parse(payload)
    transaction(() => {
      projects.deleteProject(id)
      if (projects.getSetting(ACTIVE_PROJECT_KEY) === String(id)) {
        projects.setSetting(ACTIVE_PROJECT_KEY, null)
      }
    })
  })

  handle('plan:preview', (payload: never) => previewPlan(planInput.parse(payload)))

  handle('plan:replan', (payload: never) => {
    const parsed = z
      .object({
        projectId: z.number().int(),
        plan: planInput,
        apply: z.boolean(),
        seedBacklog: z.boolean().optional()
      })
      .parse(payload)
    return replan(parsed)
  })

  handle('items:save', (payload: never) => {
    const parsed = z.object({ id: z.number().int().optional(), projectId: z.number().int(), ...itemFields }).parse(payload)
    return transaction(() => {
      if (parsed.id) {
        backlog.updateItem(parsed.id, parsed as never)
        return parsed.id
      }
      return backlog.insertItem(parsed as never)
    })
  })

  handle('items:move', (payload: never) => {
    const parsed = z
      .object({
        id: z.number().int(),
        sprintId: z.number().int().nullable(),
        status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional()
      })
      .parse(payload)
    transaction(() => backlog.updateItem(parsed.id, parsed as never))
  })

  handle('items:delete', (payload: never) => {
    const id = z.number().int().parse(payload)
    transaction(() => backlog.deleteItem(id))
  })

  handle('artifacts:save', (payload: never) => {
    const parsed = z
      .object({
        id: z.number().int(),
        name: z.string().min(1).max(300).optional(),
        dueDate: dateStr.optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(['not_started', 'in_progress', 'in_review', 'done']).optional(),
        link: z.string().max(2000).optional()
      })
      .parse(payload)
    transaction(() => planRepo.updateArtifact(parsed.id, parsed as never))
  })

  handle('milestones:save', (payload: never) => {
    const parsed = z
      .object({
        id: z.number().int(),
        name: z.string().min(1).max(300).optional(),
        date: dateStr.optional(),
        description: z.string().max(5000).optional(),
        status: z.string().max(40).optional()
      })
      .parse(payload)
    transaction(() => planRepo.updateMilestone(parsed.id, parsed as never))
  })

  handle('ceremonies:toggle', (payload: never) => {
    const parsed = z.object({ id: z.number().int(), done: z.boolean() }).parse(payload)
    transaction(() => planRepo.setCeremonyDone(parsed.id, parsed.done))
  })

  handle('sessions:save', (payload: never) => {
    const parsed = z
      .object({
        id: z.number().int().optional(),
        projectId: z.number().int(),
        itemId: z.number().int().nullable().optional(),
        sprintId: z.number().int().nullable().optional(),
        date: dateStr.optional(),
        hours: z.number().min(0).max(24).optional(),
        note: z.string().max(2000).optional()
      })
      .parse(payload)
    return transaction(() => {
      const id = backlog.upsertSession(parsed.id, parsed)
      backlog.relinkSessionsToSprints(parsed.projectId)
      return id
    })
  })

  handle('sessions:delete', (payload: never) => {
    const id = z.number().int().parse(payload)
    transaction(() => backlog.deleteSession(id))
  })

  handle('export:ics', async (payload: never) => {
    const parsed = z
      .object({ projectId: z.number().int(), includeWorkSlots: z.boolean() })
      .parse(payload)
    const data = snapshot(parsed.projectId)
    const ics = buildIcs(data, { includeWorkSlots: parsed.includeWorkSlots })
    return saveFile(getWindow(), `${slug(data.project.name)}.ics`, 'Calendar', ['ics'], ics)
  })

  handle('export:json', async (payload: never) => {
    const id = z.number().int().parse(payload)
    const data = exportProject(id)
    return saveFile(
      getWindow(),
      `${slug(data.snapshot.project.name)}.json`,
      'Project export',
      ['json'],
      JSON.stringify(data, null, 2)
    )
  })

  handle('import:json', async () => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: 'Import a project export',
          filters: [{ name: 'Project export', extensions: ['json'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({ properties: ['openFile'] })
    if (result.canceled || result.filePaths.length === 0) return { ok: false }

    try {
      const raw = await fs.readFile(result.filePaths[0], 'utf-8')
      const id = importProject(JSON.parse(raw))
      transaction(() => projects.setSetting(ACTIVE_PROJECT_KEY, String(id)))
      return { ok: true, path: result.filePaths[0] }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  })

  handle('shell:openExternal', async (payload: never) => {
    const url = z.string().url().parse(payload)
    // Only ever hand the OS an https link - never file:, and never a local path.
    if (!url.startsWith('https://')) throw new Error('Only https links can be opened.')
    await shell.openExternal(url)
  })

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, payload) => fn(payload as never))
  }
}

async function saveFile(
  window: BrowserWindow | null,
  defaultName: string,
  filterName: string,
  extensions: string[],
  contents: string
): Promise<{ ok: boolean; path?: string; message?: string }> {
  const options = {
    title: `Save ${filterName.toLowerCase()}`,
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: filterName, extensions }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }

  try {
    await fs.writeFile(result.filePath, contents, 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  )
}

export function flush(): void {
  persist()
}
