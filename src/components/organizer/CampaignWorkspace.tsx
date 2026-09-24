import { useEffect, type ReactNode } from 'react'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath, type WorkspaceSection } from '../../routing'
import { useOrganizerNavigate } from './organizerNavigation'
import { WorkspaceRail, type WorkspaceCampaign } from './WorkspaceRail'

type CampaignWorkspaceProps = {
  campaign: WorkspaceCampaign
  requestedSection: WorkspaceSection | null
  section: WorkspaceSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
  children: ReactNode
}

export function CampaignWorkspace({ campaign, requestedSection, section, now, onSetCampaignStatus, onCopyResidentLink, children }: CampaignWorkspaceProps) {
  const navigate = useOrganizerNavigate()

  useEffect(() => {
    // Replace, not push: Back must not return to an address that redirects again.
    if (requestedSection !== section) navigate(campaignSectionPath(campaign.id, section), { replace: true })
  }, [campaign.id, navigate, requestedSection, section])

  return (
    <div className="organizer-workspace">
      <WorkspaceRail campaign={campaign} section={section} now={now} onSetCampaignStatus={onSetCampaignStatus} onCopyResidentLink={onCopyResidentLink} />
      <main className="organizer-workspace-main">{children}</main>
    </div>
  )
}
