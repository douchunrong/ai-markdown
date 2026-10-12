/**
 * 备份策略：命名 / 滚动清理 / 恢复点选择（纯函数 + 薄 IO 适配）。
 * 备份目录：<userData>/.mdai-backup/<文件名>/<时间戳>.md（桌面）；iOS 沙盒同结构。
 */

export interface BackupEntry {
  /** 完整路径或虚拟路径（iOS Directory 前缀） */
  path: string
  ts: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 备份文件名：yyyyMMdd-HHmmss-<seq>.md */
export function backupFileName(date: Date, seq = 0): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return seq > 0 ? `${d}-${t}-${seq}.md` : `${d}-${t}.md`
}

/** 同秒多次备份去重：seq 递增 */
export function nextBackupName(existing: string[], date: Date): string {
  let name = backupFileName(date)
  let seq = 1
  while (existing.includes(name)) name = backupFileName(date, seq++)
  return name
}

/** 滚动清理：按时间戳排序保留最新 keep 份，返回应删除的项（时间升序） */
export function pruneBackups(entries: BackupEntry[], keep: number): BackupEntry[] {
  if (keep <= 0) return []
  const sorted = [...entries].sort((a, b) => b.ts - a.ts)
  return sorted.slice(keep).reverse()
}

export function parseBackupTs(name: string): number | null {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.md$/)
  if (!m) return null
  const [, Y, Mo, D, H, Mi, S, seq] = m
  const ts = new Date(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(S)).getTime()
  return ts + Number(seq ?? 0) // 同秒备份按 seq 排序
}
