import { useEffect, useState } from 'react'
import { describeAutoClose } from '../../domain/campaignSchedule'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import type { AutoCloseNotificationSettingState } from '../../services/autoCloseNotificationSettingsGateway'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { EmptyState } from '../ui/AsyncState'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { Menu, type MenuItem } from '../ui/Menu'
import { ProgressBar } from '../ui/ProgressBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { StatusBadge } from '../ui/StatusBadge'
import {
  campaignPhase, countCampaigns, filterCampaigns, formationProgress, sortCampaigns,
  type CampaignFilter, type CampaignPhase,
} from './campaignListView'
import { copyResidentLink } from './copyResidentLink'
import { OrganizerLink } from './OrganizerLink'
import { useOrganizerNavigate } from './organizerNavigation'

const PHASE_BADGES: Record<CampaignPhase, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  open: { label: '開團中', tone: 'success' },
  draft: { label: '草稿', tone: 'warning' },
  closed: { label: '已結單', tone: 'neutral' },
}
// Clicks on these keep their own behavior instead of opening the campaign row.
const ROW_ACTION_SELECTOR = 'a, button, input, select, textarea, label, [role="menu"]'

type OrganizerHomeProps = {
  campaigns: CampaignListItem[]
  autoCloseNotificationState?: AutoCloseNotificationSettingState
  unboundResidentCount?: number
  now?: Date
  onDelete?: (campaignId: string) => Promise<{ warning: string | null } | void>
  onCopyResidentLink?: (path: string) => Promise<void>
}

function CampaignThumb({ campaign }: { campaign: CampaignListItem }) {
  const image = campaign.images[0]
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [image?.src])
  if (image && !failed) {
    return <img className="organizer-thumb" src={image.src} alt="" loading="lazy" onError={() => setFailed(true)} />
  }
  return <span className="organizer-thumb organizer-thumb-empty" aria-hidden="true">無圖</span>
}

export function OrganizerHome({ campaigns, autoCloseNotificationState, unboundResidentCount = 0, now, onDelete, onCopyResidentLink }: OrganizerHomeProps) {
  const navigate = useOrganizerNavigate()
  const [visibleCampaigns, setVisibleCampaigns] = useState(campaigns)
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<CampaignListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteWarning, setDeleteWarning] = useState('')
  const [copyingId, setCopyingId] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')

  useEffect(() => { setVisibleCampaigns(campaigns) }, [campaigns])

  const counts = countCampaigns(visibleCampaigns)
  const rows = filterCampaigns(sortCampaigns(visibleCampaigns), filter)
  const today = now ?? new Date()
  const needsRecipient = autoCloseNotificationState === 'unconfigured'

  const copyLink = async (campaign: CampaignListItem) => {
    if (copyingId) return
    setCopyingId(campaign.id)
    setCopyFeedback('')
    setCopyError('')
    try {
      await copyResidentLink(`/campaign/${campaign.slug}`, onCopyResidentLink)
      setCopyFeedback(`已複製${campaign.title}住戶連結`)
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '複製住戶連結失敗')
    } finally {
      setCopyingId('')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await onDelete(deleteTarget.id)
      setVisibleCampaigns((current) => current.filter((campaign) => campaign.id !== deleteTarget.id))
      setDeleteTarget(null)
      setDeleteWarning(result?.warning ?? '')
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : '刪除團購失敗')
    } finally {
      setDeleting(false)
    }
  }

  const menuItems = (campaign: CampaignListItem, phase: CampaignPhase): MenuItem[] => [
    ...(phase === 'draft' ? [] : [{
      label: '查看住戶頁', ariaLabel: `查看住戶頁 ${campaign.title}`, href: `/campaign/${campaign.slug}`, target: '_blank',
    }]),
    ...(onDelete ? [{
      label: '刪除團購', ariaLabel: `刪除 ${campaign.title}`, tone: 'danger' as const,
      onSelect: () => { setDeleteError(''); setDeleteTarget(campaign) },
    }] : []),
  ]

  return (
    <main className="organizer-page organizer-home">
      <div className="organizer-page-heading">
        <h1>團購</h1>
        <SegmentedControl
          label="團購狀態篩選"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'open', label: '開團中', count: counts.open },
            { value: 'draft', label: '草稿', count: counts.draft },
            { value: 'closed', label: '已結單', count: counts.closed },
          ]}
        />
      </div>

      {(needsRecipient || unboundResidentCount > 0) && (
        <section className="organizer-attention" aria-label="待處理">
          <ul>
            {needsRecipient && <li>自動結單通知還沒有指定接收的團主<OrganizerLink href="/admin/settings">前往設定</OrganizerLink></li>}
            {unboundResidentCount > 0 && <li>{unboundResidentCount} 位住戶尚未填戶號<OrganizerLink href="/admin/residents?filter=unbound">查看住戶</OrganizerLink></li>}
          </ul>
        </section>
      )}

      {deleteWarning && <FeedbackMessage tone="warning">{deleteWarning}</FeedbackMessage>}
      {copyFeedback && <FeedbackMessage tone="success">{copyFeedback}</FeedbackMessage>}
      {copyError && <FeedbackMessage tone="error">{copyError}</FeedbackMessage>}

      {visibleCampaigns.length === 0 ? (
        <EmptyState title="建立第一團" description="按右上角的「建立新團」開始第一次團購。" />
      ) : rows.length === 0 ? (
        <p className="organizer-muted">此分類目前沒有團購。</p>
      ) : (
        <div className="organizer-table-wrap">
          <table className="organizer-table" aria-label="團購列表">
            <thead>
              <tr>
                <th scope="col">團購</th>
                <th scope="col">狀態</th>
                <th scope="col">成團進度</th>
                <th scope="col">訂單</th>
                <th scope="col">結單</th>
                <th scope="col">時間</th>
                <th scope="col"><span className="ui-visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((campaign) => {
                const phase = campaignPhase(campaign)
                const badge = PHASE_BADGES[phase]
                const progress = formationProgress(campaign)
                const closing = phase === 'closed' ? null : describeAutoClose(campaign.autoCloseAt, today)
                const href = `/admin/campaign/${campaign.id}`
                const items = menuItems(campaign, phase)
                return (
                  <tr key={campaign.id} className="organizer-table-row" onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest(ROW_ACTION_SELECTOR)) return
                    navigate(href)
                  }}>
                    <th scope="row">
                      <div className="organizer-campaign-cell">
                        <CampaignThumb campaign={campaign} />
                        <div>
                          <OrganizerLink className="organizer-row-link" href={href}>{campaign.title}</OrganizerLink>
                          {phase === 'draft' && <small>住戶看不到・尚未發布</small>}
                        </div>
                      </div>
                    </th>
                    <td data-label="狀態"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
                    <td data-label="成團進度">
                      {phase === 'draft' ? <span className="organizer-muted">發布後開始接單</span> : (
                        <div className="organizer-progress-cell">
                          <span className="ui-num">{progress.text}</span>
                          <ProgressBar label={`${campaign.title}成團進度`} value={progress.value} max={progress.max} />
                          <small className={progress.formed ? 'is-formed' : undefined}>{progress.statusText}</small>
                        </div>
                      )}
                    </td>
                    <td data-label="訂單" className="ui-num">{phase === 'draft' ? '—' : campaign.orderCount}</td>
                    <td data-label="結單">
                      {phase === 'closed' ? '—' : closing
                        ? <span className={closing.soon ? 'organizer-soon' : undefined}>{closing.when}</span>
                        : <span className="organizer-muted">未設定</span>}
                    </td>
                    <td data-label="時間" className="ui-num">
                      {phase === 'draft' || !campaign.openedAt
                        ? `最後編輯 ${formatZhTwTimestamp(campaign.updatedAt)}`
                        : formatZhTwTimestamp(campaign.openedAt)}
                    </td>
                    <td>
                      <div className="organizer-row-actions">
                        {phase !== 'draft' && (
                          <Button variant="utility" size="sm" aria-label={`複製住戶連結 ${campaign.title}`} disabled={Boolean(copyingId)} onClick={() => { void copyLink(campaign) }}>
                            {copyingId === campaign.id ? '複製中…' : '複製住戶連結'}
                          </Button>
                        )}
                        {items.length > 0 && <Menu size="sm" label={`更多操作 ${campaign.title}`} items={items} />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="確認刪除團購"
          confirmLabel="確認永久刪除"
          cancelLabel="取消刪除"
          busy={deleting}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
          onConfirm={() => { void confirmDelete() }}
        >
          <p>確定要刪除「{deleteTarget.title}」嗎？</p>
          <p>訂單及歷史資料都會永久刪除，無法復原。</p>
          {deleteError && <FeedbackMessage tone="error">{deleteError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </main>
  )
}
