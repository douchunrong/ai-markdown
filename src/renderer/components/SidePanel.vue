<script setup lang="ts">
/**
 * 侧栏：大纲 / 最近文件（桌面）/ 文档区（iOS）/ 自定义指令 快捷执行。
 */
import { computed, ref } from 'vue'
import type { HeadingNode } from '@/lib/markdown/outline'
import { useSettingsStore } from '@/stores/settings'
import { useDocumentStore } from '@/stores/document'
import { useAiStore } from '@/stores/ai'
import { useCustomPromptsStore } from '@/stores/custom-prompts'
import { getEditorBridge } from '@/lib/editor-bridge'
import { getPlatform } from '@/lib/platform'
import { t } from '@/i18n'
import type { DocMeta } from '@/lib/platform/types'

const emit = defineEmits<{ (e: 'close'): void }>()
defineProps<{ outline: HeadingNode[] }>()

const settings = useSettingsStore()
const doc = useDocumentStore()
const ai = useAiStore()
const custom = useCustomPromptsStore()

const tab = ref<'outline' | 'recent' | 'prompts'>('outline')
const iosDocs = ref<DocMeta[]>([])
const isIos = getPlatform().kind === 'capacitor'

const recentList = computed(() => settings.s.recent)

async function openRecent(path: string) {
  try {
    const content = await getPlatform().fs.readFile(path)
    await doc.loadFrom(path, content)
  } catch (err) {
    settings.removeRecent(path)
    window.alert(`无法打开文件（可能已被移动或删除）：${path}`)
    console.error(err)
  }
}

async function loadIosDocs() {
  if (!getPlatform().fs.listDocuments) return
  iosDocs.value = await getPlatform().fs.listDocuments!()
}
if (isIos) void loadIosDocs()

async function openIosDoc(meta: DocMeta) {
  const content = await getPlatform().fs.readFile(meta.path)
  await doc.loadFrom(meta.path, content)
}

async function deleteIosDoc(meta: DocMeta) {
  if (!window.confirm(`删除「${meta.name}」？此操作不可恢复。`)) return
  await getPlatform().fs.deleteDocument?.(meta.path)
  await loadIosDocs()
}

function gotoHeading(h: HeadingNode) {
  getEditorBridge()?.scrollToHeading(h.text)
  emit('close')
}

async function runCustom(id: string) {
  const p = custom.items.find((x) => x.id === id)
  if (!p) return
  await ai.run('', { name: p.name, prompt: p.prompt })
  emit('close')
}
</script>

<template>
  <aside class="side-root">
    <div class="tabs">
      <button :class="{ on: tab === 'outline' }" @click="tab = 'outline'">{{ t.sidebar.outline }}</button>
      <button :class="{ on: tab === 'recent' }" @click="tab = isIos ? (loadIosDocs(), 'recent') : 'recent'">
        {{ isIos ? t.sidebar.docs : t.sidebar.recent }}
      </button>
      <button :class="{ on: tab === 'prompts' }" @click="tab = 'prompts'">{{ t.sidebar.prompts }}</button>
      <button class="close" @click="emit('close')">✕</button>
    </div>

    <div v-if="tab === 'outline'" class="pane">
      <p v-if="!outline.length" class="empty">暂无标题，输入 # 可创建</p>
      <button
        v-for="(h, i) in outline"
        :key="i"
        class="ol-item"
        :style="{ paddingLeft: 8 + (h.level - 1) * 14 + 'px' }"
        :title="h.text"
        @click="gotoHeading(h)"
      >
        {{ h.text }}
      </button>
    </div>

    <div v-else-if="tab === 'recent'" class="pane">
      <template v-if="isIos">
        <div v-for="d in iosDocs" :key="d.path" class="doc-row">
          <button class="doc-btn" @click="openIosDoc(d)">
            <span class="doc-name">{{ d.name }}</span>
            <span class="doc-meta">{{ (d.size / 1024).toFixed(1) }} KB · {{ new Date(d.mtime).toLocaleString() }}</span>
          </button>
          <button class="del" title="删除" @click="deleteIosDoc(d)">🗑</button>
        </div>
        <p v-if="!iosDocs.length" class="empty">文档区为空（可通过「文件」App 拷入 .md）</p>
      </template>
      <template v-else>
        <button v-for="r in recentList" :key="r.path" class="doc-btn" :title="r.path" @click="openRecent(r.path)">
          <span class="doc-name">{{ r.title }}</span>
          <span class="doc-meta">{{ new Date(r.openedAt).toLocaleDateString() }}</span>
        </button>
        <p v-if="!recentList.length" class="empty">暂无最近文件</p>
        <button v-if="recentList.length" class="link-btn" @click="settings.clearRecent()">清空记录</button>
      </template>
    </div>

    <div v-else class="pane">
      <button v-for="p in custom.sorted" :key="p.id" class="doc-btn" @click="runCustom(p.id)">
        <span class="doc-name">{{ p.pinned ? '📌 ' : '' }}{{ p.name }}</span>
      </button>
      <p v-if="!custom.items.length" class="empty">在右侧 AI 面板创建自定义指令</p>
    </div>
  </aside>
</template>

<style scoped>
.side-root { display: flex; flex-direction: column; height: 100%; }
.tabs { display: flex; gap: 2px; padding: 8px; border-bottom: 1px solid var(--mdai-border); }
.tabs button { flex: 1; background: none; border: none; font-size: 12px; color: var(--mdai-fg-muted); padding: 6px 2px; cursor: pointer; border-radius: 6px; font-family: inherit; }
.tabs button.on { background: var(--mdai-accent-weak); color: var(--mdai-accent); font-weight: 600; }
.tabs button.close { flex: 0; display: none; }
body.platform-capacitor .tabs button.close { display: block; }
.pane { padding: 8px; overflow-y: auto; flex: 1; }
.empty { color: var(--mdai-fg-muted); font-size: 12px; text-align: center; margin-top: 24px; }
.ol-item { display: block; width: 100%; text-align: left; background: none; border: none; color: var(--mdai-fg); font-size: 13px; padding: 5px 8px; border-radius: 6px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: inherit; }
.ol-item:hover { background: var(--mdai-bg-hover); }
.doc-row { display: flex; align-items: center; gap: 4px; }
.doc-btn { flex: 1; display: flex; flex-direction: column; align-items: flex-start; background: none; border: none; color: var(--mdai-fg); padding: 7px 8px; border-radius: 6px; cursor: pointer; min-width: 0; font-family: inherit; }
.doc-btn:hover { background: var(--mdai-bg-hover); }
.doc-name { font-size: 13px; font-weight: 500; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-meta { font-size: 11px; color: var(--mdai-fg-muted); }
.del { background: none; border: none; cursor: pointer; opacity: 0.6; }
.link-btn { background: none; border: none; color: var(--mdai-accent); font-size: 12px; cursor: pointer; margin-top: 8px; font-family: inherit; }
</style>
