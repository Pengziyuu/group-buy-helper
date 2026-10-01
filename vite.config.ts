import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // The slowest UI tests take ~2s here; a shared CI runner can be several times slower, so the
    // 5s default failed tests that were only slow, not wrong. A broken test still fails, just later.
    testTimeout: 20_000,
    // Agent worktrees under .claude/ hold a second copy of every test file,
    // which silently doubles the suite and reports stale code as passing.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
