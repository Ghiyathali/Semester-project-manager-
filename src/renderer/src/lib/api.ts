/**
 * Typed wrapper over the preload bridge. The renderer talks to main only
 * through here, so every call is checked against the IPC contract.
 */
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'

export function call<C extends IpcChannel>(
  channel: C,
  ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
): Promise<IpcResponse<C>> {
  return window.api.call(channel, args[0] as never)
}

/** Human-readable message from whatever main threw, for the error banner. */
export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Electron prefixes IPC errors with "Error invoking remote method '...':".
    return error.message.replace(/^Error invoking remote method '[^']*':\s*/, '')
  }
  return String(error)
}
