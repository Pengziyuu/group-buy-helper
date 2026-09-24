import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { WorkspaceSection } from '../../routing'

export type ShownSection = Exclude<WorkspaceSection, 'overview'>

// Phase 3 has no overview yet, so published campaigns open on their orders.
export function resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean): ShownSection {
  if (!published) return 'content'
  if (requested === null || requested === 'overview') return 'orders'
  return requested
}

export function sectionUnavailableReason(section: ShownSection, status: CampaignStatus, published: boolean): string | null {
  if (section === 'content') return null
  if (!published) return '發布後可用'
  if (section === 'pickup' && status === 'open') return '結單後才能使用'
  return null
}
