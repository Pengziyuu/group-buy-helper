import { useState } from 'react'
import { ProgressBar } from './components/ui/ProgressBar'
import { StatusBadge, type StatusTone } from './components/ui/StatusBadge'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
import { formatZhTwTimestamp } from './domain/timestamp'
import { normalizeQuantityUnit, type QuantityUnit } from './domain/quantityUnit'
import type { CampaignImage } from './services/demoCampaignStore'
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
  totalAmount?: number
  threshold: number
  thresholdKind?: 'quantity' | 'amount'
  amountThreshold?: number | null
  quantityUnit?: QuantityUnit
  images?: CampaignImage[]
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

function CampaignCover({ campaign }: { campaign: ResidentCampaignListItem }) {
  const [failed, setFailed] = useState(false)
  const image = campaign.images?.[0]
  const showImage = Boolean(image?.src) && !failed

  return (
    <div className="resident-campaign-cover">
      {showImage && image
        ? <img src={image.src} alt={image.alt || `${campaign.title}商品圖片`} onError={() => setFailed(true)} />
        : (
          <div className="resident-campaign-cover-fallback" role="img" aria-label={`${campaign.title}尚未設定商品圖片`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7.5h16v11H4zM7 7.5V5.8C7 4.8 7.8 4 8.8 4h6.4c1 0 1.8.8 1.8 1.8v1.7M8 12h8M12 9v6" />
            </svg>
            <span>團購小幫手</span>
          </div>
      )}
      <div className="resident-campaign-cover-status">
        <StatusBadge tone={statusTone(campaign.status)}>{campaignStatusLabel(campaign.status)}</StatusBadge>
      </div>
    </div>
  )
}

export default function ResidentCampaignListApp({ identity, campaigns, onLogout }: ResidentCampaignListAppProps) {
  const sortedCampaigns = [...campaigns].sort((left, right) =>
    statusPriority[left.status] - statusPriority[right.status]
      || Date.parse(right.openedAt) - Date.parse(left.openedAt))
  const openCampaignCount = campaigns.filter((campaign) => campaign.status === 'open').length

  return (
    <main className="resident-list-shell">
      <header className="resident-list-header">
        <div className="resident-list-identity">
          {identity.pictureUrl
            ? <img src={identity.pictureUrl} alt={`${identity.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
            : <span className="resident-avatar-fallback" aria-label={`${identity.displayName}的預設頭貼`}>{identity.displayName.slice(0, 1)}</span>}
          <div>
            <p>LINE身分</p>
            <strong>{identity.displayName}</strong>
          </div>
        </div>
        {onLogout ? <button type="button" onClick={() => void onLogout()}>登出</button> : null}
      </header>

      <section className="resident-list-heading">
        <div className="resident-list-heading-copy">
          <p>社區團購記事本</p>
          <h1>全部開團</h1>
          <span>看看鄰居最近都在買什麼，選一團查看內容或直接下單。</span>
        </div>
        <div className="resident-list-summary" aria-label={`共有${campaigns.length}個團購，${openCampaignCount}個開團中`}>
          <strong>{openCampaignCount}</strong>
          <span>個團購<br />開團中</span>
        </div>
      </section>

      <section className="resident-campaign-grid" aria-label="已發布團購列表">
        {campaigns.length === 0 && <p className="resident-list-empty">目前沒有已發布的團購。</p>}
        {sortedCampaigns.map((campaign) => {
          const amountThreshold = campaign.amountThreshold ?? campaign.threshold
          const usesAmountThreshold = campaign.thresholdKind === 'amount'
          const progressValue = usesAmountThreshold ? (campaign.totalAmount ?? 0) : campaign.totalQuantity
          const progressTarget = usesAmountThreshold ? amountThreshold : campaign.threshold
          const quantityUnit = normalizeQuantityUnit(campaign.quantityUnit)
          const progressText = usesAmountThreshold
            ? `NT$ ${progressValue.toLocaleString('zh-TW')} / NT$ ${progressTarget.toLocaleString('zh-TW')}`
            : `${progressValue} ${quantityUnit} / ${progressTarget} ${quantityUnit}`

          return (
            <article className="resident-campaign-card" data-status={campaign.status} key={campaign.slug}>
              <CampaignCover campaign={campaign} />
              <div className="resident-campaign-card-body">
                <p className="resident-campaign-time">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.8 1.8" /></svg>
                  {formatZhTwTimestamp(campaign.openedAt)} 開團
                </p>
                <h2>{campaign.title}</h2>
                <div className="resident-campaign-facts">
                  <p><span>最低價</span><strong><small>NT$</small> {campaign.unitPrice.toLocaleString('zh-TW')}</strong></p>
                  <p><span>成團進度</span><strong>{progressText}</strong></p>
                </div>
                <div className="resident-campaign-progress">
                  <ProgressBar label={`${campaign.title}成團進度`} value={progressValue} max={progressTarget} />
                </div>
                <a href={`/campaign/${campaign.slug}`} aria-label={`查看${campaign.title}`}>
                  <span>{campaign.status === 'open' ? '查看並下單' : '查看團購內容'}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                </a>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
