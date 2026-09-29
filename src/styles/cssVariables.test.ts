import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = join(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(css|tsx?)$/.test(entry) ? [path] : []
  })
}

describe('CSS custom properties', () => {
  // One undefined var() invalidates the whole declaration, e.g. a padding shorthand collapses to 0.
  it('references only variables that some stylesheet defines', () => {
    const files = sourceFiles(sourceRoot)
    const defined = new Set(files.filter((file) => file.endsWith('.css'))
      .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1])))
    const undefinedReferences = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)\)/g)]
        .map((match) => match[1])
        .filter((name) => !defined.has(name))
        .map((name) => `${file.slice(sourceRoot.length + 1)}: ${name}`))
    expect(undefinedReferences).toEqual([])
  })
})
