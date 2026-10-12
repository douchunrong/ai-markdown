import { describe, expect, it } from 'vitest'
import { renderMarkdownHtml } from '@/lib/markdown/render-html'

describe('Markdown 预览渲染（renderMarkdownHtml）', () => {
  it('标题 / 段落 / 行内样式', () => {
    const html = renderMarkdownHtml('# 标题\n\n**加粗** 与 *斜体*、`code`')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<code>code</code>')
  })

  it('代码块保留语言 class', () => {
    const html = renderMarkdownHtml('```shell\nls -la\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('language-shell')
    expect(html).toContain('ls -la')
  })

  it('GFM 表格与删除线', () => {
    const html = renderMarkdownHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n~~删除~~')
    expect(html).toContain('<table>')
    expect(html).toContain('<s>删除</s>')
  })

  it('引用 / 列表 / 分隔线', () => {
    const html = renderMarkdownHtml('> 引用\n\n- 项目\n\n---')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<li>项目</li>')
    expect(html).toContain('<hr')
  })

  it('内嵌 HTML 不渲染（html:false）', () => {
    const html = renderMarkdownHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
  })

  it('空输入安全', () => {
    expect(renderMarkdownHtml('')).toBe('')
    expect(renderMarkdownHtml('')).not.toThrow
  })
})
