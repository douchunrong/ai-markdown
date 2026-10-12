/**
 * 跨平台导出编排（另存为）：MD / TXT / HTML / PDF / DOCX / PNG。
 * 桌面走原生对话框 + 主进程渲染；iOS 走分享面板（PDF/PNG 降级提示）。
 */
import { getPlatform } from '@/lib/platform'
import { buildStandaloneHtml, markdownToPlainText } from '@/lib/markdown/export'
import { markdownToBlocks, blocksToDocxBlob } from '@/lib/markdown/to-docx'
import type { FileFilter, PdfExportOptions, PngExportOptions } from '@/lib/platform/types'

type Toast = (text: string, error?: boolean) => void

export type ExportFormat = 'md' | 'txt' | 'html' | 'pdf' | 'docx' | 'png'

export interface ExportOptions {
  pdf?: PdfExportOptions
  png?: PngExportOptions
  html?: { embedSource: boolean }
  docx?: { fontSizePt: number }
}

export const EXPORT_FILTERS: Record<ExportFormat, FileFilter> = {
  md: { name: 'Markdown 文档', extensions: ['md'] },
  txt: { name: '纯文本', extensions: ['txt'] },
  html: { name: '网页', extensions: ['html'] },
  pdf: { name: 'PDF 文档', extensions: ['pdf'] },
  docx: { name: 'Word 文档', extensions: ['docx'] },
  png: { name: 'PNG 图片', extensions: ['png'] },
}

export async function exportDoc(
  kind: ExportFormat,
  title: string,
  content: string,
  toast: Toast,
  opts: ExportOptions = {},
): Promise<boolean> {
  const platform = getPlatform()
  const name = sanitize(title)
  try {
    switch (kind) {
      case 'md':
        return await saveText(platform, `${name}.md`, content, toast)
      case 'txt':
        return await saveText(platform, `${name}.txt`, markdownToPlainText(content), toast)
      case 'html': {
        const html = buildStandaloneHtml(title, content, { embedSource: opts.html?.embedSource !== false })
        return await saveText(platform, `${name}.html`, html, toast)
      }
      case 'pdf': {
        const pdfOpts = opts.pdf ?? { pageSize: 'A4' as const, landscape: false, margin: 'standard' as const }
        const html = buildStandaloneHtml(title, content, { margin: pdfOpts.margin })
        if (!platform.export.toPdf) {
          // iOS：无打印桥接，分享 HTML（系统打印可另存 PDF）
          await shareAsFile(platform, `${name}.html`, html, title)
          toast('iOS 端暂不支持直接导出 PDF，已分享 HTML（可在系统打印中另存 PDF）')
          return true
        }
        const target = await platform.fs.pickSavePath(`${name}.pdf`, [EXPORT_FILTERS.pdf])
        if (!target) return false
        await platform.export.toPdf(html, ensureExt(target, 'pdf'), pdfOpts)
        return true
      }
      case 'docx': {
        const blob = await blocksToDocxBlob(title, markdownToBlocks(content), opts.docx)
        const b64 = await blobToBase64(blob)
        if (platform.kind === 'capacitor') {
          await shareAsFile(platform, `${name}.docx`, '', title, b64)
          return true
        }
        const target = await platform.fs.pickSavePath(`${name}.docx`, [EXPORT_FILTERS.docx])
        if (!target) return false
        await platform.fs.writeFile(ensureExt(target, 'docx'), b64, 'base64')
        return true
      }
      case 'png': {
        if (!platform.export.capturePng) {
          toast('当前平台（iOS/Web）暂不支持 PNG 导出，请在桌面端使用', true)
          return false
        }
        const pngOpts = opts.png ?? { width: 860, scale: 2 }
        const html = buildStandaloneHtml(title, content, { width: pngOpts.width })
        const target = await platform.fs.pickSavePath(`${name}.png`, [EXPORT_FILTERS.png])
        if (!target) return false
        await platform.export.capturePng(html, ensureExt(target, 'png'), pngOpts)
        return true
      }
    }
  } catch (err) {
    console.error('[export]', err)
    toast(`导出失败：${err instanceof Error ? err.message : String(err)}`, true)
    return false
  }
}

async function saveText(
  platform: ReturnType<typeof getPlatform>,
  fileName: string,
  text: string,
  _toast: Toast,
): Promise<boolean> {
  if (platform.kind === 'capacitor') {
    await shareAsFile(platform, fileName, text, fileName)
    return true
  }
  const ext = fileName.split('.').pop() as ExportFormat
  const target = await platform.fs.pickSavePath(fileName, [EXPORT_FILTERS[ext] ?? EXPORT_FILTERS.md])
  if (!target) return false
  await platform.fs.writeFile(ensureExt(target, ext), text)
  return true
}

async function shareAsFile(
  platform: ReturnType<typeof getPlatform>,
  fileName: string,
  text: string,
  title: string,
  base64?: string,
): Promise<void> {
  if (!platform.export.share) throw new Error('当前平台不支持分享')
  // UTF-8 → base64（含 BOM，保证 iOS 备注类应用识别编码）
  const b64 = base64 ?? encodeBase64Utf8(`\ufeff${text}`)
  await platform.export.share({ title, fileName, base64: b64 })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const r = String(reader.result ?? '')
      resolve(r.slice(r.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function encodeBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/** 对话框返回路径若无正确扩展名则补齐（Word/PDF 等关联打开依赖扩展名） */
function ensureExt(path: string, ext: string): string {
  return new RegExp(`\\.${ext}$`, 'i').test(path) ? path : `${path}.${ext}`
}

function sanitize(name: string): string {
  return (name || '未命名文档').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
}
