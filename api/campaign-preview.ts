import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LINE reads the raw HTML, not the client-side React title. Keep the SPA entry
// intact while replacing only the three public preview tags for published slugs.
type Request = { method?: string; query: { slug?: string | string[] } }
type Response = {
  status: (code: number) => Response
  setHeader: (name: string, value: string) => Response
  send: (body: string) => Response
}

// New campaigns get 8-character codes; older ones keep their 36-character codes.
const slugPattern = /^(?:[0-9a-f]{36}|[0-9a-z]{8})$/
const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

function publicCover(raw: unknown, supabaseUrl: string): string | null {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    const origin = new URL(supabaseUrl).origin
    if (url.protocol !== 'https:' || url.origin !== origin || url.search || url.hash) return null
    if (!/^\/storage\/v1\/object\/public\/campaign-images\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

// The root may already hold the loading outline shown before the scripts run.
const isSpaEntry = (html: string) => html.includes('<div id="root">') && html.includes('property="og:title"')

function bundledEntry(): string | null {
  try {
    const html = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8')
    return isSpaEntry(html) ? html : null
  } catch { return null }
}

export default async function campaignPreview(req: Request, res: Response) {
  if (req.method && req.method !== 'GET') return res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed')
  // Deployment-specific VERCEL_URL can be password-protected even while the
  // stable Production domain is public. Never inject metadata into that login page.
  // Prefer this deployment's own built page (bundled via vercel.json includeFiles): production's page names
  // production's script files, which a preview deployment does not have, so the browser got HTML for its JS.
  let html = bundledEntry()
  if (!html) {
    try {
      const response = await fetch('https://tuan-go.vercel.app/index.html', { signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error('SPA entry unavailable')
      html = await response.text()
      if (!isSpaEntry(html)) throw new Error('Unexpected SPA entry')
    } catch { return res.status(503).send('Unavailable') }
  }

  const slug = req.query.slug
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (typeof slug === 'string' && slugPattern.test(slug) && supabaseUrl && anonKey) {
    try {
      const endpoint = new URL('/rest/v1/rpc/campaign_link_preview', supabaseUrl)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const rows = await response.json() as Array<{ title?: unknown; image_url?: unknown }>
        const row = Array.isArray(rows) ? rows[0] : null
        if (row && typeof row.title === 'string' && row.title.trim()) {
          const title = escapeAttribute(row.title.trim())
          const description = escapeAttribute(`查看「${row.title.trim()}」團購商品與下單資訊。`)
          const cover = publicCover(row.image_url, supabaseUrl)
          html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}｜團購小幫手" />`)
            .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
            .replace(/<title>[^<]*<\/title>/, `<title>${title}｜團購小幫手</title>`)
          if (cover) html = html.replace('</head>', `  <meta property="og:image" content="${escapeAttribute(cover)}" />\n</head>`)
        }
      }
    } catch { /* Fail closed to generic metadata while preserving the resident page. */ }
  }
  return res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=0, s-maxage=60').send(html)
}
