/**
 * Capacitor（iOS）适配层：原生 HTTP（绕 WKWebView CORS）、Filesystem 沙盒、Preferences、Share。
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Share } from '@capacitor/share'
import { AppError } from '@/lib/ai/errors'
import type { DocMeta, HttpRequest, HttpResponse, PlatformAdapter } from './types'

const DOC_DIR = Directory.Documents

export function createCapacitorAdapter(): PlatformAdapter {
  return {
    kind: 'capacitor',
    fs: {
      // iOS 无任意路径对话框：openFile 即列出文档区由 UI 选择（应用内文档浏览器）
      async openFile() {
        return null
      },
      async readFile(path) {
        const rel = toRelative(path)
        const r = await Filesystem.readFile({ path: rel, directory: DOC_DIR, encoding: Encoding.UTF8 })
        return typeof r.data === 'string' ? r.data : blobToText(r.data)
      },
      async writeFile(path, content, encoding) {
        const rel = toRelative(path)
        if (encoding === 'base64') {
          await Filesystem.writeFile({ path: rel, directory: DOC_DIR, data: content })
        } else {
          await Filesystem.writeFile({ path: rel, directory: DOC_DIR, data: content, encoding: Encoding.UTF8 })
        }
      },
      async pickSavePath(defaultName) {
        return defaultName
      },
      async listDocuments() {
        const r = await Filesystem.readdir({ path: '', directory: DOC_DIR })
        const out: DocMeta[] = []
        for (const f of r.files) {
          if (f.type !== 'file' || !/\.(md|markdown|txt)$/i.test(f.name)) continue
          try {
            const stat = await Filesystem.stat({ path: f.name, directory: DOC_DIR })
            out.push({ path: f.name, name: f.name, size: stat.size, mtime: stat.mtime })
          } catch {
            /* 单文件 stat 失败跳过 */
          }
        }
        return out.sort((a, b) => b.mtime - a.mtime)
      },
      async deleteDocument(path) {
        await Filesystem.deleteFile({ path: toRelative(path), directory: DOC_DIR })
      },
    },
    http: {
      async request(req: HttpRequest): Promise<HttpResponse> {
        const ctrl = new AbortController()
        req.signal?.addEventListener('abort', () => ctrl.abort(), { once: true })
        // CapacitorHttp 原生 URLSession：无 CORS；超时由原生层控制（毫秒）
        try {
          const r = await CapacitorHttp.request({
            url: req.url,
            method: req.method,
            headers: req.headers,
            data: req.body ? JSON.parse(req.body) : undefined,
            // CapacitorHttp 读取超时（秒）
            readTimeout: Math.ceil(req.timeoutMs / 1000),
            connectTimeout: Math.ceil(Math.min(req.timeoutMs, 15000) / 1000),
            responseType: 'text',
          })
          const bodyText = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
          if (req.signal?.aborted) throw new AppError('E-CANCELED', '已取消')
          return { status: r.status, ok: r.status >= 200 && r.status < 300, bodyText }
        } catch (err) {
          if (req.signal?.aborted) throw new AppError('E-CANCELED', '已取消')
          throw err
        }
      },
    },
    secure: {
      // v1：Preferences + 应用沙盒（见安全设计 §7.1，v2 升级 Keychain 插件）
      async get(key) {
        const r = await Preferences.get({ key })
        return r.value ?? null
      },
      async set(key, value) {
        await Preferences.set({ key, value })
      },
      async delete(key) {
        await Preferences.remove({ key })
      },
    },
    clipboard: {
      // WKWebView：写通常可用；读受权限限制，失败静默为空
      async readText() {
        try {
          return await navigator.clipboard.readText()
        } catch {
          return ''
        }
      },
      async writeText(text) {
        await navigator.clipboard.writeText(text)
      },
    },
    export: {
      async share({ title, text, fileName, base64 }) {
        if (!base64 || !fileName) {
          await Share.share({ title, text: text ?? '' })
          return
        }
        // 写入临时目录再分享（Share.sheet 需要文件 URL）
        const tmp = `${Date.now()}-${fileName}`
        await Filesystem.writeFile({ path: tmp, directory: Directory.Cache, data: base64, encoding: Encoding.UTF8 })
        const uri = await Filesystem.getUri({ path: tmp, directory: Directory.Cache })
        await Share.share({ title, url: uri.uri, dialogTitle: title })
      },
    },
  }
}

/** Capacitor 平台名（ios/android），用于 UI 差异 */
export function capacitorPlatform(): string {
  return Capacitor.getPlatform()
}

function toRelative(path: string): string {
  // path 形如 "notes/a.md"（应用文档区相对路径）
  return path.replace(/^\/+/, '')
}

function blobToText(blob: Blob): Promise<string> {
  return blob.text()
}
