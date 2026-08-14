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

  it('Vercel將團主網址送至團主專用HTML', () => {
    const config = JSON.parse(readProjectFile('vercel.json')) as {
      rewrites: Array<{ source: string; destination: string }>
    }

    expect(config.rewrites[0]).toEqual({ source: '/admin', destination: '/admin.html' })
    expect(config.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' })
  })
})
