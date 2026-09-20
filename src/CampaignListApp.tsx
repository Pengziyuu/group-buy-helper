import { useEffect, useState, type FormEvent } from 'react'
import { campaignStatusLabel } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import { formatArrivalLabel, formatAutoCloseReminder } from './domain/campaignSchedule'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { HouseholdKind } from './domain/household'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import type { ResidentMember } from './services/residentMemberManagementGateway'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { ProgressBar } from './components/ui/ProgressBar'
import './CampaignListApp.css'

type CampaignListAppProps = {
  campaigns: CampaignListItem[]
  onCreate: (title: string) => Promise<CampaignListItem>
  onDelete?: (campaignId: string) => Promise<{ warning: string | null } | void>
  onNavigate?: (path: string) => void
  onSignOut?: () => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
  residentMembers?: ResidentMember[]
  onSetResidentBlocked?: (memberCode: string, blocked: boolean) => Promise<void>
  onUpdateResidentHousehold?: (memberCode: string, household: { kind: HouseholdKind; period: number | null; unit: string | null }) => Promise<void>
}

const currencyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
})

function CampaignCardCover({ campaign }: { campaign: CampaignListItem }) {
  const image = campaign.images[0]
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [image?.src])

  return (
    <div className="campaign-card-cover">
      {image && !failed
        ? <>
            <img className="campaign-card-cover-backdrop" src={image.src} alt="" aria-hidden="true" loading="lazy" />
            <img className="campaign-card-cover-foreground" src={image.src} alt={image.alt} loading="lazy" onError={() => setFailed(true)} />
          </>
        : <div className="campaign-card-cover-fallback" role="img" aria-label={`${campaign.title}尚未設定圖片`}>
            <span aria-hidden="true">▧</span>
            <small>尚未設定圖片</small>
          </div>}
    </div>
  )
}

function CampaignFormationProgress({ campaign }: { campaign: CampaignListItem }) {
  if (!campaign.openedAt) {
    return (
      <section className="campaign-formation-progress is-draft" aria-label={`${campaign.title}成團進度`}>
        <p className="campaign-progress-empty"><strong>發布後開始接單</strong><span>先完成商品、圖片與開團設定</span></p>
      </section>
    )
  }

  const usesAmount = campaign.thresholdKind === 'amount'
  const target = usesAmount ? (campaign.amountThreshold ?? campaign.threshold) : campaign.threshold
  const current = usesAmount ? campaign.totalAmount : campaign.totalQuantity
  const remaining = Math.max(0, target - current)
  const formed = current >= target
  const progressText = usesAmount
    ? `${currencyFormatter.format(current)}／${currencyFormatter.format(target)}`
    : `${current}／${target} ${campaign.quantityUnit}`
  const statusText = formed
    ? '已達成團門檻'
    : campaign.status === 'open'
      ? usesAmount
        ? `還差 ${currencyFormatter.format(remaining)} 成團`
        : `還差 ${remaining} ${campaign.quantityUnit}成團`
      : '結單時未達成團門檻'

  return (
    <section className="campaign-formation-progress" aria-label={`${campaign.title}成團進度摘要`}>
      <div className="campaign-progress-heading"><span>成團進度</span><strong>{progressText}</strong></div>
      <ProgressBar label={`${campaign.title}成團進度`} value={current} max={target} />
      <p className={formed ? 'is-formed' : 'is-remaining'}>{statusText}</p>
    </section>
  )
}

export default function CampaignListApp({ campaigns, onCreate, onDelete, onNavigate, onSignOut, onCopyResidentLink, residentMembers, onSetResidentBlocked, onUpdateResidentHousehold }: CampaignListAppProps) {
  const [visibleCampaigns, setVisibleCampaigns] = useState(campaigns)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('未命名團購')
  const [createError, setCreateError] = useState('')
  const [deleteFeedback, setDeleteFeedback] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CampaignListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activeSection, setActiveSection] = useState<'campaigns' | 'residents'>('campaigns')
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'open' | 'draft' | 'completed'>('all')
  const [copyingCampaignId, setCopyingCampaignId] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    setVisibleCampaigns(campaigns)
  }, [campaigns])

  const campaignCounts = {
    all: visibleCampaigns.length,
    open: visibleCampaigns.filter((campaign) => campaign.openedAt && campaign.status === 'open').length,
    draft: visibleCampaigns.filter((campaign) => !campaign.openedAt).length,
    completed: visibleCampaigns.filter((campaign) => campaign.openedAt && campaign.status !== 'open').length,
  }
  const activeResidentCount = residentMembers?.filter((member) => !member.blocked).length ?? 0
  const unboundResidentCount = residentMembers?.filter((member) => !member.blocked && member.householdKind !== 'other' && (member.period === null || !member.unit)).length ?? 0
  const filteredCampaigns = visibleCampaigns.filter((campaign) => {
    if (campaignFilter === 'open') return Boolean(campaign.openedAt) && campaign.status === 'open'
    if (campaignFilter === 'draft') return !campaign.openedAt
    if (campaignFilter === 'completed') return Boolean(campaign.openedAt) && campaign.status !== 'open'
    return true
  })

  const navigate = (path: string) => {
    if (onNavigate) onNavigate(path)
    else window.location.assign(path)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || busy) return
    setBusy(true)
    setCreateError('')
    try {
      const campaign = await onCreate(nextTitle)
      navigate(`/admin/campaign/${campaign.id}`)
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : '建立團購失敗')
      setBusy(false)
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
      if (result?.warning) setDeleteFeedback(result.warning)
      else setDeleteFeedback('')
    } catch (deleteError) {
      setDeleteError(deleteError instanceof Error ? deleteError.message : '刪除團購失敗')
    } finally {
      setDeleting(false)
    }
  }

  const copyResidentLink = async (campaign: CampaignListItem) => {
    if (copyingCampaignId) return
    const path = `/campaign/${campaign.slug}`
    setCopyingCampaignId(campaign.id)
    setCopyFeedback('')
    setCopyError('')
    try {
      if (onCopyResidentLink) await onCopyResidentLink(path)
      else {
        const value = new URL(path, window.location.origin).toString()
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
        else {
          const input = document.createElement('textarea')
          input.value = value
          input.style.position = 'fixed'
          input.style.opacity = '0'
          document.body.append(input)
          input.select()
          const copied = document.execCommand?.('copy') ?? false
          input.remove()
          if (!copied) throw new Error('這個瀏覽器不支援自動複製')
        }
      }
      setCopyFeedback(`已複製${campaign.title}住戶連結`)
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '複製住戶連結失敗')
    } finally {
      setCopyingCampaignId('')
    }
  }

  return (
    <main className="campaign-list-shell">
      <header className="campaign-list-header">
        <div className="campaign-list-title">
          <p className="admin-eyebrow">團購小幫手・團主專區</p>
          <h1>團主工作台</h1>
          <p>掌握每一團的進度、整理住戶資料，並建立下一次團購。</p>
        </div>
        <div className="campaign-list-actions">
          <button type="button" onClick={() => setCreating(true)}>
            <span className="campaign-action-icon" aria-hidden="true">＋</span>
            建立新團
          </button>
          <a className="secondary-action" href="/admin/notification-lab">
            <span className="campaign-action-icon" aria-hidden="true">⚗</span>
            通知測試中心
          </a>
          {onSignOut && <button type="button" className="secondary-action sign-out-action" onClick={() => { void onSignOut() }}>
            <span className="campaign-action-icon" aria-hidden="true">↪</span>
            登出
          </button>}
        </div>
      </header>

      {residentMembers && onSetResidentBlocked && onUpdateResidentHousehold && (
        <nav className="campaign-section-nav" aria-label="團主後台區段">
          <button type="button" aria-current={activeSection === 'campaigns' ? 'page' : undefined} onClick={() => setActiveSection('campaigns')}>
            團購作業 <span>{visibleCampaigns.length}</span>
          </button>
          <button type="button" aria-current={activeSection === 'residents' ? 'page' : undefined} onClick={() => setActiveSection('residents')}>
            住戶與戶號 <span>{activeResidentCount}</span>
          </button>
        </nav>
      )}

      {activeSection === 'campaigns' && <>
      <section className="campaign-overview" aria-label="工作概況">
        <div className="campaign-overview-heading">
          <p className="admin-eyebrow">工作概況</p>
          <p>先處理進行中的團購，再確認尚未發布的草稿與住戶資料。</p>
        </div>
        <dl>
          <div className="is-open"><dt>開團中</dt><dd>{campaignCounts.open}</dd></div>
          <div className="is-draft"><dt>待發布</dt><dd>{campaignCounts.draft}</dd></div>
          <div className="is-completed"><dt>已結束</dt><dd>{campaignCounts.completed}</dd></div>
          {residentMembers && <div className={unboundResidentCount > 0 ? 'needs-attention' : ''}><dt>待綁定戶號</dt><dd>{unboundResidentCount}</dd></div>}
        </dl>
      </section>

      {creating && (
        <form className="campaign-create-card" onSubmit={submit}>
          <label>
            <span>團購標題</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} autoFocus />
          </label>
          {createError && <p role="alert">{createError}</p>}
          <div>
            <button type="button" className="secondary-action" onClick={() => setCreating(false)} disabled={busy}>取消</button>
            <button type="submit" disabled={busy || !title.trim()}>{busy ? '建立中…' : '建立並編輯'}</button>
          </div>
        </form>
      )}

      {deleteFeedback && <FeedbackMessage tone="warning">{deleteFeedback}</FeedbackMessage>}
      {copyFeedback && <FeedbackMessage tone="success">{copyFeedback}</FeedbackMessage>}
      {copyError && <FeedbackMessage tone="error">{copyError}</FeedbackMessage>}

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

      <div className="campaign-workspace-heading">
        <div>
          <p className="admin-eyebrow">團購作業</p>
          <h2>管理所有團購</h2>
        </div>
        <p>依目前處理階段篩選，進入各團後可管理設定、訂單與到貨作業。</p>
      </div>

      <nav className="campaign-filter-nav" aria-label="團購狀態篩選">
        {([
          ['all', '全部團購', campaignCounts.all],
          ['open', '開團中', campaignCounts.open],
          ['draft', '待發布', campaignCounts.draft],
          ['completed', '已結束', campaignCounts.completed],
        ] as const).map(([value, label, count]) => (
          <button key={value} type="button" aria-pressed={campaignFilter === value} onClick={() => setCampaignFilter(value)}>
            {label} {count}
          </button>
        ))}
      </nav>

      <section className="campaign-list-grid" aria-label="團購列表">
        {filteredCampaigns.length === 0 && <p className="campaign-list-empty">{visibleCampaigns.length === 0 ? '目前還沒有團購，建立第一團吧。' : '此分類目前沒有團購。'}</p>}
        {filteredCampaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-list-card">
            <CampaignCardCover campaign={campaign} />
            <div className="campaign-list-card-copy">
              <div className="campaign-list-card-heading">
                <h2>{campaign.title}</h2>
                <span className={`campaign-status ${!campaign.openedAt ? 'is-draft' : campaign.status === 'open' ? 'is-open' : 'is-completed'}`}>
                  {campaign.openedAt ? campaignStatusLabel(campaign.status) : '待發布'}
                </span>
              </div>
              <p>{campaign.openedAt ? `開團時間 ${formatZhTwTimestamp(campaign.openedAt)}` : `最後編輯 ${formatZhTwTimestamp(campaign.updatedAt)}・住戶尚不可見`}</p>
              <div className="campaign-card-schedule">
                <span>{formatArrivalLabel(campaign.arrivalLabel)}</span>
                {campaign.autoCloseAt && <span>{formatAutoCloseReminder(campaign.autoCloseAt)}</span>}
              </div>
            </div>
            <CampaignFormationProgress campaign={campaign} />
            <div className="campaign-list-card-actions">
              <a className="campaign-primary-action" href={`/admin/campaign/${campaign.id}`} aria-label={`管理團購 ${campaign.title}`}>管理團購</a>
              {(campaign.openedAt || onDelete) && (
                <details className="campaign-overflow" aria-label={`更多操作 ${campaign.title}`}>
                  <summary aria-label={`更多操作 ${campaign.title}`}>
                    <span aria-hidden="true">⋯</span>
                  </summary>
                  <div className="campaign-overflow-menu">
                    {campaign.openedAt && (
                      <>
                        <a href={`/campaign/${campaign.slug}`} aria-label={`查看住戶頁 ${campaign.title}`} target="_blank" rel="noreferrer">
                          <span aria-hidden="true">↗</span>
                          查看住戶頁
                        </a>
                        <button type="button" aria-label={`複製住戶連結 ${campaign.title}`} disabled={Boolean(copyingCampaignId)} onClick={(event) => {
                          event.currentTarget.closest('details')?.removeAttribute('open')
                          void copyResidentLink(campaign)
                        }}>
                          <span aria-hidden="true">⧉</span>
                          {copyingCampaignId === campaign.id ? '複製中…' : '複製住戶連結'}
                        </button>
                      </>
                    )}
                    {onDelete && (
                      <button type="button" className="danger-link" aria-label={`刪除 ${campaign.title}`} onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        setDeleteError('')
                        setDeleteTarget(campaign)
                      }}>
                        <span aria-hidden="true">×</span>
                        刪除團購
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          </article>
        ))}
      </section>
      </>}
      {activeSection === 'residents' && residentMembers && onSetResidentBlocked && onUpdateResidentHousehold && (
        <ResidentMemberManagementApp members={residentMembers} onSetBlocked={onSetResidentBlocked} onUpdateHousehold={onUpdateResidentHousehold} />
      )}
    </main>
  )
}
