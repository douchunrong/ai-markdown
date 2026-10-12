import { describe, expect, it } from 'vitest'
import { BUILTIN_PROMPTS, buildUserMessage, getPrompt } from '@/lib/ai/prompts'
import { buildStandaloneHtml, escapeHtml, markdownToPlainText } from '@/lib/markdown/export'

describe('内置指令集', () => {
  it('覆盖 v1 设计全量功能（20 项）', () => {
    expect(BUILTIN_PROMPTS.length).toBeGreaterThanOrEqual(20)
    const groups = new Set(BUILTIN_PROMPTS.map((p) => p.group))
    expect(groups).toEqual(new Set(['一键', '润色', '结构', '内容', '格式']))
  })

  it('系统提示词包含输出约束', () => {
    for (const p of BUILTIN_PROMPTS) {
      expect(p.system).toContain('仅输出处理后的完整 Markdown 正文')
      expect(p.system).toContain(p.name === '一键规整' ? '任务' : '任务')
    }
  })

  it('摘要/去重/表格类为非分块任务', () => {
    expect(getPrompt('summary')!.chunkable).toBe(false)
    expect(getPrompt('dedupe')!.chunkable).toBe(false)
    expect(getPrompt('tidy-all')!.chunkable).toBe(true)
  })

  it('未知指令返回 undefined', () => {
    expect(getPrompt('nope')).toBeUndefined()
  })

  it('分块用户消息含片段说明', () => {
    const msg = buildUserMessage('内容', true, { i: 2, n: 5 })
    expect(msg).toContain('2/5')
    expect(msg).toContain('中间片段')
    expect(buildUserMessage('内容', false)).toBe('内容')
  })
})

describe('导出构建', () => {
  it('自包含 HTML 含样式与源码注释', () => {
    const html = buildStandaloneHtml('测试 <script>alert(1)</script>', '# 标题\n\n正文 <b>加粗</b>')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<style>')
    expect(html).toContain('mdai-source')
    expect(html).toContain('# 标题')
    // 标题经转义，防 <title> 注入
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapeHtml', () => {
    expect(escapeHtml('<img onerror="x">')).not.toContain('<img')
  })

  it('markdownToPlainText 剥离语法与链接', () => {
    const t = markdownToPlainText('# 标题\n\n[链接](https://a.com) 与 **加粗**')
    expect(t).toContain('链接')
    expect(t).toContain('加粗')
    expect(t).not.toContain('https://a.com')
    expect(t).not.toContain('[')
  })
})
