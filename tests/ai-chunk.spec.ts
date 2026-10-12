import { describe, expect, it } from 'vitest'
import { chunkMarkdown, chunksReconstructable } from '@/lib/ai/chunk'

describe('chunkMarkdown 长文分块', () => {
  it('短文不分块', () => {
    const r = chunkMarkdown('# 标题\n\n内容', { maxChars: 6000 })
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('# 标题\n\n内容')
  })

  it('空文本返回空数组', () => {
    expect(chunkMarkdown('', { maxChars: 6000 })).toHaveLength(0)
  })

  it('长文按标题边界切分且标题归属正确', () => {
    const sec = '# A\n' + 'a'.repeat(3000) + '\n\n# B\n' + 'b'.repeat(3000)
    const r = chunkMarkdown(sec, { maxChars: 2000 })
    expect(r.length).toBeGreaterThan(1)
    // 每块不超过阈值（硬切兜底 + 装箱）
    for (const c of r) expect(c.text.length).toBeLessThanOrEqual(2000)
    // 标题开头块存在
    expect(r.some((c) => c.text.startsWith('# A'))).toBe(true)
    expect(r.some((c) => c.text.startsWith('# B'))).toBe(true)
  })

  it('段落装箱减少请求次数', () => {
    const paras = Array.from({ length: 10 }, (_, i) => `段落${i} ${'x'.repeat(500)}`).join('\n\n')
    const r = chunkMarkdown(paras, { maxChars: 2000 })
    // 每块聚合多段
    expect(r.length).toBeLessThan(10)
    expect(r.length).toBeGreaterThan(1)
  })

  it('无边界超长单行硬切不死循环', () => {
    const one = 'x'.repeat(10000)
    const r = chunkMarkdown(one, { maxChars: 3000 })
    expect(r.length).toBeGreaterThanOrEqual(4)
    for (const c of r) expect(c.text.length).toBeLessThanOrEqual(3000)
  })

  it('分块可无损重建（顺序与内容）', () => {
    const doc = ['# 一\n' + 'a'.repeat(4000), '# 二\n' + 'b'.repeat(4000), '# 三\n\n- 1\n- 2\n- 3'].join('\n\n')
    const r = chunkMarkdown(doc, { maxChars: 2500 })
    expect(chunksReconstructable(doc, r)).toBe(true)
  })
})
