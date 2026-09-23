import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBrowserLocation } from './organizerNavigation'
import { OrganizerLink, OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerShell } from './OrganizerShell'

function LocationHarness() {
  const [location, navigate] = useBrowserLocation({ pathname: '/admin', search: '' })
  return (
    <OrganizerNavigationProvider navigate={navigate}>
      <p data-testid="location">{location.pathname}{location.search}</p>
      <OrganizerLink href="/admin/residents?filter=unbound">住戶</OrganizerLink>
    </OrganizerNavigationProvider>
  )
}

function renderShell(props: Partial<Parameters<typeof OrganizerShell>[0]> = {}) {
  const navigate = vi.fn()
  render(
    <OrganizerNavigationProvider navigate={navigate}>
      <OrganizerShell current="campaigns" {...props}><main><h1>頁面內容</h1></main></OrganizerShell>
    </OrganizerNavigationProvider>,
  )
  return navigate
}

afterEach(() => { window.history.replaceState(null, '', '/') })

describe('organizer navigation', () => {
  it('moves between organizer pages without reloading and follows the browser history', async () => {
    const user = userEvent.setup()
    render(<LocationHarness />)

    await user.click(screen.getByRole('link', { name: '住戶' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/residents?filter=unbound')
    expect(window.location.pathname).toBe('/admin/residents')

    act(() => {
      window.history.pushState(null, '', '/admin/settings')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/settings')
  })

  it('leaves modified clicks to the browser so organizers can open a new tab', () => {
    const navigate = vi.fn()
    render(<OrganizerNavigationProvider navigate={navigate}><OrganizerLink href="/admin/settings">設定</OrganizerLink></OrganizerNavigationProvider>)
    let handledByLink = true
    const guard = (event: Event) => {
      handledByLink = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', guard)
    fireEvent.click(screen.getByRole('link', { name: '設定' }), { ctrlKey: true })
    document.removeEventListener('click', guard)

    expect(handledByLink).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('OrganizerShell', () => {
  it('shows the organizer navigation with the current page marked', () => {
    renderShell({ current: 'residents' })
    const nav = screen.getByRole('navigation', { name: '團主後台' })
    expect(nav).toContainElement(screen.getByRole('link', { name: '團購' }))
    expect(screen.getByRole('link', { name: '團購' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/admin/settings')
    expect(screen.getByRole('link', { name: '團購小幫手' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('heading', { name: '頁面內容' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立新團' })).not.toBeInTheDocument()
  })

  it('creates a campaign from any page and opens its content settings', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue({ id: 'new-id' })
    const navigate = renderShell({ onCreate })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    const title = screen.getByRole('textbox', { name: '團購標題' })
    expect(title).toHaveFocus()
    expect(title).toHaveValue('未命名團購')
    await user.clear(title)
    expect(screen.getByRole('button', { name: '建立並編輯' })).toBeDisabled()
    await user.type(title, '週末麵包團')
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('週末麵包團'))
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/new-id/content')
    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps the create dialog open with the error when creation fails', async () => {
    const user = userEvent.setup()
    const navigate = renderShell({ onCreate: vi.fn().mockRejectedValue(new Error('建立團購失敗：permission denied')) })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('建立團購失敗：permission denied')
    expect(screen.getByRole('dialog', { name: '建立新團' })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closes the create dialog with Escape and returns focus to its button', async () => {
    const user = userEvent.setup()
    renderShell({ onCreate: vi.fn() })
    const open = screen.getByRole('button', { name: '建立新團' })

    await user.click(open)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '建立新團' })).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })
})
