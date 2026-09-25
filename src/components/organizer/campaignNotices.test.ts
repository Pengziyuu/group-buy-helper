import { describe, expect, it } from 'vitest'
import { clearCampaignNotice, noticeForTemplateResult, peekCampaignNotice, rememberCampaignNotice } from './campaignNotices'

describe('campaign notices', () => {
  it('keeps a notice for a campaign until it is cleared', () => {
    rememberCampaignNotice('c1', '有 1 張範本圖片沒有複製成功，請重新加入')
    expect(peekCampaignNotice('c1')).toBe('有 1 張範本圖片沒有複製成功，請重新加入')
    expect(peekCampaignNotice('c1')).toBe('有 1 張範本圖片沒有複製成功，請重新加入')
    clearCampaignNotice('c1')
    expect(peekCampaignNotice('c1')).toBeNull()
  })

  it('describes what went wrong when creating from a template', () => {
    expect(noticeForTemplateResult({ id: 'c', missingImages: 0, contentError: null })).toBeNull()
    expect(noticeForTemplateResult({ id: 'c', missingImages: 2, contentError: null })).toBe('有 2 張範本圖片沒有複製成功，請重新加入')
    expect(noticeForTemplateResult({ id: 'c', missingImages: 2, contentError: 'network' })).toBe('範本內容沒有完整帶入：network')
  })
})
