<script setup lang="ts">
/**
 * 另存为 / 导出对话框：格式选择（MD/TXT/HTML/PDF/DOCX/PNG）+ 每格式参数配置。
 */
import { computed, reactive, ref } from 'vue'
import { exportDoc, type ExportFormat } from '@/lib/export-doc'
import { useDocumentStore } from '@/stores/document'
import { getPlatform } from '@/lib/platform'
import { t } from '@/i18n'

const emit = defineEmits<{ (e: 'close'): void }>()
const props = defineProps<{ initialFormat?: ExportFormat }>()
const doc = useDocumentStore()
const isMobile = getPlatform().kind === 'capacitor'

const formats: { v: ExportFormat; label: string }[] = [
  { v: 'md', label: t.exporter.md },
  { v: 'txt', label: t.exporter.txt },
  { v: 'html', label: t.exporter.html },
  { v: 'pdf', label: t.exporter.pdf },
  { v: 'docx', label: t.exporter.docx },
  { v: 'png', label: t.exporter.png },
]

// 文件菜单「导出」子菜单直达：以传入格式预选
const kind = ref<ExportFormat>(props.initialFormat ?? 'pdf')
const busy = ref(false)
const form = reactive({
  pdfPaper: 'A4' as 'A4' | 'Letter',
  pdfLandscape: false,
  pdfMargin: 'standard' as 'none' | 'standard' | 'wide',
  pngWidth: 860,
  pngScale: 2,
  htmlEmbedSource: true,
  docxFontSize: 11,
})

/** 平台能力提示（iOS 的 PDF/PNG 降级） */
const unsupported = computed(() => {
  if (!isMobile) return false
  return kind.value === 'png'
})

const pdfHint = computed(() => (isMobile && kind.value === 'pdf' ? 'iOS 端将以分享 HTML 替代（可在系统打印中另存 PDF）' : ''))

async function run() {
  busy.value = true
  // 进度指示：开始即提示正在导出（完成/失败经 toast 反馈）
  emitToast(t.exporter.exporting.replace('{fmt}', formats.find((f) => f.v === kind.value)?.label ?? kind.value))
  try {
    const ok = await exportDoc(
      kind.value,
      doc.title,
      doc.content,
      (text, error) => emitToast(text, error),
      {
        pdf: { pageSize: form.pdfPaper, landscape: form.pdfLandscape, margin: form.pdfMargin },
        png: { width: form.pngWidth, scale: form.pngScale },
        html: { embedSource: form.htmlEmbedSource },
        docx: { fontSizePt: form.docxFontSize },
      },
    )
    if (ok) {
      emitToast(t.exporter.exportDone)
      emit('close')
    }
  } finally {
    busy.value = false
  }
}

// 轻量 toast：借用全局事件，由 App.vue 提供监听
function emitToast(text: string, error?: boolean) {
  window.dispatchEvent(new CustomEvent('mdai-toast', { detail: { text, error } }))
}
</script>

<template>
  <div class="mdai-dialog-mask" @click.self="emit('close')">
    <div class="mdai-dialog exporter">
      <header>
        <span>{{ t.exporter.title }}</span>
        <button class="x" @click="emit('close')">✕</button>
      </header>
      <div class="body">
        <div class="form-row">
          <label>{{ t.exporter.format }}</label>
          <div class="fmt-grid">
            <button
              v-for="f in formats"
              :key="f.v"
              class="fmt"
              :class="{ on: kind === f.v }"
              @click="kind = f.v"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <!-- PDF 参数 -->
        <template v-if="kind === 'pdf'">
          <div class="form-row">
            <label>{{ t.exporter.pdfPaper }}</label>
            <div class="seg">
              <button :class="{ on: form.pdfPaper === 'A4' }" @click="form.pdfPaper = 'A4'">{{ t.exporter.pdfA4 }}</button>
              <button :class="{ on: form.pdfPaper === 'Letter' }" @click="form.pdfPaper = 'Letter'">{{ t.exporter.pdfLetter }}</button>
            </div>
          </div>
          <div class="form-row">
            <label>{{ t.exporter.pdfMargin }}</label>
            <div class="seg">
              <button :class="{ on: form.pdfMargin === 'none' }" @click="form.pdfMargin = 'none'">{{ t.exporter.marginNone }}</button>
              <button :class="{ on: form.pdfMargin === 'standard' }" @click="form.pdfMargin = 'standard'">{{ t.exporter.marginStandard }}</button>
              <button :class="{ on: form.pdfMargin === 'wide' }" @click="form.pdfMargin = 'wide'">{{ t.exporter.marginWide }}</button>
            </div>
          </div>
          <label class="check-row">
            <input v-model="form.pdfLandscape" type="checkbox" />
            {{ t.exporter.pdfOrientation }}
          </label>
          <p v-if="pdfHint" class="hint">{{ pdfHint }}</p>
        </template>

        <!-- PNG 参数 -->
        <template v-else-if="kind === 'png'">
          <div class="form-grid-2">
            <div class="form-row">
              <label>{{ t.exporter.pngWidth }}（480–2400）</label>
              <input v-model.number="form.pngWidth" type="number" min="480" max="2400" step="20" class="mdai-input" />
            </div>
            <div class="form-row">
              <label>{{ t.exporter.pngScale }}（1–3）</label>
              <input v-model.number="form.pngScale" type="number" min="1" max="3" step="1" class="mdai-input" />
            </div>
          </div>
          <p v-if="unsupported" class="hint error">{{ t.exporter.unsupported }}</p>
        </template>

        <!-- HTML 参数 -->
        <template v-else-if="kind === 'html'">
          <label class="check-row">
            <input v-model="form.htmlEmbedSource" type="checkbox" />
            {{ t.exporter.htmlEmbedSource }}
          </label>
        </template>

        <!-- DOCX 参数 -->
        <template v-else-if="kind === 'docx'">
          <div class="form-row">
            <label>{{ t.exporter.docxFontSize }}（9–18）</label>
            <input v-model.number="form.docxFontSize" type="number" min="9" max="18" step="0.5" class="mdai-input" />
          </div>
        </template>
      </div>
      <footer>
        <button class="mdai-btn" @click="emit('close')">取消</button>
        <button class="mdai-btn primary" :disabled="busy || unsupported" @click="run">
          {{ busy ? '导出中…' : t.exporter.save }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.exporter { width: min(520px, 94vw); }
header .x { background: none; border: none; cursor: pointer; color: var(--mdai-fg-muted); font-size: 14px; }
.fmt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.fmt {
  border: 1px solid var(--mdai-border); background: var(--mdai-bg); color: var(--mdai-fg);
  border-radius: 8px; padding: 9px 6px; font-size: 12.5px; cursor: pointer; font-family: inherit;
}
.fmt.on { border-color: var(--mdai-accent); color: var(--mdai-accent); background: var(--mdai-accent-weak); font-weight: 600; }
.seg { display: flex; gap: 6px; }
.seg button {
  flex: 1; border: 1px solid var(--mdai-border); background: var(--mdai-bg); color: var(--mdai-fg);
  border-radius: 8px; padding: 7px; font-size: 12.5px; cursor: pointer; font-family: inherit;
}
.seg button.on { border-color: var(--mdai-accent); color: var(--mdai-accent); background: var(--mdai-accent-weak); font-weight: 600; }
.check-row { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 13px; }
.hint { font-size: 12px; color: var(--mdai-fg-muted); }
.hint.error { color: var(--mdai-danger); }
@media (max-width: 520px) { .fmt-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
