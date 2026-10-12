/**
 * 编辑器右键菜单：动作 id 与菜单结构构建（纯函数，i18n 标签由调用方注入，可单测）。
 * 结构：剪切/拷贝/粘贴 + 复制/粘贴为… + AI 处理（选区/全文自动感知）。
 */

export interface CtxMenuItem {
  id: string
  label: string
  disabled?: boolean
  children?: CtxMenuItem[]
}

/** 右键菜单标签（i18n 注入） */
export interface CtxMenuLabels {
  cut: string
  copy: string
  paste: string
  copyAs: string
  asMarkdown: string
  asHtml: string
  simplify: string
  pastePlain: string
  tidyAll: string
  aiMenu: string
  aiScopeSel: string
  aiScopeFull: string
  insertTable: string
}

/** AI 子菜单动作（一键规整提升为一级项，不在此列；id 与 prompts.ts 一致，菜单 id 前缀 ai:） */
export const CTX_AI_ACTIONS: { id: string; label: string }[] = [
  { id: 'polish', label: '基础润色' },
  { id: 'expand', label: '扩写丰富' },
  { id: 'proofread', label: '问题纠错' },
  { id: 'condense', label: '精简压缩' },
]

export interface CtxMenuState {
  /** 当前有选中内容（剪切/拷贝/复制为… 的可用性；AI 范围提示） */
  hasSelection: boolean
  /** 编辑锁定中（AI 处理期间插入类操作禁用） */
  locked?: boolean
}

/** 构建编辑器右键菜单结构 */
export function buildEditorContextMenu(state: CtxMenuState, L: CtxMenuLabels): CtxMenuItem[] {
  const noSel = !state.hasSelection
  return [
    { id: 'cut', label: L.cut, disabled: noSel },
    { id: 'copy', label: L.copy, disabled: noSel },
    { id: 'paste', label: L.paste },
    {
      id: 'copyAs',
      label: L.copyAs,
      disabled: noSel,
      children: [
        { id: 'copyAsMarkdown', label: L.asMarkdown },
        { id: 'copyAsHtml', label: L.asHtml },
        { id: 'copySimplified', label: L.simplify },
      ],
    },
    { id: 'pasteAsPlain', label: L.pastePlain },
    { id: 'insertTable', label: L.insertTable, disabled: state.locked === true },
    // 一键规整：一级菜单项（位于 AI 处理上方），选区/全文自动感知
    { id: 'ai:tidy-all', label: L.tidyAll },
    {
      id: 'ai',
      label: `${L.aiMenu}（${noSel ? L.aiScopeFull : L.aiScopeSel}）`,
      children: CTX_AI_ACTIONS.map((a) => ({ id: `ai:${a.id}`, label: a.label })),
    },
  ]
}

/** 是否 AI 动作（ai:tidy-all → 'tidy-all'） */
export function parseAiAction(id: string): string | null {
  return id.startsWith('ai:') ? id.slice(3) : null
}
