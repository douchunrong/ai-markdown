/**
 * 编辑器输入规则纯函数（可单测，供 EditorPane 的 ProseMirror 插件调用）：
 * - 标题延迟渲染：# 后敲空格保持纯文本（拦截即时转标题），换行完成时统一转标题
 * - 代码块退出：光标在块尾且当前行为空行时，Enter 退出代码块回到普通段落
 */

/** 整行匹配标题：`#+ 空格 [正文]`；返回级别与去前缀正文 */
export function matchHeadingLine(line: string): { level: number; text: string } | null {
  const m = /^(#{1,6}) +(.*?)\s*$/.exec(line)
  return m ? { level: m[1].length, text: m[2] } : null
}

/** 行首已输入 #+（此刻敲空格应保持纯文本，拦截 commonmark 即时转标题的输入规则） */
export function isHeadingHashPrefix(before: string): boolean {
  return /^#{1,6}$/.test(before)
}

/** 代码块内 Enter 是否应退出：光标在块尾，且当前行为空（无内容或正好以换行结尾） */
export function shouldExitCodeBlock(textBeforeCursor: string, atBlockEnd: boolean): boolean {
  if (!atBlockEnd) return false
  return textBeforeCursor === '' || textBeforeCursor.endsWith('\n')
}
