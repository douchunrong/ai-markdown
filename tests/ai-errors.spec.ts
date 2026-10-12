import { describe, expect, it } from 'vitest'
import { AppError, mapHttpError, isAbortLike } from '@/lib/ai/errors'

describe('错误分类映射', () => {
  it('401/403 → E-AUTH（不重试）', () => {
    for (const s of [401, 403]) {
      const e = mapHttpError(s, 'unauthorized', 60000)
      expect(e.code).toBe('E-AUTH')
      expect(e.retryable).toBe(false)
    }
  })

  it('404 → E-AUTH（地址/模型错误）', () => {
    expect(mapHttpError(404, 'nope', 60000).code).toBe('E-AUTH')
  })

  it('429 → E-RATE（可重试）', () => {
    const e = mapHttpError(429, 'rate limited', 60000)
    expect(e.code).toBe('E-RATE')
    expect(e.retryable).toBe(true)
  })

  it('5xx → E-SERVER（可重试）', () => {
    for (const s of [500, 502, 503]) {
      expect(mapHttpError(s, '', 60000).code).toBe('E-SERVER')
    }
  })

  it('400 + 上下文关键词 → E-CTX', () => {
    const e = mapHttpError(400, 'This model maximum context length is 8192 tokens', 60000)
    expect(e.code).toBe('E-CTX')
  })

  it('408 → E-TIMEOUT', () => {
    expect(mapHttpError(408, '', 60000).code).toBe('E-TIMEOUT')
  })

  it('isAbortLike 识别 AbortError 与 Capacitor canceled', () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    expect(isAbortLike(abortErr)).toBe(true)
    expect(isAbortLike({ canceled: true })).toBe(true)
    expect(isAbortLike(new Error('other'))).toBe(false)
  })

  it('AppError toJSON 序列化', () => {
    const e = new AppError('E-NET', 'x', 'd')
    expect(e.toJSON()).toEqual({ code: 'E-NET', message: 'x', detail: 'd' })
  })
})
