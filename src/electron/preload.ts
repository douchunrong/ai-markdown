/**
 * preload：contextIsolation 白名单 API（window.mdai），仅暴露最小面。
 */
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  app: {
    version: process.env.MDAI_VERSION ?? '0.1.0',
    platform: process.platform,
    /** 原生菜单动作（新建/打开/保存/另存为/设置），返回取消监听函数 */
    onMenuAction: (cb: (action: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, action: string) => cb(action)
      ipcRenderer.on('app:menu-action', listener)
      return () => ipcRenderer.removeListener('app:menu-action', listener)
    },
  },
  menu: {
    /** 更新「插入表格」菜单加速键（设置保存后同步） */
    setInsertTableShortcut: (accel: string) =>
      ipcRenderer.invoke('menu:set-insert-table-shortcut', accel),
  },
  fs: {
    openDialog: (defaultPath?: string) => ipcRenderer.invoke('fs:openDialog', defaultPath),
    saveDialog: (defaultName: string, filters?: { name: string; extensions: string[] }[]) =>
      ipcRenderer.invoke('fs:saveDialog', defaultName, filters),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string, encoding?: 'utf8' | 'base64') =>
      ipcRenderer.invoke('fs:writeFile', path, content, encoding),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    listBackups: (docPath: string) => ipcRenderer.invoke('fs:listBackups', docPath),
    readBackup: (path: string) => ipcRenderer.invoke('fs:readBackup', path),
    writeBackup: (docPath: string, content: string, keep: number) =>
      ipcRenderer.invoke('fs:writeBackup', docPath, content, keep),
    watch: (path: string) => ipcRenderer.invoke('fs:watch', path),
    unwatch: (path: string) => ipcRenderer.invoke('fs:unwatch', path),
    onExternalChange: (path: string, cb: () => void) => {
      const listener = (_e: Electron.IpcRendererEvent, p: string) => {
        if (p === path) cb()
      }
      ipcRenderer.on('fs:external-change', listener)
      return () => ipcRenderer.removeListener('fs:external-change', listener)
    },
  },
  http: {
    request: (req: { url: string; method: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('http:request', req),
  },
  secure: {
    get: (key: string) => ipcRenderer.invoke('secure:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('secure:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('secure:delete', key),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  },
  export: {
    toPdf: (html: string, target: string, opts?: { pageSize?: 'A4' | 'Letter'; landscape?: boolean }) =>
      ipcRenderer.invoke('export:toPdf', html, target, opts),
    capturePng: (html: string, target: string, opts?: { width?: number; scale?: number }) =>
      ipcRenderer.invoke('export:capturePng', html, target, opts),
  },
}

contextBridge.exposeInMainWorld('mdai', api)
export type MdaiPreloadApi = typeof api
