import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mdai.editor',
  appName: 'AI Markdown',
  webDir: 'dist',
  ios: {
    // 键盘避让与滚动由 CSS safe-area + Capacitor 默认处理
    scrollEnabled: false,
  },
}

export default config
