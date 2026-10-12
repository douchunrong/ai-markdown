/**
 * Web 适配层（浏览器开发/降级运行）：
 * - 文件：File System Access API（Chromium），无则降级 <input> 下载/上传
 * - HTTP：直接 fetch（受目标端点 CORS 策略限制，仅本地 Ollama 等 CORS 友好端点可用）
 * - 安全存储：localStorage（仅开发用途）
 */
import type { DocMeta, HttpRequest, HttpResponse, PlatformAdapter } from './types'

export function createWebAdapter(): PlatformAdapter {
  return {
    kind: 'web',
    fs: {
      async openFile() {
        const picked = await pickViaInput()
        if (!picked) return null
        return { path: picked.name, content: await picked.text() }
      },
      async readFile(path) {
        const v = localStorage.getItem(`mdai-doc:${path}`)
        if (v == null) throw new Error(`文件不存在：${path}`)
        return v
      },
      async writeFile(path, content) {
        localStorage.setItem(`mdai-doc:${path}`, content)
      },
      async pickSavePath(defaultName) {
        return defaultName
      },
      async listDocuments() {
        const out: DocMeta[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith('mdai-doc:')) {
            const name = k.slice('mdai-doc:'.length)
            const v = localStorage.getItem(k) ?? ''
            out.push({ path: name, name, size: v.length, mtime: Date.now() })
          }
        }
        return out
      },
      async deleteDocument(path) {
        localStorage.removeItem(`mdai-doc:${path}`)
      },
    },
    http: {
      async request(req: HttpRequest): Promise<HttpResponse> {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          signal: req.signal,
        })
        const bodyText = await res.text()
        return { status: res.status, ok: res.ok, bodyText }
      },
    },
    secure: {
      async get(key) {
        return localStorage.getItem(`mdai-secure:${key}`)
      },
      async set(key, value) {
        localStorage.setItem(`mdai-secure:${key}`, value)
      },
      async delete(key) {
        localStorage.removeItem(`mdai-secure:${key}`)
      },
    },
    clipboard: {
      async readText() {
        try {
          return await navigator.clipboard.readText()
        } catch {
          return '' // 无权限/非安全上下文时静默为空
        }
      },
      async writeText(text) {
        await navigator.clipboard.writeText(text)
      },
    },
    export: {},
  }
}

function pickViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
