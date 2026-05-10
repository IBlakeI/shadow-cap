import { contextBridge, ipcRenderer } from 'electron'

export type Settings = {
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

const api = {
  // Sources
  getSources: (): Promise<{ id: string; name: string; thumbnail: string }[]> =>
    ipcRenderer.invoke('get-sources'),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (s: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('save-settings', s),
  chooseSavePath: (): Promise<string | null> => ipcRenderer.invoke('choose-save-path'),
  openSaveFolder: (): Promise<void> => ipcRenderer.invoke('open-save-folder'),

  // File saving
  saveRecording: (buffer: ArrayBuffer, filename: string): Promise<string> =>
    ipcRenderer.invoke('save-recording', buffer, filename),
  saveScreenshot: (buffer: ArrayBuffer, filename: string): Promise<string> =>
    ipcRenderer.invoke('save-screenshot', buffer, filename),
  convertRecording: (sourcePath: string, outputPath: string, format: string): Promise<string> =>
    ipcRenderer.invoke('convert-recording', sourcePath, outputPath, format),

  // FIX: Reads the save directory and returns all video/screenshot files,
  // newest first. Used on mount to restore the file list across restarts.
  listSavedFiles: (): Promise<string[]> => ipcRenderer.invoke('list-saved-files'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // Global hotkey events (main → renderer)
  onTriggerReplay: (cb: () => void) => {
    ipcRenderer.on('trigger-save-replay', cb)
    return () => ipcRenderer.removeListener('trigger-save-replay', cb)
  },
  onTriggerToggleRecording: (cb: () => void) => {
    ipcRenderer.on('trigger-toggle-recording', cb)
    return () => ipcRenderer.removeListener('trigger-toggle-recording', cb)
  },
  onTriggerScreenshot: (cb: () => void) => {
    ipcRenderer.on('trigger-screenshot', cb)
    return () => ipcRenderer.removeListener('trigger-screenshot', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
