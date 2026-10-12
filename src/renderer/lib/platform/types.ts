/**
 * 平台适配层类型定义
 * 三端（Electron 桌面 / Capacitor iOS / Web）差异的唯一收口点。
 */

export type PlatformKind = 'electron' | 'capacitor' | 'web'

export interface HttpRequest {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs: number
  /** 取消信号（Web/Electron 适配层使用） */
  signal?: AbortSignal
}

export interface HttpResponse {
  status: number
  ok: boolean
  /** 响应体文本（>5MB 时适配层应抛 E-RESP，防内存膨胀） */
  bodyText: string
}

export interface DocMeta {
  path: string
  name: string
  size: number
  mtime: number
}

export interface OpenResult {
  path: string
  content: string
}

export interface PlatformFs {
  /** 打开文件：桌面弹原生对话框后读取；iOS 读取沙盒指定路径 */
  openFile(defaultPath?: string): Promise<OpenResult | null>
  /** 读取指定路径（iOS 文档浏览器 / 桌面最近文件） */
  readFile(path: string): Promise<string>
  /** 写文件（encoding=base64 用于 DOCX 等二进制导出） */
  writeFile(path: string, content: string, encoding?: 'utf8' | 'base64'): Promise<void>
  /** 另存为：返回新路径或 null（取消）；filters 指定格式过滤 */
  pickSavePath(defaultName: string, filters?: FileFilter[]): Promise<string | null>
  /** iOS：列出应用文档区文件；桌面：null（用最近文件列表） */
  listDocuments?(): Promise<DocMeta[]>
  /** 删除沙盒文档（iOS 文档管理） */
  deleteDocument?(path: string): Promise<void>
  /** AI 处理前文件备份（桌面：独立备份目录 + 滚动清理；返回备份名） */
  writeBackup?(docPath: string, content: string, keep: number): Promise<string>
  /** 桌面：监听当前文件被外部程序修改；返回取消函数 */
  watchExternalChange?(path: string, cb: () => void): { dispose: () => void }
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface PdfExportOptions {
  pageSize: 'A4' | 'Letter'
  landscape: boolean
  margin: 'none' | 'standard' | 'wide'
}

export interface PngExportOptions {
  /** 渲染宽度（CSS px） */
  width: number
  /** 像素密度倍率（1–3） */
  scale: number
}

export interface PlatformSecure {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/** 剪贴板（右键菜单 / 复制粘贴为…功能） */
export interface PlatformClipboard {
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}

export interface PlatformExport {
  /** 桌面：HTML 渲染为 PDF 写入 target（含纸张/方向参数；页边距由 HTML 内边距实现） */
  toPdf?(html: string, target: string, opts?: PdfExportOptions): Promise<void>
  /** 桌面：HTML 渲染并截图为 PNG 写入 target */
  capturePng?(html: string, target: string, opts?: PngExportOptions): Promise<void>
  /** iOS：系统分享面板 */
  share?(data: { title: string; text?: string; fileName?: string; base64?: string }): Promise<void>
}

export interface PlatformAdapter {
  readonly kind: PlatformKind
  fs: PlatformFs
  http: { request(req: HttpRequest): Promise<HttpResponse> }
  secure: PlatformSecure
  clipboard: PlatformClipboard
  export: PlatformExport
}
