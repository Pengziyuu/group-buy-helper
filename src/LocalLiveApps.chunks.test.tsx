import { expect, it, vi } from 'vitest'

vi.mock('./App', () => { throw new Error('住戶詳情不應隨 Live 列表載入') })
vi.mock('./AdminApp', () => { throw new Error('團主編輯器不應隨 Live 列表載入') })

it('keeps the resident detail and organizer editor out of the Live shell import', async () => {
  const { LocalLiveResidentApp, LocalLiveAdminApp } = await import('./LocalLiveApps')
  expect(LocalLiveResidentApp).toBeTypeOf('function')
  expect(LocalLiveAdminApp).toBeTypeOf('function')
})
