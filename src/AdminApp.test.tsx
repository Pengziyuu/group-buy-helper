import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import AdminApp from './AdminApp'
import type { CampaignContent } from './services/demoCampaignStore'

beforeEach(() => localStorage.clear())

describe('organizer campaign editor', () => {
  it('loads the current campaign into the editor and resident preview', () => {
    render(<AdminApp />)

    expect(screen.getByRole('heading', { name: '團主後台' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('一涼製冰所 超厚三明治冰餅')
    expect(screen.getByRole('spinbutton', { name: '品項 A 單價' })).toHaveValue(45)
    expect(screen.getByRole('spinbutton', { name: '成團門檻' })).toHaveValue(100)
    expect(screen.getByRole('region', { name: '住戶端預覽' })).toHaveTextContent('炎炎夏日')
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
  })

  it('prioritizes products and images before the long campaign announcement', () => {
    render(<AdminApp />)

    const itemEditor = screen.getByRole('heading', { name: '團購品項' }).closest('section')
    const imageEditor = screen.getByRole('heading', { name: '商品圖片' }).closest('section')
    const announcement = screen.getByRole('textbox', { name: '開團資訊' })

    expect(itemEditor).not.toBeNull()
    expect(imageEditor).not.toBeNull()
    expect(within(itemEditor!).getByRole('list')).toHaveClass('is-locked')
    expect(itemEditor!.compareDocumentPosition(imageEditor!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(imageEditor!.compareDocumentPosition(announcement)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(announcement).toHaveAttribute('rows', '10')
  })

  it('lets the organizer expand and collapse the full resident preview', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    const expand = screen.getByRole('button', { name: '展開完整預覽' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)
    expect(screen.getByRole('button', { name: '收合完整預覽' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('separates campaign settings and order management into exclusive tabs', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)
    const tabs = screen.getByRole('tablist', { name: '團主工作區' })
    const settingsTab = within(tabs).getByRole('tab', { name: '開團設定' })
    const ordersTab = within(tabs).getByRole('tab', { name: '訂單管理' })

    expect(settingsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '訂單統計' })).not.toBeInTheDocument()

    await user.click(ordersTab)
    expect(ordersTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('查看訂單進度，處理付款狀態與訂單備註。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()

    await user.click(settingsTab)
    expect(settingsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '訂單統計' })).not.toBeInTheDocument()
  })

  it('uses the loaded campaign title for Excel export without a duplicate title prop', async () => {
    const user = userEvent.setup()
    render(<AdminApp campaignStatus="closed" />)

    await user.click(screen.getByRole('tab', { name: '訂單管理' }))
    expect(screen.getByRole('button', { name: '匯出成團明細' })).toBeEnabled()
  })

  it('supports keyboard navigation between organizer workspace tabs', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)
    const tabs = screen.getByRole('tablist', { name: '團主工作區' })
    const settingsTab = within(tabs).getByRole('tab', { name: '開團設定' })
    const ordersTab = within(tabs).getByRole('tab', { name: '訂單管理' })

    settingsTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(ordersTab).toHaveFocus()
    expect(ordersTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(settingsTab).toHaveFocus()
    expect(settingsTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowLeft}')
    expect(ordersTab).toHaveFocus()
    expect(ordersTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(settingsTab).toHaveFocus()
    expect(settingsTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    expect(ordersTab).toHaveFocus()
    expect(ordersTab).toHaveAttribute('aria-selected', 'true')
  })

  it('updates the resident preview and saves the campaign draft', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    const announcement = screen.getByRole('textbox', { name: '開團資訊' })
    await user.clear(announcement)
    await user.type(announcement, '新品到貨，數量有限！')

    expect(within(screen.getByRole('region', { name: '住戶端預覽' })).getByText('新品到貨，數量有限！')).toBeInTheDocument()
    expect(await screen.findByText('已自動暫存')).toBeInTheDocument()
  })

  it('lets mobile users clear and replace numeric fields without a leading zero', async () => {
    const user = userEvent.setup()
    render(<AdminApp initialContent={{
      title: '新團', unitPrice: 0, threshold: 1, announcement: '', images: [],
      items: [{ code: 'ITEM1', name: 'A', unitPrice: 0, active: true }], openedAt: null,
    }} initialPublicationState="draft" />)
    const price = screen.getByRole<HTMLInputElement>('spinbutton', { name: '品項 A 單價' })
    const threshold = screen.getByRole<HTMLInputElement>('spinbutton', { name: '成團門檻' })

    await user.clear(price)
    expect(price.value).toBe('')
    await user.type(price, '700')
    expect(price.value).toBe('700')

    await user.clear(threshold)
    expect(threshold.value).toBe('')
    await user.type(threshold, '70')
    expect(threshold.value).toBe('70')
  })

  it('keeps the existing formation threshold and lets the organizer switch it to total amount', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    expect(screen.getByRole('group', { name: '成團門檻' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '總金額' }))
    const amount = screen.getByRole<HTMLInputElement>('spinbutton', { name: '成團門檻金額' })
    await user.clear(amount)
    await user.type(amount, '5000')

    expect(within(screen.getByRole('region', { name: '住戶端預覽' })).getByText('滿 NT$ 5,000 成團')).toBeInTheDocument()
  })

  it('lets the organizer choose a common quantity unit and saves it with the draft', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    render(<AdminApp onSaveDraft={onSaveDraft} />)

    const unit = screen.getByRole('combobox', { name: '數量單位' })
    expect(unit).toHaveValue('個')
    expect(within(unit).getAllByRole('option').map((option) => option.textContent)).toEqual(
      expect.arrayContaining(['個', '盒', '包', '袋', '瓶', '罐', '組', '份', '條', '顆', '箱']),
    )

    await user.selectOptions(unit, '盒')
    expect(screen.getByText('結單：100 盒成團')).toBeInTheDocument()
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ quantityUnit: '盒' })))
  })

  it('lets the organizer enable resident custom items and saves the setting', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    const draft: CampaignContent = {
      title: '尚未開團', unitPrice: 45, threshold: 100, allowCustomItems: false,
      announcement: '公告', images: [], items: [{ code: 'A', name: '原味', unitPrice: 45, active: true }],
      openedAt: null,
    }
    render(<AdminApp initialContent={draft} initialPublicationState="draft" onSaveDraft={onSaveDraft} />)

    const toggle = screen.getByRole('checkbox', { name: '允許住戶新增額外品項' })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByText('可新增自訂額外品項，金額由團主另計')).not.toBeInTheDocument()

    await user.click(toggle)

    expect(within(screen.getByRole('region', { name: '住戶端預覽' })).getByText('可新增自訂額外品項，金額由團主另計')).toBeInTheDocument()
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalled())
    expect(onSaveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ allowCustomItems: true }))
  })

  it('locks the resident custom item setting after the campaign is first published', () => {
    const published: CampaignContent = {
      title: '已開團', unitPrice: 45, threshold: 100, allowCustomItems: true,
      announcement: '公告', images: [], items: [{ code: 'A', name: '原味', unitPrice: 45, active: true }],
      openedAt: '2026-09-11T00:00:00.000Z',
    }
    render(<AdminApp initialContent={published} initialPublicationState="published" />)

    expect(screen.getByRole('checkbox', { name: '允許住戶新增額外品項' })).toBeDisabled()
    expect(screen.getByText('正式開團後此設定不可變更。')).toBeInTheDocument()
  })

  it('adds and removes campaign images without requiring a visible description field', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    await user.type(screen.getByRole('textbox', { name: '圖片網址' }), '/second-product.svg')
    expect(screen.queryByRole('textbox', { name: '圖片說明' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增圖片' }))

    const addedImage = screen.getByRole('img', { name: /第 2 張商品圖片/ })
    expect(addedImage).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /移除 .*第 2 張商品圖片/ }))
    expect(addedImage).not.toBeInTheDocument()
  })

  it('keeps saved drafts private until the organizer publishes them', async () => {
    const user = userEvent.setup()
    const admin = render(<AdminApp />)
    const title = screen.getByRole('textbox', { name: '團購標題' })
    await user.clear(title)
    await user.type(title, '週末限定冰餅團')
    expect(await screen.findByText('已自動暫存')).toBeInTheDocument()
    admin.unmount()

    const residentBeforePublish = render(<App />)
    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '週末限定冰餅團' })).not.toBeInTheDocument()
    residentBeforePublish.unmount()

    const reopenedAdmin = render(<AdminApp />)
    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('週末限定冰餅團')
    await user.click(screen.getByRole('button', { name: '更新住戶公告' }))
    reopenedAdmin.unmount()

    const publishedAdmin = render(<AdminApp />)
    expect(screen.getByText('已發布')).toBeInTheDocument()
    publishedAdmin.unmount()

    render(<App />)
    expect(screen.getByRole('heading', { name: '週末限定冰餅團' })).toBeInTheDocument()
  })

  it('uses an async repository when running with Supabase content', async () => {
    const user = userEvent.setup()
    const content: CampaignContent = {
      title: 'Supabase 冰餅團',
      unitPrice: 50,
      threshold: 80,
      announcement: '資料庫公告',
      images: [{ src: '/remote.svg', alt: '資料庫商品圖' }],
      items: [{ code: 'A', name: '牛奶', active: true }],
      openedAt: '2026-08-12T00:00:00Z',
    }
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    const onPublish = vi.fn().mockResolvedValue(undefined)
    render(
      <AdminApp
        initialContent={content}
        initialPublicationState="published"
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
      />,
    )

    const title = screen.getByRole('textbox', { name: '團購標題' })
    await user.clear(title)
    await user.type(title, 'Supabase 草稿新版')
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ title: 'Supabase 草稿新版' })))
    expect(screen.getByRole('status')).toHaveTextContent('已自動暫存')

    await user.click(screen.getByRole('button', { name: '更新住戶公告' }))
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ title: 'Supabase 草稿新版' }))
    expect(screen.getByRole('status')).toHaveTextContent('住戶公告已更新')
  })

  it('shows the actual campaign workflow state in the resident preview', () => {
    render(<AdminApp campaignStatus="arrived" />)

    expect(screen.getByLabelText('住戶端預覽')).toHaveTextContent('已到貨')
    expect(screen.getByLabelText('住戶端預覽')).not.toHaveTextContent('● 開團中')
  })

  it('confirms the selected image without asking for a separate description', async () => {
    const user = userEvent.setup()
    render(<AdminApp onUploadImage={vi.fn().mockResolvedValue('http://storage.test/campaign/image.png')} />)
    const file = new File(['image'], '冰餅商品照.png', { type: 'image/png' })

    expect(screen.getByText('選擇圖片')).toBeInTheDocument()
    expect(screen.getByText('尚未選擇圖片')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('商品圖片檔案'), file)

    expect(screen.getByRole('status')).toHaveTextContent('已選擇「冰餅商品照.png」')
    expect(screen.getByText('冰餅商品照.png')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('請按「上傳圖片」')
    expect(screen.queryByRole('textbox', { name: '圖片說明' })).not.toBeInTheDocument()
  })

  it('accepts a mobile file picker that emits input without change', () => {
    render(<AdminApp onUploadImage={vi.fn().mockResolvedValue('http://storage.test/campaign/image.png')} />)
    const input = screen.getByLabelText<HTMLInputElement>('商品圖片檔案')
    const file = new File(['image'], 'Samsung照片.png', { type: 'image/png' })

    fireEvent.input(input, { target: { files: [file] } })

    expect(screen.getByRole('status')).toHaveTextContent('已選擇「Samsung照片.png」')
  })

  it('uploads a product image file and adds only its public URL to the preview', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn().mockResolvedValue('http://storage.test/campaign/image.png')
    render(<AdminApp onUploadImage={onUploadImage} />)
    const file = new File(['image'], '商品照.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('商品圖片檔案'), file)
    await user.click(screen.getByRole('button', { name: '上傳圖片' }))

    expect(onUploadImage).toHaveBeenCalledWith(file)
    expect(await screen.findByRole('img', { name: /第 2 張商品圖片/ })).toHaveAttribute(
      'src',
      'http://storage.test/campaign/image.png',
    )
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>('商品圖片檔案').files).toHaveLength(0)
  })

  it('blocks saving and publishing while an image upload is pending', async () => {
    const user = userEvent.setup()
    let finishUpload: ((url: string) => void) | undefined
    const onUploadImage = vi.fn().mockImplementation(() => new Promise<string>((resolve) => {
      finishUpload = resolve
    }))
    render(<AdminApp onUploadImage={onUploadImage} />)

    await user.upload(
      screen.getByLabelText('商品圖片檔案'),
      new File(['image'], '商品照.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: '上傳圖片' }))

    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeDisabled()
    expect(screen.getByLabelText('商品圖片檔案')).toBeDisabled()

    finishUpload?.('http://storage.test/campaign/pending.png')
    expect(await screen.findByRole('img', { name: /第 2 張商品圖片/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeEnabled()
  })

  it('keeps editing available but blocks publication while autosave is pending', async () => {
    const user = userEvent.setup()
    let finishSave: (() => void) | undefined
    const onSaveDraft = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      finishSave = resolve
    }))
    render(
      <AdminApp
        onSaveDraft={onSaveDraft}
        onUploadImage={vi.fn().mockResolvedValue('http://storage.test/unreachable.png')}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '修改')
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalled())
    expect(screen.getByLabelText('商品圖片檔案')).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeDisabled()

    finishSave?.()
    expect(await screen.findByText('已自動暫存')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeEnabled()
  })

  it('flushes edits made during an in-flight autosave before reporting success', async () => {
    const user = userEvent.setup()
    const resolvers: Array<() => void> = []
    const onSaveDraft = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      resolvers.push(resolve)
    }))
    render(<AdminApp onSaveDraft={onSaveDraft} />)

    const title = screen.getByRole('textbox', { name: '團購標題' })
    await user.type(title, '第一版')
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
    await user.type(title, '第二版')

    resolvers[0]?.()
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2), { timeout: 250 })
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeDisabled()
    expect(screen.getByRole('status')).not.toHaveTextContent('已自動暫存')
    expect(onSaveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ title: expect.stringContaining('第一版第二版') }))

    resolvers[1]?.()
    expect(await screen.findByText('已自動暫存')).toBeInTheDocument()
  })

  it('does not loop autosave retries after a failure without a new edit', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn().mockRejectedValue(new Error('網路中斷'))
    render(<AdminApp onSaveDraft={onSaveDraft} />)

    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '修改')
    expect(await screen.findByText('自動暫存失敗：網路中斷')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 700))
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
  })

  it('lets the organizer manually retry a failed autosave', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn()
      .mockRejectedValueOnce(new Error('網路中斷'))
      .mockResolvedValueOnce(undefined)
    render(<AdminApp onSaveDraft={onSaveDraft} />)

    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '待重試修改')
    expect(await screen.findByText('自動暫存失敗：網路中斷')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '立即重試暫存' }))

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('已自動暫存')).toBeInTheDocument()
  })

  it('edits item names and prices and continues labels after Z', async () => {
    const user = userEvent.setup()
    const content: CampaignContent = {
      title: '多品項團', unitPrice: 10, threshold: 10,
      announcement: '多口味商品', images: [],
      items: Array.from({ length: 26 }, (_, index) => ({
        code: `ITEM${index + 1}`,
        name: `口味${index + 1}`,
        unitPrice: 10 + index,
        active: true,
      })),
      openedAt: null,
    }
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    render(<AdminApp initialContent={content} orderSummary={null} onSaveDraft={onSaveDraft} />)

    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toHaveValue('口味1')
    expect(screen.getByRole('spinbutton', { name: '品項 A 單價' })).toHaveValue(10)
    expect(screen.queryByRole('spinbutton', { name: '單價' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' }))
    await user.type(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' }), '牛奶')
    await user.clear(screen.getByRole('spinbutton', { name: '品項 A 單價' }))
    await user.type(screen.getByRole('spinbutton', { name: '品項 A 單價' }), '45')
    const addItemButton = screen.getByRole('button', { name: '增加品項' })
    const removeItemButton = screen.getByRole('button', { name: '減少品項' })
    expect(addItemButton).toHaveClass('workflow-action-primary')
    expect(removeItemButton).toHaveClass('workflow-action-secondary')
    expect(addItemButton.querySelector('[aria-hidden="true"]')).toHaveTextContent('＋')
    expect(removeItemButton.querySelector('[aria-hidden="true"]')).toHaveTextContent('−')
    await user.click(addItemButton)

    expect(screen.getByText('AA')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '品項 AA 商品名稱（口味）' })).toBeInTheDocument()
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ code: 'ITEM1', name: '牛奶', unitPrice: 45 }),
      ]),
    })))
  })

  it('locks fallback items immediately after the first publication', async () => {
    const user = userEvent.setup()
    const content: CampaignContent = {
      title: '新團', unitPrice: 50, threshold: 10, announcement: 'A 商品', images: [],
      items: [{ code: '1', name: 'A', unitPrice: 50, active: true }], openedAt: null,
    }
    render(<AdminApp initialContent={content} orderSummary={null} />)

    await user.click(screen.getByRole('button', { name: '發布並開團' }))

    expect(screen.getByText('已正式開團，品項代碼、名稱與單價已鎖定。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeInTheDocument()
  })

  it('locks item structure and prices after the first opening', () => {
    const content: CampaignContent = {
      title: '已開團', unitPrice: 50, threshold: 10,
      announcement: 'A 牛奶、B 花生', images: [],
      items: [
        { code: 'A', name: '牛奶', unitPrice: 50, active: true },
        { code: 'B', name: '花生', unitPrice: 50, active: true },
      ],
      openedAt: '2026-08-14T00:05:00Z',
    }
    render(<AdminApp initialContent={content} orderSummary={null} />)

    expect(screen.getByText('已正式開團，品項代碼、名稱與單價已鎖定。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '增加品項' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '減少品項' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '品項 A 單價' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '成團門檻' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '開團資訊' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '儲存公告修改' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新住戶公告' })).toBeInTheDocument()
  })

  it('applies the canonical campaign returned by publication immediately', async () => {
    const user = userEvent.setup()
    const content: CampaignContent = {
      title: 'Canonical團', unitPrice: 50, threshold: 10, announcement: '', images: [],
      items: [{ code: 'KEEP', name: '保留口味', active: true }], openedAt: null,
    }
    const onPublish = vi.fn().mockResolvedValue({
      ...content,
      items: [
        { code: 'KEEP', name: '保留口味', active: true },
        { code: 'OLD', name: '歷史口味', active: false },
      ],
      openedAt: '2026-08-14T00:05:00Z',
    })
    render(<AdminApp initialContent={content} orderSummary={null} onPublish={onPublish} />)

    await user.click(screen.getByRole('button', { name: '發布並開團' }))

    expect(await screen.findByRole('textbox', { name: '品項 B 商品名稱（口味）' })).toHaveValue('歷史口味')
    expect(screen.getByText('已正式開團，品項代碼、名稱與單價已鎖定。')).toBeInTheDocument()
    expect(screen.getByText('已發布')).toBeInTheDocument()
  })
})
