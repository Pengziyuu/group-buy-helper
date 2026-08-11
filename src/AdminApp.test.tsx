import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import AdminApp from './AdminApp'

beforeEach(() => localStorage.clear())

describe('organizer campaign editor', () => {
  it('loads the current campaign into the editor and resident preview', () => {
    render(<AdminApp />)

    expect(screen.getByRole('heading', { name: '團主後台' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('一涼製冰所 超厚三明治冰餅')
    expect(screen.getByRole('spinbutton', { name: '單價' })).toHaveValue(45)
    expect(screen.getByRole('spinbutton', { name: '成團門檻' })).toHaveValue(100)
    expect(screen.getByRole('region', { name: '住戶端預覽' })).toHaveTextContent('炎炎夏日')
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
  })

  it('updates the resident preview and saves the campaign draft', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    const announcement = screen.getByRole('textbox', { name: '開團資訊' })
    await user.clear(announcement)
    await user.type(announcement, '新品到貨，數量有限！')

    expect(within(screen.getByRole('region', { name: '住戶端預覽' })).getByText('新品到貨，數量有限！')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '儲存草稿' }))
    expect(screen.getByRole('status')).toHaveTextContent('開團資料已儲存')
  })

  it('adds and removes campaign images with accessible descriptions', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    await user.type(screen.getByRole('textbox', { name: '圖片網址' }), '/second-product.svg')
    await user.type(screen.getByRole('textbox', { name: '圖片說明' }), '冰餅包裝與尺寸示意')
    await user.click(screen.getByRole('button', { name: '新增圖片' }))

    expect(screen.getByRole('img', { name: '冰餅包裝與尺寸示意' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移除 冰餅包裝與尺寸示意' }))
    expect(screen.queryByRole('img', { name: '冰餅包裝與尺寸示意' })).not.toBeInTheDocument()
  })

  it('keeps saved drafts private until the organizer publishes them', async () => {
    const user = userEvent.setup()
    const admin = render(<AdminApp />)
    const title = screen.getByRole('textbox', { name: '團購標題' })
    await user.clear(title)
    await user.type(title, '週末限定冰餅團')
    await user.click(screen.getByRole('button', { name: '儲存草稿' }))
    admin.unmount()

    const residentBeforePublish = render(<App />)
    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '週末限定冰餅團' })).not.toBeInTheDocument()
    residentBeforePublish.unmount()

    const reopenedAdmin = render(<AdminApp />)
    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('週末限定冰餅團')
    await user.click(screen.getByRole('button', { name: '發布到住戶端' }))
    reopenedAdmin.unmount()

    const publishedAdmin = render(<AdminApp />)
    expect(screen.getByText('已發布')).toBeInTheDocument()
    publishedAdmin.unmount()

    render(<App />)
    expect(screen.getByRole('heading', { name: '週末限定冰餅團' })).toBeInTheDocument()
  })
})
