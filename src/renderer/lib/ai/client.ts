/**
 * AI 客户端：OpenAI 兼容 /chat/completions 适配层。
 * - 超时（AbortController）· 指数退避重试 · 可取消
 * - 长文分块流水线（进度回调 · 部分成功不丢失）
 * - 隐私脱敏与还原
 * 网络请求经 PlatformAdapter.http（桌面走主进程 / iOS 走原生），绕过 WebView CORS。
 */
import type { PlatformAdapter } from '@/lib/platform/types'
import { AppError, isAbortLike, mapHttpError, toNetError } from './errors'
import { chunkMarkdown, type TextChunk } from './chunk'
import { redact, unredact } from './redact'
import { buildUserMessage } from './prompts'

/** 用户配置的一套模型（密钥独立经安全存储保存） */
export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
}

export interface AiClientOptions {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  retryLimit: number
  maxChunkChars: number
  redactEnabled: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface RunOptions {
  signal?: AbortSignal
  /** 分块进度回调（i 从 1 开始） */
  onProgress?: (info: { done: number; total: number }) => void
}

export interface RunResult {
  text: string
  /** 分块模式下最终失败的块（保留原文） */
  failedChunks: number[]
}

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

/** 规范化 baseUrl：去尾部斜杠；隐私安全校验（非 https 仅允许本机） */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

/** 非本地 http 端点拦截（传输安全：明文仅限 localhost） */
export function assertEndpointAllowed(baseUrl: string): void {
  const u = new URL(baseUrl)
  if (u.protocol === 'https:') return
  const host = u.hostname
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) || host.endsWith('.local')
  if (!isLocal) throw new AppError('E-VALIDATE', '出于传输安全，仅允许 https 端点（本地模型可使用 http://localhost）')
}

/** 剥离可能包裹全文的代码围栏与前后缀（模型常见行为） */
export function stripCodeFence(text: string): string {
  const t = text.trim()
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/)
  return m ? m[1] : t
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new AppError('E-CANCELED', '已取消'))
      },
      { once: true },
    )
  })

export class AiClient {
  constructor(
    private readonly http: PlatformAdapter['http'],
    private readonly opts: AiClientOptions,
  ) {}

  /** 探活：最小请求验证配置（配置保存时调用） */
  async ping(signal?: AbortSignal): Promise<void> {
    await this.chat(
      [
        { role: 'system', content: 'You are a health check endpoint. Reply with the single word: OK' },
        { role: 'user', content: 'ping' },
      ],
      { maxTokens: 8, signal },
    )
  }

  /**
   * 执行整理任务：短文单次；长文分块串行（进度 + 取消 + 部分成功）。
   * 返回文本已做脱敏还原与围栏剥离。
   */
  async run(
    promptSystem: string,
    input: string,
    runOpts: RunOptions = {},
    chunkable = true,
  ): Promise<RunResult> {
    const needChunk = chunkable && input.length > this.opts.maxChunkChars
    if (!needChunk) {
      const out = await this.runWithRetry(promptSystem, input, runOpts.signal)
      return { text: out, failedChunks: [] }
    }

    const chunks = chunkMarkdown(input, { maxChars: this.opts.maxChunkChars })
    const results: string[] = new Array(chunks.length)
    const failedChunks: number[] = []
    for (const c of chunks) {
      runOpts.onProgress?.({ done: c.index, total: chunks.length })
      if (runOpts.signal?.aborted) throw new AppError('E-CANCELED', '已取消')
      try {
        results[c.index] = await this.runWithRetry(
          promptSystem,
          buildUserMessage(c.text, true, { i: c.index + 1, n: chunks.length }),
          runOpts.signal,
        )
      } catch (err) {
        if (err instanceof AppError && err.code === 'E-CANCELED') throw err
        // 部分成功策略：失败的块保留原文，不阻断整体
        results[c.index] = c.text
        failedChunks.push(c.index)
      }
    }
    runOpts.onProgress?.({ done: chunks.length, total: chunks.length })
    return { text: results.join('\n\n'), failedChunks }
  }

  /** 单次请求（含脱敏/还原 + 重试），无分块 */
  private async runWithRetry(system: string, input: string, signal?: AbortSignal): Promise<string> {
    const { text: safeText, map } = this.opts.redactEnabled ? redact(input) : { text: input, map: new Map<string, string>() }
    let lastErr: unknown
    for (let attempt = 0; attempt <= this.opts.retryLimit; attempt++) {
      if (signal?.aborted) throw new AppError('E-CANCELED', '已取消')
      try {
        const out = await this.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: safeText },
          ],
          { signal },
        )
        return unredact(out, map)
      } catch (err) {
        lastErr = err
        if (err instanceof AppError) {
          if (err.code === 'E-CANCELED' || !err.retryable) throw err
          if (err.code === 'E-CTX' && attempt === 0) throw err // 上层转分块由调用方处理
        }
        if (attempt < this.opts.retryLimit) await sleep(2 ** attempt * 1000, signal)
      }
    }
    throw lastErr
  }

  /** 底层聊天请求：超时控制 + 错误映射 */
  private async chat(messages: ChatMessage[], o: { maxTokens?: number; signal?: AbortSignal } = {}): Promise<string> {
    const baseUrl = normalizeBaseUrl(this.opts.baseUrl)
    assertEndpointAllowed(baseUrl)

    const timeoutSignal = AbortSignal.any?.([AbortSignal.timeout(this.opts.timeoutMs), o.signal].filter(Boolean) as AbortSignal[]) ??
      compositeSignal(this.opts.timeoutMs, o.signal)

    let res
    try {
      res = await this.http.request({
        url: `${baseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey || 'none'}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          temperature: this.opts.temperature,
          max_tokens: o.maxTokens ?? this.opts.maxTokens,
          stream: false,
        }),
        timeoutMs: this.opts.timeoutMs,
        signal: timeoutSignal,
      })
    } catch (err) {
      if (isAbortLike(err) || (o.signal && o.signal.aborted)) {
        if (o.signal?.aborted) throw new AppError('E-CANCELED', '已取消')
        throw new AppError('E-TIMEOUT', `请求超时（${Math.round(this.opts.timeoutMs / 1000)}s），可在设置调大超时或更换模型`)
      }
      throw toNetError(err)
    }

    if (res.bodyText.length > MAX_RESPONSE_BYTES) {
      throw new AppError('E-RESP', '模型响应异常（超出大小限制）')
    }
    if (!res.ok) throw mapHttpError(res.status, res.bodyText, this.opts.timeoutMs)

    let parsed: {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      error?: { message?: string; type?: string }
    }
    try {
      parsed = JSON.parse(res.bodyText)
    } catch {
      throw new AppError('E-RESP', '模型返回异常（无法解析响应）', res.bodyText.slice(0, 300))
    }
    if (parsed.error) {
      throw new AppError('E-SERVER', `模型服务返回错误：${parsed.error.message ?? '未知错误'}`)
    }
    const content = parsed.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new AppError('E-RESP', '模型返回了空内容，请重试或更换模型')
    }
    return stripCodeFence(content)
  }
}

/** AbortSignal.any 的简易回退（旧 WebView/Node） */
function compositeSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new AppError('E-TIMEOUT', 'timeout')), timeoutMs)
  external?.addEventListener(
    'abort',
    () => {
      clearTimeout(timer)
      ctrl.abort(external.reason)
    },
    { once: true },
  )
  ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return ctrl.signal
}

export type { TextChunk }
