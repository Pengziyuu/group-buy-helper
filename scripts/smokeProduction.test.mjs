import { describe, expect, it } from 'vitest'
import { checkSite } from './smokeProduction.mjs'

const BASE = 'https://site.example'
const PROJECT = 'abcdefghijklmnopqrst'
const page = (scripts) => `<html><head>${scripts.map((src) => `<script type="module" src="${src}"></script>`).join('')}<link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div></body></html>`

// A healthy site; each test breaks one thing.
function site(overrides = {}) {
  const routes = {
    '/': { body: page(['/assets/main.js']), type: 'text/html' },
    '/admin': { body: page(['/assets/admin.js']), type: 'text/html' },
    [`/campaign/${'0'.repeat(36)}`]: { body: page(['/assets/main.js']), type: 'text/html' },
    '/assets/main.js': { body: `createClient("https://${PROJECT}.supabase.co")`, type: 'application/javascript' },
    '/assets/admin.js': { body: `createClient("https://${PROJECT}.supabase.co")`, type: 'application/javascript' },
    '/assets/app.css': { body: 'body{}', type: 'text/css' },
    ...overrides,
  }
  return async (url) => {
    const route = routes[new URL(url).pathname]
    if (!route) return new Response('<!doctype html><div id="root"></div>', { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response(route.body, { status: route.status ?? 200, headers: { 'content-type': route.type } })
  }
}

describe('production smoke check', () => {
  it('passes a healthy live site', async () => {
    expect(await checkSite(BASE, PROJECT, site())).toEqual([])
  })

  it('catches a page whose script comes back as HTML, as the blank preview campaign page did', async () => {
    const problems = await checkSite(BASE, PROJECT, site({
      [`/campaign/${'0'.repeat(36)}`]: { body: page(['/assets/main-old.js']), type: 'text/html' },
    }))
    expect(problems.join('\n')).toMatch(/\/campaign\/.*main-old\.js.*text\/html/)
  })

  it('catches a site that fell back to demo mode, without the production database', async () => {
    const problems = await checkSite(BASE, PROJECT, site({
      '/assets/main.js': { body: 'demo only', type: 'application/javascript' },
    }))
    expect(problems.join('\n')).toContain(PROJECT)
  })

  it('catches a page that is down or has no app root', async () => {
    const problems = await checkSite(BASE, PROJECT, site({ '/admin': { body: 'Bad gateway', type: 'text/html', status: 502 } }))
    expect(problems.join('\n')).toMatch(/\/admin.*502/)
  })
})
