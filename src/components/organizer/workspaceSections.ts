import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { WorkspaceSection } from '../../routing'

// Drafts only have content settings; published campaigns open their unified orders page.
// Preserve old /overview links by replacing them with /orders in CampaignWorkspace.
export function resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean, _status: CampaignStatus): WorkspaceSection {
  if (!published) return 'content'
  if (requested === null || requested === 'overview') return 'orders'
  return requested
}

export function sectionUnavailableReason(section: WorkspaceSection, status: CampaignStatus, published: boolean): string | null {
  if (section === 'content') return null
  if (!published) return '發布後可用'
  if (section === 'pickup' && status === 'open') return '結單後才能使用'
  return null
}
