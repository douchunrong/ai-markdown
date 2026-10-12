/**
 * 导出模块：HTML（自包含样式，DOMPurify 消毒）/ TXT；PDF 由平台层（Electron printToPDF）完成。
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: true, linkify: true, typographer: false })

/** 渲染并消毒（XSS 防护：预览与导出统一入口） */
export function renderMarkdownSafe(src: string): string {
  const raw = md.render(src)
  if (typeof window === 'undefined') return raw // Node 单测环境无 DOM，规则另行覆盖
  return DOMPurify.sanitize(raw, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'formaction'],
    ALLOW_DATA_ATTR: false,
  })
}

export function markdownToPlainText(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, ''))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|-]/g, (m) => (m === '-' ? '-' : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const EXPORT_CSS = `
:root { color-scheme: light dark; }
body { font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  max-width: 860px; margin: 0 auto; padding: 48px 32px; line-height: 1.75; color: #24292f;
  background: #fff; }
@media (prefers-color-scheme: dark) { body { color: #d2d8de; background: #1b1f24; } }
h1,h2,h3,h4 { line-height: 1.35; margin: 1.4em 0 .6em; }
code { background: rgba(125,125,125,.15); padding: .15em .35em; border-radius: 4px; }
pre { background: rgba(125,125,125,.12); padding: 14px; border-radius: 8px; overflow: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; } th, td { border: 1px solid rgba(125,125,125,.4); padding: 6px 12px; }
blockquote { margin: 1em 0; padding: .2em 1em; border-left: 4px solid rgba(125,125,125,.4); color: inherit; opacity: .85; }
img { max-width: 100%; }
a { color: #0969da; } @media (prefers-color-scheme: dark) { a { color: #6cb2ff; } }
`

/** 生成自包含 HTML 文档（含内联样式与源码注释，便于恢复编辑）；opts 控制边距（PDF 用）与源码嵌入 */
export function buildStandaloneHtml(
  title: string,
  src: string,
  opts: { margin?: 'none' | 'standard' | 'wide'; embedSource?: boolean; width?: number } = {},
): string {
  const body = renderMarkdownSafe(src)
  const padding =
    opts.margin === 'none' ? '0' : opts.margin === 'wide' ? '32mm 28mm' : opts.margin === 'standard' ? '20mm 18mm' : '48px 32px'
  const css = EXPORT_CSS.replace('padding: 48px 32px;', `padding: ${padding};`).replace(
    'max-width: 860px;',
    `max-width: ${opts.width ?? 860}px;`,
  )
  const parts = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    body,
  ]
  if (opts.embedSource !== false) {
    parts.push(`<!-- mdai-source\n${src.replace(/-->/g, '--＞')}\n-->`)
  }
  parts.push('</body>', '</html>')
  return parts.join('\n')
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
