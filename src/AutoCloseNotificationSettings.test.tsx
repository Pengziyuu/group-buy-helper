import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AutoCloseNotificationSettings from './AutoCloseNotificationSettings'

describe('AutoCloseNotificationSettings', () => {
  it('lets the signed-in organizer assign themselves without showing identities or another organizer list', async () => {
    const user = userEvent.setup()
    const onSelectCurrentUser = vi.fn().mockResolvedValue(undefined)
    render(<AutoCloseNotificationSettings state="unconfigured" onSelectCurrentUser={onSelectCurrentUser} />)

    expect(screen.getByRole('heading', { name: '自動結單通知' })).toBeInTheDocument()
    expect(screen.getByText('尚未設定通知團主。自動結單仍會完成，但設定前不會傳送LINE通知。')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '將我設為通知接收者' }))

    expect(onSelectCurrentUser).toHaveBeenCalledOnce()
    expect(await screen.findByText('已將你設為自動結單通知接收者。')).toBeInTheDocument()
  })

  it('shows when the current organizer already receives notifications', () => {
    render(<AutoCloseNotificationSettings state="current_user" onSelectCurrentUser={vi.fn()} />)

    expect(screen.getByText('目前由你的LINE帳號接收自動結單通知。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '你目前是通知接收者' })).toBeDisabled()
  })

  it('allows another approved organizer to take over without revealing who is currently selected', async () => {
    const user = userEvent.setup()
    const onSelectCurrentUser = vi.fn().mockResolvedValue(undefined)
    render(<AutoCloseNotificationSettings state="other_organizer" onSelectCurrentUser={onSelectCurrentUser} />)

    expect(screen.getByText('目前已由另一位已核准團主接收通知。')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/user id|auth|uuid/i)
    await user.click(screen.getByRole('button', { name: '改由我接收通知' }))
    expect(onSelectCurrentUser).toHaveBeenCalledOnce()
  })

  it('shows an accessible error and keeps retry available when saving fails', async () => {
    const user = userEvent.setup()
    const onSelectCurrentUser = vi.fn().mockRejectedValue(new Error('暫時無法儲存'))
    render(<AutoCloseNotificationSettings state="unconfigured" onSelectCurrentUser={onSelectCurrentUser} />)

    await user.click(screen.getByRole('button', { name: '將我設為通知接收者' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法儲存')
    expect(screen.getByRole('button', { name: '將我設為通知接收者' })).toBeEnabled()
  })
})
