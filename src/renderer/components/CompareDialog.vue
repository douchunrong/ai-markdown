<script setup lang="ts">
/**
 * AI 结果对比对话框（长文 >2000 字符）：双栏对比 + 采用/放弃。
 */
import { useAiStore } from '@/stores/ai'
import { t } from '@/i18n'

const ai = useAiStore()
</script>

<template>
  <div v-if="ai.pending" class="mdai-dialog-mask">
    <div class="mdai-dialog compare">
      <header>
        <span>{{ t.ai.compareTitle }} — {{ ai.pending.actionName }}</span>
        <span v-if="ai.pending.failedChunks.length" class="warn">
          {{ t.ai.partialFail.replace('{n}', String(ai.pending.failedChunks.length)) }}
        </span>
      </header>
      <div class="body compare-body">
        <div class="col">
          <div class="col-title">{{ t.ai.before }}</div>
          <pre>{{ ai.pending.before }}</pre>
        </div>
        <div class="col">
          <div class="col-title">{{ t.ai.after }}</div>
          <pre>{{ ai.pending.after }}</pre>
        </div>
      </div>
      <footer>
        <span class="safe-tip">{{ t.ai.originSafe }}</span>
        <button class="mdai-btn" @click="ai.applyPending(false)">{{ t.ai.discard }}</button>
        <button class="mdai-btn primary" @click="ai.applyPending(true)">{{ t.ai.apply }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.compare { width: min(1100px, 94vw); height: 82vh; }
header .warn { color: var(--mdai-warn); font-size: 12px; font-weight: 400; }
.safe-tip { margin-right: auto; font-size: 11.5px; color: var(--mdai-fg-muted); }
.compare-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; height: 100%; }
.col { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--mdai-border); border-radius: 8px; overflow: hidden; }
.col-title { padding: 6px 10px; background: var(--mdai-bg-side); font-size: 12px; font-weight: 600; border-bottom: 1px solid var(--mdai-border); }
.col pre { flex: 1; margin: 0; padding: 10px; overflow: auto; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; font-family: var(--mdai-mono); }
@media (max-width: 720px) { .compare-body { grid-template-columns: 1fr; } }
</style>
