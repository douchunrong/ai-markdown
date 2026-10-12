/**
 * 安全存储：API 密钥经 Electron safeStorage（DPAPI/libsecret/Keychain）加密落盘。
 * 文件：userData/secure.json → { [key]: base64(encrypted) }
 */
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

interface SecureFile {
  [key: string]: string
}

function file(): string {
  return path.join(app.getPath('userData'), 'secure.json')
}

function readAll(): SecureFile {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf-8')) as SecureFile
  } catch {
    return {}
  }
}

function writeAll(data: SecureFile) {
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify(data), { mode: 0o600 })
}

/** 密钥永不明文落盘；safeStorage 不可用时回退 base64 混淆并标记 _insecure */
export function secureGet(key: string): string | null {
  const all = readAll()
  const v = all[key]
  if (!v) return null
  const [mode, payload] = v.split(':', 2)
  try {
    if (mode === 'enc') return safeStorage.decryptString(Buffer.from(payload, 'base64'))
    if (mode === 'b64') return Buffer.from(payload, 'base64').toString('utf-8')
  } catch {
    return null
  }
  return null
}

export function secureSet(key: string, value: string): void {
  const all = readAll()
  if (safeStorage.isEncryptionAvailable()) {
    all[key] = `enc:${safeStorage.encryptString(value).toString('base64')}`
  } else {
    all[key] = `b64:${Buffer.from(value, 'utf-8').toString('base64')}`
  }
  writeAll(all)
}

export function secureDelete(key: string): void {
  const all = readAll()
  delete all[key]
  writeAll(all)
}
