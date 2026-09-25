import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignTemplate, CampaignTemplateContent } from '../../domain/campaignTemplate'
import { CampaignWorkspace } from './CampaignWorkspace'
import { rememberCampaignNotice } from './campaignNotices'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerSettings } from './OrganizerSettings'
import type { WorkspaceCampaign } from './WorkspaceRail'

const templateContent: CampaignTemplateContent = {
  title: '一涼冰餅', announcement: '公告', images: [],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: false }],
  unitPrice: 45, threshold: 100, thresholdKind: 'quantity', amountThreshold: null, quantityUnit: '個',
  baseDiscountRate: 1, mixMatchDiscount: null, allowCustomItems: false,
}
const template = (id: string, name: string): CampaignTemplate => ({ id, name, content: templateContent, updatedAt: '2026-09-24T02:00:00.000Z' })

const campaign: WorkspaceCampaign = {
  id: 'campaign-1', title: '十月冰餅團', status: 'open', published: true, coverImage: null,
  openedAt: '2026-09-20T00:00:00.000Z', orderCount: 3, residentHref: '/campaign/abc',
}

function renderWorkspace(saveTemplate?: Parameters<typeof CampaignWorkspace>[0]['saveTemplate'], target = campaign) {
  return render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <CampaignWorkspace campaign={target} requestedSection="overview" section="overview" saveTemplate={saveTemplate}>
        <p>分區內容</p>
      </CampaignWorkspace>
    </OrganizerNavigationProvider>,
  )
}

describe('save as template', () => {
  it('saves the campaign as a new template named after it by default', async () => {
    const user = userEvent.setup()
    const saveNew = vi.fn(async (name: string) => template('t9', name))
    renderWorkspace({ loadTemplates: vi.fn(async () => []), saveNew, replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    expect(within(dialog).getByRole('textbox', { name: '範本名稱' })).toHaveValue('十月冰餅團')
    expect(within(dialog).getByText(/會使用這一團已儲存的內容/)).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: '取代既有範本' })).toBeDisabled())

    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(saveNew).toHaveBeenCalledWith('十月冰餅團')
    expect(screen.queryByRole('dialog', { name: '存成範本' })).not.toBeInTheDocument()
    expect(screen.getByText('已存成範本「十月冰餅團」')).toBeInTheDocument()
  })

  it('stops a duplicate name before saving', async () => {
    const user = userEvent.setup()
    const saveNew = vi.fn()
    renderWorkspace({ loadTemplates: vi.fn(async () => [template('t1', '十月冰餅團')]), saveNew, replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('已經有叫「十月冰餅團」的範本')
    expect(within(dialog).getByRole('button', { name: '儲存範本' })).toBeDisabled()
    expect(saveNew).not.toHaveBeenCalled()
  })

  it('replaces a chosen template', async () => {
    const user = userEvent.setup()
    const replace = vi.fn(async (id: string) => template(id, '包子'))
    renderWorkspace({ loadTemplates: vi.fn(async () => [template('t1', '冰餅'), template('t2', '包子')]), saveNew: vi.fn(), replace })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.click(await within(dialog).findByRole('radio', { name: '取代既有範本' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '要取代的範本' }), 't2')
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(replace).toHaveBeenCalledWith('t2')
    expect(screen.getByText('已存成範本「包子」')).toBeInTheDocument()
  })

  it('keeps the dialog open with the reason when saving fails', async () => {
    const user = userEvent.setup()
    renderWorkspace({ loadTemplates: vi.fn(async () => []), saveNew: vi.fn(async () => { throw new Error('存成範本失敗：copy failed') }), replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(await within(dialog).findByText('存成範本失敗：copy failed')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '儲存範本' })).toBeEnabled()
  })

  it('offers no template button when templates are not available', () => {
    renderWorkspace(undefined)
    expect(screen.queryByRole('button', { name: '存成範本' })).not.toBeInTheDocument()
  })

  it('shows a notice left by creating the campaign from a template, once', () => {
    rememberCampaignNotice('campaign-2', '有 1 張範本圖片沒有複製成功，請重新加入')
    const target = { ...campaign, id: 'campaign-2' }
    const { unmount } = renderWorkspace(undefined, target)
    expect(screen.getByText('有 1 張範本圖片沒有複製成功，請重新加入')).toBeInTheDocument()
    unmount()

    renderWorkspace(undefined, target)
    expect(screen.queryByText('有 1 張範本圖片沒有複製成功，請重新加入')).not.toBeInTheDocument()
  })
})

describe('template settings', () => {
  const actions = (templates: CampaignTemplate[]) => ({
    list: vi.fn(async () => templates),
    rename: vi.fn(async (id: string, name: string) => ({ ...templates.find((item) => item.id === id)!, name })),
    remove: vi.fn(async () => ({ warning: null })),
  })

  it('lists templates with item counts and update times, and explains when there are none', async () => {
    const { unmount } = render(<OrganizerSettings templateActions={actions([template('t1', '冰餅')])} />)
    const section = screen.getByRole('region', { name: '團購範本' })
    const row = (await within(section).findByRole('rowheader', { name: '冰餅' })).closest('tr') as HTMLElement
    expect(within(row).getByText('1 個')).toBeInTheDocument()
    expect(within(row).getByText('2026/09/24 10:00')).toBeInTheDocument()
    unmount()

    render(<OrganizerSettings templateActions={actions([])} />)
    expect(await screen.findByText('還沒有範本。在團購工作區按「存成範本」就會出現在這裡。')).toBeInTheDocument()
  })

  it('renames a template in place and blocks a duplicate name', async () => {
    const user = userEvent.setup()
    const templateActions = actions([template('t1', '冰餅'), template('t2', '包子')])
    render(<OrganizerSettings templateActions={templateActions} />)

    await user.click(await screen.findByRole('button', { name: '改名 冰餅' }))
    const input = screen.getByRole('textbox', { name: '冰餅 的新名稱' })
    await user.clear(input)
    await user.type(input, ' 包子 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('已經有叫「包子」的範本')
    expect(templateActions.rename).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '冰餅（每月）{Enter}')
    expect(templateActions.rename).toHaveBeenCalledWith('t1', '冰餅（每月）')
    expect(await screen.findByRole('rowheader', { name: '冰餅（每月）' })).toBeInTheDocument()
  })

  it('deletes a template after confirmation', async () => {
    const user = userEvent.setup()
    const templateActions = actions([template('t1', '冰餅')])
    render(<OrganizerSettings templateActions={templateActions} />)

    await user.click(await screen.findByRole('button', { name: '刪除 冰餅' }))
    const dialog = screen.getByRole('dialog', { name: '刪除範本' })
    expect(dialog).toHaveTextContent('刪除範本「冰餅」？已用這個範本建立的團購不受影響。')
    await user.click(within(dialog).getByRole('button', { name: '刪除範本' }))

    expect(templateActions.remove).toHaveBeenCalledWith('t1')
    expect(await screen.findByText('已刪除範本「冰餅」')).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: '冰餅' })).not.toBeInTheDocument()
  })

  it('offers a retry when the list cannot be read', async () => {
    const user = userEvent.setup()
    const list = vi.fn().mockRejectedValueOnce(new Error('讀取範本失敗：network')).mockResolvedValue([template('t1', '冰餅')])
    render(<OrganizerSettings templateActions={{ list, rename: vi.fn(), remove: vi.fn() }} />)

    expect(await screen.findByText('讀取範本失敗：network')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('rowheader', { name: '冰餅' })).toBeInTheDocument()
  })
})
