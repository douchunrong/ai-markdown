/**
 * 设置仓库：非敏感项 localStorage 持久化（三端一致）；API 密钥经平台安全存储加密。
 * 含 schema 版本迁移与损坏自愈（enhanced-design §4.3）。
 */
import { defineStore } from 'pinia'
import { getPlatform } from '@/lib/platform'
import type { AiProvider } from '@/lib/ai/client'

export interface AppSettings {
  version: number
  ai: {
    providers: Omit<AiProvider, 'apiKey'>[]
    activeProviderId: string
    maxChunkChars: number
    retryLimit: number
    /** 全局角色设定：AI 处理内容时前置注入系统提示词（空 = 不注入） */
    persona: string
    /** 是否已完成常用模型预置（防止用户清空后复活） */
    seeded?: boolean
  }
  privacy: { redact: boolean; privacyMode: boolean; persistAiHistory: boolean }
  editor: {
    autosave: boolean
    autosaveIntervalSec: number
    backupBeforeAi: boolean
    backupKeep: number
    formatOnSave: boolean
    /** 自定义快捷键（Electron accelerator 格式，如 CmdOrCtrl+Alt+T） */
    shortcuts: { insertTable: string }
  }
  appearance: { theme: ThemeName; fontSize: number; lineHeight: number }
  recent: { path: string; title: string; openedAt: number }[]
}

export type ThemeName = 'light' | 'dark' | 'sepia' | 'paper' | 'ink' | 'system'

/** 插入表格默认快捷键（与 electron/menu.ts 内置默认保持一致） */
export const DEFAULT_INSERT_TABLE_SHORTCUT = 'CmdOrCtrl+Alt+T'

export const SCHEMA_VERSION = 1
const LS_KEY = 'mdai-settings'

/** 常用模型预置（OpenAI 兼容端点）：首次使用时填充下拉列表，仅需填入 API Key */
export function presetProviders(): Omit<AiProvider, 'apiKey'>[] {
  const base = { temperature: 0.3, maxTokens: 4096, timeoutMs: 60_000 }
  return [
    { id: 'preset-deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', ...base },
    { id: 'preset-openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', ...base },
    { id: 'preset-kimi', name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-latest', ...base },
    { id: 'preset-glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', ...base },
    { id: 'preset-qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', ...base },
    { id: 'preset-ollama', name: 'Ollama（本机）', baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', ...base },
  ]
}

export function defaultSettings(): AppSettings {
  return {
    version: SCHEMA_VERSION,
    ai: { providers: [], activeProviderId: '', maxChunkChars: 6000, retryLimit: 3, persona: '', seeded: false },
    privacy: { redact: false, privacyMode: false, persistAiHistory: true },
    editor: {
      autosave: true,
      autosaveIntervalSec: 30,
      backupBeforeAi: true,
      backupKeep: 20,
      formatOnSave: true,
      shortcuts: { insertTable: DEFAULT_INSERT_TABLE_SHORTCUT },
    },
    appearance: { theme: 'system', fontSize: 16, lineHeight: 1.7 },
    recent: [],
  }
}

/** 深度合并默认值（缺字段补全）—— 纯函数供单测 */
export function mergeDefaults(saved: unknown, base: AppSettings = defaultSettings()): AppSettings {
  if (typeof saved !== 'object' || saved === null) return structuredClone(base)
  const out = structuredClone(base) as unknown as Record<string, unknown>
  deepAssign(out, saved as Record<string, unknown>)
  // 数组字段整体替换（recent/providers 为用户数据）
  return out as unknown as AppSettings
}

function deepAssign(target: Record<string, unknown>, src: Record<string, unknown>) {
  for (const [k, v] of Object.entries(src)) {
    if (k in target) {
      const tv = target[k]
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && typeof tv === 'object' && tv !== null && !Array.isArray(tv)) {
        deepAssign(tv as Record<string, unknown>, v as Record<string, unknown>)
      } else if (typeof v === typeof tv || tv === undefined) {
        target[k] = v
      }
    }
  }
}

/** 读取 + 校验 + 迁移；损坏时隔离旧文件并重建（不静默丢失：留 .corrupt 备查） */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return defaultSettings()
    const merged = mergeDefaults(JSON.parse(raw))
    if (merged.version > SCHEMA_VERSION) {
      // 未来版本文件：保守回退默认，避免未知字段破坏
      localStorage.setItem(`${LS_KEY}.future-${Date.now()}`, raw)
      return defaultSettings()
    }
    seedPresetsIfNeeded(merged)
    return merged
  } catch (err) {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) localStorage.setItem(`${LS_KEY}.corrupt-${Date.now()}`, raw)
    console.error('[settings] 损坏的设置已隔离，使用默认配置', err)
    return defaultSettings()
  }
}

/** 首次使用（未播种且无配置）时预置常用模型，避免下拉列表为空；用户清空后不复活 */
function seedPresetsIfNeeded(s: AppSettings): void {
  if (s.ai.seeded) return
  if (s.ai.providers.length === 0) s.ai.providers = presetProviders()
  s.ai.seeded = true
}

/** 隐私模式端点校验（仅 https 或本机） */
export function isEndpointAllowedInPrivacyMode(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl)
    if (u.protocol === 'https:') return true
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.local')
  } catch {
    return false
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): { s: AppSettings; keyCache: Record<string, string> } => ({
    s: loadSettings(),
    keyCache: {},
  }),
  getters: {
    activeProvider(state): (Omit<AiProvider, 'apiKey'> & { hasKey: boolean }) | null {
      const p = state.s.ai.providers.find((x) => x.id === state.s.ai.activeProviderId) ?? state.s.ai.providers[0]
      return p ? { ...p, hasKey: !!this.keyCache[p.id] } : null
    },
  },
  actions: {
    persist() {
      localStorage.setItem(LS_KEY, JSON.stringify(this.s))
    },
    async loadKey(providerId: string): Promise<string> {
      if (this.keyCache[providerId] !== undefined) return this.keyCache[providerId]
      const v = (await getPlatform().secure.get(`ai-key:${providerId}`)) ?? ''
      this.keyCache[providerId] = v
      return v
    },
    async setKey(providerId: string, key: string) {
      this.keyCache[providerId] = key
      await getPlatform().secure.set(`ai-key:${providerId}`, key)
    },
    async deleteKey(providerId: string) {
      delete this.keyCache[providerId]
      await getPlatform().secure.delete(`ai-key:${providerId}`)
    },
    touchRecent(path: string, title: string) {
      const list = this.s.recent.filter((r) => r.path !== path)
      list.unshift({ path, title, openedAt: Date.now() })
      this.s.recent = list.slice(0, 15)
      this.persist()
    },
    removeRecent(path: string) {
      this.s.recent = this.s.recent.filter((r) => r.path !== path)
      this.persist()
    },
    clearRecent() {
      this.s.recent = []
      this.persist()
    },
  },
})
