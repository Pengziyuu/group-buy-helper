import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SKELETON_BOOT_SCRIPT, bootSkeletonMarkup } from './src/components/resident/skeletonMarkup.ts'

// Opens the connection to Supabase while the scripts still download, so the first query skips the
// DNS and TLS handshake. Only builds that talk to Supabase get it; the demo build has no URL.
function preconnectSupabase(url: string | undefined): Plugin {
  const origin = (() => {
    try { return url ? new URL(url).origin : null } catch { return null }
  })()
  return {
    name: 'preconnect-supabase',
    transformIndexHtml: () => origin ? [{ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' }] : [],
  }
}

// The resident entry opens on the outline of its page, before any script or stylesheet arrives. The
// markup and styles are the ones React renders while loading, so taking over changes nothing on screen.
function residentBootSkeleton(): Plugin {
  return {
    name: 'resident-boot-skeleton',
    transformIndexHtml(html, context) {
      if (!context.filename.endsWith('index.html')) return html
      const css = readFileSync(resolve(import.meta.dirname, 'src/components/resident/skeleton.css'), 'utf8')
      return {
        html: html.replace('<div id="root"></div>', `<div id="root">${bootSkeletonMarkup()}</div>`),
        tags: [
          { tag: 'script', children: SKELETON_BOOT_SCRIPT, injectTo: 'head' },
          { tag: 'style', children: css, injectTo: 'head' },
        ],
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), preconnectSupabase(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL), residentBootSkeleton()],
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
}))
