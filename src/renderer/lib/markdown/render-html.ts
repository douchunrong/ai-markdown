/**
 * Markdown → 安全 HTML（预览面板用）：markdown-it 渲染 + DOMPurify 消毒。
 * 纯函数可单测；无 DOM 环境（node 测试）跳过消毒仅做渲染。
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: false, linkify: true })

export function renderMarkdownHtml(src: string): string {
  const raw = md.render(src ?? '')
  if (typeof window === 'undefined') return raw
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}
