/**
 * 自定义 AI 指令仓库（localStorage 持久化，v1 设计 4.4）。
 */
import { defineStore } from 'pinia'

export interface CustomPrompt {
  id: string
  name: string
  prompt: string
  pinned: boolean
}

const LS_KEY = 'mdai-custom-prompts'

function load(): CustomPrompt[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.prompt === 'string')
      .map((p) => ({ id: p.id, name: p.name, prompt: p.prompt, pinned: !!p.pinned }))
  } catch {
    return []
  }
}

export const useCustomPromptsStore = defineStore('custom-prompts', {
  state: (): { items: CustomPrompt[] } => ({ items: load() }),
  getters: {
    sorted(state): CustomPrompt[] {
      return [...state.items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'zh'))
    },
  },
  actions: {
    persist() {
      localStorage.setItem(LS_KEY, JSON.stringify(this.items))
    },
    add(name: string, prompt: string) {
      this.items.push({ id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, prompt, pinned: false })
      this.persist()
    },
    update(id: string, patch: Partial<Omit<CustomPrompt, 'id'>>) {
      const it = this.items.find((p) => p.id === id)
      if (it) Object.assign(it, patch)
      this.persist()
    },
    remove(id: string) {
      this.items = this.items.filter((p) => p.id !== id)
      this.persist()
    },
    togglePin(id: string) {
      const it = this.items.find((p) => p.id === id)
      if (it) it.pinned = !it.pinned
      this.persist()
    },
  },
})
