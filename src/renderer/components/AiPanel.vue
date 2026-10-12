<script setup lang="ts">
/**
 * AI 面板：内置指令分组执行 / 选区模式 / 自定义指令管理 / 运行状态 / 历史回滚。
 */
import { computed, reactive, ref } from 'vue'
import { useAiStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { useCustomPromptsStore } from '@/stores/custom-prompts'
import { BUILTIN_PROMPTS } from '@/lib/ai/prompts'
import { t } from '@/i18n'

const ai = useAiStore()
const settings = useSettingsStore()
const custom = useCustomPromptsStore()

const selectionOnly = ref(false)
const expanded = ref<Record<string, boolean>>({ 一键: true })
const editingCustom = ref(false)
const form = reactive({ name: '', prompt: '' })
const showHistory = ref(false)

const groups = computed(() => {
  const g: Record<string, typeof BUILTIN_PROMPTS> = {}
  for (const p of BUILTIN_PROMPTS) (g[p.group] ??= []).push(p)
  return g
})

const providerName = computed(() => settings.activeProvider?.name ?? t.status.offline)

async function run(id: string) {
  await ai.run(id, undefined, { selectionOnly: selectionOnly.value })
}

async function runCustom(id: string) {
  const p = custom.items.find((x) => x.id === id)
  if (!p) return
  await ai.run('', { name: p.name, prompt: p.prompt }, { selectionOnly: selectionOnly.value })
}

function submitCustom() {
  if (!form.name.trim() || !form.prompt.trim()) return
  custom.add(form.name.trim(), form.prompt.trim())
  form.name = ''
  form.prompt = ''
  editingCustom.value = false
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <section class="ai-root">
    <div class="ai-head">
      <span class="title">✨ {{ t.ai.panel }}</span>
      <span class="provider" :title="providerName">{{ providerName }}</span>
    </div>

    <label class="sel-toggle">
      <input v-model="selectionOnly" type="checkbox" />
      仅处理选中文本（无选区时处理全文）
    </label>

    <!-- 运行状态 -->
    <div v-if="ai.running" class="running-box">
      <div class="spin"></div>
      <div class="running-info">
        <div>{{ t.ai.running }}：{{ ai.actionName }}</div>
        <div v-if="ai.progress.total" class="progress">
          {{ t.ai.progress }} {{ ai.progress.done }}/{{ ai.progress.total }}
        </div>
        <div class="bar" :style="{ width: ai.progress.total ? (ai.progress.done / ai.progress.total) * 100 + '%' : '30%' }"></div>
      </div>
      <button class="mdai-btn danger" @click="ai.cancel()">{{ t.ai.cancel }}</button>
    </div>

    <!-- 内置指令 -->
    <div v-for="(list, g) in groups" :key="g" class="group">
      <button class="group-head" @click="expanded[g] = !expanded[g]">
        <span>{{ expanded[g] ? '▾' : '▸' }} {{ g }}</span>
      </button>
      <div v-if="expanded[g] !== false" class="group-body">
        <button v-for="p in list" :key="p.id" class="prompt-btn" :disabled="ai.running" :title="p.desc" @click="run(p.id)">
          {{ p.name }}
        </button>
      </div>
    </div>

    <!-- 自定义指令 -->
    <div class="group">
      <button class="group-head" @click="editingCustom = !editingCustom">
        <span>▾ {{ t.ai.custom }}</span>
        <span class="add" @click.stop="editingCustom = true">＋</span>
      </button>
      <div v-if="editingCustom" class="custom-form">
        <input v-model="form.name" class="mdai-input" placeholder="指令名称，如：周报精修" />
        <textarea v-model="form.prompt" class="mdai-textarea" rows="3" placeholder="提示词：告诉 AI 如何处理文档…" />
        <button class="mdai-btn primary" @click="submitCustom">保存指令</button>
      </div>
      <div v-for="p in custom.sorted" :key="p.id" class="custom-row">
        <button class="prompt-btn" :disabled="ai.running" :title="p.prompt" @click="runCustom(p.id)">{{ p.name }}</button>
        <span class="ops">
          <button title="置顶" @click="custom.togglePin(p.id)">{{ p.pinned ? '📌' : '📍' }}</button>
          <button title="删除" @click="custom.remove(p.id)">🗑</button>
        </span>
      </div>
    </div>

    <!-- 历史 -->
    <div class="group">
      <button class="group-head" @click="showHistory = !showHistory">
        <span>{{ showHistory ? '▾' : '▸' }} {{ t.ai.history }}（{{ ai.history.length }}）</span>
      </button>
      <div v-if="showHistory" class="group-body">
        <p v-if="!ai.history.length" class="empty">{{ t.ai.noHistory }}</p>
        <div v-for="h in ai.history" :key="h.id" class="history-row">
          <div class="meta">
            <span class="name">{{ h.actionName }}{{ h.selectionOnly ? '（选区）' : '' }}</span>
            <span class="time">{{ fmtTime(h.time) }}</span>
          </div>
          <button class="mdai-btn" @click="ai.revertHistory(h.id)">{{ t.ai.revert }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-root { display: flex; flex-direction: column; padding: 10px; gap: 10px; font-size: 13px; }
.ai-head { display: flex; justify-content: space-between; align-items: center; }
.ai-head .title { font-weight: 700; }
.provider { font-size: 11px; color: var(--mdai-fg-muted); background: var(--mdai-accent-weak); color: var(--mdai-accent); border-radius: 999px; padding: 2px 8px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sel-toggle { display: none; }
.mode-hint { margin: 0; font-size: 11.5px; color: var(--mdai-fg-muted); line-height: 1.5; background: var(--mdai-bg); border: 1px dashed var(--mdai-border); border-radius: 8px; padding: 8px 10px; }
.running-box { display: flex; gap: 10px; align-items: center; background: var(--mdai-accent-weak); padding: 10px; border-radius: 8px; }
.running-info { flex: 1; min-width: 0; }
.progress { font-size: 11px; color: var(--mdai-fg-muted); margin-top: 2px; }
.bar { height: 3px; background: var(--mdai-accent); border-radius: 2px; margin-top: 4px; transition: width 0.3s; animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.5; } }
.spin { width: 14px; height: 14px; border: 2px solid var(--mdai-accent); border-top-color: transparent; border-radius: 50%; animation: rot 0.8s linear infinite; flex-shrink: 0; }
@keyframes rot { to { transform: rotate(360deg); } }
.group-head { width: 100%; display: flex; justify-content: space-between; background: none; border: none; color: var(--mdai-fg); font-weight: 600; font-size: 12.5px; padding: 6px 2px; cursor: pointer; font-family: inherit; }
.group-head .add { padding: 0 6px; }
.group-body { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 0 6px; }
.prompt-btn { background: var(--mdai-bg); border: 1px solid var(--mdai-border); color: var(--mdai-fg); border-radius: 999px; padding: 5px 10px; font-size: 12px; cursor: pointer; font-family: inherit; }
.prompt-btn:hover:not(:disabled) { border-color: var(--mdai-accent); color: var(--mdai-accent); }
.prompt-btn:disabled { opacity: 0.45; cursor: wait; }
.custom-form { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
.custom-row { display: flex; align-items: center; gap: 4px; }
.custom-row .prompt-btn { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
.ops button { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.65; }
.empty { color: var(--mdai-fg-muted); font-size: 12px; }
.history-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 6px 2px; border-bottom: 1px dashed var(--mdai-border); }
.history-row .meta { display: flex; flex-direction: column; min-width: 0; }
.history-row .name { font-size: 12px; font-weight: 500; }
.history-row .time { font-size: 11px; color: var(--mdai-fg-muted); }
</style>
