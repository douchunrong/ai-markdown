/**
 * Electron 桥接类型（与 electron/preload.ts 白名单 API 一一对应）
 */
import type { DocMeta, FileFilter, HttpRequest, HttpResponse, OpenResult, PdfExportOptions, PngExportOptions, PlatformAdapter } from './types'

export interface MdaiBridge {
  app: { version: string; platform: string }
  menu: { setInsertTableShortcut(accel: string): Promise<boolean> }
  fs: {
    openDialog(defaultPath?: string): Promise<string | null>
    saveDialog(defaultName: string, filters?: FileFilter[]): Promise<string | null>
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string, encoding?: 'utf8' | 'base64'): Promise<void>
    exists(path: string): Promise<boolean>
    listBackups(docPath: string): Promise<DocMeta[]>
    readBackup(path: string): Promise<string>
    writeBackup(docPath: string, content: string, keep: number): Promise<string>
    watch(path: string): Promise<boolean>
    onExternalChange(path: string, cb: () => void): () => void
  }
  http: { request(req: Omit<HttpRequest, 'timeoutMs' | 'signal'>): Promise<HttpResponse> }
  secure: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }
  clipboard: {
    readText(): Promise<string>
    writeText(text: string): Promise<void>
  }
  export: {
    toPdf(html: string, target: string, opts?: { pageSize?: 'A4' | 'Letter'; landscape?: boolean }): Promise<void>
    capturePng(html: string, target: string, opts?: { width?: number; scale?: number }): Promise<void>
  }
}

export function createElectronAdapter(): PlatformAdapter {
  const bridge = window.mdai as MdaiBridge
  return {
    kind: 'electron',
    fs: {
      async openFile(defaultPath) {
        const path = await bridge.fs.openDialog(defaultPath)
        if (!path) return null
        const content = await bridge.fs.readFile(path)
        return { path, content } satisfies OpenResult
      },
      readFile: (path) => bridge.fs.readFile(path),
      writeFile: (path, content, encoding) => bridge.fs.writeFile(path, content, encoding),
      async pickSavePath(defaultName, filters) {
        return bridge.fs.saveDialog(defaultName, filters)
      },
      writeBackup: (docPath, content, keep) => bridge.fs.writeBackup(docPath, content, keep),
      watchExternalChange(path, cb) {
        void bridge.fs.watch(path)
        // preload 返回取消订阅函数；主进程 watcher 在文档切换时由下一次 watch 覆盖
        const off = bridge.fs.onExternalChange(path, cb)
        return { dispose: () => off() }
      },
    },
    http: { request: (req) => bridge.http.request(req) },
    secure: bridge.secure,
    clipboard: bridge.clipboard,
    export: {
      toPdf: (html, target, opts: PdfExportOptions) =>
        bridge.export.toPdf(html, target, { pageSize: opts?.pageSize, landscape: opts?.landscape }),
      capturePng: (html, target, opts: PngExportOptions) =>
        bridge.export.capturePng(html, target, { width: opts?.width, scale: opts?.scale }),
    },
  }
}
