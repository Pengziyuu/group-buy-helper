// Full-page screenshots of the localStorage demo for before/after UI review.
// Usage: node scripts/capture-pages.mjs <outDir> [baseUrl]
// Needs `npm run dev` running and Google Chrome (override with CHROME_PATH).
// Later redesign phases edit `pages` when routes change.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [outDir, baseUrl = 'http://localhost:5173'] = process.argv.slice(2)
if (!outDir) {
  console.error('Usage: node scripts/capture-pages.mjs <outDir> [baseUrl]')
  process.exit(1)
}

const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const widths = [375, 768, 1440]
const pages = [
  { name: 'resident-list', path: '/' },
  { name: 'resident-campaign', path: '/campaign/0123456789abcdef0123456789abcdef0123' },
  { name: 'admin-list', path: '/admin' },
  { name: 'admin-residents', path: '/admin/residents' },
  { name: 'admin-settings', path: '/admin/settings' },
  { name: 'admin-editor', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef/content' },
  { name: 'admin-orders', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef/orders' },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const port = 9400 + Math.floor(Math.random() * 400)
const profileDir = await mkdtemp(join(tmpdir(), 'capture-pages-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let target
for (let attempt = 0; attempt < 50 && !target; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
    target = targets.find((candidate) => candidate.type === 'page')
  } catch {
    // Chrome is still starting.
  }
  if (!target) await wait(100)
}
if (!target) throw new Error('Chrome DevTools did not become ready')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const eventWaiters = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
    return
  }
  for (const waiter of eventWaiters.filter((candidate) => candidate.method === message.method)) {
    eventWaiters.splice(eventWaiters.indexOf(waiter), 1)
    waiter.resolve(message.params)
  }
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const nextEvent = (method) => new Promise((resolve) => eventWaiters.push({ method, resolve }))
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value

const overflowProbe = `(() => {
  const root = document.documentElement
  const clipped = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflowX !== 'visible') return true
    }
    return false
  }
  const offenders = [...document.querySelectorAll('body *')].flatMap((element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || (rect.right <= root.clientWidth + 1 && rect.left >= -1) || clipped(element)) return []
    return [{ tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right) }]
  }).slice(0, 12)
  return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders }
})()`

await send('Page.enable')
await mkdir(outDir, { recursive: true })
const report = []
try {
  for (const page of pages) {
    for (const width of widths) {
      await send('Storage.clearDataForOrigin', { origin: new URL(baseUrl).origin, storageTypes: 'local_storage' })
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 })
      const loaded = nextEvent('Page.loadEventFired')
      await send('Page.navigate', { url: new URL(page.path, baseUrl).toString() })
      await Promise.race([loaded, wait(15000)])
      await wait(800)
      if (page.click) {
        const clicked = await evaluate(`(() => {
          const element = document.querySelector(${JSON.stringify(page.click)})
          if (!element) return false
          element.click()
          return true
        })()`)
        if (!clicked) throw new Error(`${page.name}: click target ${page.click} not found`)
        await wait(300)
      }
      const height = await evaluate('Math.min(document.documentElement.scrollHeight, 8000)')
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
      await wait(300)
      const overflow = await evaluate(overflowProbe)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const file = `${page.name}-${width}.png`
      await writeFile(join(outDir, file), Buffer.from(shot.data, 'base64'))
      report.push({ file, ...overflow })
      console.log(`${file}  scrollWidth=${overflow.scrollWidth}/${overflow.clientWidth}  offenders=${overflow.offenders.length}`)
    }
  }
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
} finally {
  socket.close()
  chrome.kill()
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
