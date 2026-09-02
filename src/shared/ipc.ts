/**
 * The IPC contract.
 *
 * Channel names live here so main and renderer cannot drift, and the preload
 * bridge uses `IPC_CHANNELS` as an allowlist - the renderer can only ever reach
 * these, never arbitrary IPC.
 */
import type { GeneratedPlan, PlanInput } from '@core/types'
import type {
  ArtifactRecord,
  BacklogItemRecord,
  MilestoneRecord,
  ProjectSnapshot,
  ProjectSummary,
  ReplanDiff,
  WorkSessionRecord
} from './models'

export interface CreateProjectPayload {
  name: string
  course: string
  description: string
  timezone: string
  plan: PlanInput
  /** Seed the backlog with the suggested UP starter items. */
  seedBacklog: boolean
}

export interface UpdateProjectPayload {
  id: number
  name?: string
  course?: string
  description?: string
  timezone?: string
}

export interface ReplanPayload {
  projectId: number
  plan: PlanInput
  /** `false` only computes the diff; `true` writes it. */
  apply: boolean
  seedBacklog?: boolean
}

export interface SaveItemPayload extends Partial<Omit<BacklogItemRecord, 'id'>> {
  id?: number
  projectId: number
}

export interface MoveItemPayload {
  id: number
  sprintId: number | null
  status?: BacklogItemRecord['status']
}

export interface SaveArtifactPayload extends Partial<Omit<ArtifactRecord, 'id'>> {
  id: number
}

export interface SaveMilestonePayload extends Partial<Omit<MilestoneRecord, 'id'>> {
  id: number
}

export interface SaveSessionPayload extends Partial<Omit<WorkSessionRecord, 'id'>> {
  id?: number
  projectId: number
}

export interface ExportIcsPayload {
  projectId: number
  includeWorkSlots: boolean
}

export interface FileResult {
  ok: boolean
  path?: string
  message?: string
}

export interface AppInfo {
  version: string
  electron: string
  databasePath: string
  userDataPath: string
}

/** channel -> [request, response] */
export interface IpcContract {
  'app:info': [void, AppInfo]

  'projects:list': [void, ProjectSummary[]]
  'projects:active': [void, number | null]
  'projects:setActive': [number | null, void]
  'projects:create': [CreateProjectPayload, number]
  'projects:snapshot': [number, ProjectSnapshot]
  'projects:update': [UpdateProjectPayload, void]
  'projects:delete': [number, void]

  'plan:preview': [PlanInput, GeneratedPlan]
  'plan:replan': [ReplanPayload, ReplanDiff]

  'items:save': [SaveItemPayload, number]
  'items:move': [MoveItemPayload, void]
  'items:delete': [number, void]

  'artifacts:save': [SaveArtifactPayload, void]
  'milestones:save': [SaveMilestonePayload, void]
  'ceremonies:toggle': [{ id: number; done: boolean }, void]

  'sessions:save': [SaveSessionPayload, number]
  'sessions:delete': [number, void]

  'export:ics': [ExportIcsPayload, FileResult]
  'export:json': [number, FileResult]
  'import:json': [void, FileResult]
  'shell:openExternal': [string, void]
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C][0]
export type IpcResponse<C extends IpcChannel> = IpcContract[C][1]

export const IPC_CHANNELS: IpcChannel[] = [
  'app:info',
  'projects:list',
  'projects:active',
  'projects:setActive',
  'projects:create',
  'projects:snapshot',
  'projects:update',
  'projects:delete',
  'plan:preview',
  'plan:replan',
  'items:save',
  'items:move',
  'items:delete',
  'artifacts:save',
  'milestones:save',
  'ceremonies:toggle',
  'sessions:save',
  'sessions:delete',
  'export:ics',
  'export:json',
  'import:json',
  'shell:openExternal'
]
