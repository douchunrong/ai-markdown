/**
 * Electron 主进程：窗口生命周期、安全加固、IPC 注册。
 */
import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpc, getWindow } from './ipc'
import { installAppMenu } from './menu'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 单实例锁（避免多进程写同一设置/备份目录）
if (!app.requestSingleInstanceLock()) {
  // 常见场景：上一个实例仍在后台（macOS 关窗不退出）。给出明确提示便于排查「秒退」。
  console.warn('[MDAI] 已有一个实例在运行，本进程退出。如需重启：先 ⌘Q 彻底退出旧实例（或检查 Dock / 活动监视器）再启动。')
  app.quit()
}

// 与 vite.config.ts 的 server.port 保持一致（MDAI 专用端口，避免 5173 被其他项目占用）
const DEV_URL = process.env.MDAI_DEV_URL || 'http://localhost:5188'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'AI Markdown — 文档整理工具',
    webPreferences: {
      // 安全基线（enhanced-design §7.1）
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.once('ready-to-show', () => win.show())

  // 拦截外部导航 → 系统浏览器（防钓鱼/防降级攻击面）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL() && !url.startsWith(DEV_URL)) e.preventDefault()
  })

  const distIndex = path.join(__dirname, '../dist/index.html')
  if (process.env.MDAI_DEV === '1' || !app.isPackaged) {
    // 开发模式加载 Vite dev server；不可达时回退到最近一次构建产物
    win.webContents.once('did-fail-load', () => {
      void win.loadFile(distIndex)
    })
    void win.loadURL(DEV_URL).catch(() => {
      void win.loadFile(distIndex)
    })
  } else {
    void win.loadFile(distIndex)
  }
  return win
}

app.whenReady().then(() => {
  registerIpc()
  installAppMenu() // 原生菜单中文化（文件/编辑/视图/窗口/帮助）
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  const win = getWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
