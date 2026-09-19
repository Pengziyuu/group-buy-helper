import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const configPath = resolve(process.cwd(), 'vite.config.ts')

describe('vitest exclude globs', () => {
  it('prefixes every exclude glob with **/ so nested directories are excluded too', () => {
    // Without the **/ prefix these patterns only match at the project root,
    // so vitest's own defaults (which do have the prefix) get replaced by
    // patterns that miss nested node_modules -- e.g. an agent worktree
    // copies every test file a second time, silently doubling the suite and
    // reporting stale code as passing.
    const sql = readFileSync(configPath, 'utf8')
    const excludeMatch = sql.match(/exclude:\s*\[([^\]]*)\]/)
    expect(excludeMatch).not.toBeNull()

    const patterns = (excludeMatch?.[1] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    expect(patterns.length).toBeGreaterThan(0)
    for (const pattern of patterns) {
      expect(pattern).toMatch(/^['"]\*\*\//)
    }
  })
})
