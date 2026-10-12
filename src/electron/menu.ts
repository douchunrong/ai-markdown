/**
 * 原生应用菜单（中文本地化）：macOS / Windows / Linux 统一注册。
 * 菜单动作通过 `app:menu-action` 事件转发给渲染进程，由 App.vue 复用界面内
 * 既有处理逻辑（新建/打开/保存/另存为/设置），避免主进程重复实现业务。
 */
import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { getWindow } from './ipc'

const APP_NAME = 'AI Markdown'

const sep: MenuItemConstructorOptions = { type: 'separator' }

function send(action: string) {
  getWindow()?.webContents.send('app:menu-action', action)
}

/** 插入表格快捷键（可经设置页自定义，与 renderer/stores/settings.ts 默认值保持一致） */
let insertTableAccelerator = 'CmdOrCtrl+Alt+T'

/** accelerator 白名单校验：至少「修饰键 + 主键」两段，防非法值导致菜单构建抛错 */
function isValidAccelerator(a: string): boolean {
  if (typeof a !== 'string' || !a) return false
  const parts = a.split('+')
  if (parts.length < 2) return false
  return parts.every((p) => /^[A-Za-z0-9]{1,12}$/.test(p))
}

/** 更新插入表格快捷键并重建菜单（渲染层设置保存时经 IPC 调用） */
export function setInsertTableAccelerator(accel: string): boolean {
  if (!isValidAccelerator(accel)) return false
  insertTableAccelerator = accel
  installAppMenu()
  return true
}

export function installAppMenu() {
  app.setName(APP_NAME)
  const isMac = process.platform === 'darwin'

  // macOS 首个子菜单固定为「应用菜单」，标题取自应用包名（开发环境经脚本改名为 AI Markdown）
  const appMenu: MenuItemConstructorOptions = {
    label: APP_NAME,
    submenu: [
      { label: `关于 ${APP_NAME}`, role: 'about' },
      { type: 'separator' },
      { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
      { type: 'separator' },
      { label: '服务', role: 'services' },
      { type: 'separator' },
      { label: `隐藏 ${APP_NAME}`, role: 'hide' },
      { label: '隐藏其他', role: 'hideOthers' },
      { label: '显示全部', role: 'unhide' },
      { type: 'separator' },
      { label: `退出 ${APP_NAME}`, role: 'quit' },
    ],
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: '文件',
    submenu: [
      { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { type: 'separator' },
      { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
      // 导出子菜单：直达常用格式（打开导出对话框并预选，可调参数后导出）
      {
        label: '导出',
        submenu: [
          { label: 'Word 文档 (.docx)…', click: () => send('export:docx') },
          { label: 'PDF 文档 (.pdf)…', click: () => send('export:pdf') },
          { label: 'PNG 长图 (.png)…', click: () => send('export:png') },
        ],
      },
      ...(isMac
        ? []
        : [sep, { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') }]),
      { type: 'separator' },
      { label: '关闭窗口', role: 'close' },
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '拷贝', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
      { type: 'separator' },
      { label: '插入表格…', accelerator: insertTableAccelerator, click: () => send('insertTable') },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: '视图',
    submenu: [
      // 快捷键 ⌘/ 由渲染进程键盘监听统一处理（此处不注册加速键，避免双重触发相互抵消）
      { label: '切换视图（预览 / 编辑）  ⌘/', click: () => send('cycleView') },
      { type: 'separator' },
      { label: '重新加载', role: 'reload' },
      { label: '强制重新加载', role: 'forceReload' },
      { label: '切换开发者工具', role: 'toggleDevTools' },
      { type: 'separator' },
      { label: '实际大小', role: 'resetZoom' },
      { label: '放大', role: 'zoomIn' },
      { label: '缩小', role: 'zoomOut' },
      { type: 'separator' },
      { label: '进入全屏', role: 'togglefullscreen' },
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      ...(isMac ? [sep, { label: '前置全部窗口', role: 'front' as const }] : []),
    ],
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: '帮助',
    submenu: isMac
      ? [{ label: `${APP_NAME} 帮助`, enabled: false }]
      : [{ label: `关于 ${APP_NAME}`, role: 'about' }],
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu, helpMenu]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
