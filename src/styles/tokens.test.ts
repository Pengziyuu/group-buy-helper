import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const tokens: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()]),
)

function luminance(hex: string) {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits.slice(0, 6)
  const [red, green, blue] = [0, 2, 4]
    .map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('design tokens', () => {
  it('uses the single DESIGN.md action blue and its focus ring', () => {
    expect(tokens['color-primary']).toBe('#0066cc')
    expect(tokens['color-focus']).toBe('#0071e3')
    expect(tokens['color-text']).toBe('#1d1d1f')
    expect(tokens['color-bg']).toBe('#f5f5f7')
  })

  it('declares no decorative gradients or UI shadows', () => {
    expect(css).not.toMatch(/gradient\(/)
    expect(css).toMatch(/--shadow-sticky:\s*none;/)
    expect(css).toMatch(/--shadow-dialog:\s*none;/)
  })

  it.each([
    ['color-text', 'color-bg'],
    ['color-text', 'color-surface'],
    ['color-text-secondary', 'color-surface'],
    ['color-text-secondary', 'color-bg'],
    ['color-text-secondary', 'color-surface-subtle'],
    ['color-text-tertiary', 'color-surface'],
    ['color-text-tertiary', 'color-bg'],
    ['color-primary', 'color-surface'],
    ['color-primary', 'color-primary-subtle'],
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
    ['color-on-primary', 'color-danger'],
    ['color-success', 'color-success-subtle'],
    ['color-warning', 'color-warning-subtle'],
    ['color-danger', 'color-danger-subtle'],
    ['color-danger', 'color-surface'],
    ['color-neutral', 'color-neutral-subtle'],
    ['color-on-primary', 'color-text'],
    ['color-primary-on-dark', 'color-text'],
  ])('keeps %s on %s at 4.5:1 or better', (foreground, background) => {
    expect(tokens[foreground], foreground).toBeDefined()
    expect(tokens[background], background).toBeDefined()
    expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(4.5)
  })
})
