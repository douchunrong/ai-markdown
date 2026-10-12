/**
 * DOCX 导出：Markdown → IR（纯函数，可单测）→ docx 文档。
 * 支持：1-6 级标题、段落（加粗/斜体/行内代码/链接）、有序/无序列表、
 * 任务清单、代码块、引用块、分隔线、GFM 表格。
 */
import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'

export interface DocxRun {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: string
  strike?: boolean
}

export type DocxBlock =
  | { type: 'heading'; level: number; runs: DocxRun[] }
  | { type: 'paragraph'; runs: DocxRun[] }
  | { type: 'list'; ordered: boolean; items: { runs: DocxRun[]; checked?: boolean | null }[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; runs: DocxRun[] }
  | { type: 'hr' }
  | { type: 'table'; header: DocxRun[][]; rows: DocxRun[][][] }

const md = new MarkdownIt({ html: false, linkify: true })

/** Markdown 源 → 块级 IR（纯函数） */
export function markdownToBlocks(src: string): DocxBlock[] {
  const tokens = md.parse(src, {})
  const blocks: DocxBlock[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.type === 'heading_open') {
      blocks.push({ type: 'heading', level: Number(t.tag.slice(1)), runs: inlineRuns(tokens[i + 1]) })
      i += 3 // heading_open + inline + heading_close
      continue
    }
    if (t.type === 'paragraph_open') {
      blocks.push({ type: 'paragraph', runs: inlineRuns(tokens[i + 1]) })
      i += 3
      continue
    }
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      const ordered = t.type === 'ordered_list_open'
      const close = ordered ? 'ordered_list_close' : 'bullet_list_close'
      const items: Extract<DocxBlock, { type: 'list' }>['items'] = []
      let checked: boolean | null = null
      i++
      while (i < tokens.length && tokens[i].type !== close) {
        const it = tokens[i]
        if (it.type === 'list_item_open') {
          checked = null
        } else if (it.type === 'inline') {
          const runs = inlineRuns(it)
          // 任务清单（markdown-it 核心不产出 checkbox token，作文本检测并剥前缀）
          const first = runs[0]
          const m = first?.text.match(/^ *\[([ xX])\] +/)
          if (m) {
            if (checked === null) checked = m[1].toLowerCase() === 'x'
            first.text = first.text.slice(m[0].length)
          }
          items.push({ runs, checked })
        }
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      i++ // skip close
      continue
    }
    if (t.type === 'fence' || t.type === 'code_block') {
      blocks.push({ type: 'code', lang: String(t.info ?? '').trim(), text: t.content ?? '' })
      i++
      continue
    }
    if (t.type === 'blockquote_open') {
      const runs: DocxRun[] = []
      i++
      while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
        if (tokens[i].type === 'inline') runs.push(...inlineRuns(tokens[i]))
        i++
      }
      blocks.push({ type: 'quote', runs: runs.length ? runs : [{ text: '' }] })
      i++
      continue
    }
    if (t.type === 'hr') {
      blocks.push({ type: 'hr' })
      i++
      continue
    }
    if (t.type === 'table_open') {
      const header: DocxRun[][] = [] // 表头一行：单元格 → runs
      const rows: DocxRun[][][] = [] // 数据行：行 → 单元格 → runs
      let current: DocxRun[] | null = null
      i++
      while (i < tokens.length && tokens[i].type !== 'table_close') {
        const tt = tokens[i]
        if (tt.type === 'tr_open' && !isInsideHead(tokens, i)) rows.push([])
        else if (tt.type === 'th_open' || tt.type === 'td_open') current = []
        else if (tt.type === 'inline' && current) current.push(...inlineRuns(tt))
        else if ((tt.type === 'th_close' || tt.type === 'td_close') && current) {
          if (isInsideHead(tokens, i)) header.push(current)
          else if (rows.length) rows[rows.length - 1].push(current)
          current = null
        }
        i++
      }
      blocks.push({ type: 'table', header, rows })
      i++
      continue
    }
    if (t.type === 'html_block' || t.type === 'html_inline') {
      i++
      continue
    }
    i++
  }
  return blocks
}

function isInsideHead(tokens: Token[], idx: number): boolean {
  for (let j = idx; j >= 0; j--) {
    const ty = tokens[j].type
    if (ty === 'thead_open') return true
    // 越过表头闭合/表格起点仍未命中 → 处于表体
    if (ty === 'thead_close' || ty === 'table_open') return false
  }
  return false
}

function inlineRuns(token: Token | undefined): DocxRun[] {
  const runs: DocxRun[] = []
  if (!token?.children) return runs
  let bold = 0
  let italic = 0
  let strike = 0
  let link = ''
  for (const c of token.children) {
    switch (c.type) {
      case 'strong_open': bold++; break
      case 'strong_close': bold--; break
      case 'em_open': italic++; break
      case 'em_close': italic--; break
      case 's_open': strike++; break
      case 's_close': strike--; break
      case 'link_open': link = attrOf(c, 'href'); break
      case 'link_close': link = ''; break
      case 'code_inline': {
        const text = c.content ?? ''
        if (text) runs.push({ text, code: true })
        break
      }
      case 'text': {
        const text = c.content ?? ''
        if (text)
          runs.push({
            text,
            bold: bold > 0 || undefined,
            italic: italic > 0 || undefined,
            strike: strike > 0 || undefined,
            link: link || undefined,
          })
        break
      }
      case 'softbreak':
      case 'hardbreak':
        runs.push({ text: '\n' })
        break
      default:
        break
    }
  }
  return runs.length ? runs : [{ text: '' }]
}

/** markdown-it attrs 为 [k, v][]，统一取值 */
function attrOf(token: Token, key: string): string {
  const pair = token.attrs?.find(([k]) => k === key)
  return pair?.[1] ?? ''
}

/** IR → docx Blob（浏览器环境）；动态加载 docx 保持主包精简 */
export async function blocksToDocxBlob(title: string, blocks: DocxBlock[], opts: { fontSizePt?: number } = {}): Promise<Blob> {
  const d = await import('docx')
  const fontSizeHalf = Math.round((opts.fontSizePt ?? 11) * 2)
  const mono = 'Courier New'

  const toTextRuns = (runs: DocxRun[]) =>
    runs.map(
      (r) =>
        new d.TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          strike: r.strike,
          font: r.code ? mono : undefined,
          size: r.code ? fontSizeHalf - 2 : undefined,
          color: r.link ? '0563C1' : undefined,
          underline: r.link ? {} : undefined,
        }),
    )

  const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        children.push(new d.Paragraph({ heading: mapHeading(d, b.level), children: toTextRuns(b.runs) }))
        break
      case 'paragraph':
        children.push(new d.Paragraph({ children: toTextRuns(b.runs), spacing: { after: 120 } }))
        break
      case 'list':
        for (const [k, item] of b.items.entries()) {
          const prefix = item.checked === null || item.checked === undefined ? '' : item.checked ? '☑ ' : '☐ '
          children.push(
            new d.Paragraph({
              children: [new d.TextRun({ text: prefix }), ...toTextRuns(item.runs)],
              bullet: b.ordered ? undefined : { level: 0 },
              numbering: b.ordered ? { reference: 'mdai-ol', level: 0, instance: k } : undefined,
              spacing: { after: 60 },
            }),
          )
        }
        break
      case 'code':
        for (const line of b.text.replace(/\n$/, '').split('\n')) {
          children.push(
            new d.Paragraph({
              children: [new d.TextRun({ text: line || ' ', font: mono, size: fontSizeHalf - 2 })],
              shading: { type: d.ShadingType.CLEAR, fill: 'F2F4F7' },
              spacing: { after: 0, line: 300 },
            }),
          )
        }
        children.push(new d.Paragraph({ text: '', spacing: { after: 120 } }))
        break
      case 'quote':
        children.push(
          new d.Paragraph({
            children: toTextRuns(b.runs).map((r) => r),
            indent: { left: 480 },
            border: { left: { style: d.BorderStyle.SINGLE, size: 12, color: '999999', space: 8 } },
            spacing: { after: 120 },
          }),
        )
        break
      case 'hr':
        children.push(
          new d.Paragraph({ text: '', border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 4 } }, spacing: { after: 160 } }),
        )
        break
      case 'table': {
        const mkCell = (runs: DocxRun[], isHeader: boolean) =>
          new d.TableCell({
            children: [new d.Paragraph({ children: toTextRuns(runs) })],
            shading: isHeader ? { type: d.ShadingType.CLEAR, fill: 'EFEFEF' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          })
        children.push(
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: [
              new d.TableRow({ tableHeader: true, children: b.header.map((c) => mkCell(c, true)) }),
              ...b.rows.map((row) => new d.TableRow({ children: row.map((c) => mkCell(c, false)) })),
            ],
          }),
        )
        children.push(new d.Paragraph({ text: '', spacing: { after: 120 } }))
        break
      }
    }
  }

  const doc = new d.Document({
    numbering: {
      config: [
        {
          reference: 'mdai-ol',
          levels: [
            {
              level: 0,
              format: d.LevelFormat.DECIMAL,
              text: '%1.',
              alignment: d.AlignmentType.START,
              style: { paragraph: { indent: { left: 480, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { size: fontSizeHalf, font: 'Calibri' } },
      },
    },
    sections: [{ properties: {}, children: [new d.Paragraph({ text: title, heading: d.HeadingLevel.TITLE }), ...children] }],
  })
  return d.Packer.toBlob(doc)
}

function mapHeading(d: typeof import('docx'), level: number): (typeof d.HeadingLevel)[keyof typeof d.HeadingLevel] {
  const map: Record<number, (typeof d.HeadingLevel)[keyof typeof d.HeadingLevel]> = {
    1: d.HeadingLevel.HEADING_1,
    2: d.HeadingLevel.HEADING_2,
    3: d.HeadingLevel.HEADING_3,
    4: d.HeadingLevel.HEADING_4,
    5: d.HeadingLevel.HEADING_5,
    6: d.HeadingLevel.HEADING_6,
  }
  return map[level] ?? d.HeadingLevel.HEADING_6
}
