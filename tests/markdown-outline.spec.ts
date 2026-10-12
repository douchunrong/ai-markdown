import { describe, expect, it } from 'vitest'
import { extractOutline, computeStats } from '@/lib/markdown/outline'

describe('大纲解析', () => {
  it('提取标题层级与文本', () => {
    const doc = '# 一级\n\n正文\n\n## 二级 A\n\n### 三级\n\n## 二级 B'
    const ol = extractOutline(doc)
    expect(ol.map((h) => [h.level, h.text])).toEqual([
      [1, '一级'],
      [2, '二级 A'],
      [3, '三级'],
      [2, '二级 B'],
    ])
  })

  it('忽略代码块内的 # 行', () => {
    const doc = '# 标题\n\n```python\n# 这是注释不是标题\n```\n'
    const ol = extractOutline(doc)
    expect(ol).toHaveLength(1)
    expect(ol[0].text).toBe('标题')
  })

  it('行号可用于定位', () => {
    const doc = '段落\n\n# 目标标题\n'
    const ol = extractOutline(doc)
    expect(ol[0].line).toBe(2)
  })

  it('空文档无大纲', () => {
    expect(extractOutline('')).toHaveLength(0)
  })
})

describe('文档统计', () => {
  it('中文按字、英文按词', () => {
    const s = computeStats('你好世界 hello  world，AI 工具')
    // 中文 6 字（你好世界+工具）+ 英文 3 词（hello world AI）
    expect(s.words).toBe(9)
  })

  it('字符/行数/阅读时长', () => {
    const s = computeStats('第一行\n第二行\n第三行')
    expect(s.lines).toBe(3)
    expect(s.chars).toBe(11) // 9 个汉字 + 2 个换行
    expect(s.readMinutes).toBeGreaterThanOrEqual(1)
  })

  it('空文档', () => {
    const s = computeStats('')
    expect(s.chars).toBe(0)
    expect(s.words).toBe(0)
    expect(s.readMinutes).toBe(0)
  })
})
