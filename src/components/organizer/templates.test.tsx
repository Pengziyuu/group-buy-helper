import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignTemplate, CampaignTemplateContent } from '../../domain/campaignTemplate'
import { CampaignWorkspace } from './CampaignWorkspace'
import { rememberCampaignNotice } from './campaignNotices'
import { OrganizerNavigationProvider } from './OrganizerLink'
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
