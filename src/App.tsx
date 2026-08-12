import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { summarizeCampaign } from './domain/campaign'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from './domain/timestamp'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
import { itemLabel } from './domain/itemLabel'
import {
  campaign,
  currentCustomerId,
  initialOrders,
  items,
  type VisibleOrder,
} from './data/demo'
import { loadPublishedCampaign, type CampaignContent } from './services/demoCampaignStore'

const defaultContent: CampaignContent = {
  title: campaign.title,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
  announcement: campaign.announcement,
  images: campaign.images,
  items,
  openedAt: campaign.openedAt,
}

const orderQuantity = (orderItems: Record<string, number>) =>
  Object.values(orderItems).reduce((sum, quantity) => sum + quantity, 0)

type AppProps = {
  publishedContent?: CampaignContent
  liveDemo?: boolean
  campaignStatus?: CampaignStatus
  visibleOrders?: VisibleOrder[]
  residentCustomer?: Pick<VisibleOrder, 'customerId' | 'name' | 'period' | 'unit'> | null
  onSubmitOrder?: (items: Record<string, number>) => Promise<void>
}

function App({ publishedContent, liveDemo = false, campaignStatus = 'open', visibleOrders, residentCustomer, onSubmitOrder }: AppProps = {}) {
  const [localPublishedCampaign] = useState(() => loadPublishedCampaign(defaultContent))
  const publishedCampaign = publishedContent ?? localPublishedCampaign
  const itemDisplayLabel = (code: string) => {
    const index = publishedCampaign.items.findIndex((item) => item.code === code)
    return index >= 0 ? itemLabel(index) : code
  }
  const activeItems = publishedCampaign.items.filter((item) => item.active)
  const [localOrders, setLocalOrders] = useState<VisibleOrder[]>(initialOrders)
  const orders = visibleOrders ?? localOrders
  const effectiveCustomer = residentCustomer === undefined
    ? initialOrders.find((order) => order.customerId === currentCustomerId)!
    : residentCustomer
  const ownOrder = effectiveCustomer
    ? orders.find((order) => order.customerId === effectiveCustomer.customerId)
    : undefined
  const [draft, setDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)

  useEffect(() => {
    if (visibleOrders && !draftDirty) setDraft({ ...(ownOrder?.items ?? {}) })
  }, [draftDirty, ownOrder, visibleOrders])

  const summary = useMemo(
    () => summarizeCampaign(orders, publishedCampaign.unitPrice, publishedCampaign.threshold),
    [orders, publishedCampaign],
  )
  const draftQuantity = orderQuantity(draft)
  const editable = campaignStatus === 'open'

  const adjust = (code: string, delta: number) => {
    if (!editable) return
    setNotice('')
    setDraftDirty(true)
    setDraft((current) => {
      const next = Math.max(0, Math.min(20, (current[code] ?? 0) + delta))
      if (next === 0) {
        const { [code]: _removed, ...remaining } = current
        return remaining
      }
      return { ...current, [code]: next }
    })
  }

  const submit = async () => {
    if (onSubmitOrder) {
      setSubmitting(true)
      setNotice('')
      try {
        await onSubmitOrder(draft)
        setDraftDirty(false)
        setNotice('訂單已更新')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '訂單更新失敗')
      } finally {
        setSubmitting(false)
      }
      return
    }
    setLocalOrders((current) =>
      current.map((order) =>
        order.customerId === currentCustomerId
          ? { ...order, items: { ...draft }, updatedAt: new Date().toISOString() }
          : order,
      ),
    )
    setDraftDirty(false)
    setNotice('訂單已更新')
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="eyebrow-row">
          <span className="status-dot" aria-hidden="true" />
          <span>{campaignStatusLabel(campaignStatus)}</span>
          <span className="price">每個 ${publishedCampaign.unitPrice}</span>
        </div>
        <h1>{publishedCampaign.title}</h1>
        <p className="arrival">🧊 {campaign.arrival}</p>
        {publishedCampaign.openedAt && (
          <p className="campaign-time">開團時間 {formatZhTwTimestamp(publishedCampaign.openedAt)}</p>
        )}

        <div className="progress-copy">
          <strong>{summary.quantity} / {summary.threshold}</strong>
          <span>{summary.formed ? '已成團' : `還差 ${summary.remaining} 個成團`}</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="成團進度"
          aria-valuenow={summary.quantity}
          aria-valuemin={0}
          aria-valuemax={publishedCampaign.threshold}
        >
          <span style={{ width: `${summary.progressPercent}%` }} />
        </div>
        <p className="social-proof">已有 {orders.length} 戶參加，大家的訂單都看得到</p>
      </section>

      <article className="panel campaign-post" aria-labelledby="campaign-post-heading">
        <div className="post-heading">
          <div>
            <p className="section-kicker">團主公告</p>
            <h2 id="campaign-post-heading">開團資訊</h2>
          </div>
          <span className="organizer-badge">團主提供</span>
        </div>

        <div className="campaign-gallery" aria-label="團購圖片">
          {publishedCampaign.images.map((image) => (
            <img key={image.src} src={image.src} alt={image.alt} loading="eager" />
          ))}
        </div>
        <p className="campaign-copy">{publishedCampaign.announcement}</p>
      </article>

      {effectiveCustomer ? <section className="panel order-panel" aria-labelledby="order-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">我的訂單</p>
            <h2 id="order-heading">{effectiveCustomer.period === 1 ? '一期' : '二期'} {effectiveCustomer.unit}・{effectiveCustomer.name}</h2>
          </div>
          <div className="my-total">
            <strong>我的訂單 {draftQuantity} 個</strong>
            <span>${draftQuantity * publishedCampaign.unitPrice}</span>
          </div>
        </div>

        <div className="product-list">
          {activeItems.map((item) => {
            const itemIndex = publishedCampaign.items.findIndex((candidate) => candidate.code === item.code)
            const displayLabel = itemLabel(itemIndex)
            const quantity = draft[item.code] ?? 0
            return (
              <div className="product-row" key={item.code}>
                <span className="product-code">{displayLabel.slice(0, 1)}</span>
                <div className="product-name">
                  <strong>{displayLabel}</strong>
                  <span>${publishedCampaign.unitPrice}</span>
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label={`減少 ${displayLabel}`}
                    onClick={() => adjust(item.code, -1)}
                    disabled={!editable || quantity === 0}
                  >−</button>
                  <output aria-label={`${displayLabel}數量`}>{quantity}</output>
                  <button
                    type="button"
                    aria-label={`增加 ${displayLabel}`}
                    onClick={() => adjust(item.code, 1)}
                    disabled={!editable}
                  >＋</button>
                </div>
              </div>
            )
          })}
        </div>

        <button className="submit-button" type="button" onClick={() => { void submit() }} disabled={!editable || submitting || draftQuantity === 0}>
          送出訂單
        </button>
        {notice && <p className="success" role="status">{notice}</p>}
        <p className="privacy-note">
          {editable
            ? '送出後仍可在結單前修改。你只能修改自己的訂單。'
            : campaignStatus === 'arrived'
              ? '商品已到貨，訂單已鎖定。'
              : '本團已結單，暫停修改訂單。'}
        </p>
      </section> : (
        <section className="panel order-panel" aria-label="我的訂單">
          <p className="privacy-note">戶號尚未綁定，目前可先查看公開訂單與成團進度。</p>
        </section>
      )}

      <section className="panel wall-panel" aria-labelledby="wall-heading">
        <div className="section-heading compact">
          <div>
            <p className="section-kicker">即時成團牆</p>
            <h2 id="wall-heading">目前訂單</h2>
          </div>
          <span className="live-pill">● 即時</span>
        </div>

        <div className="order-wall">
          {[...orders]
            .sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt)
              || a.customerId.localeCompare(b.customerId))
            .map((order) => (
              <article className={`wall-order ${order.customerId === effectiveCustomer?.customerId ? 'own' : ''}`} key={order.customerId}>
                <div className="avatar" aria-hidden="true">{order.name.slice(0, 1).toUpperCase()}</div>
                <div className="wall-main">
                  <div className="wall-name">
                    <strong>{order.name}</strong>
                    <span>{order.period === 1 ? '一期' : '二期'} {order.unit}</span>
                  </div>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([code, quantity]) => `${itemDisplayLabel(code)}×${quantity}`)
                    .join('、')}</p>
                  <p className="wall-time">
                    下單時間 {formatZhTwTimestamp(order.orderedAt)}
                    {wasMeaningfullyUpdated(order.orderedAt, order.updatedAt) && (
                      <span>已修改・最後修改 {formatZhTwTimestamp(order.updatedAt)}</span>
                    )}
                  </p>
                </div>
                <strong className="wall-count">{orderQuantity(order.items)}個</strong>
              </article>
            ))}
        </div>
      </section>

      <footer>
        {liveDemo
          ? 'Supabase Live Demo・發布內容由資料庫即時同步'
          : '這是本機示範模式；接上 LIFF 與 Supabase 後會自動辨識身分並即時同步。'}
      </footer>
    </main>
  )
}

export default App
