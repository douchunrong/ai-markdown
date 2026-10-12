/**
 * 「复制内容并简化格式」：Markdown → 纯文本（剥离加粗/斜体/链接/图片标记等格式，
 * 保留文字内容、代码块内容与换行结构）。纯函数可单测。
 */
import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true })

/** 结束后追加空行的块级闭合 token（视觉分段） */
const BLANK_AFTER = new Set([
  'paragraph_close',
  'heading_close',
  'bullet_list_close',
  'ordered_list_close',
  'blockquote_close',
  'table_close',
])

export function simplifyMarkdown(src: string): string {
  const tokens = md.parse(src ?? '', {})
  const lines: string[] = []
  let cur: string | null = null
  let tightPara = false
  const endLine = () => {
    if (cur !== null) {
      lines.push(cur)
      cur = null
    }
  }
  const blank = () => {
    endLine()
    lines.push('')
  }
  const append = (s: string) => {
    cur = (cur ?? '') + s
  }

  for (const t of tokens) {
    if (t.type === 'inline') {
      append(inlinePlain(t))
    } else if (t.type === 'fence' || t.type === 'code_block') {
      endLine()
      const body = (t.content ?? '').replace(/\n$/, '')
      if (body) for (const l of body.split('\n')) lines.push(l)
    } else if (t.type === 'td_close' || t.type === 'th_close') {
      append(' ') // 表格单元格以空格分隔
    } else if (t.type === 'tr_close' || t.type === 'list_item_close') {
      endLine() // 表格行 / 列表项：换行但不空行
    } else if (t.type === 'paragraph_open') {
      tightPara = !!t.hidden // tight 列表项内段落不产生空行
    } else if (t.type === 'paragraph_close') {
      if (tightPara) endLine()
      else blank()
    } else if (t.type === 'hr') {
      blank()
    } else if (BLANK_AFTER.has(t.type)) {
      blank()
    }
  }
  endLine()
  return lines
    .join('\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 行内 token → 纯文本：保留文字与行内代码；图片取 alt；链接取文字；其余标记剥离 */
function inlinePlain(t: Token): string {
  const parts: string[] = []
  const walk = (tokens: Token[]) => {
    for (const c of tokens) {
      if (c.type === 'text' || c.type === 'code_inline') parts.push(c.content)
      else if (c.type === 'softbreak' || c.type === 'hardbreak') parts.push('\n')
      else if (c.type === 'image') walk(c.children ?? [])
    }
  }
  walk(t.children ?? [])
  return parts.join('')
}
