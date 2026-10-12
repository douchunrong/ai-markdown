<script setup lang="ts">
/**
 * 状态栏：保存状态 · 统计 · 平台 · AI 状态。
 * AI 运行中：窗口右下角显示（旋转加载动画 + 动作名 + 分块进度）；
 * 空闲时：左侧快捷操作（格式化(非AI) / 一键规整 / 基础润色，选区自动优先）。
 */
import type { DocStats } from '@/lib/markdown/outline'
import type { PlatformKind } from '@/lib/platform/types'
import { useDocumentStore } from '@/stores/document'
import { useSettingsStore } from '@/stores/settings'
import { useAiStore } from '@/stores/ai'
import { t } from '@/i18n'

defineProps<{ stats: DocStats; platform: PlatformKind }>()
const doc = useDocumentStore()
const settings = useSettingsStore()
const ai = useAiStore()

const platformName: Record<PlatformKind, string> = {
  electron: 'Desktop',
  capacitor: 'iOS',
  web: 'Web',
}

/** 手动格式化（非 AI）；空文档跳过（格式化空串会得到单个换行） */
function doFormat() {
  if (!doc.content.trim()) return
  doc.formatDocument()
}
/** AI 快捷动作：run 自动模式——有选区处理选区，无选区处理全文 */
function runAi(id: string) {
  void ai.run(id)
}
</script>

<template>
  <footer class="statusbar">
    <span class="cell save" :class="doc.saveState">
      {{
        doc.saveState === 'saving' ? t.status.saving
        : doc.saveState === 'dirty' ? t.status.dirty
        : doc.saveState === 'error' ? t.status.dirty + '（失败）'
        : doc.lastSavedAt ? t.status.saved + ' ' + new Date(doc.lastSavedAt).toLocaleTimeString()
        : t.status.saved
      }}
    </span>
    <span v-if="settings.s.editor.autosave && doc.path" class="cell muted">{{ t.status.autosaveOn }}</span>
    <span v-if="settings.s.privacy.privacyMode" class="cell privacy">{{ t.status.privacy }}</span>

    <!-- 空闲快捷操作（运行中隐藏，避免误触发） -->
    <template v-if="!ai.running">
      <button class="cell quick" :title="t.status.formatTip" @click="doFormat">⚡ {{ t.status.format }}</button>
      <button class="cell quick" :title="t.status.aiScopeTip" @click="runAi('tidy-all')">✨ {{ t.status.tidyAll }}</button>
      <button class="cell quick" :title="t.status.aiScopeTip" @click="runAi('polish')">🖌 {{ t.status.polish }}</button>
    </template>

    <span class="spacer"></span>
    <span class="cell muted">{{ stats.words }} {{ t.status.words }} · {{ stats.chars }} {{ t.status.chars }} · {{ stats.lines }} {{ t.status.lines }} · {{ stats.readMinutes }} {{ t.status.readMin }}</span>

    <!-- AI 处理状态：固定在窗口右下角（转圈 + 动作名 + 分块进度） -->
    <span v-if="ai.running" class="cell ai running">
      <span class="spinner" aria-hidden="true"></span>
      ✨ {{ ai.actionName }}<template v-if="ai.progress.total">（{{ ai.progress.done }}/{{ ai.progress.total }}）</template>
    </span>
    <span class="cell muted platform">{{ platformName[platform] }}</span>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex; align-items: center; gap: 10px; padding: 3px 12px;
  padding-bottom: calc(3px + var(--safe-bottom));
  border-top: 1px solid var(--mdai-border); background: var(--mdai-bg-side);
  font-size: 11.5px; color: var(--mdai-fg-muted); user-select: none;
}
.cell.save.clean { color: var(--mdai-ok); }
.cell.save.dirty, .cell.save.error { color: var(--mdai-warn); }
.cell.privacy { color: var(--mdai-ok); }
.cell.ai { color: var(--mdai-accent); }
.cell.ai.running { display: inline-flex; align-items: center; gap: 6px; }
/* 旋转加载动画 */
.spinner {
  width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid var(--mdai-accent-weak, rgba(127,127,127,.3));
  border-top-color: var(--mdai-accent);
  animation: mdai-spin 0.8s linear infinite;
  flex: none;
}
@keyframes mdai-spin { to { transform: rotate(360deg); } }
/* 空闲快捷操作按钮 */
.cell.quick {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: 1px solid transparent; border-radius: 6px;
  padding: 1px 8px; font-size: 11.5px; font-family: inherit;
  color: var(--mdai-fg-muted); cursor: pointer; white-space: nowrap;
}
.cell.quick:hover {
  color: var(--mdai-accent);
  border-color: var(--mdai-border);
  background: var(--mdai-bg-hover, rgba(127,127,127,.08));
}
.spacer { flex: 1; }
</style>
