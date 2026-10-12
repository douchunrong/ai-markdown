/**
 * IPC 白名单：文件读写 / 对话框 / HTTP 代理（无 CORS）/ 安全存储 / PDF 导出 / 外部修改监听。
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, net } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { secureGet, secureSet, secureDelete } from './secure-store'
import { setInsertTableAccelerator } from './menu'

const MAX_READ_BYTES = 50 * 1024 * 1024 // 50MB 上限，防异常大文件拖垮内存
const MAX_HTTP_BODY = 5 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
const watchers = new Map<string, FSWatcher>()

export function getWindow(): BrowserWindow | null {
  return mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null
}

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: '所有文件', extensions: ['*'] },
]

function backupDirFor(docPath: string): string {
  const name = path.basename(docPath).replace(/\.[^.]+$/, '')
  return path.join(app.getPath('userData'), '.mdai-backup', sanitize(name))
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_\-\u4e00-\u9fff]/g, '_').slice(0, 80) || 'doc'
}

function toDocMeta(p: string, st: fs.Stats) {
  return { path: p, name: path.basename(p), size: st.size, mtime: st.mtimeMs }
}

export function registerIpc(): void {
  const win = getWindow()
  mainWindow = win ?? null

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))

  // ---------- 剪贴板（右键菜单 复制/粘贴为…） ----------
  ipcMain.handle('clipboard:readText', () => clipboard.readText())
  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
  })

  // ---------- 文件 ----------
  ipcMain.handle('fs:openDialog', async (_e, defaultPath?: string) => {
    const r = await dialog.showOpenDialog(getWindow()!, {
      properties: ['openFile'],
      filters: MD_FILTERS,
      defaultPath: defaultPath || undefined,
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  ipcMain.handle('fs:saveDialog', async (_e, defaultName: string) => {
    const r = await dialog.showSaveDialog(getWindow()!, {
      defaultPath: defaultName,
      filters: MD_FILTERS,
    })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle('fs:readFile', async (_e, p: string) => {
    assertSafePath(p)
    const st = await fsp.stat(p)
    if (st.size > MAX_READ_BYTES) throw new Error(`文件过大（${(st.size / 1048576).toFixed(1)}MB），超出支持范围`)
    return fsp.readFile(p, 'utf-8')
  })

  ipcMain.handle('fs:writeFile', async (_e, p: string, content: string) => {
    assertSafePath(p)
    await fsp.mkdir(path.dirname(p), { recursive: true })
    // 原子写：先写临时文件再改名，避免半写状态
    const tmp = `${p}.mdai-tmp-${Date.now()}`
    await fsp.writeFile(tmp, content, 'utf-8')
    await fsp.rename(tmp, p)
  })

  ipcMain.handle('fs:exists', async (_e, p: string) => {
    try {
      await fsp.access(p)
      return true
    } catch {
      return false
    }
  })

  // ---------- 备份 ----------
  ipcMain.handle('fs:listBackups', async (_e, docPath: string) => {
    const dir = backupDirFor(docPath)
    try {
      const names = await fsp.readdir(dir)
      const metas = []
      for (const n of names.filter((x) => x.endsWith('.md'))) {
        const full = path.join(dir, n)
        metas.push(toDocMeta(full, await fsp.stat(full)))
      }
      return metas.sort((a, b) => b.mtime - a.mtime)
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:readBackup', async (_e, p: string) => {
    if (!p.includes(path.join('.mdai-backup'))) throw new Error('非法备份路径')
    return fsp.readFile(p, 'utf-8')
  })

  ipcMain.handle('fs:writeBackup', async (_e, docPath: string, content: string, keep: number) => {
    const dir = backupDirFor(docPath)
    await fsp.mkdir(dir, { recursive: true })
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    let name = `${stamp}.md`
    let seq = 1
    const existing = new Set(await fsp.readdir(dir).catch(() => [] as string[]))
    while (existing.has(name)) name = `${stamp}-${seq++}.md`
    await fsp.writeFile(path.join(dir, name), content, 'utf-8')
    // 滚动清理
    const all = (await fsp.readdir(dir).catch(() => [] as string[])).filter((x) => x.endsWith('.md'))
    if (all.length > keep) {
      const st = await Promise.all(all.map(async (n) => ({ n, mtime: (await fsp.stat(path.join(dir, n))).mtimeMs })))
      st.sort((a, b) => b.mtime - a.mtime)
      for (const { n } of st.slice(keep)) await fsp.rm(path.join(dir, n), { force: true })
    }
    return name
  })

  // ---------- 外部修改监听（冲突检测） ----------
  ipcMain.handle('fs:watch', (_e, p: string) => {
    stopWatcher(p)
    try {
      const w = chokidar.watch(p, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 400 } })
      w.on('change', () => {
        // 自身写入触发的变更由渲染层时间戳过滤
        getWindow()?.webContents.send('fs:external-change', p)
      })
      watchers.set(p, w)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:unwatch', (_e, p: string) => {
    stopWatcher(p)
    return true
  })

  // ---------- HTTP 代理（绕过 CORS；超时由渲染层 signal 控制） ----------
  ipcMain.handle('http:request', async (_e, req: { url: string; method: string; headers?: Record<string, string>; body?: string }) => {
    const r = await net.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    })
    const bodyText = await r.text()
    if (bodyText.length > MAX_HTTP_BODY) throw new Error('响应过大')
    return { status: r.status, ok: r.ok, bodyText }
  })

  // ---------- 安全存储 ----------
  ipcMain.handle('secure:get', (_e, key: string) => secureGet(key))
  ipcMain.handle('secure:set', (_e, key: string, v: string) => secureSet(key, v))
  ipcMain.handle('secure:delete', (_e, key: string) => secureDelete(key))

  // ---------- 菜单快捷键（渲染层设置保存后同步原生菜单） ----------
  ipcMain.handle('menu:set-insert-table-shortcut', (_e, accel: string) => setInsertTableAccelerator(accel))

  // ---------- PDF / PNG 导出 ----------
  ipcMain.handle(
    'export:toPdf',
    async (_e, html: string, target: string, opts?: { pageSize?: 'A4' | 'Letter'; landscape?: boolean }) => {
      assertSafePath(target)
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
      try {
        await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const buf = await pdfWin.webContents.printToPDF({
          printBackground: true,
          pageSize: opts?.pageSize === 'Letter' ? 'Letter' : 'A4',
          landscape: !!opts?.landscape,
        })
        await fsp.writeFile(target, buf)
      } finally {
        pdfWin.destroy()
      }
    },
  )

  ipcMain.handle(
    'export:capturePng',
    async (_e, html: string, target: string, opts?: { width?: number; scale?: number }) => {
      assertSafePath(target)
      const width = Math.min(2400, Math.max(480, Math.round(opts?.width ?? 860)))
      const scale = Math.min(3, Math.max(1, Math.round(opts?.scale ?? 2)))
      const pngWin = new BrowserWindow({
        show: false,
        useContentSize: true,
        width,
        height: 800,
        webPreferences: { sandbox: true, contextIsolation: true },
      })
      try {
        await pngWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        // 高倍率导出：zoomFactor 放大内容后按内容实际高度截取整页
        if (scale > 1) await pngWin.webContents.setZoomFactor(scale)
        const contentHeight = await pngWin.webContents.executeJavaScript(
          `Math.ceil((document.documentElement.scrollHeight || document.body.scrollHeight))`,
        )
        pngWin.setContentSize(width, Math.max(200, Math.min(20000, Math.ceil(contentHeight))))
        // 等待布局稳定
        await new Promise((r) => setTimeout(r, 250))
        const image = await pngWin.webContents.capturePage()
        await fsp.writeFile(target, image.toPNG())
      } finally {
        pngWin.destroy()
      }
    },
  )
}

function stopWatcher(p: string) {
  watchers.get(p)?.close().catch(() => {})
  watchers.delete(p)
}

/** IPC 路径安全：拒绝写应用自身目录之外的危险系统路径由对话框保证来源；此处仅做基本校验 */
function assertSafePath(p: string) {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw new Error('非法路径')
}
