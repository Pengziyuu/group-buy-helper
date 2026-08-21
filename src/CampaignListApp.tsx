import { useEffect, useState, type FormEvent } from 'react'
import { campaignStatusLabel } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { CampaignListItem } from './services/campaignManagementGateway'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import type { ResidentMember } from './services/residentMemberManagementGateway'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
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
}

export default function CampaignListApp({ campaigns, onCreate, onDelete, onNavigate, onSignOut, onCopyResidentLink, residentMembers, onSetResidentBlocked }: CampaignListAppProps) {
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
        <div>
          <p className="admin-eyebrow">GROUP BUY HELPER</p>
          <h1>我的團購</h1>
          <p>建立新團、管理進行中團購，也能回看過去團購。</p>
        </div>
        <div className="campaign-list-actions">
          <button type="button" onClick={() => setCreating(true)}>新增團購</button>
          {onSignOut && <button type="button" className="secondary-action" onClick={() => { void onSignOut() }}>登出</button>}
        </div>
      </header>

      {residentMembers && onSetResidentBlocked && (
        <nav className="campaign-section-nav" aria-label="團主後台區段">
          <button type="button" aria-current={activeSection === 'campaigns' ? 'page' : undefined} onClick={() => setActiveSection('campaigns')}>
            團購管理 {visibleCampaigns.length}
          </button>
          <button type="button" aria-current={activeSection === 'residents' ? 'page' : undefined} onClick={() => setActiveSection('residents')}>
            住戶管理 {residentMembers.length}
          </button>
        </nav>
      )}

      {activeSection === 'campaigns' && <>
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

      <nav className="campaign-filter-nav" aria-label="團購狀態篩選">
        {([
          ['all', '全部', campaignCounts.all],
          ['open', '進行中', campaignCounts.open],
          ['draft', '草稿', campaignCounts.draft],
          ['completed', '已完成', campaignCounts.completed],
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
            <div className="campaign-list-card-heading">
              <h2>{campaign.title}</h2>
              <span>{campaign.openedAt ? campaignStatusLabel(campaign.status) : '尚未開團'}</span>
            </div>
            <p>{campaign.openedAt ? `開團時間 ${formatZhTwTimestamp(campaign.openedAt)}` : '草稿會自動暫存，住戶目前看不到。'}</p>
            <div className="campaign-list-card-actions">
              <a href={`/admin/campaign/${campaign.id}`} aria-label={`編輯 ${campaign.title}`}>編輯團購</a>
              {campaign.openedAt && (
                <>
                  <a className="resident-share-link" href={`/campaign/${campaign.slug}`} aria-label={`住戶連結 ${campaign.title}`} target="_blank" rel="noreferrer">住戶連結 ↗</a>
                  <button type="button" className="copy-link-action" aria-label={`複製住戶連結 ${campaign.title}`} disabled={Boolean(copyingCampaignId)} onClick={() => { void copyResidentLink(campaign) }}>
                    {copyingCampaignId === campaign.id ? '複製中…' : '複製連結'}
                  </button>
                </>
              )}
              {onDelete && (
                <button type="button" className="danger-link" aria-label={`刪除 ${campaign.title}`} onClick={() => { setDeleteError(''); setDeleteTarget(campaign) }}>
                  刪除團購
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
      </>}
      {activeSection === 'residents' && residentMembers && onSetResidentBlocked && (
        <ResidentMemberManagementApp members={residentMembers} onSetBlocked={onSetResidentBlocked} />
      )}
    </main>
  )
}
