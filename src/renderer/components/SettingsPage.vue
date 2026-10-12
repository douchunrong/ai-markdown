<script setup lang="ts">
/**
 * 设置页面（独立页面形态，替代原弹窗）：AI 模型 / 隐私 / 编辑 / 外观。
 * 经视图切换进入，返回按钮回到编辑界面。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useSettingsStore, DEFAULT_INSERT_TABLE_SHORTCUT, type ThemeName } from '@/stores/settings'
import { AiClient, normalizeBaseUrl } from '@/lib/ai/client'
import { AppError } from '@/lib/ai/errors'
import { getPlatform } from '@/lib/platform'
import { t } from '@/i18n'

const emit = defineEmits<{ (e: 'back'): void }>()
const settings = useSettingsStore()

const tab = ref<'ai' | 'privacy' | 'editor' | 'appearance'>('ai')
const testing = ref(false)
const testResult = ref<{ ok: boolean; msg: string } | null>(null)

const editing = reactive({
  id: '',
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  temperature: 0.3,
  maxTokens: 4096,
  timeoutSec: 60,
})

const activeId = computed(() => settings.s.ai.activeProviderId || settings.s.ai.providers[0]?.id || '')
/** 当前启用中的模型（真实存储值，不回退首个；空 = 全部未启用） */
const enabledId = computed(() => settings.s.ai.activeProviderId)

function loadProvider(id: string) {
  const p = settings.s.ai.providers.find((x) => x.id === id)
  if (!p) return
  Object.assign(editing, {
    id: p.id, name: p.name, baseUrl: p.baseUrl, model: p.model,
    temperature: p.temperature, maxTokens: p.maxTokens, timeoutSec: Math.round(p.timeoutMs / 1000),
  })
  void settings.loadKey(p.id).then((k) => (editing.apiKey = k))
}
onMounted(() => {
  if (activeId.value) loadProvider(activeId.value)
})

function newProvider() {
  Object.assign(editing, { id: '', name: '新模型配置', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', temperature: 0.3, maxTokens: 4096, timeoutSec: 60 })
  testResult.value = null
}

async function saveProvider() {
  try {
    new URL(normalizeBaseUrl(editing.baseUrl))
  } catch {
    testResult.value = { ok: false, msg: '接口地址格式不正确' }
    return
  }
  let id = editing.id
  if (!id) {
    id = `p-${Date.now()}`
    settings.s.ai.providers.push({ id, name: editing.name, baseUrl: normalizeBaseUrl(editing.baseUrl), model: editing.model, temperature: editing.temperature, maxTokens: editing.maxTokens, timeoutMs: editing.timeoutSec * 1000 })
  } else {
    const p = settings.s.ai.providers.find((x) => x.id === id)!
    Object.assign(p, { name: editing.name, baseUrl: normalizeBaseUrl(editing.baseUrl), model: editing.model, temperature: editing.temperature, maxTokens: editing.maxTokens, timeoutMs: editing.timeoutSec * 1000 })
  }
  await settings.setKey(id, editing.apiKey)
  settings.s.ai.activeProviderId = settings.s.ai.activeProviderId || id
  settings.persist()
  loadProvider(id)
  testResult.value = { ok: true, msg: '已保存' }
}

async function deleteProvider() {
  if (!editing.id) return
  await settings.deleteKey(editing.id)
  settings.s.ai.providers = settings.s.ai.providers.filter((p) => p.id !== editing.id)
  if (settings.s.ai.activeProviderId === editing.id) settings.s.ai.activeProviderId = settings.s.ai.providers[0]?.id ?? ''
  settings.persist()
  if (settings.s.ai.providers[0]) loadProvider(settings.s.ai.providers[0].id)
  else newProvider()
}

/** 启用/停用模型：activeProviderId 为单值，启用一个其余自动关闭 */
function toggleActive(id: string) {
  settings.s.ai.activeProviderId = settings.s.ai.activeProviderId === id ? '' : id
  settings.persist()
}

async function testConnection() {
  if (!editing.id) {
    testResult.value = { ok: false, msg: '请先保存配置' }
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const client = new AiClient(getPlatform().http, {
      baseUrl: editing.baseUrl,
      apiKey: editing.apiKey,
      model: editing.model,
      temperature: 0,
      maxTokens: 8,
      timeoutMs: Math.min(editing.timeoutSec * 1000, 30000),
      retryLimit: 0,
      maxChunkChars: 6000,
      redactEnabled: false,
    })
    await client.ping()
    testResult.value = { ok: true, msg: t.settings.testOk }
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError('E-NET', err instanceof Error ? err.message : String(err))
    testResult.value = { ok: false, msg: `${e.code}：${e.message}` }
  } finally {
    testing.value = false
  }
}

function saveAll() {
  settings.persist()
  emit('back')
}

/** ---------- 快捷键自定义（插入表格） ---------- */
const isMacOs = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const recording = ref(false)
const recordTip = ref('')

/** accelerator 美化显示：CmdOrCtrl → ⌘/Ctrl */
function displayAccel(accel: string): string {
  if (!accel) return t.settings.shortcutEmpty
  return accel
    .split('+')
    .map((p) =>
      p === 'CmdOrCtrl' ? (isMacOs ? '⌘' : 'Ctrl')
      : p === 'Alt' ? (isMacOs ? '⌥' : 'Alt')
      : p === 'Shift' ? (isMacOs ? '⇧' : 'Shift')
      : p.toUpperCase(),
    )
    .join(' + ')
}

const insertTableAccel = computed(() => settings.s.editor.shortcuts.insertTable)

/** 录制：捕获下一次组合键写入设置（Esc 取消；须含 Cmd/Ctrl/Alt/Shift 至少一个修饰键） */
function onRecordKeydown(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.key === 'Escape') {
    stopRecord()
    return
  }
  const mod = e.metaKey || e.ctrlKey
  if (!mod && !e.altKey) {
    recordTip.value = t.settings.shortcutNeedMod
    return
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (!/^[a-z0-9]$/.test(key) && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    recordTip.value = t.settings.shortcutBadKey
    return
  }
  const parts: string[] = []
  if (mod) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  settings.s.editor.shortcuts.insertTable = parts.join('+')
  settings.persist()
  recordTip.value = ''
  stopRecord()
}

function startRecord() {
  recording.value = true
  recordTip.value = t.settings.recording
  window.addEventListener('keydown', onRecordKeydown, { capture: true })
}
function stopRecord() {
  recording.value = false
  window.removeEventListener('keydown', onRecordKeydown, { capture: true })
}
onBeforeUnmount(stopRecord)

function resetInsertTableShortcut() {
  settings.s.editor.shortcuts.insertTable = DEFAULT_INSERT_TABLE_SHORTCUT
  settings.persist()
  recordTip.value = ''
}

const themes: { v: ThemeName; label: string }[] = [
  { v: 'system', label: t.themes.system },
  { v: 'light', label: t.themes.light },
  { v: 'dark', label: t.themes.dark },
  { v: 'sepia', label: t.themes.sepia },
  { v: 'paper', label: t.themes.paper },
  { v: 'ink', label: t.themes.ink },
]

/** 预置角色模板：点击填入输入框，可自由修改 */
const personaPresets = [
  { name: '资深作家', text: '你是一个有10年经验的作家，文风简洁有力，善于用精准的词汇和富有节奏感的句式表达，杜绝空洞辞藻与套话。' },
  { name: '商务编辑', text: '你是一名资深商务编辑，措辞严谨专业、句式规范，习惯结论先行、数据支撑，去除口语化表达。' },
  { name: '学术审稿人', text: '你是一名严谨的学术审稿人，用词精确、逻辑严密、表述客观，注重论证链条完整与专业术语准确。' },
  { name: '技术文档工程师', text: '你是一名技术文档工程师，行文直陈要点、步骤清晰、术语准确，善用列表与结构化表达，不写废话。' },
]

const tabs = computed(() => [
  { v: 'ai' as const, label: t.settings.aiGroup },
  { v: 'privacy' as const, label: t.settings.privacyGroup },
  { v: 'editor' as const, label: t.settings.editorGroup },
  { v: 'appearance' as const, label: t.settings.appearanceGroup },
])
</script>

<template>
  <div class="settings-page">
    <header class="sp-head">
      <button class="back mdai-btn" @click="emit('back')">← {{ t.settings.back }}</button>
      <span class="sp-title">{{ t.settings.title }}</span>
      <button class="mdai-btn primary" @click="saveAll">{{ t.settings.save }}</button>
    </header>

    <div class="sp-body">
      <nav class="sp-nav">
        <button v-for="tb in tabs" :key="tb.v" :class="{ on: tab === tb.v }" @click="tab = tb.v">{{ tb.label }}</button>
      </nav>

      <div class="sp-content">
        <!-- AI 模型：左侧模型列表 + 右侧配置信息 -->
        <div v-if="tab === 'ai'" class="ai-layout">
          <aside class="provider-list">
            <div class="provider-list-head">已配置模型</div>
            <button
              v-for="p in settings.s.ai.providers"
              :key="p.id"
              class="provider-item"
              :class="{ on: p.id === editing.id }"
              @click="loadProvider(p.id)"
            >
              <span class="p-info">
                <span class="p-name">{{ p.name }}</span>
                <span class="p-model">{{ p.model }}</span>
              </span>
              <span
                class="switch"
                role="switch"
                :aria-checked="p.id === enabledId"
                :class="{ on: p.id === enabledId }"
                :title="p.id === enabledId ? '已启用，点击停用' : '点击启用（其他模型将自动停用）'"
                @click.stop="toggleActive(p.id)"
              ></span>
            </button>
            <p v-if="settings.s.ai.providers.length === 0" class="provider-empty">暂无模型配置</p>
            <button class="mdai-btn add-btn" @click="newProvider">＋ {{ t.settings.addProvider }}</button>
          </aside>

          <div class="provider-editor">
            <div class="form-row">
              <label>{{ t.settings.providerName }}</label>
              <input v-model="editing.name" class="mdai-input" />
            </div>
            <div class="form-row">
              <label>{{ t.settings.baseUrl }}</label>
              <input v-model="editing.baseUrl" class="mdai-input" placeholder="https://api.openai.com/v1" />
            </div>
            <div class="form-row">
              <label>{{ t.settings.apiKey }}（{{ editing.apiKey ? '已安全保存' : '未设置' }}，本地加密存储）</label>
              <input v-model="editing.apiKey" type="password" class="mdai-input" autocomplete="off" placeholder="sk-…" />
            </div>
            <div class="form-row">
              <label>{{ t.settings.model }}</label>
              <input v-model="editing.model" class="mdai-input" />
            </div>
            <div class="form-grid-2">
              <div class="form-row">
                <label>{{ t.settings.temperature }}（{{ editing.temperature }}）</label>
                <input v-model.number="editing.temperature" type="range" min="0" max="1" step="0.05" />
              </div>
              <div class="form-row">
                <label>{{ t.settings.timeout }}（{{ editing.timeoutSec }}s）</label>
                <input v-model.number="editing.timeoutSec" type="range" min="10" max="300" step="5" />
              </div>
              <div class="form-row">
                <label>{{ t.settings.maxTokens }}</label>
                <input v-model.number="editing.maxTokens" type="number" min="256" max="32768" step="256" class="mdai-input" />
              </div>
              <div class="form-row">
                <label>{{ t.settings.chunk }}</label>
                <input v-model.number="settings.s.ai.maxChunkChars" type="number" min="1000" max="50000" step="500" class="mdai-input" />
              </div>
            </div>
            <div class="form-row">
              <label>{{ t.settings.retry }}</label>
              <input v-model.number="settings.s.ai.retryLimit" type="number" min="0" max="5" class="mdai-input" />
            </div>
            <div class="ops">
              <button class="mdai-btn primary" @click="saveProvider">保存配置</button>
              <button class="mdai-btn" :disabled="testing" @click="testConnection">
                {{ testing ? t.settings.testing : t.settings.testConn }}
              </button>
              <button class="mdai-btn danger" :disabled="!editing.id" @click="deleteProvider">{{ t.settings.delProvider }}</button>
              <span v-if="testResult" class="test-result" :class="{ ok: testResult.ok }">{{ testResult.msg }}</span>
            </div>
          </div>
        </div>

        <!-- 角色设定（全局）：AI 处理内容时前置注入系统提示词 -->
        <section v-if="tab === 'ai'" class="persona-section">
          <div class="persona-head">
            <span class="persona-title">{{ t.settings.personaGroup }}</span>
            <span class="persona-templates">
              <button
                v-for="tp in personaPresets"
                :key="tp.name"
                class="mdai-btn persona-tpl"
                :title="tp.text"
                @click="settings.s.ai.persona = tp.text"
              >{{ tp.name }}</button>
            </span>
          </div>
          <textarea
            v-model="settings.s.ai.persona"
            class="mdai-input persona-input"
            rows="3"
            maxlength="500"
            :placeholder="t.settings.personaPlaceholder"
          ></textarea>
          <p class="hint">{{ t.settings.personaTip }}</p>
        </section>

        <!-- 隐私 -->
        <div v-else-if="tab === 'privacy'">
          <label class="check-row">
            <input v-model="settings.s.privacy.redact" type="checkbox" />
            {{ t.settings.redact }}
          </label>
          <label class="check-row">
            <input v-model="settings.s.privacy.privacyMode" type="checkbox" />
            {{ t.settings.privacyMode }}
          </label>
          <label class="check-row">
            <input v-model="settings.s.privacy.persistAiHistory" type="checkbox" />
            {{ t.settings.persistHistory }}
          </label>
          <p class="hint">密钥经系统安全存储（Windows DPAPI / Linux libsecret / macOS Keychain）加密保存，永不明文落盘。</p>
        </div>

        <!-- 编辑 -->
        <div v-else-if="tab === 'editor'">
          <label class="check-row">
            <input v-model="settings.s.editor.autosave" type="checkbox" />
            {{ t.settings.autosave }}
          </label>
          <div class="form-row">
            <label>{{ t.settings.autosaveInterval }}（10–300）</label>
            <input v-model.number="settings.s.editor.autosaveIntervalSec" type="number" min="10" max="300" class="mdai-input" />
          </div>
          <label class="check-row">
            <input v-model="settings.s.editor.formatOnSave" type="checkbox" />
            {{ t.settings.formatOnSave }}
          </label>
          <label class="check-row">
            <input v-model="settings.s.editor.backupBeforeAi" type="checkbox" />
            {{ t.settings.backupAi }}
          </label>
          <div class="form-row">
            <label>{{ t.settings.backupKeep }}</label>
            <input v-model.number="settings.s.editor.backupKeep" type="number" min="1" max="100" class="mdai-input" />
          </div>

          <!-- 快捷键自定义 -->
          <div class="form-row">
            <label>{{ t.settings.insertTableShortcut }}</label>
            <div class="shortcut-box">
              <button v-if="!recording" class="mdai-btn shortcut-display" @click="startRecord">
                {{ displayAccel(insertTableAccel) }}
              </button>
              <span v-else class="recording-hint">{{ t.settings.recording }}</span>
              <button class="mdai-btn" @click="resetInsertTableShortcut">{{ t.settings.resetKeys }}</button>
            </div>
          </div>
          <p class="hint">{{ recordTip || t.settings.shortcutHint }}</p>
        </div>

        <!-- 外观 -->
        <div v-else>
          <div class="form-row">
            <label>{{ t.settings.theme }}</label>
            <select v-model="settings.s.appearance.theme" class="mdai-select">
              <option v-for="th in themes" :key="th.v" :value="th.v">{{ th.label }}</option>
            </select>
          </div>
          <div class="form-grid-2">
            <div class="form-row">
              <label>{{ t.settings.fontSize }}（{{ settings.s.appearance.fontSize }}px）</label>
              <input v-model.number="settings.s.appearance.fontSize" type="range" min="12" max="24" step="1" />
            </div>
            <div class="form-row">
              <label>{{ t.settings.lineHeight }}（{{ settings.s.appearance.lineHeight }}）</label>
              <input v-model.number="settings.s.appearance.lineHeight" type="range" min="1.2" max="2.4" step="0.1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--mdai-bg); }
.sp-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 20px; padding-top: calc(12px + var(--safe-top));
  border-bottom: 1px solid var(--mdai-border); background: var(--mdai-bg-side);
}
.sp-title { font-size: 15px; font-weight: 700; }
.sp-body { display: flex; flex: 1; min-height: 0; }
.sp-nav { display: flex; flex-direction: column; gap: 4px; padding: 16px 10px; border-right: 1px solid var(--mdai-border); width: 150px; flex-shrink: 0; }
.sp-nav button {
  background: none; border: none; text-align: left; padding: 9px 12px; border-radius: 8px;
  font-size: 13px; color: var(--mdai-fg-muted); cursor: pointer; font-family: inherit;
}
.sp-nav button.on { background: var(--mdai-accent-weak); color: var(--mdai-accent); font-weight: 600; }
.sp-content { flex: 1; overflow-y: auto; padding: 24px 28px; max-width: 720px; width: 100%; margin: 0 auto; }

/* AI 模型：左侧模型列表 + 右侧配置信息 */
.ai-layout { display: flex; gap: 20px; align-items: stretch; }
.provider-list { width: 215px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--mdai-border); padding-right: 14px; }
.provider-list-head { font-size: 12px; font-weight: 600; color: var(--mdai-fg-muted); padding: 2px 6px 6px; }
.provider-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: none; border: 1px solid transparent; border-radius: 8px; padding: 7px 8px; cursor: pointer; text-align: left; font-family: inherit; min-width: 0; }
.provider-item:hover { background: var(--mdai-bg-hover); }
.provider-item.on { background: var(--mdai-accent-weak); border-color: var(--mdai-accent); }
.p-info { display: flex; flex-direction: column; min-width: 0; }
.p-name { font-size: 13px; color: var(--mdai-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.provider-item.on .p-name { color: var(--mdai-accent); font-weight: 600; }
.p-model { font-size: 11px; color: var(--mdai-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.provider-empty { font-size: 12px; color: var(--mdai-fg-muted); padding: 4px 6px; }
.add-btn { margin-top: 8px; white-space: nowrap; }
.provider-editor { flex: 1; min-width: 0; }

/* 角色设定（全局） */
.persona-section { margin-top: 22px; }
.persona-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.persona-title { font-size: 13px; font-weight: 600; }
.persona-templates { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.persona-tpl { padding: 2px 10px; font-size: 12px; white-space: nowrap; }
.persona-input { width: 100%; resize: vertical; min-height: 64px; font-family: inherit; line-height: 1.6; box-sizing: border-box; }

/* 启用滑钮：全局仅一个模型启用 */
.switch { position: relative; width: 30px; height: 17px; border-radius: 999px; background: var(--mdai-border); flex-shrink: 0; cursor: pointer; transition: background 0.2s; }
.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); transition: left 0.2s; }
.switch.on { background: var(--mdai-accent); }
.switch.on::after { left: 15px; }

.check-row { display: flex; gap: 8px; align-items: center; padding: 9px 0; font-size: 13px; }
.ops { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.ops .mdai-btn { white-space: nowrap; }
.test-result { font-size: 12px; color: var(--mdai-danger); max-width: 300px; }
.test-result.ok { color: var(--mdai-ok); }
.hint { font-size: 12px; color: var(--mdai-fg-muted); margin-top: 12px; line-height: 1.6; }

/* 快捷键自定义 */
.shortcut-box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.shortcut-display { min-width: 110px; font-variant-numeric: tabular-nums; }
.recording-hint {
  display: inline-flex; align-items: center; min-width: 110px; padding: 4px 12px;
  border: 1px dashed var(--mdai-accent); border-radius: 7px;
  color: var(--mdai-accent); font-size: 12.5px; animation: mdai-record 1.2s ease-in-out infinite;
}
@keyframes mdai-record { 50% { opacity: 0.45; } }
@media (max-width: 640px) {
  .sp-body { flex-direction: column; }
  .sp-nav { flex-direction: row; width: auto; border-right: none; border-bottom: 1px solid var(--mdai-border); overflow-x: auto; padding: 8px; }
  .sp-content { padding: 16px; }
  .ai-layout { flex-direction: column; gap: 12px; }
  .provider-list { width: auto; border-right: none; border-bottom: 1px solid var(--mdai-border); padding: 0 0 10px; }
}
</style>
