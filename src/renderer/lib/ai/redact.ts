/**
 * 隐私脱敏：发送云端模型前将敏感信息替换为占位符，响应后无损还原。
 * 纯函数，便于单元测试。
 */

export interface RedactResult {
  text: string
  /** 占位符 -> 原文（仅在内存中短暂存在，不落盘、不日志） */
  map: Map<string, string>
}

interface RedactRule {
  name: string
  regex: RegExp
}

const RULES: RedactRule[] = [
  { name: 'email', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'phone-cn', regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { name: 'id-card-cn', regex: /(?<!\d)\d{17}[0-9Xx](?!\d)/g },
  { name: 'apikey', regex: /\b(?:sk|rk|pk)-[A-Za-z0-9]{16,}\b/g },
  { name: 'bearer', regex: /Bearer\s+[A-Za-z0-9._-]{16,}/g },
  { name: 'url-secret', regex: /(https?:\/\/[^\s]*[?&](?:token|key|secret|password|passwd|pwd)=)[^\s&]+/gi },
]

/** 是否包含敏感内容（用于 UI 提示） */
export function containsSensitive(text: string): boolean {
  return RULES.some((r) => {
    r.regex.lastIndex = 0
    return r.regex.test(text)
  })
}

export function redact(text: string): RedactResult {
  const map = new Map<string, string>()
  let out = text
  let seq = 0
  for (const rule of RULES) {
    out = out.replace(rule.regex, (...args) => {
      const matched = args[0] as string
      if (rule.name === 'url-secret') {
        // 组 1 = 含参数名的 URL 前缀，保留；仅占位符化参数值
        const prefix = (args[1] as string) ?? matched
        const secret = matched.slice(prefix.length)
        if (!secret) return matched
        const ph = `«MDAI_URLSECRET_${seq++}»`
        map.set(ph, secret)
        return prefix + ph
      }
      for (const [ph, orig] of map) if (orig === matched) return ph
      const ph = `«MDAI_${rule.name.toUpperCase()}_${seq++}»`
      map.set(ph, matched)
      return ph
    })
  }
  return { text: out, map }
}

/** 将占位符还原为原文；未知占位符保持原样（响应可能改写格式） */
export function unredact(text: string, map: Map<string, string>): string {
  let out = text
  for (const [ph, orig] of map) {
    // 容错：模型可能丢失 «» 或改变大小写
    out = out.split(ph).join(orig)
    const loose = ph.replace(/[«»]/g, '')
    out = out.split(loose).join(orig)
  }
  return out
}
