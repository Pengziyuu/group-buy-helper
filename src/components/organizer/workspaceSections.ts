import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { WorkspaceSection } from '../../routing'

// Drafts only have content settings; a bare address opens where the organizer works next:
// the overview while taking orders, the order list once closed.
export function resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean, status: CampaignStatus): WorkspaceSection {
  if (!published) return 'content'
  if (requested === null) return status === 'open' ? 'overview' : 'orders'
  return requested
}

export function sectionUnavailableReason(section: WorkspaceSection, status: CampaignStatus, published: boolean): string | null {
  if (section === 'content') return null
  if (!published) return '發布後可用'
  if (section === 'pickup' && status === 'open') return '結單後才能使用'
  return null
}
