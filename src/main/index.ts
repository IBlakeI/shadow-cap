import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { join } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import Store from 'electron-store'

interface AppSettings {
  savePath: string
  bufferDuration: number // seconds
  hotkeyInstantReplay: string
  hotkeyStartStop: string
  hotkeyScreenshot: string
  quality: 'low' | 'medium' | 'high'
}

const store = new Store<AppSettings>({
  defaults: {
    savePath: app.getPath('videos'),
    bufferDuration: 300, // 5 min default
    hotkeyInstantReplay: 'Alt+F10',
    hotkeyStartStop: 'Alt+F9',
    hotkeyScreenshot: 'Alt+F8',
    quality: 'high'
  }
})

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()

  const replayKey = store.get('hotkeyInstantReplay')
  const startStopKey = store.get('hotkeyStartStop')
  const screenshotKey = store.get('hotkeyScreenshot')

  if (replayKey) {
    globalShortcut.register(replayKey, () => {
      mainWindow?.webContents.send('trigger-save-replay')
    })
  }

  if (startStopKey) {
    globalShortcut.register(startStopKey, () => {
      mainWindow?.webContents.send('trigger-toggle-recording')
    })
  }

  if (screenshotKey) {
    globalShortcut.register(screenshotKey, () => {
      mainWindow?.webContents.send('trigger-screenshot')
    })
  }
}

function createTray(): void {
  // Minimal tray icon (16x16 data URI fallback)
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('ShadowCap')
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
}

ipcMain.handle('get-sources', async () => {
  const { desktopCapturer } = await import('electron')
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  })
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL()
  }))
})

ipcMain.handle('get-settings', () => store.store)

ipcMain.handle('save-settings', (_e, settings: Partial<AppSettings>) => {
  Object.entries(settings).forEach(([k, v]) => store.set(k as keyof AppSettings, v as never))
  registerGlobalShortcuts()
  return store.store
})

ipcMain.handle('choose-save-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Choose Save Location'
  })
  if (!result.canceled && result.filePaths[0]) {
    store.set('savePath', result.filePaths[0])
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('save-recording', async (_e, buffer: ArrayBuffer, filename: string) => {
  const savePath = store.get('savePath')
  if (!existsSync(savePath)) await mkdir(savePath, { recursive: true })
  const fullPath = join(savePath, filename)
  await writeFile(fullPath, Buffer.from(buffer))
  return fullPath
})

ipcMain.handle('save-screenshot', async (_e, buffer: ArrayBuffer, filename: string) => {
  const savePath = store.get('savePath')
  if (!existsSync(savePath)) await mkdir(savePath, { recursive: true })
  const fullPath = join(savePath, filename)
  await writeFile(fullPath, Buffer.from(buffer))
  return fullPath
})

ipcMain.handle('open-save-folder', () => {
  shell.openPath(store.get('savePath'))
})

ipcMain.handle('window-minimize', () => mainWindow?.minimize())
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window-close', () => mainWindow?.hide())

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerGlobalShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Keep alive in tray on macOS/Windows; quit on Linux
  if (process.platform === 'linux') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
