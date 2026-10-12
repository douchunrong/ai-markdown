import { describe, expect, it, vi } from 'vitest'
import { AiClient, normalizeBaseUrl, assertEndpointAllowed, stripCodeFence, type AiClientOptions } from '@/lib/ai/client'
import { AppError } from '@/lib/ai/errors'
import type { HttpRequest, HttpResponse, PlatformAdapter } from '@/lib/platform/types'

function mockHttp(handler: (req: HttpRequest) => Promise<HttpResponse>): PlatformAdapter['http'] {
  return { request: handler }
}

function opts(over: Partial<AiClientOptions> = {}): AiClientOptions {
  return {
    baseUrl: 'https://api.test.local/v1',
    apiKey: 'sk-test',
    model: 'test-model',
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 2000,
    retryLimit: 0,
    maxChunkChars: 6000,
    redactEnabled: false,
    ...over,
  }
}

const okBody = (content: string) => JSON.stringify({ choices: [{ message: { content } }] })

describe('AiClient 工具函数', () => {
  it('normalizeBaseUrl 规范化', () => {
    expect(normalizeBaseUrl('https://a.com/v1/')).toBe('https://a.com/v1')
    expect(normalizeBaseUrl('a.com/v1')).toBe('https://a.com/v1')
    expect(normalizeBaseUrl('http://localhost:11434/v1//')).toBe('http://localhost:11434/v1')
  })

  it('assertEndpointAllowed：非本机 http 拦截', () => {
    expect(() => assertEndpointAllowed('http://api.example.com/v1')).toThrowError(AppError)
    expect(() => assertEndpointAllowed('http://127.0.0.1:11434/v1')).not.toThrow()
    expect(() => assertEndpointAllowed('https://api.example.com/v1')).not.toThrow()
  })

  it('stripCodeFence 剥离围栏', () => {
    expect(stripCodeFence('```markdown\n# A\n```')).toBe('# A')
    expect(stripCodeFence('# A')).toBe('# A')
  })
})

describe('AiClient 请求管线', () => {
  it('成功请求并剥围栏', async () => {
    const http = mockHttp(async (req) => {
      expect(req.url).toBe('https://api.test.local/v1/chat/completions')
      expect(req.headers!.Authorization).toBe('Bearer sk-test')
      expect(JSON.parse(req.body!).stream).toBe(false)
      return { status: 200, ok: true, bodyText: okBody('```md\n结果\n```') }
    })
    const c = new AiClient(http, opts())
    const r = await c.run('sys', '输入')
    expect(r.text).toBe('结果')
    expect(r.failedChunks).toEqual([])
  })

  it('429 自动退避重试后成功', async () => {
    let calls = 0
    const http = mockHttp(async () => {
      calls++
      if (calls === 1) return { status: 429, ok: false, bodyText: 'rate' }
      return { status: 200, ok: true, bodyText: okBody('ok') }
    })
    const c = new AiClient(http, opts({ retryLimit: 1 }))
    const r = await c.run('s', 'x')
    expect(r.text).toBe('ok')
    expect(calls).toBe(2)
  })

  it('E-AUTH 不重试直接失败', async () => {
    let calls = 0
    const http = mockHttp(async () => {
      calls++
      return { status: 401, ok: false, bodyText: 'bad key' }
    })
    const c = new AiClient(http, opts({ retryLimit: 3 }))
    await expect(c.run('s', 'x')).rejects.toMatchObject({ code: 'E-AUTH' })
    expect(calls).toBe(1)
  })

  it('外部取消 → E-CANCELED', async () => {
    const http = mockHttp(
      (req) =>
        new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        }),
    )
    const c = new AiClient(http, opts())
    const ctrl = new AbortController()
    const p = c.run('s', 'x', { signal: ctrl.signal })
    setTimeout(() => ctrl.abort(), 20)
    await expect(p).rejects.toMatchObject({ code: 'E-CANCELED' })
  })

  it('超时 → E-TIMEOUT', async () => {
    const http = mockHttp(
      (req) =>
        new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => {
            const e = new Error('The operation was aborted due to timeout')
            e.name = 'AbortError'
            reject(e)
          })
        }),
    )
    const c = new AiClient(http, opts({ timeoutMs: 100 }))
    await expect(c.run('s', 'x')).rejects.toMatchObject({ code: 'E-TIMEOUT' })
  })

  it('畸形响应 → E-RESP', async () => {
    const http = mockHttp(async () => ({ status: 200, ok: true, bodyText: 'not-json' }))
    const c = new AiClient(http, opts())
    await expect(c.run('s', 'x')).rejects.toMatchObject({ code: 'E-RESP' })
  })

  it('空内容 → E-RESP', async () => {
    const http = mockHttp(async () => ({ status: 200, ok: true, bodyText: okBody('  ') }))
    const c = new AiClient(http, opts())
    await expect(c.run('s', 'x')).rejects.toMatchObject({ code: 'E-RESP' })
  })

  it('分块部分成功：失败块保留原文不阻断', async () => {
    const long = Array.from({ length: 12 }, (_, i) => `# 章节${i}\n\n${'内容'.repeat(1200)}`).join('\n\n')
    const http = mockHttp(async (req) => {
      const body = JSON.parse(req.body!) as { messages: { role: string; content: string }[] }
      const user = body.messages.at(-1)!.content
      if (user.includes('章节3')) return { status: 500, ok: false, bodyText: 'boom' }
      return { status: 200, ok: true, bodyText: okBody(`【处理】${user.slice(-20)}`) }
    })
    const onProgress = vi.fn()
    const c = new AiClient(http, opts({ maxChunkChars: 2600 }))
    const r = await c.run('s', long, { onProgress })
    expect(r.failedChunks.length).toBeGreaterThanOrEqual(1)
    expect(r.text).toContain('【处理】')
    // 失败块原文仍在结果中（无内容丢失）
    expect(r.text).toContain('章节3')
    expect(onProgress).toHaveBeenCalled()
  })

  it('脱敏开启时占位符不出现在请求且结果可还原', async () => {
    let sentUser = ''
    const http = mockHttp(async (req) => {
      const body = JSON.parse(req.body!) as { messages: { role: string; content: string }[] }
      sentUser = body.messages.at(-1)!.content
      return { status: 200, ok: true, bodyText: okBody(`优化后：${sentUser}`) }
    })
    const c = new AiClient(http, opts({ redactEnabled: true }))
    const r = await c.run('s', '联系 someone@example.com 商谈')
    expect(sentUser).not.toContain('someone@example.com')
    expect(r.text).toContain('someone@example.com')
  })

  it('ping 探活成功', async () => {
    const http = mockHttp(async () => ({ status: 200, ok: true, bodyText: okBody('OK') }))
    await new AiClient(http, opts()).ping()
  })
})
