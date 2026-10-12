<script setup lang="ts">
/**
 * 插入表格对话框：行列配置（number 步进）+ GFM 预览，确认后经编辑器桥插入光标处。
 */
import { computed, ref } from 'vue'
import { getEditorBridge } from '@/lib/editor-bridge'
import { t } from '@/i18n'

const emit = defineEmits<{ (e: 'close'): void }>()

const rows = ref(3)
const cols = ref(3)

const preview = computed(() => {
  const c = Math.max(1, Math.min(10, cols.value || 1))
  const r = Math.max(2, Math.min(30, rows.value || 2))
  const header = Array.from({ length: c }, (_, i) => `列 ${i + 1}`).join(' | ')
  const sep = Array.from({ length: c }, () => '---').join(' | ')
  const body = Array.from({ length: Math.min(r - 1, 3) }, () => Array.from({ length: c }, () => '   ').join(' | '))
  const more = r - 1 > 3 ? [`…（共 ${r - 1} 行数据）`] : []
  return [`| ${header} |`, `| ${sep} |`, ...body.map((l) => `| ${l} |`), ...more].join('\n')
})

function clampRows(v: number) {
  rows.value = Math.max(2, Math.min(30, Math.floor(v) || 2))
}
function clampCols(v: number) {
  cols.value = Math.max(1, Math.min(10, Math.floor(v) || 1))
}

function doInsert() {
  getEditorBridge()?.insertTable(rows.value, cols.value)
  emit('close')
}
</script>

<template>
  <div class="mdai-dialog-mask" @click.self="emit('close')">
    <div class="mdai-dialog table-dialog">
      <header>
        <span>{{ t.table.title }}</span>
        <button class="x" @click="emit('close')">✕</button>
      </header>
      <div class="body">
        <div class="grid-picker">
          <div class="form-row">
            <label>{{ t.table.rows }}（2–30）</label>
            <div class="stepper">
              <button @click="clampRows(rows - 1)">−</button>
              <input
                :value="rows"
                type="number"
                min="2"
                max="30"
                class="mdai-input"
                @change="clampRows(Number(($event.target as HTMLInputElement).value))"
              />
              <button @click="clampRows(rows + 1)">＋</button>
            </div>
          </div>
          <div class="form-row">
            <label>{{ t.table.cols }}（1–10）</label>
            <div class="stepper">
              <button @click="clampCols(cols - 1)">−</button>
              <input
                :value="cols"
                type="number"
                min="1"
                max="10"
                class="mdai-input"
                @change="clampCols(Number(($event.target as HTMLInputElement).value))"
              />
              <button @click="clampCols(cols + 1)">＋</button>
            </div>
          </div>
        </div>
        <div class="form-row">
          <label>{{ t.table.preview }}</label>
          <pre class="tbl-preview">{{ preview }}</pre>
        </div>
        <p class="hint">{{ t.table.hint }}</p>
      </div>
      <footer>
        <button class="mdai-btn" @click="emit('close')">{{ t.table.cancel }}</button>
        <button class="mdai-btn primary" @click="doInsert">{{ t.table.insert }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.table-dialog { width: min(460px, 94vw); }
header .x { background: none; border: none; cursor: pointer; color: var(--mdai-fg-muted); font-size: 14px; }
.grid-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.stepper { display: flex; align-items: center; gap: 6px; }
.stepper input { width: 64px; text-align: center; }
.stepper button {
  width: 28px; height: 28px; border: 1px solid var(--mdai-border); border-radius: 7px;
  background: var(--mdai-bg); color: var(--mdai-fg); cursor: pointer; font-size: 14px; font-family: inherit;
}
.stepper button:hover { border-color: var(--mdai-accent); color: var(--mdai-accent); }
.tbl-preview {
  margin: 0; padding: 10px 12px; border: 1px solid var(--mdai-border); border-radius: 8px;
  background: var(--mdai-bg-side); font-size: 11.5px; line-height: 1.7; overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--mdai-fg-muted);
  white-space: pre;
}
.hint { font-size: 12px; color: var(--mdai-fg-muted); margin-top: 10px; }
@media (max-width: 460px) { .grid-picker { grid-template-columns: 1fr; } }
</style>
