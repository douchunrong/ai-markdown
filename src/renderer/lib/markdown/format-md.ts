/**
 * 保存时自动格式化（非 AI、确定性、幂等）：
 * - 代码围栏内部内容原样保留（只规范围栏标注）
 * - 行尾空白清除；EOF 恰好一个换行
 * - 标题：# 后统一单空格；3+ 连续空行折叠为 1
 * - 列表：* / + 统一为 -；有序 1) 统一为 1.；标记后统一单空格；任务 [X] → [x]
 * - GFM 表格：单元格两侧加空格、分隔行补足 3 个 -、按列宽对齐（CJK 按 2 宽）
 * 不改写任何文字内容与语义结构。纯函数可单测。
 */

/** CJK 等宽字符计 2，其余计 1（表格对齐用） */
export function visualWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    w += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x20000 && c <= 0x3fffd)) ? 2 : 1
  }
  return w
}

const HEADING_RE = /^(#{1,6})(?!#)[ \t]*(.*?)[ \t]*$/
const BULLET_RE = /^(\s*)[*+-][ \t]+(.*)$/
const ORDERED_RE = /^(\s*)(\d+)[.)][ \t]+(.*)$/
const TASK_RE = /^(\[[ xX]\])[ \t]*/
const FENCE_OPEN_RE = /^\s{0,3}(```+|~~~+)/

export function formatMarkdown(src: string): string {
  const lines = (src ?? '').split('\n')
  const out: string[] = []
  let inFence = false
  let fenceMarker = ''

  // 表格块缓冲：连续的 | 行一次性对齐
  let tableBuf: string[] = []

  const flushTable = () => {
    if (tableBuf.length) {
      out.push(...alignTable(tableBuf))
      tableBuf = []
    }
  }

  for (const line of lines) {
    // ---- 代码围栏：内容原样保留 ----
    const fence = FENCE_OPEN_RE.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1][0].repeat(3)
        flushTable()
        // 围栏开启行：规范为 ``` + 语言标注去首尾空格
        out.push(`${fenceMarker}${line.slice(line.indexOf(fence[1]) + fence[1].length).trim()}`)
        continue
      }
      if (line.trim().startsWith(fenceMarker[0])) {
        inFence = false
        flushTable()
        out.push(fenceMarker)
        continue
      }
    }
    if (inFence) {
      out.push(line)
      continue
    }

    // ---- 表格行缓冲 ----
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      tableBuf.push(line)
      continue
    }
    flushTable()

    // ---- 空行 ----
    if (!trimmed) {
      out.push('')
      continue
    }

    // ---- 标题：行首 1-6 个 # 即视为标题（含无空格写法），# 后统一单空格 ----
    const h = HEADING_RE.exec(line)
    if (h) {
      out.push(h[2] ? `${h[1]} ${h[2].trimEnd()}` : h[1])
      continue
    }

    // ---- 列表：* / + 统一为 -；有序 1) 统一为 1.；标记后单空格；任务 [X] → [x] ----
    const b = BULLET_RE.exec(line)
    if (b) {
      out.push(`${b[1]}- ${normTask(b[2])}`)
      continue
    }
    const o = ORDERED_RE.exec(line)
    if (o) {
      out.push(`${o[1]}${o[2]}. ${normTask(o[3])}`)
      continue
    }

    // ---- 普通行：仅去行尾空白 ----
    out.push(line.trimEnd())
  }
  flushTable()

  // 3+ 连续空行 → 1 空行；EOF 单换行
  const collapsed: string[] = []
  for (const l of out) {
    if (l === '' && collapsed.length && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(l)
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop()
  return collapsed.join('\n') + '\n'
}

/** 列表项内容：任务勾选 [X]→[x]、去多余空格，正文保留原样 */
function normTask(rest: string): string {
  const task = TASK_RE.exec(rest)
  if (!task) return rest.trim()
  const mark = task[1] === '[X]' ? '[x]' : task[1]
  return `${mark} ${rest.slice(task[0].length).trim()}`
}

/** 分隔单元格：保留对齐冒号语义，按目标列宽补足横线（至少 3 个） */
function normSepCell(c: string, width: number): string {
  const t = c.trim()
  const left = t.startsWith(':')
  const right = t.endsWith(':') && t.length > 1
  const dashes = Math.max(3, width - (left ? 1 : 0) - (right ? 1 : 0))
  return `${left ? ':' : ''}${'-'.repeat(dashes)}${right ? ':' : ''}`
}

/** 表格对齐：所有行列数以表头为准，按列视觉宽度补空格 */
function alignTable(rows: string[]): string[] {
  if (rows.length < 2) return rows.map((r) => r.trimEnd())
  const split = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const header = split(rows[0])
  const sep = split(rows[1])
  const isSep = sep.every((c) => /^:?-+:?$/.test(c) && c.includes('-')) && sep.length === header.length
  if (!isSep) return rows.map((r) => r.trimEnd())

  const body = rows.slice(2).map(split)
  const n = header.length
  const widths = Array.from({ length: n }, (_, i) => {
    let w = visualWidth(header[i] ?? '')
    for (const cells of body) w = Math.max(w, visualWidth(cells[i] ?? ''))
    return Math.max(w, 3)
  })
  const pad = (c: string, i: number) => {
    const fill = ' '.repeat(Math.max(0, widths[i] - visualWidth(c)))
    return ` ${c}${fill} `
  }
  const res = [`|${header.map((c, i) => pad(c, i)).join('|')}|`]
  res.push(`|${sep.map((c, i) => ` ${normSepCell(c, widths[i])} `).join('|')}|`)
  for (const cells of body) res.push(`|${Array.from({ length: n }, (_, i) => pad(cells[i] ?? '', i)).join('|')}|`)
  return res
}
