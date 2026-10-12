import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 单元测试位于项目根 tests/（符合目录规范），被测代码在 src/renderer
const projectRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  root: projectRoot,
  plugins: [vue()],
  // vite 工作区根在 src/（package.json 所在），tests/ 在其外 → 显式放行
  server: { fs: { allow: [projectRoot, fileURLToPath(new URL('.', import.meta.url))] } },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./renderer', import.meta.url)),
    },
  },
})
