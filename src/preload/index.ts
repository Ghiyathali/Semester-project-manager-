/**
 * The bridge between renderer and main.
 *
 * The renderer never touches `ipcRenderer` directly and can only reach the
 * channels on the allowlist - so a bug (or an injected script) in the UI cannot
 * invent new IPC surface.
 */
import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type IpcChannel, type IpcRequest, type IpcResponse } from '@shared/ipc'

const allowed = new Set<string>(IPC_CHANNELS)

const api = {
  call<C extends IpcChannel>(channel: C, payload?: IpcRequest<C>): Promise<IpcResponse<C>> {
    if (!allowed.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<C>>
  }
}

export type PreloadApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Only reachable if contextIsolation were ever turned off; keeps dev usable.
  const target = globalThis as unknown as { api: PreloadApi }
  target.api = api
}
