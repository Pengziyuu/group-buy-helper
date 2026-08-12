import { useState, type FormEvent } from 'react'
import { campaignStatusLabel } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { CampaignListItem } from './services/campaignManagementGateway'
import './CampaignListApp.css'

type CampaignListAppProps = {
  campaigns: CampaignListItem[]
  onCreate: (title: string) => Promise<CampaignListItem>
  onNavigate?: (path: string) => void
  onSignOut?: () => Promise<void>
}

export default function CampaignListApp({ campaigns, onCreate, onNavigate, onSignOut }: CampaignListAppProps) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('未命名團購')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const navigate = (path: string) => {
    if (onNavigate) onNavigate(path)
    else window.location.assign(path)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || busy) return
    setBusy(true)
    setError('')
    try {
      const campaign = await onCreate(nextTitle)
      navigate(`/admin/campaign/${campaign.id}`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '建立團購失敗')
      setBusy(false)
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
          {error && <p role="alert">{error}</p>}
          <div>
            <button type="button" className="secondary-action" onClick={() => setCreating(false)} disabled={busy}>取消</button>
            <button type="submit" disabled={busy || !title.trim()}>{busy ? '建立中…' : '建立並編輯'}</button>
          </div>
        </form>
      )}

      <section className="campaign-list-grid" aria-label="團購列表">
        {campaigns.length === 0 && <p className="campaign-list-empty">目前還沒有團購，建立第一團吧。</p>}
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="campaign-list-card">
            <div className="campaign-list-card-heading">
              <h2>{campaign.title}</h2>
              <span>{campaign.openedAt ? campaignStatusLabel(campaign.status) : '尚未開團'}</span>
            </div>
            <p>{campaign.openedAt ? `開團時間 ${formatZhTwTimestamp(campaign.openedAt)}` : '草稿會自動暫存，住戶目前看不到。'}</p>
            <div className="campaign-list-card-actions">
              <a href={`/admin/campaign/${campaign.id}`} aria-label={`編輯 ${campaign.title}`}>編輯團購</a>
              {campaign.openedAt && (
                <a href={`/campaign/${campaign.slug}`} aria-label={`住戶連結 ${campaign.title}`} target="_blank" rel="noreferrer">住戶連結 ↗</a>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
