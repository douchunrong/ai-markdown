/**
 * 编辑器桥：让非组件模块（AI 流水线、文件服务）访问编辑器命令式 API。
 * EditorPane 挂载时注入，卸载时置空。
 */
export interface EditorBridge {
  getMarkdown(): string
  getSelectionMarkdown(): string | null
  applyContent(md: string): void
  scrollToHeading(text: string): void
  focus(): void
  /** 在光标处插入 rows×cols 的 GFM 表格（rows 含表头行） */
  insertTable(rows: number, cols: number): void
}

/** 选区信息（悬浮 AI 工具栏定位用） */
export interface SelectionInfo {
  hasSelection: boolean
  chars: number
  /** 选区首末端屏幕坐标 */
  rect: { left: number; top: number; bottom: number } | null
}

let bridge: EditorBridge | null = null

export function setEditorBridge(b: EditorBridge | null) {
  bridge = b
}

export function getEditorBridge(): EditorBridge | null {
  return bridge
}
