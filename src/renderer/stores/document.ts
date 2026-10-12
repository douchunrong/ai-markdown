/**
 * 文档仓库：当前文档状态、文件操作（经平台适配层）、自动保存、冲突检测。
 */
import { defineStore } from 'pinia'
import { getPlatform } from '@/lib/platform'
import { getEditorBridge } from '@/lib/editor-bridge'
import { formatMarkdown } from '@/lib/markdown/format-md'
import { useSettingsStore } from './settings'

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error'

const NEW_TITLE = '未命名文档'

export const useDocumentStore = defineStore('document', {
  state: () => ({
    path: '' as string,
    title: NEW_TITLE,
    content: '',
    saveState: 'clean' as SaveState,
    lastSavedAt: 0,
    /** 桌面：磁盘文件被外部修改 */
    externalChanged: false,
    externalContent: '',
  }),
  getters: {
    dirty(state): boolean {
      return state.saveState === 'dirty' || state.saveState === 'error'
    },
  },
  actions: {
    onContentChanged(md: string) {
      if (md === this.content && this.saveState === 'clean') return
      this.content = md
      if (this.saveState !== 'saving') this.saveState = 'dirty'
    },
    /** 立即格式化当前文档并同步编辑器；返回是否发生变更（空文档跳过） */
    formatDocument(): boolean {
      if (!this.content.trim()) return false
      const formatted = formatMarkdown(this.content)
      if (formatted === this.content) return false
      this.onContentChanged(formatted)
      getEditorBridge()?.applyContent(formatted)
      return true
    },
    newDoc() {
      this.$patch({ path: '', title: NEW_TITLE, content: '', saveState: 'clean' as SaveState, lastSavedAt: 0, externalChanged: false })
      getEditorBridge()?.applyContent('')
    },
    async openFromDisk() {
      const platform = getPlatform()
      const r = await platform.fs.openFile()
      if (!r) return false
      return this.loadFrom(r.path, r.content)
    },
    async loadFrom(path: string, content: string) {
      this.$patch({ path, title: titleOf(path), content, saveState: 'clean' as SaveState, externalChanged: false })
      getEditorBridge()?.applyContent(content)
      useSettingsStore().touchRecent(path, titleOf(path))
      this.watchExternal(path)
      return true
    },
    async save(): Promise<boolean> {
      if (!this.path) return this.saveAs()
      return this.writeTo(this.path)
    },
    async saveAs(): Promise<boolean> {
      const platform = getPlatform()
      const target = await platform.fs.pickSavePath(suggestName(this.title))
      if (!target) return false
      const ok = await this.writeTo(target)
      if (ok) {
        this.path = target
        this.title = titleOf(target)
        useSettingsStore().touchRecent(target, this.title)
        this.watchExternal(target)
      }
      return ok
    },
    async writeTo(path: string): Promise<boolean> {
      this.saveState = 'saving'
      try {
        await getPlatform().fs.writeFile(path, this.content)
        this.saveState = 'clean'
        this.lastSavedAt = Date.now()
        return true
      } catch (err) {
        console.error('[doc] 保存失败', err)
        this.saveState = 'error'
        return false
      }
    },
    /** 冲突处理三选 */
    async resolveConflict(mode: 'keep-mine' | 'load-disk' | 'save-as') {
      this.externalChanged = false
      if (mode === 'keep-mine') {
        await this.writeTo(this.path)
      } else if (mode === 'load-disk') {
        const disk = await getPlatform().fs.readFile(this.path)
        await this.loadFrom(this.path, disk)
      } else if (mode === 'save-as') {
        const ok = await this.saveAs()
        if (ok) {
          const disk = await getPlatform().fs.readFile(this.path)
          await this.loadFrom(this.path, disk)
        }
      }
    },
    watchExternal(path: string) {
      const platform = getPlatform()
      if (!platform.fs.watchExternalChange || !path) return
      platform.fs.watchExternalChange(path, async () => {
        if (this.path !== path) return
        // 过滤自身保存触发的 watcher 事件（保存后 1.5s 内的变更视为回声）
        if (Date.now() - this.lastSavedAt < 1500) return
        if (!this.dirty) {
          // 干净状态：静默重载
          const disk = await getPlatform().fs.readFile(path)
          await this.loadFrom(path, disk)
        } else {
          this.externalChanged = true
        }
      })
    },
  },
})

function titleOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? NEW_TITLE
  return base.replace(/\.(md|markdown|txt)$/i, '') || NEW_TITLE
}

function suggestName(title: string): string {
  return title.endsWith('.md') ? title : `${title || '未命名文档'}.md`
}
