/**
 * 长文本分块器：按 Markdown 结构边界切分，保证块级完整性与顺序还原。
 * 纯函数，无副作用，便于单元测试。
 */

export interface TextChunk {
  index: number
  text: string
}

export interface ChunkOptions {
  maxChars: number
  /** 分块间保留的上下文重叠字符数（0 = 不重叠） */
  overlapChars?: number
}

/**
 * 将 markdown 全文按「标题边界 → 空行段落组」切分为 ≤ maxChars 的块。
 * - 单个块级元素超过 maxChars 时再按硬长度切，避免死循环；
 * - 尽量不切断列表项/代码块内部（首层优先在 \n\n 边界切）。
 */
export function chunkMarkdown(text: string, opts: ChunkOptions): TextChunk[] {
  const maxChars = Math.max(500, Math.floor(opts.maxChars))
  if (text.length <= maxChars) return text ? [{ index: 0, text }] : []

  // 1) 先按标题（#/##…）切大段
  const sections = splitByHeadings(text)
  // 2) 段内超限再按空行段落组聚合切分
  const blocks: string[] = []
  for (const sec of sections) {
    if (sec.length <= maxChars) {
      blocks.push(sec)
      continue
    }
    blocks.push(...splitByParagraphs(sec, maxChars))
  }

  // 3) 聚合相邻块（装箱），尽量减少请求次数
  const chunks: string[] = []
  let buf = ''
  for (const b of blocks) {
    if (!b) continue
    if (!buf) {
      buf = b
    } else if (buf.length + b.length + 2 <= maxChars) {
      buf = `${buf}\n\n${b}`
    } else {
      chunks.push(buf)
      buf = b
    }
  }
  if (buf) chunks.push(buf)

  return chunks.map((t, i) => ({ index: i, text: t }))
}

function splitByHeadings(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let cur: string[] = []
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && cur.length) {
      out.push(cur.join('\n'))
      cur = [line]
    } else {
      cur.push(line)
    }
  }
  if (cur.length) out.push(cur.join('\n'))
  return out.map((s) => s.trim()).filter(Boolean)
}

function splitByParagraphs(sec: string, maxChars: number): string[] {
  const paras = sec.split(/\n{2,}/)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if (!cur) {
      cur = p
    } else if (cur.length + p.length + 2 <= maxChars) {
      cur = `${cur}\n\n${p}`
    } else {
      out.push(cur)
      cur = p
    }
    // 单段落自身超限 → 硬切（按行，再按字符）
    if (cur.length > maxChars) {
      out.push(...hardSplit(cur, maxChars))
      cur = ''
    }
  }
  if (cur) out.push(cur)
  return out
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars)
    if (cut < maxChars * 0.5) cut = maxChars
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

/**
 * 校验分块内容无损（字符集合与顺序保持）。
 * 注：仅在「无任何边界的超长单行」被硬切时，重组可能引入空白重排
 * （如超长段落被拆为两段），属 markdown 可接受再排版，不视为内容丢失。
 */
export function chunksReconstructable(text: string, chunks: TextChunk[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '')
  return norm(chunks.map((c) => c.text).join('')) === norm(text)
}
