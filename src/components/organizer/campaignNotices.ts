import type { CreateFromTemplateResult } from '../../domain/campaignTemplate'

// Carries a one-off notice from the create dialog to the new campaign's workspace within this page session.
const notices = new Map<string, string>()

export function rememberCampaignNotice(campaignId: string, text: string): void {
  notices.set(campaignId, text)
}

export function peekCampaignNotice(campaignId: string): string | null {
  return notices.get(campaignId) ?? null
}

export function clearCampaignNotice(campaignId: string): void {
  notices.delete(campaignId)
}

export function noticeForTemplateResult(result: CreateFromTemplateResult): string | null {
  if (result.contentError) return `範本內容沒有完整帶入：${result.contentError}`
  if (result.missingImages > 0) return `有 ${result.missingImages} 張範本圖片沒有複製成功，請重新加入`
  return null
}
