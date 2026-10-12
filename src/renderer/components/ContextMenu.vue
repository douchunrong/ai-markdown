<script setup lang="ts">
/**
 * 通用右键浮动菜单：Teleport 到 body，支持一级子菜单（悬停展开），
 * 点击外部 / Esc / 滚动 关闭；位置自动收拢在视口内。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CtxMenuItem } from '@/lib/editor/context-menu'

const props = defineProps<{ x: number; y: number; items: CtxMenuItem[] }>()
const emit = defineEmits<{ (e: 'select', id: string): void; (e: 'close'): void }>()

const panel = ref<HTMLElement>()
const pos = ref({ x: props.x, y: props.y })
const openSub = ref<string | null>(null)

let raf = 0
onMounted(async () => {
  // pointerdown（鼠标左/右键、触摸、触控笔统一）捕获阶段监听：点击菜单外任意处立即关闭
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('contextmenu', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', close)
  window.addEventListener('wheel', close, { passive: true })
  window.addEventListener('blur', close)
  await nextTick()
  clamp()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('contextmenu', onOutside, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('wheel', close)
  window.removeEventListener('blur', close)
  if (raf) cancelAnimationFrame(raf)
})

/** 视口边界收拢：菜单整体保持在窗口内 */
function clamp() {
  const el = panel.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const x = Math.min(props.x, window.innerWidth - r.width - 8)
  const y = Math.min(props.y, window.innerHeight - r.height - 8)
  pos.value = { x: Math.max(4, x), y: Math.max(4, y) }
}

function onOutside(e: Event) {
  if (panel.value && !panel.value.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}
function close() {
  emit('close')
}
function onClick(item: CtxMenuItem) {
  if (item.disabled) return
  if (item.children?.length) {
    openSub.value = openSub.value === item.id ? null : item.id
    return
  }
  emit('select', item.id)
}
</script>

<template>
  <Teleport to="body">
    <div ref="panel" class="ctx-menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
      <template v-for="item in items" :key="item.id">
        <div
          class="ctx-item"
          :class="{ disabled: item.disabled, hasSub: !!item.children?.length, open: openSub === item.id }"
          @click.stop="onClick(item)"
          @mouseenter="openSub = item.children?.length ? item.id : null"
        >
          <span class="ctx-label">{{ item.label }}</span>
          <span v-if="item.children?.length" class="ctx-arrow">›</span>
          <div v-if="item.children?.length && openSub === item.id" class="ctx-sub" @click.stop>
            <div
              v-for="sub in item.children"
              :key="sub.id"
              class="ctx-item"
              :class="{ disabled: sub.disabled }"
              @click.stop="onClick(sub)"
            >
              <span class="ctx-label">{{ sub.label }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  padding: 5px;
  background: var(--mdai-panel-bg, #fff);
  color: var(--mdai-fg);
  border: 1px solid var(--mdai-border);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  font-size: 13px;
  user-select: none;
}
.ctx-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.ctx-item:hover { background: var(--mdai-accent); color: #fff; }
.ctx-item.disabled { opacity: 0.4; cursor: default; }
.ctx-item.disabled:hover { background: none; color: var(--mdai-fg); }
.ctx-arrow { font-size: 15px; line-height: 1; opacity: 0.7; }
.ctx-sub {
  position: absolute;
  left: calc(100% + 2px);
  top: -6px;
  /* 收窄：去掉固定最小宽度，宽度贴合最长文字（仅余内边距） */
  padding: 5px 6px;
  background: var(--mdai-panel-bg, #fff);
  border: 1px solid var(--mdai-border);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
}
.ctx-sub .ctx-item { padding: 6px 10px; color: #000; }
.ctx-sub .ctx-item:hover { background: var(--mdai-accent-weak, rgba(127, 127, 127, 0.15)); color: #000; }
.ctx-sub .ctx-item.disabled:hover { color: #000; }
</style>
