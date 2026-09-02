import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'

import { closeDatabase, openDatabase } from './db/connection'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null

/**
 * The renderer is treated as untrusted: no Node integration, context isolated,
 * sandboxed, and any attempt to navigate away or open a window is intercepted.
 * The app loads no remote content, so nothing here needs to make exceptions.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f7f6',
    title: 'Semester Project Manager',
    // Packaged builds take the icon from the executable itself; this is only so
    // `npm run dev` does not show the generic Electron logo.
    ...(is.dev ? { icon: path.join(app.getAppPath(), 'resources', 'icon.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevServer = is.dev && process.env['ELECTRON_RENDERER_URL']
    if (isDevServer && url.startsWith(process.env['ELECTRON_RENDERER_URL'] as string)) return
    event.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// One window per machine: two instances writing the same database file would
// silently overwrite each other, since the whole database is exported on save.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('dev.semesterprojectmanager')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    await openDatabase({
      file: path.join(app.getPath('userData'), 'semester-planner.db'),
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath()
    })

    registerIpcHandlers(() => mainWindow)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => closeDatabase())
}
