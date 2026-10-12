import { beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings, isEndpointAllowedInPrivacyMode, loadSettings, mergeDefaults, SCHEMA_VERSION } from '@/stores/settings'

// node 环境注入 localStorage 桩
class LsMock {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  get length() { return this.m.size }
  clear() { this.m.clear() }
}
;(globalThis as Record<string, unknown>).localStorage = new LsMock()

describe('设置：默认值合并与损坏自愈', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: LsMock }).localStorage.clear()
  })

  it('默认结构完整', () => {
    const s = defaultSettings()
    expect(s.version).toBe(SCHEMA_VERSION)
    expect(s.ai.maxChunkChars).toBe(6000)
    expect(s.editor.autosaveIntervalSec).toBe(30)
    expect(s.appearance.theme).toBe('system')
  })

  it('mergeDefaults 补全缺失字段且保留已有值', () => {
    const saved = {
      version: 1,
      ai: { maxChunkChars: 8000 },  // 缺 providers/activeProviderId
      appearance: { theme: 'dark' }, // 缺 fontSize/lineHeight
      recent: [{ path: '/a.md', title: 'a', openedAt: 1 }],
    }
    const m = mergeDefaults(saved)
    expect(m.ai.maxChunkChars).toBe(8000)
    expect(m.ai.providers).toEqual([])
    expect(m.appearance.theme).toBe('dark')
    expect(m.appearance.fontSize).toBe(16)
    expect(m.recent).toEqual([{ path: '/a.md', title: 'a', openedAt: 1 }])
  })

  it('类型不匹配字段被忽略（防注入畸形值）', () => {
    const m = mergeDefaults({ editor: { autosave: 'yes' }, appearance: { fontSize: 'big' } })
    expect(m.editor.autosave).toBe(true)
    expect(m.appearance.fontSize).toBe(16)
  })

  it('损坏 JSON → 隔离并回退默认', () => {
    localStorage.setItem('mdai-settings', '{broken json!!')
    const s = loadSettings()
    expect(s.version).toBe(SCHEMA_VERSION)
    // 损坏内容被隔离保存，可人工恢复
    expect(localStorage.getItem('mdai-settings')).toContain('{broken')
  })

  it('未来版本 → 保守回退默认', () => {
    localStorage.setItem('mdai-settings', JSON.stringify({ ...defaultSettings(), version: SCHEMA_VERSION + 5 }))
    expect(loadSettings().version).toBe(SCHEMA_VERSION)
  })

  it('空存储 → 默认', () => {
    expect(loadSettings().ai.maxChunkChars).toBe(6000)
  })

  it('首次使用（未播种）→ 自动预置常用模型', () => {
    localStorage.setItem('mdai-settings', JSON.stringify({ version: 1, ai: { maxChunkChars: 8000 } }))
    const s = loadSettings()
    expect(s.ai.providers.length).toBeGreaterThanOrEqual(5)
    expect(s.ai.seeded).toBe(true)
    expect(s.ai.providers.some((p) => p.baseUrl.includes('deepseek'))).toBe(true)
    expect(s.ai.providers.some((p) => p.baseUrl.includes('localhost:11434'))).toBe(true) // 本机 Ollama
  })

  it('已播种且用户清空 → 不复活预置', () => {
    localStorage.setItem('mdai-settings', JSON.stringify({ version: 1, ai: { providers: [], seeded: true } }))
    const s = loadSettings()
    expect(s.ai.providers).toEqual([])
  })
})

describe('隐私模式端点校验', () => {
  it('https 与本机放行', () => {
    expect(isEndpointAllowedInPrivacyMode('https://api.openai.com/v1')).toBe(true)
    expect(isEndpointAllowedInPrivacyMode('http://localhost:11434/v1')).toBe(true)
    expect(isEndpointAllowedInPrivacyMode('http://127.0.0.1:8080')).toBe(true)
  })

  it('远程 http 拦截', () => {
    expect(isEndpointAllowedInPrivacyMode('http://api.example.com/v1')).toBe(false)
  })

  it('非法 URL 拦截', () => {
    expect(isEndpointAllowedInPrivacyMode('not a url')).toBe(false)
  })
})
