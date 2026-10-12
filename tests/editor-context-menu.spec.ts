import { describe, expect, it } from 'vitest'
import { simplifyMarkdown } from '@/lib/markdown/simplify-md'
import { buildEditorContextMenu, parseAiAction } from '@/lib/editor/context-menu'

describe('复制内容并简化格式（simplifyMarkdown）', () => {
  it('剥离加粗 / 斜体 / 行内代码 / 删除线标记，保留文字', () => {
    expect(simplifyMarkdown('**加粗** 与 *斜体*、`code`、~~删除~~')).toBe('加粗 与 斜体、code、删除')
  })

  it('标题只保留文字，链接保留文字去掉 URL，图片取 alt', () => {
    expect(simplifyMarkdown('# 标题\n\n[点这里](https://example.com)\n\n![logo 图片](logo.png)')).toBe(
      '标题\n\n点这里\n\nlogo 图片',
    )
  })

  it('代码块保留内容（去掉围栏与语言标注）', () => {
    expect(simplifyMarkdown('```shell\nls -la\necho hi\n```')).toBe('ls -la\necho hi')
  })

  it('列表每项独立成行；引用剥离 >', () => {
    expect(simplifyMarkdown('- 甲\n- 乙\n- 丙')).toBe('甲\n乙\n丙')
    expect(simplifyMarkdown('> 引用内容')).toBe('引用内容')
  })

  it('表格保留单元格内容（空格分隔）', () => {
    const out = simplifyMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('a b')
    expect(out).toContain('1 2')
    expect(out).not.toContain('|')
  })

  it('空输入安全', () => {
    expect(simplifyMarkdown('')).toBe('')
  })
})

describe('右键菜单结构（buildEditorContextMenu）', () => {
  const L = {
    cut: '剪切',
    copy: '拷贝',
    paste: '粘贴',
    copyAs: '复制 / 粘贴为…',
    asMarkdown: '复制为 Markdown',
    asHtml: '复制为 HTML 代码',
    simplify: '复制内容并简化格式',
    pastePlain: '粘贴为纯文本',
    insertTable: '插入表格…',
    tidyAll: '一键规整',
    aiMenu: 'AI 处理',
    aiScopeSel: '选中文本',
    aiScopeFull: '全文',
  }

  it('有选区：复制类可用；插入表格可用；一键规整为一级项；AI 菜单标注「选中文本」', () => {
    const items = buildEditorContextMenu({ hasSelection: true }, L)
    expect(items.map((i) => i.id)).toEqual(['cut', 'copy', 'paste', 'copyAs', 'pasteAsPlain', 'insertTable', 'ai:tidy-all', 'ai'])
    expect(items.every((i) => !i.disabled)).toBe(true)
    const tidy = items.find((i) => i.id === 'ai:tidy-all')!
    expect(tidy.label).toBe('一键规整')
    expect(tidy.children).toBeUndefined()
    const ai = items.find((i) => i.id === 'ai')!
    expect(ai.label).toContain('选中文本')
    expect(ai.children!.map((c) => c.id)).toEqual(['ai:polish', 'ai:expand', 'ai:proofread', 'ai:condense'])
    const sub = items.find((i) => i.id === 'copyAs')?.children ?? []
    expect(sub.map((s) => s.id)).toEqual(['copyAsMarkdown', 'copyAsHtml', 'copySimplified'])
  })

  it('无选区：剪切/拷贝/复制为…禁用；插入表格、一键规整与 AI（全文）可用', () => {
    const items = buildEditorContextMenu({ hasSelection: false }, L)
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId.cut.disabled).toBe(true)
    expect(byId.copy.disabled).toBe(true)
    expect(byId.copyAs.disabled).toBe(true)
    expect(byId.paste.disabled).toBeFalsy()
    expect(byId.pasteAsPlain.disabled).toBeFalsy()
    expect(byId.insertTable.disabled).toBeFalsy()
    expect(byId['ai:tidy-all'].disabled).toBeFalsy()
    expect(byId.ai.disabled).toBeFalsy()
    expect(byId.ai.label).toContain('全文')
  })

  it('锁定（AI 处理中）：插入表格禁用，其余不受影响', () => {
    const items = buildEditorContextMenu({ hasSelection: false, locked: true }, L)
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(byId.insertTable.disabled).toBe(true)
    expect(byId.paste.disabled).toBeFalsy()
  })

  it('parseAiAction：ai: 前缀解析，非 AI 动作返回 null', () => {
    expect(parseAiAction('ai:tidy-all')).toBe('tidy-all')
    expect(parseAiAction('cut')).toBeNull()
    expect(parseAiAction('copyAsHtml')).toBeNull()
  })
})
