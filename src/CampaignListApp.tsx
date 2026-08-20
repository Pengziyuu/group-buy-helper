import { useEffect, useState, type FormEvent } from 'react'
import { campaignStatusLabel } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { CampaignListItem } from './services/campaignManagementGateway'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import type { ResidentMember } from './services/residentMemberManagementGateway'
import './CampaignListApp.css'

type CampaignListAppProps = {
  campaigns: CampaignListItem[]
  onCreate: (title: string) => Promise<CampaignListItem>
  onDelete?: (campaignId: string) => Promise<{ warning: string | null } | void>
  onNavigate?: (path: string) => void
  onSignOut?: () => Promise<void>
  residentMembers?: ResidentMember[]
  onSetResidentBlocked?: (memberCode: string, blocked: boolean) => Promise<void>
}

export default function CampaignListApp({ campaigns, onCreate, onDelete, onNavigate, onSignOut, residentMembers, onSetResidentBlocked }: CampaignListAppProps) {
  const [visibleCampaigns, setVisibleCampaigns] = useState(campaigns)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('未命名團購')
  const [createError, setCreateError] = useState('')
  const [deleteFeedback, setDeleteFeedback] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CampaignListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setVisibleCampaigns(campaigns)
  }, [campaigns])

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

      {deleteFeedback && <p role="alert">{deleteFeedback}</p>}

      {deleteTarget && (
        <div className="campaign-delete-backdrop">
          <section className="campaign-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-delete-heading">
            <h2 id="campaign-delete-heading">確認刪除團購</h2>
            <p>確定要刪除「{deleteTarget.title}」嗎？</p>
            <p>訂單及歷史資料都會永久刪除，無法復原。</p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div>
              <button type="button" className="secondary-action" onClick={() => { setDeleteTarget(null); setDeleteError('') }} disabled={deleting}>取消刪除</button>
              <button type="button" className="danger-action" onClick={() => { void confirmDelete() }} disabled={deleting}>
                {deleting ? '刪除中…' : '確認永久刪除'}
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="campaign-list-grid" aria-label="團購列表">
        {visibleCampaigns.length === 0 && <p className="campaign-list-empty">目前還沒有團購，建立第一團吧。</p>}
        {visibleCampaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-list-card">
            <div className="campaign-list-card-heading">
              <h2>{campaign.title}</h2>
              <span>{campaign.openedAt ? campaignStatusLabel(campaign.status) : '尚未開團'}</span>
            </div>
            <p>{campaign.openedAt ? `開團時間 ${formatZhTwTimestamp(campaign.openedAt)}` : '草稿會自動暫存，住戶目前看不到。'}</p>
            <div className="campaign-list-card-actions">
              <a href={`/admin/campaign/${campaign.id}`} aria-label={`編輯 ${campaign.title}`}>編輯團購</a>
              {campaign.openedAt && (
                <a className="resident-share-link" href={`/campaign/${campaign.slug}`} aria-label={`住戶連結 ${campaign.title}`} target="_blank" rel="noreferrer">住戶連結 ↗</a>
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
      {residentMembers && onSetResidentBlocked && (
        <ResidentMemberManagementApp members={residentMembers} onSetBlocked={onSetResidentBlocked} />
      )}
    </main>
  )
}
