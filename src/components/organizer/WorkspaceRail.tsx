import { useState } from 'react'
import { describeAutoClose, normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { campaignStatusAction, campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { campaignSectionPath } from '../../routing'
import type { CampaignImage } from '../../services/demoCampaignStore'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { StatusBadge } from '../ui/StatusBadge'
import { copyResidentLink } from './copyResidentLink'
import { OrganizerLink } from './OrganizerLink'
import { sectionUnavailableReason, type ShownSection } from './workspaceSections'

export type WorkspaceCampaign = {
  id: string
  title: string
  status: CampaignStatus
  published: boolean
  coverImage: CampaignImage | null
  openedAt: string | null
  autoCloseAt?: string | null
  arrivalLabel?: string
  orderCount: number | null
  residentHref: string | null
}

type WorkspaceRailProps = {
  campaign: WorkspaceCampaign
  section: ShownSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
}

const STATUS_CONFIRMATIONS: Record<'open' | 'closed', { title: string; body: string; confirm: string }> = {
  closed: { title: '確認結單', body: '結單後住戶就不能再下單或修改訂單，之後仍可重新開放。', confirm: '確認結單' },
  open: { title: '確認重新開放', body: '重新開放後住戶可以再次下單與修改訂單。', confirm: '確認重新開放' },
}

const NAV_ITEMS: Array<{ section: ShownSection; label: string }> = [
  { section: 'orders', label: '訂單' },
  { section: 'content', label: '內容設定' },
  { section: 'pickup', label: '領取通知' },
]

export function WorkspaceRail({ campaign, section, now, onSetCampaignStatus, onCopyResidentLink }: WorkspaceRailProps) {
  const [confirming, setConfirming] = useState(false)
  const [changing, setChanging] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')
  const action = campaignStatusAction(campaign.status)
  const confirmation = STATUS_CONFIRMATIONS[action.next === 'closed' ? 'closed' : 'open']
  const isOpen = campaign.status === 'open'
  const closing = describeAutoClose(campaign.autoCloseAt, now ?? new Date())
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
        {isOpen && <div><dt>結單</dt><dd>{closing ? closing.when : '未設定'}</dd></div>}
        <div><dt>到貨</dt><dd>{normalizeArrivalLabel(campaign.arrivalLabel)}</dd></div>
        <div><dt>開團</dt><dd>{campaign.openedAt ? formatZhTwTimestamp(campaign.openedAt) : '尚未發布'}</dd></div>
      </dl>
      <nav className="organizer-rail-nav" aria-label="團購分區">
        {NAV_ITEMS.map((item) => {
          const reason = sectionUnavailableReason(item.section, campaign.status, campaign.published)
          if (reason) {
            return (
              <span key={item.section} className="organizer-rail-link is-unavailable">
                {item.label}<small>{reason}</small>
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
              {item.label}{count !== null && <>{' '}<span className="ui-num">{count}</span></>}
            </OrganizerLink>
          )
        })}
      </nav>
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
