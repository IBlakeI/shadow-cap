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
import { writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync, unlinkSync } from 'fs'
import Store from 'electron-store'
import { spawn } from 'child_process'

import _ffmpegPath from 'ffmpeg-static'

function resolveFfmpegPath(): string {
  const raw = _ffmpegPath as string | null
  if (!raw)
    throw new Error(
      'ffmpeg-static did not return a path. Try: node node_modules/.pnpm/ffmpeg-static@5.3.0/node_modules/ffmpeg-static/install.js'
    )
  const resolved = raw.replace('app.asar', 'app.asar.unpacked')
  if (existsSync(resolved)) return resolved
  if (existsSync(raw)) return raw
  throw new Error(`ffmpeg binary not found at: ${resolved}\nRaw path: ${raw}`)
}

interface AppSettings {
  savePath: string
  bufferDuration: number
  hotkeyInstantReplay: string
  hotkeyStartStop: string
  hotkeyScreenshot: string
  quality: 'low' | 'medium' | 'high'
  codec: 'vp9' | 'vp8' | 'auto'
  frameRate: 15 | 30 | 60
  outputFormat: 'webm' | 'mp4' | 'mkv'
}

const store = new Store<AppSettings>({
  defaults: {
    savePath: app.getPath('videos'),
    bufferDuration: 300,
    hotkeyInstantReplay: 'Alt+F10',
    hotkeyStartStop: 'Alt+F9',
    hotkeyScreenshot: 'Alt+F8',
    quality: 'high',
    codec: 'auto',
    frameRate: 60,
    outputFormat: 'mp4'
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

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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

  if (replayKey)
    globalShortcut.register(replayKey, () => mainWindow?.webContents.send('trigger-save-replay'))
  if (startStopKey)
    globalShortcut.register(startStopKey, () =>
      mainWindow?.webContents.send('trigger-toggle-recording')
    )
  if (screenshotKey)
    globalShortcut.register(screenshotKey, () => mainWindow?.webContents.send('trigger-screenshot'))
}

function createTray(): void {
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

function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[ffmpeg] ${ffmpeg} ${args.join(' ')}`)
    const proc = spawn(ffmpeg, args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
      else resolve()
    })
    proc.on('error', (err) => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)))
  })
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

ipcMain.handle(
  'convert-recording',
  async (_event, sourcePath: string, outputPath: string, format: string): Promise<string> => {
    let ffmpeg: string
    try {
      ffmpeg = resolveFfmpegPath()
    } catch (e: unknown) {
      throw new Error(`ffmpeg not available: ${e instanceof Error ? e.message : e}`)
    }

    let args: string[]

    if (format === 'mp4') {
      // VP8/VP9 can't be stream-copied into MP4 — must re-encode to H.264.
      // libx264 + yuv420p is the most universally compatible MP4 output.
      // -crf 18 is near-lossless (lower = better quality, larger file; 18-23 is typical).
      // -preset fast balances encode speed vs compression.
      args = [
        '-y',
        '-i',
        sourcePath,
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-preset',
        'fast',
        '-pix_fmt',
        'yuv420p', // required for QuickTime / broad compatibility
        '-movflags',
        '+faststart', // puts moov atom at start for streaming/seeking
        outputPath
      ]
    } else {
      // MKV supports VP8/VP9 natively — stream copy is instant and lossless
      args = ['-y', '-i', sourcePath, '-c', 'copy', outputPath]
    }

    await runFfmpeg(ffmpeg, args)
    try {
      unlinkSync(sourcePath)
    } catch {
      /* ignore */
    }
    return outputPath
  }
)

ipcMain.handle('save-screenshot', async (_e, buffer: ArrayBuffer, filename: string) => {
  const savePath = store.get('savePath')
  if (!existsSync(savePath)) await mkdir(savePath, { recursive: true })
  const fullPath = join(savePath, filename)
  await writeFile(fullPath, Buffer.from(buffer))
  return fullPath
})

ipcMain.handle('list-saved-files', async () => {
  const savePath = store.get('savePath')

  if (!existsSync(savePath)) return []

  const EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.png', '.jpg'])

  try {
    const entries = await readdir(savePath)

    return entries
      .filter((name) => {
        const dot = name.lastIndexOf('.')
        return dot !== -1 && EXTENSIONS.has(name.slice(dot).toLowerCase())
      })
      .sort()
      .reverse()
      .map((name) => join(savePath, name))
  } catch {
    return []
  }
})

ipcMain.handle('open-save-folder', () => shell.openPath(store.get('savePath')))
ipcMain.handle('window-minimize', () => mainWindow?.minimize())
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window-close', () => mainWindow?.hide())

// Enable hardware-accelerated encoding — significantly reduces CPU load
// and allows higher frame rates without dropping frames
app.commandLine.appendSwitch(
  'enable-features',
  'VaapiVideoEncoder,VaapiVideoDecoder,CanvasOopRasterization'
)
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerGlobalShortcuts()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'linux') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
