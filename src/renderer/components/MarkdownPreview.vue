<script setup lang="ts">
/**
 * 只读 Markdown 预览面板（双屏模式右侧）：markdown-it 渲染 + 消毒，防抖跟随源码变更。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { renderMarkdownHtml } from '@/lib/markdown/render-html'

const props = defineProps<{ md: string }>()

const html = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.md,
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (html.value = renderMarkdownHtml(props.md)), 120)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="md-preview" v-html="html"></div>
</template>

<style scoped>
.md-preview {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--mdai-fg);
  background: var(--mdai-bg);
  user-select: text;
}
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3),
.md-preview :deep(h4),
.md-preview :deep(h5),
.md-preview :deep(h6) {
  margin: 1.2em 0 0.5em;
  font-weight: 700;
  line-height: 1.35;
}
.md-preview :deep(h1) { font-size: 1.7em; }
.md-preview :deep(h2) { font-size: 1.45em; }
.md-preview :deep(h3) { font-size: 1.25em; }
.md-preview :deep(h4) { font-size: 1.1em; }
.md-preview :deep(p) { margin: 0.6em 0; }
.md-preview :deep(a) { color: var(--mdai-accent); text-decoration: none; }
.md-preview :deep(a:hover) { text-decoration: underline; }
.md-preview :deep(ul),
.md-preview :deep(ol) { padding-left: 1.6em; margin: 0.5em 0; }
.md-preview :deep(li) { margin: 0.25em 0; }
.md-preview :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: var(--mdai-bg-hover, rgba(127, 127, 127, 0.15));
  border-radius: 4px;
  padding: 0.15em 0.4em;
}
.md-preview :deep(pre) {
  background: var(--mdai-bg-hover, rgba(127, 127, 127, 0.12));
  border: 1px solid var(--mdai-border);
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  margin: 0.8em 0;
}
.md-preview :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.6;
}
.md-preview :deep(blockquote) {
  margin: 0.8em 0;
  padding: 0.2em 1em;
  border-left: 3px solid var(--mdai-accent);
  color: var(--mdai-fg-muted);
  background: var(--mdai-bg-hover, rgba(127, 127, 127, 0.08));
  border-radius: 0 6px 6px 0;
}
.md-preview :deep(table) {
  border-collapse: collapse;
  margin: 0.8em 0;
  width: 100%;
  font-size: 0.92em;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid var(--mdai-border);
  padding: 6px 10px;
  text-align: left;
}
.md-preview :deep(th) { background: var(--mdai-bg-hover, rgba(127, 127, 127, 0.12)); font-weight: 600; }
.md-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--mdai-border);
  margin: 1.4em 0;
}
.md-preview :deep(img) { max-width: 100%; border-radius: 6px; }
.md-preview :deep(del) { color: var(--mdai-fg-muted); }
</style>
