import { describe, expect, it } from 'vitest'
import { backupFileName, nextBackupName, parseBackupTs, pruneBackups } from '@/lib/backup'

describe('备份命名与滚动清理', () => {
  it('backupFileName 格式 yyyyMMdd-HHmmss.md', () => {
    expect(backupFileName(new Date(2026, 8, 3, 14, 5, 9))).toBe('20260903-140509.md')
    expect(backupFileName(new Date(2026, 8, 3, 14, 5, 9), 2)).toBe('20260903-140509-2.md')
  })

  it('同秒冲突 seq 递增', () => {
    const d = new Date(2026, 8, 3, 14, 5, 9)
    const name = nextBackupName(['20260903-140509.md', '20260903-140509-1.md'], d)
    expect(name).toBe('20260903-140509-2.md')
  })

  it('无冲突直接使用基础名', () => {
    expect(nextBackupName(['20250101-000000.md'], new Date(2026, 8, 3, 14, 5, 9))).toBe('20260903-140509.md')
  })

  it('pruneBackups 保留最新 keep 份', () => {
    const entries = [1, 2, 3, 4, 5].map((i) => ({ path: `/b/${i}.md`, ts: i }))
    const del = pruneBackups(entries, 3)
    expect(del.map((d) => d.ts)).toEqual([1, 2])
    expect(pruneBackups(entries, 0)).toEqual([])
    expect(pruneBackups(entries, 10)).toEqual([])
  })

  it('parseBackupTs 解析与排序（同秒按 seq）', () => {
    expect(parseBackupTs('20260903-140509.md')).toBeGreaterThan(0)
    expect(parseBackupTs('20260903-140509-2.md')).toBeGreaterThan(parseBackupTs('20260903-140509.md'))
    expect(parseBackupTs('random.md')).toBeNull()
  })
})
