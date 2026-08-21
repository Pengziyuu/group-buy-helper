import { ProgressBar } from './components/ui/ProgressBar'
import { StatusBadge, type StatusTone } from './components/ui/StatusBadge'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import './ResidentCampaignListApp.css'

export type ResidentLineIdentity = {
  displayName: string
  pictureUrl: string | null
}

export type ResidentCampaignListItem = {
  slug: string
  title: string
  status: CampaignStatus
  unitPrice: number
  openedAt: string
  totalQuantity: number
  threshold: number
}

type ResidentCampaignListAppProps = {
  identity: ResidentLineIdentity
  campaigns: ResidentCampaignListItem[]
  onLogout?: () => void | Promise<void>
}

const statusPriority: Record<CampaignStatus, number> = { open: 0, closed: 1, arrived: 2 }

function statusTone(status: CampaignStatus): StatusTone {
  if (status === 'open') return 'success'
  if (status === 'arrived') return 'info'
  return 'neutral'
}

export default function ResidentCampaignListApp({ identity, campaigns, onLogout }: ResidentCampaignListAppProps) {
  const sortedCampaigns = [...campaigns].sort((left, right) =>
    statusPriority[left.status] - statusPriority[right.status]
      || Date.parse(right.openedAt) - Date.parse(left.openedAt))

  return (
    <main className="resident-list-shell">
      <header className="resident-list-header">
        {identity.pictureUrl
          ? <img src={identity.pictureUrl} alt={`${identity.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
          : <span className="resident-avatar-fallback" aria-label={`${identity.displayName}的預設頭貼`}>{identity.displayName.slice(0, 1)}</span>}
        <div>
          <p>LINE身分</p>
          <strong>{identity.displayName}</strong>
        </div>
        {onLogout ? <button type="button" onClick={() => void onLogout()}>登出</button> : null}
      </header>

      <section className="resident-list-heading">
        <p>GROUP BUY NOTEBOOK</p>
        <h1>全部開團</h1>
        <span>像查看LINE記事本一樣，選擇團購查看內容或下單。</span>
      </section>

      <section className="resident-campaign-grid" aria-label="已發布團購列表">
        {campaigns.length === 0 && <p className="resident-list-empty">目前沒有已發布的團購。</p>}
        {sortedCampaigns.map((campaign) => (
          <article className="resident-campaign-card" key={campaign.slug}>
            <div className="resident-campaign-card-heading">
              <h2>{campaign.title}</h2>
              <StatusBadge tone={statusTone(campaign.status)}>{campaignStatusLabel(campaign.status)}</StatusBadge>
            </div>
            <p className="resident-campaign-time">開團時間 {formatZhTwTimestamp(campaign.openedAt)}</p>
            <div className="resident-campaign-facts">
              <p><span>單價</span><strong>NT$ {campaign.unitPrice.toLocaleString('zh-TW')}</strong></p>
              <p>成團進度 {campaign.totalQuantity} / {campaign.threshold}</p>
            </div>
            <ProgressBar label={`${campaign.title}成團進度`} value={campaign.totalQuantity} max={campaign.threshold} />
            <a href={`/campaign/${campaign.slug}`} aria-label={`查看${campaign.title}`}>查看／下單</a>
          </article>
        ))}
      </section>
    </main>
  )
}
