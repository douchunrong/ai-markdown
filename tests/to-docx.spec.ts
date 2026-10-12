import { describe, expect, it } from 'vitest'
import { markdownToBlocks } from '@/lib/markdown/to-docx'

describe('DOCX 导出：markdown → IR 转换', () => {
  it('标题与段落', () => {
    const b = markdownToBlocks('# 一级\n\n正文段落')
    expect(b[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(b[1]).toMatchObject({ type: 'paragraph' })
  })

  it('行内样式（加粗/斜体/删除线/行内代码/链接）', () => {
    const b = markdownToBlocks('**粗** *斜* ~~删~~ `码` [链](https://a.com)')
    const runs = (b[0] as { runs: { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; link?: string }[] }).runs
    const by = (t: string) => runs.find((r) => r.text === t)!
    expect(by('粗').bold).toBe(true)
    expect(by('斜').italic).toBe(true)
    expect(by('删').strike).toBe(true)
    expect(by('码').code).toBe(true)
    expect(by('链').link).toBe('https://a.com')
  })

  it('无序/有序/任务清单', () => {
    const b = markdownToBlocks('- 甲\n- 乙\n\n1. 一\n2. 二\n\n- [x] 完成\n- [ ] 待办')
    const lists = b.filter((x) => x.type === 'list') as { type: 'list'; ordered: boolean; items: { runs: unknown[]; checked: boolean | null }[] }[]
    expect(lists).toHaveLength(3)
    expect(lists[0].ordered).toBe(false)
    expect(lists[0].items.map((i) => i.runs[0])).toMatchObject([{ text: '甲' }, { text: '乙' }])
    expect(lists[1].ordered).toBe(true)
    expect(lists[1].items).toHaveLength(2)
    expect(lists[2].items[0].checked).toBe(true)
    expect(lists[2].items[1].checked).toBe(false)
  })

  it('代码块保留语言与内容', () => {
    const b = markdownToBlocks('```python\nprint(1)\n```')
    expect(b[0]).toEqual({ type: 'code', lang: 'python', text: 'print(1)\n' })
  })

  it('引用块与分隔线', () => {
    const b = markdownToBlocks('> 引用内容\n\n---')
    expect(b[0]).toMatchObject({ type: 'quote' })
    expect(b[1]).toEqual({ type: 'hr' })
  })

  it('表格：表头单元格 + 按行分组', () => {
    const b = markdownToBlocks('| A | B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |')
    const tb = b[0] as { type: 'table'; header: { text: string }[][]; rows: { text: string }[][][] }
    expect(tb.type).toBe('table')
    expect(tb.header).toMatchObject([[{ text: 'A' }], [{ text: 'B' }]])
    expect(tb.rows).toHaveLength(2)
    expect(tb.rows[0]).toMatchObject([[{ text: 'a1' }], [{ text: 'b1' }]])
    expect(tb.rows[1]).toMatchObject([[{ text: 'a2' }], [{ text: 'b2' }]])
  })

  it('空文档返回空数组', () => {
    expect(markdownToBlocks('')).toEqual([])
  })
})
