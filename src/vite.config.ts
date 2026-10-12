import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'

// MDAI_SHELL=electron 时启用桌面壳（主进程 + preload），
// 否则为纯 Web 构建（iOS Capacitor webDir 与浏览器开发均使用 dist/）
const isElectron = process.env.MDAI_SHELL === 'electron'

export default defineConfig({
  plugins: [
    vue(),
    isElectron &&
      electron({
        main: {
          entry: 'electron/main.ts',
          onstart: ({ startup }) => startup(),
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: { external: ['electron'] },
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              // 沙箱渲染进程的 preload 必须为 CJS
              rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } },
            },
          },
        },
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./renderer', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    // 注意：本项目所在卷对 node fs 的目录删除受限（EXDEV），关闭清空避免构建失败；
    // 产物为内容哈希命名，重复构建的过期文件可手动清理（rm 或文件管理器）。
    emptyOutDir: false,
  },
  server: {
    // MDAI 专用端口：避免与其他 Vite 项目（默认 5173）冲突，导致 Electron 加载错页面
    port: Number(process.env.MDAI_DEV_PORT) || 5188,
    strictPort: true,
  },
})
