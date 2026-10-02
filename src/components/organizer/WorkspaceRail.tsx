import { useState } from 'react'
import { normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { describeResidentSchedule } from '../resident/residentSchedule'
import { campaignStatusAction, campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { RelativeTime } from '../relativeTime'
import { campaignSectionPath, type WorkspaceSection } from '../../routing'
import type { CampaignImage } from '../../services/demoCampaignStore'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { StatusBadge } from '../ui/StatusBadge'
import { copyResidentLink } from './copyResidentLink'
import { OrganizerLink } from './OrganizerLink'
import { SaveTemplateDialog, type SaveTemplateActions } from './SaveTemplateDialog'
import { sectionUnavailableReason } from './workspaceSections'

export type WorkspaceCampaign = {
  id: string
  title: string
  status: CampaignStatus
  published: boolean
  coverImage: CampaignImage | null
  openedAt: string | null
  autoCloseAt?: string | null
  arrivalLabel?: string
  thresholdKind?: 'quantity' | 'amount'
  orderCount: number | null
  residentHref: string | null
}

type WorkspaceRailProps = {
  campaign: WorkspaceCampaign
  section: WorkspaceSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
  saveTemplate?: SaveTemplateActions
}

const STATUS_CONFIRMATIONS: Record<'open' | 'closed', { title: string; body: string; confirm: string }> = {
  closed: { title: '確認結單', body: '結單後住戶就不能再下單或修改訂單，之後仍可重新開放。', confirm: '確認結單' },
  open: { title: '確認重新開放', body: '重新開放後住戶可以再次下單與修改訂單。', confirm: '確認重新開放' },
}

// Pages for looking at the campaign, then pages for changing it, so organizers can tell them apart at a glance.
const NAV_GROUPS: Array<{ label: string; items: Array<{ section: WorkspaceSection; label: string }> }> = [
  { label: '查看', items: [{ section: 'orders', label: '訂單' }] },
  { label: '管理', items: [{ section: 'content', label: '內容設定' }, { section: 'pickup', label: '領取通知' }] },
]

const NAV_ICON_PATHS: Record<WorkspaceSection, string> = {
  overview: 'M5 20v-6M12 20V5M19 20v-10', // legacy route only
  orders: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  content: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  pickup: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0',
}

function NavIcon({ section }: { section: WorkspaceSection }) {
  return (
    <svg className="organizer-rail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={NAV_ICON_PATHS[section]} />
    </svg>
  )
}

export function WorkspaceRail({ campaign, section, now, onSetCampaignStatus, onCopyResidentLink, saveTemplate }: WorkspaceRailProps) {
  const [confirming, setConfirming] = useState(false)
  const [changing, setChanging] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateFeedback, setTemplateFeedback] = useState('')
  const action = campaignStatusAction(campaign.status)
  const confirmation = STATUS_CONFIRMATIONS[action.next === 'closed' ? 'closed' : 'open']
  const isOpen = campaign.status === 'open'
  // Same words residents read: a time, 額滿自動結單, or 手動決定結單.
  const closing = describeResidentSchedule(campaign, now ?? new Date()).closing
  const badge = !campaign.published
    ? { tone: 'warning' as const, label: '草稿' }
    : { tone: isOpen ? 'success' as const : 'neutral' as const, label: campaignStatusLabel(campaign.status) }

  const changeStatus = async () => {
    if (!onSetCampaignStatus || changing) return
    setChanging(true)
    setStatusError('')
    try {
      await onSetCampaignStatus(action.next)
      setConfirming(false)
    } catch (changeError) {
      setStatusError(changeError instanceof Error ? changeError.message : '更新團購狀態失敗')
    } finally {
      setChanging(false)
    }
  }

  const copyLink = async () => {
    if (!campaign.residentHref) return
    setCopyFeedback('')
    setCopyError('')
    try {
      await copyResidentLink(campaign.residentHref, onCopyResidentLink)
      setCopyFeedback('已複製住戶連結')
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '複製住戶連結失敗')
    }
  }

  return (
    <aside className="organizer-rail" aria-label="團購工作區">
      <OrganizerLink className="organizer-rail-back" href="/admin"><span aria-hidden="true">‹</span> 所有團購</OrganizerLink>
      <div className="organizer-rail-cover">
        {campaign.coverImage
          ? <img src={campaign.coverImage.src} alt={campaign.coverImage.alt} />
          : <span className="organizer-rail-cover-empty" role="img" aria-label={`${campaign.title}尚未設定圖片`}>尚未設定圖片</span>}
      </div>
      <h1 className="organizer-rail-title">{campaign.title}</h1>
      <div className="organizer-rail-status">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {campaign.published && onSetCampaignStatus && (
          <Button variant="secondary" size="sm" onClick={() => { setStatusError(''); setConfirming(true) }}>{action.label}</Button>
        )}
      </div>
      <dl className="organizer-rail-facts">
        {isOpen && <div><dt>結單</dt><dd>{closing?.value}</dd></div>}
        <div><dt>到貨</dt><dd>{normalizeArrivalLabel(campaign.arrivalLabel)}</dd></div>
        <div><dt>開團</dt><dd>{campaign.openedAt ? <RelativeTime value={campaign.openedAt} now={now ?? new Date()} /> : '尚未發布'}</dd></div>
      </dl>
      <nav className="organizer-rail-nav" aria-label="團購分區">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className="organizer-rail-group" role="group" aria-labelledby={`organizer-rail-group-${index}`}>
            <span id={`organizer-rail-group-${index}`} className="organizer-rail-group-label">{group.label}</span>
            {group.items.map((item) => {
              const reason = sectionUnavailableReason(item.section, campaign.status, campaign.published)
              if (reason) {
                return (
                  <span key={item.section} className="organizer-rail-link is-unavailable" title={`${item.label}：${reason}`}>
                    <NavIcon section={item.section} />{item.label}<small className="organizer-rail-reason">{reason}</small>
                  </span>
                )
              }
              const count = item.section === 'orders' ? campaign.orderCount : null
              return (
                <OrganizerLink
                  key={item.section}
                  className="organizer-rail-link"
                  href={campaignSectionPath(campaign.id, item.section)}
                  aria-current={section === item.section ? 'page' : undefined}
                >
                  <NavIcon section={item.section} />{item.label}{count !== null && <>{' '}<span className="ui-num organizer-rail-count">{count}</span></>}
                </OrganizerLink>
              )
            })}
          </div>
        ))}
      </nav>
      {saveTemplate && (
        <div className="organizer-rail-template">
          <Button variant="secondary" size="sm" onClick={() => { setTemplateFeedback(''); setSavingTemplate(true) }}>存成範本</Button>
          {templateFeedback && <FeedbackMessage tone="success">{templateFeedback}</FeedbackMessage>}
        </div>
      )}
      {savingTemplate && saveTemplate && (
        <SaveTemplateDialog
          {...saveTemplate}
          defaultName={campaign.title}
          onSaved={(saved) => setTemplateFeedback(`已存成範本「${saved.name}」`)}
          onClose={() => setSavingTemplate(false)}
        />
      )}
      {campaign.residentHref && (
        <div className="organizer-rail-share">
          <span>住戶連結</span>
          <Button variant="utility" size="sm" aria-label={`複製住戶連結 ${campaign.title}`} onClick={() => { void copyLink() }}>複製</Button>
          <a href={campaign.residentHref} target="_blank" rel="noreferrer">開啟住戶頁<span aria-hidden="true"> ↗</span></a>
        </div>
      )}
      {copyFeedback && <FeedbackMessage tone="success">{copyFeedback}</FeedbackMessage>}
      {copyError && <FeedbackMessage tone="error">{copyError}</FeedbackMessage>}
      {confirming && (
        <ConfirmDialog
          title={confirmation.title}
          confirmLabel={confirmation.confirm}
          destructive={false}
          busy={changing}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { void changeStatus() }}
        >
          <p>{confirmation.body}</p>
          {statusError && <FeedbackMessage tone="error">{statusError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </aside>
  )
}
