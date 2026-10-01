// After a production deploy, open the live site the way a browser would and report anything a visitor would hit:
// a page that is down, a script or stylesheet that comes back as HTML (a blank page), or a bundle that
// lost the production Supabase project (the site fell back to demo mode).
// Usage: node scripts/smokeProduction.mjs <base-url> <supabase-project-ref>
import { pathToFileURL } from 'node:url'

// Any campaign address works: the page shell and its scripts are the same for every code. Both the short
// /c/ links shared now and the older /campaign/ links already posted in LINE groups must load.
const PAGES = ['/', '/admin', `/c/${'0'.repeat(8)}`, `/campaign/${'0'.repeat(36)}`]

const assetsIn = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1])

export async function checkSite(base, projectRef, fetchImpl = fetch) {
  const problems = []
  const checkedAssets = new Map()

  for (const path of PAGES) {
    const response = await fetchImpl(new URL(path, base))
    const html = await response.text()
    if (!response.ok) { problems.push(`${path}: HTTP ${response.status}`); continue }
    if (!html.includes('<div id="root"></div>')) { problems.push(`${path}: page has no app root`); continue }

    const assets = assetsIn(html)
    const scripts = assets.filter((asset) => asset.endsWith('.js'))
    if (scripts.length === 0) problems.push(`${path}: page loads no script`)
    let foundProject = false

    for (const asset of assets) {
      if (!checkedAssets.has(asset)) {
        const assetResponse = await fetchImpl(new URL(asset, base))
        checkedAssets.set(asset, {
          status: assetResponse.status,
          type: assetResponse.headers.get('content-type') ?? '',
          body: await assetResponse.text(),
        })
      }
      const { status, type, body } = checkedAssets.get(asset)
      const expected = asset.endsWith('.js') ? 'javascript' : 'text/css'
      if (status !== 200 || !type.includes(expected)) {
        problems.push(`${path}: ${asset} came back as HTTP ${status} ${type || 'no type'}, expected ${expected}`)
      }
      if (asset.endsWith('.js') && body.includes(`${projectRef}.supabase.co`)) foundProject = true
    }
    if (scripts.length > 0 && !foundProject) {
      problems.push(`${path}: scripts do not reference the production Supabase project ${projectRef} (demo mode?)`)
    }
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, projectRef] = process.argv.slice(2)
  if (!base || !projectRef) {
    console.error('Usage: node scripts/smokeProduction.mjs <base-url> <supabase-project-ref>')
    process.exit(2)
  }
  const problems = await checkSite(base, projectRef)
  if (problems.length > 0) {
    console.error(`Production check failed for ${base}:\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`Production check passed for ${base}: ${PAGES.join(', ')}`)
}
