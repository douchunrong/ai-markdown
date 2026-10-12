/**
 * Markdown 大纲解析与文档统计（markdown-it 无状态解析，供大纲/统计/导出复用）
 */
import MarkdownIt from 'markdown-it'

export interface HeadingNode {
  level: number
  text: string
  /** 在原文中的行号（0 起） */
  line: number
}

const md = new MarkdownIt({ html: false, linkify: false })

/** 提取标题树（不含 frontmatter 中的 # ） */
export function extractOutline(src: string): HeadingNode[] {
  const tokens = md.parse(src, {})
  const out: HeadingNode[] = []
  for (const t of tokens) {
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1))
      // 找到同级 inline token 取文本
      const inline = tokens[tokens.indexOf(t) + 1]
      if (inline?.type === 'inline') {
        out.push({ level, text: inline.content.trim(), line: (t.map?.[0]) ?? 0 })
      }
    }
  }
  return out
}

export interface DocStats {
  chars: number
  /** 中文按字、英文按词 */
  words: number
  lines: number
  readMinutes: number
}

export function computeStats(src: string): DocStats {
  const chars = src.length
  const lines = src ? src.split('\n').length : 0
  const cjk = (src.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const latinWords = (src.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’\-_]*/g) ?? []).length
  const words = cjk + latinWords
  // 阅读速度：中文 ~400 字/分，混合取 350
  const readMinutes = Math.max(words ? 1 : 0, Math.round(words / 350))
  return { chars, words, lines, readMinutes }
}
