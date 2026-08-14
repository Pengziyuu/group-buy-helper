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

export default function ResidentCampaignListApp({ identity, campaigns, onLogout }: ResidentCampaignListAppProps) {
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
        {campaigns.map((campaign) => (
          <article className="resident-campaign-card" key={campaign.slug}>
            <div className="resident-campaign-card-heading">
              <h2>{campaign.title}</h2>
              <span>{campaignStatusLabel(campaign.status)}</span>
            </div>
            <p>開團時間 {formatZhTwTimestamp(campaign.openedAt)}</p>
            <p>每份 NT$ {campaign.unitPrice.toLocaleString('zh-TW')}</p>
            <p>成團進度 {campaign.totalQuantity} / {campaign.threshold}</p>
            <a href={`/campaign/${campaign.slug}`} aria-label={`查看${campaign.title}`}>查看／下單</a>
          </article>
        ))}
      </section>
    </main>
  )
}
