/**
 * 统一错误体系（错误分类码见 docs/enhanced-design.md §6.1）
 */
export type ErrorCode =
  | 'E-AUTH'
  | 'E-NET'
  | 'E-TIMEOUT'
  | 'E-RATE'
  | 'E-CTX'
  | 'E-SERVER'
  | 'E-CANCELED'
  | 'E-RESP'
  | 'E-IO'
  | 'E-FS'
  | 'E-VALIDATE'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly detail?: string

  constructor(code: ErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }

  /** 是否可重试（依据分类码自动策略） */
  get retryable(): boolean {
    return ['E-NET', 'E-TIMEOUT', 'E-RATE', 'E-SERVER', 'E-RESP'].includes(this.code)
  }

  toJSON(): { code: ErrorCode; message: string; detail?: string } {
    return { code: this.code, message: this.message, detail: this.detail }
  }
}

const AUTH_MSG = 'API 密钥无效或无权限，请检查密钥配置'
const NET_MSG = '网络连接失败，请检查网络或接口地址'
const TIMEOUT_MSG = '请求超时，可在设置调大超时或更换模型'
const RATE_MSG = '请求过于频繁，已自动等待重试'
const CTX_MSG = '文本超出模型上限，请减小单次处理长度'
const SERVER_MSG = '模型服务暂时不可用，请稍后重试'

/** 将底层 HTTP 异常映射为统一错误（纯函数，便于单测） */
export function mapHttpError(status: number, bodyText: string, timeoutMs: number): AppError {
  const lower = bodyText.slice(0, 2000).toLowerCase()
  if (status === 401 || status === 403) return new AppError('E-AUTH', AUTH_MSG, bodyText.slice(0, 500))
  if (status === 404) return new AppError('E-AUTH', '接口地址或模型不存在（404），请检查 baseUrl 与模型名', bodyText.slice(0, 500))
  if (status === 429) return new AppError('E-RATE', RATE_MSG, bodyText.slice(0, 500))
  if (status >= 500) return new AppError('E-SERVER', SERVER_MSG, `HTTP ${status}`)
  if (status === 400 && /context|token|length|maximum|too (long|many)/.test(lower))
    return new AppError('E-CTX', CTX_MSG, bodyText.slice(0, 500))
  if (status === 408) return new AppError('E-TIMEOUT', TIMEOUT_MSG, `timeout ${timeoutMs}ms`)
  return new AppError('E-SERVER', `请求失败（HTTP ${status}）`, bodyText.slice(0, 500))
}

export function isAbortLike(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' && err !== null && (err as { canceled?: boolean }).canceled === true)
  )
}

export function toNetError(err: unknown): AppError {
  const msg = err instanceof Error ? err.message : String(err)
  return new AppError('E-NET', NET_MSG, msg)
}
