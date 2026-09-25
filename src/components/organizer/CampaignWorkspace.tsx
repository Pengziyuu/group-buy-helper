import { useEffect, useState, type ReactNode } from 'react'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath, type WorkspaceSection } from '../../routing'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { clearCampaignNotice, peekCampaignNotice } from './campaignNotices'
import { useOrganizerNavigate } from './organizerNavigation'
import type { SaveTemplateActions } from './SaveTemplateDialog'
import { WorkspaceRail, type WorkspaceCampaign } from './WorkspaceRail'

type CampaignWorkspaceProps = {
  campaign: WorkspaceCampaign
  requestedSection: WorkspaceSection | null
  section: WorkspaceSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
  saveTemplate?: SaveTemplateActions
  children: ReactNode
}

export function CampaignWorkspace({ campaign, requestedSection, section, now, onSetCampaignStatus, onCopyResidentLink, saveTemplate, children }: CampaignWorkspaceProps) {
  const navigate = useOrganizerNavigate()

  // StrictMode runs initializers twice, so read here and clear in an effect rather than taking in one step.
  const [notice] = useState(() => peekCampaignNotice(campaign.id))
  useEffect(() => { clearCampaignNotice(campaign.id) }, [campaign.id])

  useEffect(() => {
    // Replace, not push: Back must not return to an address that redirects again.
    if (requestedSection !== section) navigate(campaignSectionPath(campaign.id, section), { replace: true })
  }, [campaign.id, navigate, requestedSection, section])

  return (
    <div className="organizer-workspace">
      <WorkspaceRail campaign={campaign} section={section} now={now} onSetCampaignStatus={onSetCampaignStatus} onCopyResidentLink={onCopyResidentLink} saveTemplate={saveTemplate} />
      <main className="organizer-workspace-main">
        {notice && <FeedbackMessage tone="warning" className="organizer-workspace-notice">{notice}</FeedbackMessage>}
        {children}
      </main>
    </div>
  )
}
