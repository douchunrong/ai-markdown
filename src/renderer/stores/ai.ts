/**
 * AI 仓库：任务执行状态机 + 历史记录 + 应用/对比流程。
 * 执行管线：备份(可选) → 脱敏 → [分块] → 还原 → 对比/直接写回。
 */
import { defineStore } from 'pinia'
import { getPlatform } from '@/lib/platform'
import { getEditorBridge } from '@/lib/editor-bridge'
import { AiClient, type AiProvider } from '@/lib/ai/client'
import { AppError } from '@/lib/ai/errors'
import { getPrompt } from '@/lib/ai/prompts'
import { useSettingsStore, isEndpointAllowedInPrivacyMode } from './settings'
import { useDocumentStore } from './document'

export interface AiHistoryItem {
  id: string
  time: number
  actionName: string
  selectionOnly: boolean
  before: string
  after: string
}

export interface PendingCompare {
  actionName: string
  before: string
  after: string
  failedChunks: number[]
}

const HISTORY_KEY = 'mdai-ai-history'

export const useAiStore = defineStore('ai', {
  state: () => ({
    running: false,
    actionName: '',
    progress: { done: 0, total: 0 },
    error: null as AppError | null,
    history: [] as AiHistoryItem[],
    pending: null as PendingCompare | null,
    abortController: null as AbortController | null,
  }),
  actions: {
    loadHistory() {
      if (!useSettingsStore().s.privacy.persistAiHistory) return
      try {
        const raw = localStorage.getItem(HISTORY_KEY)
        this.history = raw ? (JSON.parse(raw) as AiHistoryItem[]) : []
      } catch {
        this.history = []
      }
    },
    pushHistory(item: AiHistoryItem) {
      this.history.unshift(item)
      this.history = this.history.slice(0, 20)
      if (useSettingsStore().s.privacy.persistAiHistory) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history))
      }
    },
    buildClient(): { client: AiClient; provider: AiProvider } {
      const settings = useSettingsStore()
      const p = settings.activeProvider
      if (!p) throw new AppError('E-VALIDATE', '请先在设置中配置 AI 模型')
      if (settings.s.privacy.privacyMode && !isEndpointAllowedInPrivacyMode(p.baseUrl)) {
        throw new AppError('E-VALIDATE', '隐私模式已开启：仅允许本地端点，请在设置中调整')
      }
      const apiKey = settings.keyCache[p.id] ?? ''
      const client = new AiClient(getPlatform().http, {
        baseUrl: p.baseUrl,
        apiKey,
        model: p.model,
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        timeoutMs: p.timeoutMs,
        retryLimit: settings.s.ai.retryLimit,
        maxChunkChars: settings.s.ai.maxChunkChars,
        redactEnabled: settings.s.privacy.redact,
      })
      return { client, provider: p }
    },
    /**
     * 执行 AI 任务（整理过程不改动原文，结果进入预览，由用户选择性应用）。
     * @param id 内置指令 id；custom 传入 { custom: {name, prompt} }
     * @param opts.selectionOnly true 强制仅处理选区；缺省为自动（有选区处理选区，无选区处理全文）
     */
    async run(
      id: string,
      custom?: { name: string; prompt: string },
      opts: { selectionOnly?: boolean } = {},
    ): Promise<void> {
      if (this.running) return
      const doc = useDocumentStore()
      const bridge = getEditorBridge()
      if (!bridge) return

      const spec = custom ? null : getPrompt(id)
      if (!spec && !custom) throw new AppError('E-VALIDATE', `未知指令：${id}`)
      const baseSystem = spec?.system ?? custom!.prompt
      // 全局角色设定：前置注入系统提示词（空 = 不注入）
      const persona = useSettingsStore().s.ai.persona.trim()
      const system = persona ? `${persona}\n\n${baseSystem}` : baseSystem
      const actionName = spec?.name ?? custom!.name
      const chunkable = spec?.chunkable ?? true

      // 双触发：强制选区模式无选区时提示；自动模式下有选区则局部处理
      const selection = bridge.getSelectionMarkdown()
      if (opts.selectionOnly === true && !selection) {
        this.error = new AppError('E-VALIDATE', '请先选中文本再执行局部整理')
        return
      }
      const input = selection ?? bridge.getMarkdown()
      if (!input.trim()) {
        this.error = new AppError('E-VALIDATE', '文档为空，无内容可处理')
        return
      }

      const before = bridge.getMarkdown()
      this.$patch({ running: true, actionName, error: null, progress: { done: 0, total: 0 } })
      const abort = new AbortController()
      this.abortController = abort

      // AI 处理前文件备份（桌面：安全目录 + 滚动清理；iOS/Web 由历史记录兜底）
      try {
        const settings = useSettingsStore()
        const platform = getPlatform()
        if (settings.s.editor.backupBeforeAi && doc.path && platform.fs.writeBackup) {
          await platform.fs.writeBackup(doc.path, before, settings.s.editor.backupKeep)
        }
      } catch (err) {
        console.warn('[ai] 备份失败（继续执行）', err)
      }

      try {
        const { client } = this.buildClient()
        const result = await client.run(system, input, {
          signal: abort.signal,
          onProgress: (p) => {
            this.progress = { ...p }
          },
        }, chunkable)

        if (abort.signal.aborted) return

        // 组装新全文（仅预览，原文未被改动）
        let after: string
        if (selection) {
          const idx = before.indexOf(selection)
          after = idx >= 0 ? before.slice(0, idx) + result.text + before.slice(idx + selection.length) : result.text
        } else {
          after = result.text
        }

        // 统一进入预览对话框，由用户「采用 / 放弃」选择性应用（采用后仍可 Ctrl+Z 撤销）
        this.pending = { actionName, before, after, failedChunks: result.failedChunks }
      } catch (err) {
        if (err instanceof AppError && err.code === 'E-CANCELED') {
          // 用户主动取消：静默
        } else if (err instanceof AppError) {
          this.error = err
        } else {
          this.error = new AppError('E-SERVER', err instanceof Error ? err.message : String(err))
        }
      } finally {
        this.$patch({ running: false, abortController: null })
      }
    },
    cancel() {
      this.abortController?.abort()
    },
    applyPending(accept: boolean) {
      const p = this.pending
      this.pending = null
      if (!p || !accept) return
      getEditorBridge()?.applyContent(p.after)
      this.pushHistory({
        id: `h-${Date.now()}`,
        time: Date.now(),
        actionName: p.actionName,
        selectionOnly: false,
        before: p.before,
        after: p.after,
      })
    },
    /** 撤销指定历史项：恢复其 before（仅当文档仍等于 after 时） */
    revertHistory(id: string) {
      const it = this.history.find((h) => h.id === id)
      if (!it) return
      const bridge = getEditorBridge()
      const current = bridge?.getMarkdown()
      if (current !== it.after) {
        this.error = new AppError('E-VALIDATE', '文档已被再次编辑，无法精准回滚该记录（可用 Ctrl+Z 逐步撤销）')
        return
      }
      bridge?.applyContent(it.before)
      this.history = this.history.filter((h) => h.id !== id)
      if (useSettingsStore().s.privacy.persistAiHistory) {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history))
      }
    },
    clearError() {
      this.error = null
    },
  },
})
