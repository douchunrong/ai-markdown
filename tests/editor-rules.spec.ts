import { describe, expect, it } from 'vitest'
import { isHeadingHashPrefix, matchHeadingLine, shouldExitCodeBlock } from '@/lib/markdown/editor-rules'

describe('编辑器输入规则（纯函数）', () => {
  describe('标题延迟渲染：matchHeadingLine', () => {
    it('匹配 1-6 级标题并剥离前缀', () => {
      expect(matchHeadingLine('# 标题')).toEqual({ level: 1, text: '标题' })
      expect(matchHeadingLine('### 三级 标题')).toEqual({ level: 3, text: '三级 标题' })
      expect(matchHeadingLine('###### 六级')).toEqual({ level: 6, text: '六级' })
    })
    it('允许空正文（仅 "# "）', () => {
      expect(matchHeadingLine('# ')).toEqual({ level: 1, text: '' })
    })
    it('7 个 # 不匹配；无空格不匹配；正文含 # 保留', () => {
      expect(matchHeadingLine('####### 七级')).toBeNull()
      expect(matchHeadingLine('#无空格')).toBeNull()
      expect(matchHeadingLine('## C# 入门')).toEqual({ level: 2, text: 'C# 入门' })
    })
    it('行中内容不误伤（前缀必须位于行首）', () => {
      expect(matchHeadingLine('普通文本 # 不是标题')).toBeNull()
    })
  })

  describe('标题延迟渲染：isHeadingHashPrefix（# 后敲空格拦截）', () => {
    it('行首仅 #+ 时拦截空格', () => {
      expect(isHeadingHashPrefix('#')).toBe(true)
      expect(isHeadingHashPrefix('##')).toBe(true)
      expect(isHeadingHashPrefix('######')).toBe(true)
    })
    it('其他内容不拦截', () => {
      expect(isHeadingHashPrefix('#######')).toBe(false) // 超过 6 级
      expect(isHeadingHashPrefix('# a')).toBe(false)
      expect(isHeadingHashPrefix('')).toBe(false)
      expect(isHeadingHashPrefix('abc')).toBe(false)
    })
  })

  describe('代码块 Enter 退出：shouldExitCodeBlock', () => {
    it('块尾 + 空行（光标前为空或以换行结尾）→ 退出', () => {
      expect(shouldExitCodeBlock('', true)).toBe(true)
      expect(shouldExitCodeBlock('ls -la\n', true)).toBe(true)
      expect(shouldExitCodeBlock('ls\necho hi\n', true)).toBe(true)
    })
    it('块尾但当前行有内容 → 不退出（先换出空行）', () => {
      expect(shouldExitCodeBlock('ls -la', true)).toBe(false)
      expect(shouldExitCodeBlock('ls\necho hi', true)).toBe(false)
    })
    it('非块尾一律不退出', () => {
      expect(shouldExitCodeBlock('', false)).toBe(false)
      expect(shouldExitCodeBlock('ls\n', false)).toBe(false)
    })
  })
})
