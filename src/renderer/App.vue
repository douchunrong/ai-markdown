<script setup lang="ts">
/**
 * 主界面：菜单栏 + 侧栏 + 编辑区 + AI 面板 + 状态栏；视图切换（编辑/设置）；
 * 动态标题（未保存 * 标识）、选区悬浮 AI 工具栏、另存为对话框统一编排。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import EditorPane from '@/components/EditorPane.vue'
import SidePanel from '@/components/SidePanel.vue'
import AiPanel from '@/components/AiPanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import TableDialog from '@/components/TableDialog.vue'
import CompareDialog from '@/components/CompareDialog.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import type { SelectionInfo } from '@/lib/editor-bridge'
import { useSettingsStore } from '@/stores/settings'
import { useDocumentStore } from '@/stores/document'
import { useAiStore } from '@/stores/ai'
import { detectPlatform } from '@/lib/platform'
import { computeStats, extractOutline } from '@/lib/markdown/outline'
import type { ExportFormat } from '@/lib/export-doc'
import { t } from '@/i18n'

const settings = useSettingsStore()
const doc = useDocumentStore()
const ai = useAiStore()
const platform = detectPlatform()
const isMobile = platform === 'capacitor'

/** 视图状态：编辑 / 设置（独立页面，平滑切换） */
const view = ref<'editor' | 'settings'>('editor')

const showSide = ref(!isMobile)
const showAi = ref(false) // 默认隐藏 AI 面板，经 ✨ 按钮或 Ctrl+Shift+2 唤出
const showExport = ref(false)
/** 导出对话框预选格式（文件菜单「导出」子菜单直达） */
const exportInitial = ref<ExportFormat>('pdf')
/** 插入表格对话框（编辑菜单 / 快捷键唤起） */
const showTableDialog = ref(false)
// 编辑视图布局：preview=预览模式（所见即所得）/ edit=编辑模式（源码）/ split=双屏（左编辑右预览）
type EditorViewMode = 'preview' | 'edit' | 'split'
const editorView = ref<EditorViewMode>('preview')
// 快捷键提示（macOS ⌘/ ，其他 Ctrl+/ ；Electron 下由原生菜单加速键处理，Web 下由键盘监听兜底）
const isMacOs = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const modLabel = isMacOs ? '⌘' : 'Ctrl+'
const viewModes = computed<{ v: EditorViewMode; label: string; title: string }[]>(() => {
  const all = [
    { v: 'preview' as const, label: t.view.preview, title: t.view.previewTitle },
    { v: 'edit' as const, label: t.view.edit, title: t.view.editTitle },
    { v: 'split' as const, label: t.view.split, title: t.view.splitTitle },
  ]
  return isMobile ? all.filter((m) => m.v !== 'split') : all // 移动端窄屏不提供双屏
})
function setView(v: EditorViewMode) {
  editorView.value = v
}
function cycleView() {
  // 快捷键仅在 预览 ⇄ 编辑 之间切换；双屏经视图按钮选择
  editorView.value = editorView.value === 'preview' ? 'edit' : 'preview'
}
const mobileSheet = ref<'none' | 'side' | 'ai'>('none')
const toast = ref<{ text: string; error?: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, error = false) {
  toast.value = { text, error }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), error ? 5000 : 2500)
}
// ExportDialog 等子组件的 toast 事件
function onToastEvent(e: Event) {
  const d = (e as CustomEvent<{ text: string; error?: boolean }>).detail
  showToast(d.text, d.error)
}

const outline = computed(() => (doc.content.length < 300_000 ? extractOutline(doc.content) : []))
const stats = computed(() => computeStats(doc.content))

// ---------- 动态标题（要求 4）：已保存→文档名；未保存→未命名文档；脏→名后 * ----------
const displayTitle = computed(() => {
  if (!doc.path) return doc.dirty ? '未命名文档 *' : '未命名文档'
  return doc.dirty ? `${doc.title} *` : doc.title
})
watch(
  displayTitle,
  (v) => {
    document.title = `${v} — AI Markdown`
  },
  { immediate: true },
)

// ---------- 主题应用 ----------
const themeApplied = computed(() => settings.s.appearance.theme)
watch(
  themeApplied,
  (th) => {
    document.documentElement.dataset.theme = th
  },
  { immediate: true },
)

// ---------- 文档操作 ----------
async function doOpen() {
  if (!(await confirmUnsaved())) return
  const ok = await doc.openFromDisk()
  if (!ok) showToast('未选择文件')
}
async function doSave() {
  const ok = await doc.save()
  showToast(ok ? t.status.saved : t.toast.saveFailed, !ok)
}
async function doNew() {
  if (!(await confirmUnsaved())) return
  doc.newDoc()
}
async function confirmUnsaved(): Promise<boolean> {
  if (!doc.dirty) return true
  const choice = await askUnsaved()
  if (choice === 'save') return await doc.save()
  return choice !== 'cancel'
}
function askUnsaved(): Promise<'save' | 'discard' | 'cancel'> {
  const yes = window.confirm(`「${displayTitle.value}」尚未保存。\n确定 = 保存并继续，取消 = 放弃更改继续`)
  return Promise.resolve(yes ? 'save' : 'discard')
}

// ---------- 选区悬浮工具栏（要求 1：选中触发局部整理） ----------
const selection = ref<SelectionInfo>({ hasSelection: false, chars: 0, rect: null })
function onSelectionChange(info: SelectionInfo) {
  selection.value = info
}
const selToolbarStyle = computed(() => {
  const r = selection.value.rect
  if (!r) return { display: 'none' }
  const top = Math.max(48, r.top - 46)
  const left = Math.min(Math.max(12, r.left), window.innerWidth - 320)
  return { position: 'fixed' as const, top: `${top}px`, left: `${left}px`, zIndex: 120 }
})
const showSelToolbar = computed(
  () => selection.value.hasSelection && !ai.running && !ai.pending && view.value === 'editor' && !showExport.value && editorView.value === 'preview',
)
/** 选区工具栏动作：仅作用于当前选中文本 */
async function runOnSelection(promptId: string) {
  selection.value = { hasSelection: false, chars: 0, rect: null }
  await ai.run(promptId, undefined, { selectionOnly: true })
}

// ---------- 自动保存 ----------
let autosaveTimer: ReturnType<typeof setInterval> | null = null
function setupAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer)
  if (!settings.s.editor.autosave) return
  autosaveTimer = setInterval(() => {
    if (doc.dirty && doc.path) void doc.save()
  }, Math.max(10, settings.s.editor.autosaveIntervalSec) * 1000)
}
watch(() => [settings.s.editor.autosave, settings.s.editor.autosaveIntervalSec], setupAutosave, { immediate: true })

// ---------- 键盘快捷键（桌面） ----------
/** 匹配 Electron accelerator（如 CmdOrCtrl+Alt+T）与键盘事件 */
function matchAccelerator(e: KeyboardEvent, accel: string): boolean {
  const parts = accel.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  const mod = e.metaKey || e.ctrlKey
  const needMod = parts.some((p) => p === 'cmdorctrl' || p === 'mod' || p === 'command')
  if (needMod !== mod) return false
  if (parts.includes('alt') !== e.altKey) return false
  if (parts.includes('shift') !== e.shiftKey) return false
  return e.key.toLowerCase() === key
}

function onKeydown(e: KeyboardEvent) {
  if (isMobile) return
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const key = e.key.toLowerCase()
  const stop = () => e.preventDefault()
  if (key === 's' && !e.shiftKey) { stop(); void doSave() }
  else if (key === 's' && e.shiftKey) { stop(); showExport.value = true } // 另存为（多格式）
  else if (key === 'o') { stop(); void doOpen() }
  else if (key === 'n') { stop(); void doNew() }
  else if (key === ',') { stop(); view.value = 'settings' }
  else if (key === '/') {
    // 在预览 / 编辑之间切换（双屏经视图按钮选择；键盘统一由此处理，菜单加速键已移除，避免双重切换相互抵消）
    stop()
    cycleView()
  }
  else if (key === '1' && e.shiftKey) { stop(); showSide.value = !showSide.value }
  else if (key === '2' && e.shiftKey) { stop(); showAi.value = !showAi.value }
  else if (matchAccelerator(e, settings.s.editor.shortcuts.insertTable)) { stop(); openTableDialog() }
}

// ---------- AI 错误提示 ----------
watch(
  () => ai.error,
  (err) => {
    if (err) showToast(`${err.code}：${err.message}`, true)
  },
)

function beforeUnload(e: BeforeUnloadEvent) {
  if (doc.dirty && !isMobile) e.preventDefault()
}

// ---------- 原生菜单动作（Electron）：复用与界面菜单一致的处理 ----------
type MdaiMenuApi = {
  app?: { onMenuAction?: (cb: (action: string) => void) => () => void }
  menu?: { setInsertTableShortcut?: (accel: string) => Promise<boolean> }
}
let offMenuAction: (() => void) | null = null

function onNativeMenuAction(action: string) {
  if (action === 'new') void doNew()
  else if (action === 'open') void doOpen()
  else if (action === 'save') void doSave()
  else if (action === 'saveAs') showExport.value = true
  else if (action === 'settings') view.value = 'settings'
  else if (action === 'cycleView') cycleView()
  else if (action === 'insertTable') openTableDialog()
  else if (action.startsWith('export:')) {
    // 文件菜单「导出」子菜单：预选格式打开导出对话框
    exportInitial.value = action.slice('export:'.length) as ExportFormat
    showExport.value = true
  }
}

/** 打开插入表格对话框（AI 处理期间编辑区已锁定，忽略触发） */
function openTableDialog() {
  if (ai.running) return
  showTableDialog.value = true
}

/** 自定义快捷键保存后同步原生菜单加速键（仅 Electron） */
watch(
  () => settings.s.editor.shortcuts.insertTable,
  (accel) => {
    void (window.mdai as MdaiMenuApi | undefined)?.menu?.setInsertTableShortcut?.(accel)
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('mdai-toast', onToastEvent as EventListener)
  ai.loadHistory()
  void settings.loadKey(settings.s.ai.activeProviderId || settings.s.ai.providers[0]?.id || '')
  offMenuAction = (window.mdai as MdaiMenuApi | undefined)?.app?.onMenuAction?.(onNativeMenuAction) ?? null
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('mdai-toast', onToastEvent as EventListener)
  offMenuAction?.()
  if (autosaveTimer) clearInterval(autosaveTimer)
})

function openMobileSheet(which: 'side' | 'ai') {
  mobileSheet.value = mobileSheet.value === which ? 'none' : which
}
function onEditorInput(v: string) {
  doc.onContentChanged(v)
}
</script>

<template>
  <div class="app-shell">
    <!-- 设置页面（独立页面视图） -->
    <SettingsPage v-if="view === 'settings'" @back="view = 'editor'" />

    <!-- 编辑视图 -->
    <template v-else>
      <!-- 顶部：动态文档标题 + 快捷操作（文件操作已迁移至原生顶部菜单栏） -->
      <header class="topbar">
        <div class="left">
          <button v-if="!isMobile" class="icon-btn" title="侧栏 (Ctrl+Shift+1)" @click="showSide = !showSide">☰</button>
          <span class="doc-title" :title="doc.path || displayTitle" :class="{ dirty: doc.dirty }">{{ displayTitle }}</span>
          <span v-if="settings.s.privacy.privacyMode" class="badge privacy">{{ t.status.privacy }}</span>
        </div>
        <div class="right">
          <template v-if="!isMobile">
            <div class="view-switch" :title="`${t.view.cycleTitle}（${modLabel}/）`">
              <button
                v-for="m in viewModes"
                :key="m.v"
                class="vs-btn"
                :class="{ on: editorView === m.v }"
                :title="m.title"
                @click="setView(m.v)"
              >{{ m.label }}</button>
            </div>
            <button class="mdai-btn" :class="{ ghost: !showAi }" :title="showAi ? t.ai.hidePanel : t.ai.showPanel" @click="showAi = !showAi">✨ AI</button>
            <button class="mdai-btn ghost" :title="t.menuBar.settings" @click="view = 'settings'">⚙</button>
          </template>
          <template v-else>
            <button class="mdai-btn" @click="doSave">{{ t.menu.save }}</button>
            <div class="view-switch">
              <button
                v-for="m in viewModes"
                :key="m.v"
                class="vs-btn"
                :class="{ on: editorView === m.v }"
                :title="m.title"
                @click="setView(m.v)"
              >{{ m.label }}</button>
            </div>
            <button class="mdai-btn ghost" @click="view = 'settings'">⚙</button>
          </template>
        </div>
      </header>

      <div class="app-main">
        <SidePanel v-if="!isMobile && showSide" :outline="outline" class="side-panel" />
        <div class="editor-split">
          <MilkdownProvider>
            <EditorPane :model-value="doc.content" :source-mode="editorView !== 'preview'" :locked="ai.running" @update:model-value="onEditorInput" @selection-change="onSelectionChange" @insert-table-request="openTableDialog" />
          </MilkdownProvider>
          <!-- 双屏：右侧只读实时预览 -->
          <MarkdownPreview v-if="editorView === 'split'" :md="doc.content" class="preview-pane" />
        </div>
        <AiPanel v-if="!isMobile && showAi" class="ai-panel" />

        <!-- iOS 抽屉 -->
        <SidePanel v-if="isMobile && mobileSheet === 'side'" :outline="outline" class="side-panel sheet" @close="mobileSheet = 'none'" />
        <AiPanel v-if="isMobile && mobileSheet === 'ai'" class="ai-panel sheet" />
      </div>

      <!-- iOS 底部工具条 -->
      <nav v-if="isMobile" class="mobile-toolbar">
        <button @click="openMobileSheet('side')">📄<span>文档/大纲</span></button>
        <button @click="doNew">➕<span>新建</span></button>
        <button @click="openMobileSheet('ai')">✨<span>AI 整理</span></button>
        <button @click="showExport = true">⬆️<span>另存为</span></button>
      </nav>

      <StatusBar :stats="stats" :platform="platform" />

      <!-- 选区悬浮 AI 工具栏 -->
      <div v-if="showSelToolbar" class="sel-toolbar" :style="selToolbarStyle">
        <button class="mdai-btn primary" @click="runOnSelection('polish')">{{ t.selection.polish }}</button>
        <button class="mdai-btn" @click="runOnSelection('expand')">{{ t.selection.expand }}</button>
      </div>

      <!-- 另存为 / 导出（多格式） -->
      <ExportDialog v-if="showExport" :initial-format="exportInitial" @close="showExport = false" />
      <!-- 插入表格（行列配置） -->
      <TableDialog v-if="showTableDialog" @close="showTableDialog = false" />
      <!-- AI 结果预览（采用 / 放弃） -->
      <CompareDialog />

      <!-- 外部修改冲突 -->
      <div v-if="doc.externalChanged" class="mdai-dialog-mask">
        <div class="mdai-dialog">
          <header>{{ t.conflict.title }}</header>
          <div class="body">{{ t.conflict.msg.replace('{name}', doc.title) }}</div>
          <footer>
            <button class="mdai-btn primary" @click="doc.resolveConflict('keep-mine')">{{ t.conflict.keepMine }}</button>
            <button class="mdai-btn" @click="doc.resolveConflict('load-disk')">{{ t.conflict.loadDisk }}</button>
            <button class="mdai-btn" @click="doc.resolveConflict('save-as')">{{ t.conflict.saveAsNew }}</button>
          </footer>
        </div>
      </div>

      <div v-if="toast" class="mdai-toast" :class="{ error: toast.error }">{{ toast.text }}</div>
    </template>
  </div>
</template>

<style scoped>
.topbar {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 6px 12px; padding-top: calc(6px + var(--safe-top));
  border-bottom: 1px solid var(--mdai-border); background: var(--mdai-bg-side);
}
.topbar .left, .topbar .right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.doc-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38vw; }
.doc-title.dirty { color: var(--mdai-warn); }
.kbd-hint {
  margin-left: 6px;
  font-size: 10px;
  color: var(--mdai-fg-muted);
  opacity: 0.8;
}
/* 视图三段切换器（预览 / 编辑 / 双屏） */
.view-switch {
  display: flex;
  border: 1px solid var(--mdai-border);
  border-radius: 8px;
  overflow: hidden;
}
.vs-btn {
  background: none;
  border: none;
  padding: 5px 11px;
  font-size: 12px;
  color: var(--mdai-fg-muted);
  cursor: pointer;
  font-family: inherit;
}
.vs-btn + .vs-btn { border-left: 1px solid var(--mdai-border); }
.vs-btn.on {
  background: var(--mdai-accent-weak);
  color: var(--mdai-accent);
  font-weight: 600;
}
/* 双屏布局：左编辑右预览 */
.editor-split { flex: 1; display: flex; min-width: 0; }
.preview-pane { border-left: 1px solid var(--mdai-border); }
.icon-btn { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--mdai-fg); padding: 2px 6px; }
.mdai-btn.ghost { border-color: transparent; }
.badge.privacy { font-size: 11px; background: var(--mdai-ok); color: #fff; border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
.side-panel { width: 260px; flex-shrink: 0; border-right: 1px solid var(--mdai-border); overflow-y: auto; background: var(--mdai-bg-side); }
.ai-panel { width: 300px; flex-shrink: 0; border-left: 1px solid var(--mdai-border); overflow-y: auto; background: var(--mdai-bg-side); }
.sheet { width: 100%; border: none; }
.sel-toolbar {
  display: flex; align-items: center; gap: 8px;
  background: var(--mdai-bg); border: 1px solid var(--mdai-border); border-radius: 999px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2); padding: 6px 8px 6px 14px;
}
</style>
