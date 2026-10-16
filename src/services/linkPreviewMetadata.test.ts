/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('LINE連結預覽中繼資料', () => {
  it('住戶入口使用住戶專用標題', () => {
    const html = readProjectFile('index.html')

    expect(html).toContain('<html lang="zh-Hant">')
    expect(html).toContain('<title>團購小幫手｜住戶入口</title>')
    expect(html).toContain('<meta property="og:title" content="團購小幫手｜住戶入口" />')
  })

  it('團主入口使用團主專用標題', () => {
    const html = readProjectFile('admin.html')

    expect(html).toContain('<html lang="zh-Hant">')
    expect(html).toContain('<title>團購小幫手｜團主後台</title>')
    expect(html).toContain('<meta property="og:title" content="團購小幫手｜團主後台" />')
  })

  it.each(['index.html', 'admin.html'])('%s 使用新版小幫手圖示與通用分享圖片', (entry) => {
    const html = readProjectFile(entry)
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/brand/helper-icon-32-v1.png" />')
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/brand/helper-icon-180-v1.png" />')
    expect(html).toContain('<meta property="og:image" content="https://tuan-go.vercel.app/brand/helper-preview-v1.jpg" />')
    expect(html).not.toContain('type="image/svg+xml" href="/favicon.svg"')
    for (const image of ['helper-icon-32-v1.png', 'helper-icon-180-v1.png', 'helper-preview-v1.jpg']) {
      expect(readFileSync(resolve(process.cwd(), 'public/brand', image)).length).toBeGreaterThan(0)
    }
  })

  it('Vercel將團主網址送至團主專用HTML', () => {
    const config = JSON.parse(readProjectFile('vercel.json')) as {
      rewrites: Array<{ source: string; destination: string }>
    }

    expect(config.rewrites[0]).toEqual({ source: '/admin', destination: '/admin.html' })
    expect(config.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' })
  })
})
