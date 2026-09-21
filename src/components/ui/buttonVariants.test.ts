import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(process.cwd(), 'src')

function sourceFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => join(srcDir, path))
}

describe('button variants', () => {
  it('keeps the solid danger button inside the confirmation dialog', () => {
    const users = sourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes("'danger-solid'"))
      .map((file) => relative(srcDir, file).replaceAll('\\', '/'))
      .sort()

    expect(users).toEqual(['components/ui/Button.tsx', 'components/ui/ConfirmDialog.tsx'])
  })
})
