import { describe, expect, it } from 'vitest'
import { containsSensitive, redact, unredact } from '@/lib/ai/redact'

describe('隐私脱敏', () => {
  it('脱敏邮箱/手机号/身份证/密钥', () => {
    const src = '联系 zhang@example.com 或 13812345678，证件 11010119900307891X，密钥 sk-abcdef1234567890abcd'
    const { text, map } = redact(src)
    expect(text).not.toContain('zhang@example.com')
    expect(text).not.toContain('13812345678')
    expect(text).not.toContain('sk-abcdef1234567890abcd')
    expect(map.size).toBeGreaterThanOrEqual(3)
  })

  it('unredact 无损还原', () => {
    const src = '邮箱 a@b.com 手机 13900000000 网址 https://x.com/page?token=SECRETTOKEN12345 结束'
    const { text, map } = redact(src)
    const restored = unredact(text, map)
    expect(restored).toBe(src)
  })

  it('重复敏感值复用同一占位符', () => {
    const src = 'a@b.com 和 a@b.com'
    const { text, map } = redact(src)
    expect(map.size).toBe(1)
    expect(unredact(text, map)).toBe(src)
  })

  it('containsSensitive 检测', () => {
    expect(containsSensitive('普通文本')).toBe(false)
    expect(containsSensitive('我的邮箱 x@y.cn')).toBe(true)
  })

  it('URL 参数仅脱敏值保留前缀', () => {
    const src = 'https://api.demo.com/v1?token=ABCDEF1234567890&x=1'
    const { text, map } = redact(src)
    expect(text).toContain('https://api.demo.com/v1?token=«MDAI_URLSECRET')
    expect(text).toContain('&x=1')
    expect(text).not.toContain('ABCDEF1234567890')
    expect(unredact(text, map)).toBe(src)
  })

  it('无敏感内容时 map 为空', () => {
    const r = redact('普通中文内容 without secrets')
    expect(r.map.size).toBe(0)
    expect(r.text).toBe('普通中文内容 without secrets')
  })
})
