import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LinkifiedText from './LinkifiedText'

describe('LinkifiedText', () => {
  it('turns HTTP(S) URLs into safe new-tab links without swallowing punctuation', () => {
    render(<p><LinkifiedText text={'商品頁：https://example.com/item/1。\n備用 http://example.org/path，請查看。'} /></p>)

    expect(screen.getByRole('link', { name: 'https://example.com/item/1' })).toHaveAttribute('href', 'https://example.com/item/1')
    expect(screen.getByRole('link', { name: 'http://example.org/path' })).toHaveAttribute('href', 'http://example.org/path')
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(screen.getByText(/。\s*備用/u)).toBeInTheDocument()
  })

  it('keeps non-HTTP schemes as plain text', () => {
    render(<p><LinkifiedText text="javascript:alert(1) ftp://example.com" /></p>)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/javascript:alert\(1\)/u)).toBeInTheDocument()
  })
})
