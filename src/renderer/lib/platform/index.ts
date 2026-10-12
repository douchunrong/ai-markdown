/**
 * 平台适配器装配：按运行环境选择 Electron / Capacitor / Web 实现。
 */
import type { PlatformAdapter, PlatformKind } from './types'
import { createElectronAdapter } from './electron-adapter'
import { createCapacitorAdapter } from './capacitor-adapter'
import { createWebAdapter } from './web-adapter'

declare global {
  interface Window {
    /** Electron preload 注入（contextIsolation 白名单 API） */
    mdai?: unknown
  }
}

export function detectPlatform(): PlatformKind {
  if (typeof window !== 'undefined' && window.mdai) return 'electron'
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  if (cap?.isNativePlatform?.()) return 'capacitor'
  return 'web'
}

let cached: PlatformAdapter | null = null

export function getPlatform(): PlatformAdapter {
  if (cached) return cached
  const kind = detectPlatform()
  cached =
    kind === 'electron'
      ? createElectronAdapter()
      : kind === 'capacitor'
        ? createCapacitorAdapter()
        : createWebAdapter()
  return cached
}

export type { PlatformAdapter }
