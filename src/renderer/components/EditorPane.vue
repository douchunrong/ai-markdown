<script setup lang="ts">
/**
 * Milkdown WYSIWYG 编辑器封装（共享核心三端复用）。
 * 命令式 API：getMarkdown / getSelectionMarkdown / applyContent / scrollToHeading；
 * 交互增强：任意位置点击定位光标、选区上报（悬浮 AI 工具栏）、
 * 文本模式（原始源码零渲染）、标题延迟渲染（换行才转）、代码块 Enter 退出。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Milkdown, useEditor } from '@milkdown/vue'
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  prosePluginsCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import { keymap } from '@milkdown/kit/prose/keymap'
import { setEditorBridge, type EditorBridge, type SelectionInfo } from '@/lib/editor-bridge'
import { matchHeadingLine, isHeadingHashPrefix, shouldExitCodeBlock } from '@/lib/markdown/editor-rules'
import { renderMarkdownHtml } from '@/lib/markdown/render-html'
import { simplifyMarkdown } from '@/lib/markdown/simplify-md'
import { buildEditorContextMenu, parseAiAction, type CtxMenuItem } from '@/lib/editor/context-menu'
import { getPlatform } from '@/lib/platform'
import { zh } from '@/i18n'
import { useAiStore } from '@/stores/ai'
import ContextMenu from '@/components/ContextMenu.vue'

const props = defineProps<{ modelValue: string; sourceMode?: boolean; locked?: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'selectionChange', info: SelectionInfo): void
  (e: 'insertTableRequest'): void
}>()

const host = ref<HTMLDivElement>()
const ta = ref<HTMLTextAreaElement>()

/**
 * 自定义输入规则（前置注册，优先于 commonmark 内置规则）：
 * 1) # 后敲空格保持纯文本 → 换行时才统一转标题（延迟渲染）
 * 2) 代码块：块尾空行 Enter → 退出代码块到普通段落
 */
const deferredRules = new Plugin({
  handleTextInput(view: EditorView, from: number, to: number, text: string) {
    if (text !== ' ') return false
    const { state } = view
    const $from = state.selection.$from
    const parent = $from.parent
    if (!state.selection.empty || parent.type.name !== 'paragraph') return false
    const before = parent.textBetween(0, $from.parentOffset, '\n', '\ufffc')
    if (!isHeadingHashPrefix(before)) return false
    // 拦截即时转标题：空格按纯文本插入
    view.dispatch(state.tr.insertText(' ', from, to))
    return true
  },
})

const deferredKeys = keymap({
  Enter: (state, dispatch) => {
    const $from = state.selection.$from
    const parent = $from.parent
    if (!state.selection.empty) return false

    // 代码块退出：光标在块尾且当前行为空行
    if (parent.type.name === 'code_block' && $from.parentOffset === parent.content.size) {
      const text = parent.textBetween(0, parent.content.size, '\n', '\ufffc')
      if (!shouldExitCodeBlock(text, true)) return false
      if (!dispatch) return true
      const tr = state.tr
      const pos = $from.after()
      tr.insert(pos, state.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
      dispatch(tr.scrollIntoView())
      return true
    }

    // 标题延迟渲染：段落文本为「#+ 空格 正文」且光标在段末 → 换行时统一转标题
    if (parent.type.name === 'paragraph' && $from.parentOffset === parent.content.size) {
      const h = matchHeadingLine(parent.textContent)
      if (!h) return false
      if (!dispatch) return true
      const prefixLen = h.level + 1 // #… + 一个空格
      const start = $from.before() + 1
      const tr = state.tr
      tr.delete(start, start + prefixLen)
      tr.setBlockType(start, $from.after() - 1 - prefixLen, state.schema.nodes.heading, {
        level: h.level,
      })
      const paraPos = $from.after() - prefixLen
      tr.insert(paraPos, state.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.near(tr.doc.resolve(paraPos + 1)))
      dispatch(tr.scrollIntoView())
      return true
    }
    return false
  },
})

/** 代码块语言标签（右下角显示 fence 语言，可直接修改，Enter/失焦提交） */
function buildLangDecorations(state: EditorState): DecorationSet {
  const decos: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block' || node.attrs.language === undefined) return
    decos.push(
      Decoration.widget(
        pos + 1,
        (view: EditorView, getPos: () => number | undefined) => {
          const box = document.createElement('span')
          box.className = 'mdai-code-lang'
          box.contentEditable = 'false'
          const input = document.createElement('input')
          input.value = String(node.attrs.language ?? '')
          input.placeholder = '语言'
          input.spellcheck = false
          input.autocomplete = 'off'
          const commit = () => {
            const p = getPos()
            if (typeof p !== 'number') return
            const cur = view.state.doc.nodeAt(p - 1)
            if (!cur || cur.type.name !== 'code_block') return
            const lang = input.value.trim()
            if (String(cur.attrs.language ?? '') === lang) return
            view.dispatch(
              view.state.tr.setNodeMarkup(p - 1, undefined, { ...cur.attrs, language: lang }),
            )
          }
          input.addEventListener('change', commit)
          input.addEventListener('keydown', (e) => {
            e.stopPropagation() // 语言输入不触发编辑器快捷键
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              input.blur()
              view.focus()
            } else if (e.key === 'Escape') {
              input.blur()
              view.focus()
            }
          })
          input.addEventListener('mousedown', (e) => e.stopPropagation())
          box.appendChild(input)
          return box
        },
        { side: -1, ignoreSelection: true },
      ),
    )
  })
  return DecorationSet.create(state.doc, decos)
}

const codeLangPlugin: Plugin = new Plugin({
  state: {
    init: (_: unknown, state: EditorState) => buildLangDecorations(state),
    apply: (tr, old: DecorationSet, _oldState: EditorState, newState: EditorState) =>
      tr.docChanged ? buildLangDecorations(newState) : old.map(tr.mapping, tr.doc),
  },
  props: {
    decorations: (state: EditorState) => codeLangPlugin.getState?.(state) ?? DecorationSet.empty,
  },
})

/** 编辑锁定（AI 处理期间只读）：闭包 ref 供 ProseMirror editable 实时读取 */
const lockedRef = ref(false)

const { get } = useEditor((root) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.modelValue)
      ctx.update(listenerCtx, (listenerManager) =>
        listenerManager.markdownUpdated((_ctx, markdown) => {
          if (markdown !== props.modelValue) emit('update:modelValue', markdown)
        }),
      )
      // AI 处理期间锁定：只读（仍可选择/复制/滚动）
      ctx.update(editorViewOptionsCtx, (prev) => ({ ...prev, editable: () => !lockedRef.value }))
      // 前置注册：优先于内置 inputrules / keymap 生效
      ctx.update(prosePluginsCtx, (ps) => [deferredRules, deferredKeys, codeLangPlugin, ...ps])
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
})

/** 锁定状态切换：更新 ref 后 dispatch 空事务，触发视图重算 editable（contentEditable） */
watch(
  () => props.locked,
  (v) => {
    lockedRef.value = !!v
    if (props.sourceMode) return
    get()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setMeta('mdai-lock', !!v))
    })
  },
  { immediate: true },
)

/** 外部整文替换（打开文件 / AI 应用结果 / 撤销 AI 修改）；文本模式下直接写 textarea */
function applyContent(md: string) {
  if (props.sourceMode) {
    if (ta.value && ta.value.value !== md) ta.value.value = md
    if (props.modelValue !== md) emit('update:modelValue', md)
    return
  }
  const editor = get()
  if (!editor) return
  if (editor.action(getMarkdown()) === md) return
  editor.action(replaceAll(md))
}

/** 获取选区 Markdown（无选区返回 null）；文本模式取 textarea 选中文本 */
function getSelectionMarkdown(): string | null {
  if (props.sourceMode) {
    const el = ta.value
    if (!el) return null
    const md = el.value.slice(el.selectionStart, el.selectionEnd)
    return md.trim() ? md : null
  }
  const editor = get()
  if (!editor) return null
  try {
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const { from, to, empty } = view.state.selection
    if (empty || to <= from) return null
    const selMd = editor.action(getMarkdown({ from, to }))
    return selMd && selMd.trim() ? selMd : null
  } catch {
    return null
  }
}

/** ---------- 右键菜单（剪切/拷贝/粘贴 + 复制/粘贴为…） ---------- */
const ctxMenu = ref<{ x: number; y: number; items: CtxMenuItem[] } | null>(null)

function onCtxMenu(e: MouseEvent) {
  const hasSel = !!getSelectionMarkdown()
  ctxMenu.value = {
    x: e.clientX,
    y: e.clientY,
    items: buildEditorContextMenu({ hasSelection: hasSel, locked: props.locked }, zh.ctxmenu),
  }
}

async function onCtxAction(id: string) {
  // 插入表格：交由 App.vue 打开行列配置对话框（确认后经 bridge 在光标处插入）
  if (id === 'insertTable') {
    ctxMenu.value = null
    if (!props.locked) emit('insertTableRequest')
    return
  }
  // AI 动作：交由 AI 仓库执行（run 自动模式——有选区处理选区，无选区处理全文）
  const aiId = parseAiAction(id)
  if (aiId) {
    ctxMenu.value = null
    void useAiStore().run(aiId)
    return
  }
  ctxMenu.value = null
  const clip = getPlatform().clipboard

  // 文本模式：textarea 直接操作
  if (props.sourceMode) {
    const el = ta.value
    if (!el) return
    const s = el.selectionStart
    const eIdx = el.selectionEnd
    const sel = el.value.slice(s, eIdx)
    const replaceRange = (text: string) => {
      el.focus()
      el.setRangeText(text, s, eIdx, 'end')
      emit('update:modelValue', el.value)
    }
    switch (id) {
      case 'cut':
        if (sel) {
          await clip.writeText(sel)
          replaceRange('')
        }
        break
      case 'copy':
      case 'copyAsMarkdown': // 源码即 Markdown
        if (sel) await clip.writeText(sel)
        break
      case 'paste':
      case 'pasteAsPlain': { // 文本模式本身就是纯文本
        const t = await clip.readText()
        if (t) replaceRange(t)
        break
      }
      case 'copyAsHtml':
        if (sel) await clip.writeText(renderMarkdownHtml(sel))
        break
      case 'copySimplified':
        if (sel) await clip.writeText(simplifyMarkdown(sel))
        break
    }
    return
  }

  // 所见即所得：ProseMirror 操作
  const editor = get()
  if (!editor) return
  const selMd = getSelectionMarkdown()
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { from, to } = view.state.selection
    const pasteTextAt = (text: string) => {
      view.dispatch(view.state.tr.insertText(text, from, to))
      view.focus()
    }
    void (async () => {
      switch (id) {
        case 'cut':
          if (!selMd) return
          await clip.writeText(selMd)
          view.dispatch(view.state.tr.delete(from, to))
          break
        case 'copy':
        case 'copyAsMarkdown': // 编辑器选区序列化即 Markdown 源码
          if (selMd) await clip.writeText(selMd)
          break
        case 'paste': {
          const t = await clip.readText()
          if (!t) return
          // 合成 paste 事件 → ProseMirror 原生解析（普通文本进段落，markdown 语法按规则解析）
          try {
            const dt = new DataTransfer()
            dt.setData('text/plain', t)
            const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
            view.focus()
            view.dom.dispatchEvent(evt)
          } catch {
            pasteTextAt(t)
          }
          break
        }
        case 'pasteAsPlain': {
          const t = await clip.readText()
          if (t) pasteTextAt(t) // 字面插入，不做任何解析
          break
        }
        case 'copyAsHtml':
          if (selMd) await clip.writeText(renderMarkdownHtml(selMd))
          break
        case 'copySimplified':
          if (selMd) await clip.writeText(simplifyMarkdown(selMd))
          break
      }
    })()
  })
}

/** 大纲定位：滚动到指定标题文本；文本模式按行匹配近似滚动 */
function scrollToHeading(text: string) {
  if (props.sourceMode) {
    const el = ta.value
    if (!el) return
    let acc = 0
    for (const line of el.value.split('\n')) {
      const m = /^#{1,6} +(.*?)\s*$/.exec(line)
      if (m && m[1].trim() === text) {
        el.focus()
        el.setSelectionRange(acc, acc + line.length)
        el.scrollTop = (acc / Math.max(1, el.value.length)) * el.scrollHeight
        return
      }
      acc += line.length + 1
    }
    return
  }
  const editor = get()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    let pos = -1
    view.state.doc.descendants((node, p) => {
      if (pos >= 0) return false
      if (node.type.name === 'heading' && node.textContent.trim() === text) {
        pos = p
        return false
      }
      return true
    })
    if (pos >= 0) {
      const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1)))
      view.dispatch(tr.scrollIntoView())
      view.focus()
    }
  })
}

function focusEditor() {
  if (props.sourceMode) {
    ta.value?.focus()
    return
  }
  const editor = get()
  editor?.action((ctx) => ctx.get(editorViewCtx).focus())
}

/** 模式切换：回到所见即所得时同步源码模式下的整文修改；进入文本模式聚焦 textarea */
watch(
  () => props.sourceMode,
  (v) => {
    if (!v) applyContent(props.modelValue)
    else void nextTick(() => ta.value?.focus())
  },
)

/** 编辑区空白处点击 → 光标定位到点击位置；内容下方空白 → 光标落到文末（同文本域行为） */
function onHostClick(e: MouseEvent) {
  if (props.sourceMode) return // 文本模式下交给 textarea 原生处理
  const target = e.target as HTMLElement
  // 点击在 ProseMirror 内容内：交给编辑器原生处理
  if (target.closest('.ProseMirror')) return
  const editor = get()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
    if (pos) {
      const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos.pos)))
      view.dispatch(tr)
    } else {
      // 点击处无可定位文本（内容下方空白）：光标置文末并滚动可见
      const end = view.state.doc.content.size
      const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1))
      view.dispatch(tr.scrollIntoView())
    }
    view.focus()
  })
}

function onSourceInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

/** 选区变化上报（悬浮工具栏）；文本模式无屏幕坐标，仅上报字符数（不弹悬浮工具栏） */
function reportSelection() {
  const editor = get()
  if (!editor) return
  let info: SelectionInfo = { hasSelection: false, chars: 0, rect: null }
  try {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { from, to, empty } = view.state.selection
      if (!empty && to > from) {
        const start = view.coordsAtPos(from)
        const end = view.coordsAtPos(to)
        const chars = view.state.doc.textBetween(from, to, '\n', ' ').length
        info = {
          hasSelection: true,
          chars,
          rect: {
            left: Math.min(start.left, end.left),
            top: Math.min(start.top, end.top),
            bottom: Math.max(start.bottom, end.bottom),
          },
        }
      }
    })
  } catch {
    /* 忽略坐标异常 */
  }
  emit('selectionChange', info)
}

let selTimer: ReturnType<typeof setTimeout> | null = null
function onSelectionActivity() {
  if (selTimer) clearTimeout(selTimer)
  selTimer = setTimeout(reportSelection, 120)
}

/** ---------- 表格插入（菜单 / 快捷键 → TableDialog → bridge） ---------- */

/** 生成 GFM 表格 Markdown（rows 含表头行；cols ≥ 1） */
function buildTableMarkdown(rows: number, cols: number): string {
  const c = Math.max(1, Math.min(10, Math.floor(cols)))
  const r = Math.max(2, Math.min(30, Math.floor(rows)))
  const header = Array.from({ length: c }, (_, i) => `列 ${i + 1}`).join(' | ')
  const sep = Array.from({ length: c }, () => '---').join(' | ')
  const body = Array.from({ length: r - 1 }, () => Array.from({ length: c }, () => '   ').join(' | '))
  return ['', `| ${header} |`, `| ${sep} |`, ...body.map((line) => `| ${line} |`), ''].join('\n')
}

/** 在光标处插入表格：WYSIWYG 经 markdown 解析为节点；源码模式插入 GFM 文本 */
function insertTable(rows: number, cols: number) {
  if (props.locked) return
  const md = buildTableMarkdown(rows, cols)
  // 源码模式：textarea 光标处插入文本
  if (props.sourceMode) {
    const el = ta.value
    if (!el) return
    const s = el.selectionStart
    el.focus()
    el.setRangeText(md, s, el.selectionEnd, 'end')
    emit('update:modelValue', el.value)
    return
  }
  const editor = get()
  if (!editor) return
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    try {
      const node = ctx.get(parserCtx)(md)
      view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
    } catch {
      // 解析异常兜底：按纯文本插入（罕见）
      view.dispatch(view.state.tr.insertText(md))
    }
    view.focus()
  })
}

let bridge: EditorBridge | null = null
onMounted(() => {
  bridge = {
    getMarkdown: () =>
      props.sourceMode ? props.modelValue : (get()?.action(getMarkdown()) ?? props.modelValue),
    getSelectionMarkdown,
    applyContent,
    scrollToHeading,
    focus: focusEditor,
    insertTable,
  }
  setEditorBridge(bridge)
  host.value?.addEventListener('mouseup', onSelectionActivity)
  host.value?.addEventListener('keyup', onSelectionActivity)
  host.value?.addEventListener('touchend', onSelectionActivity)
})
onBeforeUnmount(() => {
  if (bridge) setEditorBridge(null)
  host.value?.removeEventListener('mouseup', onSelectionActivity)
  host.value?.removeEventListener('keyup', onSelectionActivity)
  host.value?.removeEventListener('touchend', onSelectionActivity)
  if (selTimer) clearTimeout(selTimer)
})
</script>

<template>
  <div ref="host" class="editor-pane" :class="{ locked }" @click="onHostClick" @contextmenu.prevent="onCtxMenu">
    <!-- AI 处理锁定标识 -->
    <div v-if="locked" class="lock-badge">🔒 AI 处理中，编辑已锁定</div>
    <div v-show="!sourceMode" class="wysiwyg-wrap">
      <Milkdown />
    </div>
    <textarea
      v-show="sourceMode"
      ref="ta"
      class="source-area"
      spellcheck="false"
      :value="modelValue"
      :readonly="locked"
      @input="onSourceInput"
      @mouseup="onSelectionActivity"
      @keyup="onSelectionActivity"
    ></textarea>
    <ContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxMenu.items"
      @select="onCtxAction"
      @close="ctxMenu = null"
    />
  </div>
</template>

<style scoped>
.editor-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  outline: none;
  position: relative;
  /* 撑满高度：点击内容下方空白同样可定位光标 */
  display: flex;
  flex-direction: column;
}
/* AI 处理期间锁定：轻遮罩提示（仍可滚动/选择/复制） */
.editor-pane.locked :deep(.ProseMirror),
.editor-pane.locked .source-area {
  cursor: not-allowed;
}
.lock-badge {
  position: absolute;
  top: 8px;
  right: 14px;
  z-index: 20;
  font-size: 11.5px;
  color: var(--mdai-accent);
  background: var(--mdai-accent-weak);
  border: 1px solid var(--mdai-accent);
  border-radius: 999px;
  padding: 2px 10px;
  pointer-events: none;
}
.wysiwyg-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wysiwyg-wrap > :deep(.milkdown) {
  flex: 1;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.editor-pane :deep(.milkdown .editor),
.editor-pane :deep(.milkdown .ProseMirror) {
  min-height: 100%;
  flex: 1;
  cursor: text;
}
/* 代码块语言标签：右下角显示并可编辑 */
.editor-pane :deep(.ProseMirror pre) {
  position: relative;
}
.editor-pane :deep(.mdai-code-lang) {
  position: absolute;
  right: 10px;
  bottom: 6px;
  opacity: 0.5;
  transition: opacity 0.15s;
  z-index: 5;
}
.editor-pane :deep(pre:hover .mdai-code-lang),
.editor-pane :deep(.mdai-code-lang:focus-within) {
  opacity: 1;
}
.editor-pane :deep(.mdai-code-lang input) {
  width: 84px;
  padding: 2px 8px;
  font-size: 11px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--mdai-bg-hover, rgba(127, 127, 127, 0.15));
  color: var(--mdai-fg-muted, inherit);
  border: 1px solid var(--mdai-border, rgba(127, 127, 127, 0.3));
  border-radius: 5px;
  outline: none;
}
/* 文本模式：原始源码零渲染，等宽字体完整展示 */
.source-area {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: var(--mdai-bg);
  color: var(--mdai-fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  font-size: 13.5px;
  line-height: 1.75;
  padding: 16px 20px;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>
