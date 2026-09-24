import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerSettings } from './OrganizerSettings'

function renderSettings(props: Partial<Parameters<typeof OrganizerSettings>[0]> = {}) {
  render(<OrganizerNavigationProvider navigate={vi.fn()}><OrganizerSettings {...props} /></OrganizerNavigationProvider>)
}

describe('OrganizerSettings', () => {
  it('lets the signed-in approved organizer make themselves the sole notification recipient', async () => {
    const user = userEvent.setup()
    const onSelectCurrentUser = vi.fn().mockResolvedValue(undefined)
    renderSettings({ autoCloseNotificationState: 'other_organizer', onSelectCurrentUserForAutoCloseNotification: onSelectCurrentUser })

    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '自動結單通知' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '改由我接收通知' }))
    await waitFor(() => expect(onSelectCurrentUser).toHaveBeenCalledOnce())
  })

  it('links to the isolated notification lab', () => {
    renderSettings()
    expect(screen.getByRole('link', { name: '開啟通知測試中心' })).toHaveAttribute('href', '/admin/notification-lab')
  })

  it('signs the organizer out from the account section', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn().mockResolvedValue(undefined)
    renderSettings({ onSignOut })

    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('shows an error when sign-out fails', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn().mockRejectedValue(new Error('network down'))
    renderSettings({ onSignOut })

    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('登出失敗：network down')
    expect(screen.getByRole('button', { name: '登出' })).toBeEnabled()
  })
})
