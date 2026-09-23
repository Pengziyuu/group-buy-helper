import { useState } from 'react'
import { EmptyState } from './components/ui/AsyncState'
import { Button } from './components/ui/Button'
import { Menu } from './components/ui/Menu'
import { ProgressBar } from './components/ui/ProgressBar'
import { StatusBadge } from './components/ui/StatusBadge'
import { describeAutoClose, normalizeArrivalLabel } from './domain/campaignSchedule'
import type { CampaignStatus } from './domain/orderWorkflow'
import { normalizeQuantityUnit, type QuantityUnit } from './domain/quantityUnit'
import type { CampaignImage } from './services/demoCampaignStore'
import './components/resident/resident.css'

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
  arrivalLabel?: string
  autoCloseAt?: string | null
}

type ResidentCampaignListAppProps = {
  identity: ResidentLineIdentity
  campaigns: ResidentCampaignListItem[]
  onLogout?: () => void | Promise<void>
  now?: Date
}

const CLOSED_PREVIEW_COUNT = 5

function byNewestOpening(left: ResidentCampaignListItem, right: ResidentCampaignListItem) {
  return Date.parse(right.openedAt) - Date.parse(left.openedAt)
}

function campaignProgress(campaign: ResidentCampaignListItem) {
  if (campaign.thresholdKind === 'amount') {
    const value = campaign.totalAmount ?? 0
    const target = campaign.amountThreshold ?? campaign.threshold
    return { value, target, text: `NT$ ${value.toLocaleString('zh-TW')} / NT$ ${target.toLocaleString('zh-TW')}` }
  }
  const unit = normalizeQuantityUnit(campaign.quantityUnit)
  return {
    value: campaign.totalQuantity,
    target: campaign.threshold,
    text: `${campaign.totalQuantity} ${unit} / ${campaign.threshold} ${unit}`,
  }
}

function CampaignThumbnail({ campaign }: { campaign: ResidentCampaignListItem }) {
  const [failed, setFailed] = useState(false)
  const image = campaign.images?.[0]
  return (
    <div className="resident-campaign-thumb">
      {image?.src && !failed
        ? <img src={image.src} alt={image.alt || `${campaign.title}商品圖片`} loading="lazy" onError={() => setFailed(true)} />
        : <div className="resident-campaign-thumb-empty" role="img" aria-label={`${campaign.title}尚未設定商品圖片`}>無圖片</div>}
    </div>
  )
}

function CampaignRow({ campaign, now }: { campaign: ResidentCampaignListItem; now: Date }) {
  const open = campaign.status === 'open'
  const progress = campaignProgress(campaign)
  const closing = describeAutoClose(campaign.autoCloseAt, now)
  return (
    <article className="resident-campaign-row" data-status={open ? 'open' : 'closed'}>
      <CampaignThumbnail campaign={campaign} />
      <div className="resident-campaign-row-body">
        <h3><a href={`/campaign/${campaign.slug}`}>{campaign.title}</a></h3>
        {open
          ? <p className="resident-campaign-price"><strong>${campaign.unitPrice.toLocaleString('zh-TW')}</strong> 起</p>
          : <p className="resident-campaign-price"><StatusBadge tone="neutral">已結單</StatusBadge></p>}
        <dl className="resident-campaign-facts" role="group" aria-label={`${campaign.title}時程`}>
          <div>
            <dt>{!open && closing ? '原訂結單' : '結單'}</dt>
            <dd className={open && closing?.soon ? 'is-soon' : undefined}>{closing?.when ?? '未排定'}</dd>
          </div>
          <div className="resident-campaign-fact-arrival">
            <dt>到貨</dt>
            <dd>{normalizeArrivalLabel(campaign.arrivalLabel)}</dd>
          </div>
        </dl>
        <p className="resident-campaign-progress-text">{progress.text}</p>
        <ProgressBar label={`${campaign.title}成團進度`} value={progress.value} max={progress.target} />
      </div>
      <span className="resident-campaign-chevron" aria-hidden="true">›</span>
    </article>
  )
}

function ResidentAccount({ identity, onLogout }: { identity: ResidentLineIdentity; onLogout?: () => void | Promise<void> }) {
  const label = `LINE 帳號：${identity.displayName}`
  const avatar = identity.pictureUrl
    ? <img className="resident-avatar" src={identity.pictureUrl} alt="" referrerPolicy="no-referrer" />
    : <span className="resident-avatar">{identity.displayName.slice(0, 1)}</span>
  if (!onLogout) return <span className="resident-account" role="img" aria-label={label}>{avatar}</span>
  return (
    <Menu
      className="resident-account-menu"
      label={label}
      triggerContent={avatar}
      items={[{ label: '登出', onSelect: () => { void onLogout() } }]}
    />
  )
}

export default function ResidentCampaignListApp({ identity, campaigns, onLogout, now = new Date() }: ResidentCampaignListAppProps) {
  const [showAllClosed, setShowAllClosed] = useState(false)
  const openCampaigns = campaigns.filter((campaign) => campaign.status === 'open').sort(byNewestOpening)
  const closedCampaigns = campaigns.filter((campaign) => campaign.status !== 'open').sort(byNewestOpening)
  const visibleClosed = showAllClosed ? closedCampaigns : closedCampaigns.slice(0, CLOSED_PREVIEW_COUNT)
  const hiddenClosedCount = closedCampaigns.length - visibleClosed.length

  return (
    <div className="resident-page">
      <header className="resident-topbar">
        <span className="resident-topbar-brand">團購小幫手</span>
        <ResidentAccount identity={identity} onLogout={onLogout} />
      </header>
      <main className="resident-list">
        <div className="resident-list-heading">
          <h1>團購</h1>
          <span className={`resident-list-count${openCampaigns.length === 0 ? ' is-empty' : ''}`}>
          {openCampaigns.length > 0 ? `${openCampaigns.length} 團開團中` : '目前沒有開團中的團購'}
          </span>
        </div>
        {campaigns.length === 0 && <EmptyState title="目前還沒有團購" description="團主開團後會出現在這裡。" />}
        {openCampaigns.length > 0 && (
          <section className="resident-list-group" aria-labelledby="open-campaigns-heading">
            <h2 id="open-campaigns-heading">開團中</h2>
            <div className="resident-campaign-grid" data-group="open">
              {openCampaigns.map((campaign) => <CampaignRow key={campaign.slug} campaign={campaign} now={now} />)}
            </div>
          </section>
        )}
        {closedCampaigns.length > 0 && (
          <section className="resident-list-group" aria-labelledby="closed-campaigns-heading">
            <h2 id="closed-campaigns-heading">已結單</h2>
            <div className="resident-campaign-grid" data-group="closed">
              {visibleClosed.map((campaign) => <CampaignRow key={campaign.slug} campaign={campaign} now={now} />)}
            </div>
            {hiddenClosedCount > 0 && (
              <Button variant="utility" className="resident-list-more" onClick={() => setShowAllClosed(true)}>
                顯示更早的團購（{hiddenClosedCount}）
              </Button>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
