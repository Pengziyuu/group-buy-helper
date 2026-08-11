import { useMemo, useState } from 'react'
import './App.css'
import { summarizeCampaign } from './domain/campaign'
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
}

const itemName = (code: string) => items.find((item) => item.code === code)?.name ?? code
const orderQuantity = (orderItems: Record<string, number>) =>
  Object.values(orderItems).reduce((sum, quantity) => sum + quantity, 0)

function App() {
  const [publishedCampaign] = useState(() => loadPublishedCampaign(defaultContent))
  const [orders, setOrders] = useState<VisibleOrder[]>(initialOrders)
  const ownOrder = orders.find((order) => order.customerId === currentCustomerId)!
  const [draft, setDraft] = useState<Record<string, number>>({ ...ownOrder.items })
  const [notice, setNotice] = useState('')

  const summary = useMemo(
    () => summarizeCampaign(orders, publishedCampaign.unitPrice, publishedCampaign.threshold),
    [orders, publishedCampaign],
  )
  const draftQuantity = orderQuantity(draft)

  const adjust = (code: string, delta: number) => {
    setNotice('')
    setDraft((current) => {
      const next = Math.max(0, Math.min(20, (current[code] ?? 0) + delta))
      if (next === 0) {
        const { [code]: _removed, ...remaining } = current
        return remaining
      }
      return { ...current, [code]: next }
    })
  }

  const submit = () => {
    setOrders((current) =>
      current.map((order) =>
        order.customerId === currentCustomerId ? { ...order, items: { ...draft } } : order,
      ),
    )
    setNotice('訂單已更新')
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="eyebrow-row">
          <span className="status-dot" aria-hidden="true" />
          <span>{campaign.status}</span>
          <span className="price">每個 ${publishedCampaign.unitPrice}</span>
        </div>
        <h1>{publishedCampaign.title}</h1>
        <p className="arrival">🧊 {campaign.arrival}</p>

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

      <section className="panel order-panel" aria-labelledby="order-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">我的訂單</p>
            <h2 id="order-heading">二期 {ownOrder.unit}・{ownOrder.name}</h2>
          </div>
          <div className="my-total">
            <strong>我的訂單 {draftQuantity} 個</strong>
            <span>${draftQuantity * publishedCampaign.unitPrice}</span>
          </div>
        </div>

        <div className="product-list">
          {items.map((item) => {
            const quantity = draft[item.code] ?? 0
            return (
              <div className="product-row" key={item.code}>
                <span className="product-code">{item.code}</span>
                <div className="product-name">
                  <strong>{item.name}</strong>
                  <span>${publishedCampaign.unitPrice}</span>
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label={`減少 ${item.name.replace(/（.*）/, '')}`}
                    onClick={() => adjust(item.code, -1)}
                    disabled={quantity === 0}
                  >−</button>
                  <output aria-label={`${item.name}數量`}>{quantity}</output>
                  <button
                    type="button"
                    aria-label={`增加 ${item.name.replace(/（.*）/, '')}`}
                    onClick={() => adjust(item.code, 1)}
                  >＋</button>
                </div>
              </div>
            )
          })}
        </div>

        <button className="submit-button" type="button" onClick={submit} disabled={draftQuantity === 0}>
          送出訂單
        </button>
        {notice && <p className="success" role="status">{notice}</p>}
        <p className="privacy-note">送出後仍可在結單前修改。你只能修改自己的訂單。</p>
      </section>

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
            .sort((a, b) => a.period - b.period || a.unit.localeCompare(b.unit))
            .map((order) => (
              <article className={`wall-order ${order.customerId === currentCustomerId ? 'own' : ''}`} key={order.customerId}>
                <div className="avatar" aria-hidden="true">{order.name.slice(0, 1).toUpperCase()}</div>
                <div className="wall-main">
                  <div className="wall-name">
                    <strong>{order.name}</strong>
                    <span>{order.period === 1 ? '一期' : '二期'} {order.unit}</span>
                  </div>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([code, quantity]) => `${itemName(code)}×${quantity}`)
                    .join('、')}</p>
                </div>
                <strong className="wall-count">{orderQuantity(order.items)}個</strong>
              </article>
            ))}
        </div>
      </section>

      <footer>這是本機示範模式；接上 LIFF 與 Supabase 後會自動辨識身分並即時同步。</footer>
    </main>
  )
}

export default App
