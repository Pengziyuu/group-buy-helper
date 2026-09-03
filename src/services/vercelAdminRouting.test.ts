import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vercel admin entry routing', () => {
  it('serves the admin document for every nested organizer route before the resident fallback', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>
    }
    expect(config.rewrites.slice(0, 2)).toEqual([
      { source: '/admin', destination: '/admin.html' },
      { source: '/admin/(.*)', destination: '/admin.html' },
    ])
    expect(config.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' })
  })
})
