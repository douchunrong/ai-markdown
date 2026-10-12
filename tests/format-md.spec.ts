import { describe, expect, it } from 'vitest'
import { formatMarkdown, visualWidth } from '@/lib/markdown/format-md'

describe('保存时自动格式化（非 AI，确定性）', () => {
  it('标题：# 后统一单空格，去行尾空白', () => {
    expect(formatMarkdown('#标题A')).toBe('# 标题A\n')
    expect(formatMarkdown('##   二级  \n')).toBe('## 二级\n')
  })

  it('列表：* / + 统一为 -，有序 1) → 1.，标记后单空格', () => {
    expect(formatMarkdown('* 甲\n+ 乙\n-   丙')).toBe('- 甲\n- 乙\n- 丙\n')
    expect(formatMarkdown('1) 第一\n2.  第二')).toBe('1. 第一\n2. 第二\n')
  })

  it('任务清单：[X] 统一小写，勾选态保留', () => {
    expect(formatMarkdown('- [X] 已完成\n- [ ] 未完成\n- [x]  也行')).toBe('- [x] 已完成\n- [ ] 未完成\n- [x] 也行\n')
  })

  it('代码块内容逐字保留（含内部空行、行尾空格、怪异缩进）', () => {
    const code = '```shell\n  ls -la   \n\n\t echo "hi"\n```'
    expect(formatMarkdown(code + '\n\n# 标题')).toBe('```shell\n  ls -la   \n\n\t echo "hi"\n```\n\n# 标题\n')
  })

  it('代码块内伪列表/伪标题不被改写', () => {
    const src = '```\n* not a list\n#  not heading\n```\n'
    expect(formatMarkdown(src)).toBe(src)
  })

  it('3+ 连续空行折叠为 1；EOF 恰好一个换行；去除文末空行', () => {
    expect(formatMarkdown('A\n\n\n\n\nB\n\n\n')).toBe('A\n\nB\n')
  })

  it('GFM 表格：分隔行补足 3 短横线、单元格两侧空格、按列对齐（CJK 2 宽）', () => {
    const out = formatMarkdown('|名称|数量|\n|:-|--:|\n|苹果|3|\n|香蕉干|12|')
    const lines = out.split('\n')
    expect(lines[0]).toBe('| 名称   | 数量 |')
    expect(lines[1]).toBe('| :----- | ---: |')
    expect(lines[2]).toBe('| 苹果   | 3    |')
    expect(lines[3]).toBe('| 香蕉干 | 12   |')
  })

  it('幂等：格式化两次结果一致', () => {
    const src = '*  甲   \n\n\n#T\n1) x\n```\n* raw \n```\n|a|b|\n|-|-|\n|1|2|\n\n\n'
    expect(formatMarkdown(formatMarkdown(src))).toBe(formatMarkdown(src))
  })

  it('空串安全', () => {
    expect(formatMarkdown('')).toBe('\n')
  })

  it('visualWidth：CJK 计 2，ASCII 计 1', () => {
    expect(visualWidth('苹果')).toBe(4)
    expect(visualWidth('abc')).toBe(3)
  })
})
