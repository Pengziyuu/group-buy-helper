import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { summarizeCampaign } from './domain/campaign'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from './domain/timestamp'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
import { itemLabel } from './domain/itemLabel'
import {
  formatHouseholdUnit,
  formatResidentPeriod,
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  RESIDENT_PERIODS,
  type ResidentPeriod,
} from './domain/household'
import {
  campaign,
  currentCustomerId,
  initialOrders,
  items,
  type VisibleOrder,
} from './data/demo'
import { loadPublishedCampaign, normalizeCampaignContent, type CampaignContent } from './services/demoCampaignStore'
import { Button } from './components/ui/Button'
import { QuantityControl } from './components/ui/QuantityControl'
import { StickyActionBar } from './components/ui/StickyActionBar'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { ProgressBar } from './components/ui/ProgressBar'
import LinkifiedText from './components/LinkifiedText'

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

const orderItemsEqual = (left: Record<string, number>, right: Record<string, number>) => {
  const codes = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...codes].every((code) => (left[code] ?? 0) === (right[code] ?? 0))
}

type ResidentCustomer = Pick<VisibleOrder, 'customerId' | 'name' | 'period' | 'unit'>

type ResidentBindingInput = Pick<ResidentCustomer, 'period' | 'unit'>

type VerifiedResidentIdentity = {
  displayName: string
  pictureUrl: string | null
}

type AppProps = {
  publishedContent?: CampaignContent
  liveDemo?: boolean
  campaignStatus?: CampaignStatus
  visibleOrders?: VisibleOrder[]
  residentCustomer?: ResidentCustomer | null
  verifiedResidentIdentity?: VerifiedResidentIdentity
  onBindResident?: (input: ResidentBindingInput) => Promise<ResidentCustomer>
  onSubmitOrder?: (items: Record<string, number>) => Promise<void>
  syncError?: string
  onSyncRetry?: () => void
}

function App({ publishedContent, liveDemo = false, campaignStatus = 'open', visibleOrders, residentCustomer, verifiedResidentIdentity, onBindResident, onSubmitOrder, syncError, onSyncRetry }: AppProps = {}) {
  const [localPublishedCampaign] = useState(() => loadPublishedCampaign(defaultContent))
  const publishedCampaign = useMemo(
    () => normalizeCampaignContent(publishedContent ?? localPublishedCampaign),
    [localPublishedCampaign, publishedContent],
  )
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
  const [boundResident, setBoundResident] = useState<ResidentCustomer | null>(effectiveCustomer)
  const currentResident = residentCustomer === null ? boundResident : effectiveCustomer
  const ownOrder = currentResident
    ? orders.find((order) => order.customerId === currentResident.customerId)
    : undefined

  const [residentPeriod, setResidentPeriod] = useState<ResidentPeriod>(2)
  const [residentPrefix, setResidentPrefix] = useState(1)
  const [residentLetter, setResidentLetter] = useState('A')
  const [residentNumber, setResidentNumber] = useState(1)
  const [binding, setBinding] = useState(false)
  const [bindingNotice, setBindingNotice] = useState('')
  const [draft, setDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [savedDraft, setSavedDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const draftDirty = !orderItemsEqual(draft, savedDraft)
  const [announcementExpanded, setAnnouncementExpanded] = useState(false)

  useEffect(() => {
    if (visibleOrders && !draftDirty) {
      const nextSavedDraft = { ...(ownOrder?.items ?? {}) }
      setDraft(nextSavedDraft)
      setSavedDraft(nextSavedDraft)
    }
  }, [draftDirty, ownOrder, visibleOrders])

  useEffect(() => {
    if (notice?.tone !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const summary = useMemo(
    () => summarizeCampaign(
      orders,
      publishedCampaign.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? publishedCampaign.unitPrice })),
      publishedCampaign.threshold,
    ),
    [orders, publishedCampaign],
  )
  const draftQuantity = orderQuantity(draft)
  const draftAmount = Object.entries(draft).reduce((sum, [code, quantity]) => {
    const item = publishedCampaign.items.find((candidate) => candidate.code === code)
    return sum + quantity * (item?.unitPrice ?? publishedCampaign.unitPrice)
  }, 0)
  const activePrices = activeItems.map((item) => item.unitPrice ?? publishedCampaign.unitPrice)
  const minimumPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0
  const maximumPrice = activePrices.length > 0 ? Math.max(...activePrices) : 0
  const editable = campaignStatus === 'open'
  const hasLongAnnouncement = publishedCampaign.announcement.length > 240

  const adjust = (code: string, delta: number) => {
    if (!editable) return
    setNotice(null)
    setDraft((current) => {
      const next = Math.max(0, Math.min(20, (current[code] ?? 0) + delta))
      if (next === 0) {
        const { [code]: _removed, ...remaining } = current
        return remaining
      }
      return { ...current, [code]: next }
    })
  }

  const bindResident = async () => {
    if (!onBindResident) return
    const unit = formatHouseholdUnit({
      period: residentPeriod,
      prefix: residentPeriod === 1 ? null : residentPrefix,
      letter: residentLetter,
      number: residentNumber,
    })
    setBinding(true)
    setBindingNotice('')
    try {
      const customer = await onBindResident({ period: residentPeriod, unit })
      setBoundResident(customer)
    } catch (error) {
      setBindingNotice(error instanceof Error ? error.message : '住戶資料儲存失敗')
    } finally {
      setBinding(false)
    }
  }

  const submit = async () => {
    if (onSubmitOrder) {
      setSubmitting(true)
      setNotice(null)
      try {
        await onSubmitOrder(draft)
        setSavedDraft({ ...draft })
        setNotice({ tone: 'success', text: '訂單已更新' })
      } catch (error) {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : '訂單更新失敗' })
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
    setSavedDraft({ ...draft })
    setNotice({ tone: 'success', text: '訂單已更新' })
  }

  return (
    <main className="app-shell">
      <nav className="resident-detail-nav" aria-label="團購頁面導覽">
        <a className="resident-nav-action resident-nav-secondary" href="/" aria-label="回到全部開團">
          <span aria-hidden="true">←</span>
          回到全部開團
        </a>
        {currentResident && (
          <a className="resident-nav-action resident-nav-primary" href="#order-heading">
            <span aria-hidden="true">↓</span>
            前往我的訂單
          </a>
        )}
      </nav>
      {syncError && (
        <FeedbackMessage
          className="resident-sync-feedback"
          tone="warning"
          urgent
          actionLabel={onSyncRetry ? '重新同步' : undefined}
          onAction={onSyncRetry}
        >{syncError}</FeedbackMessage>
      )}
      <section className="hero-card">
        <div className="eyebrow-row">
          <span className="status-dot" aria-hidden="true" />
          <span>{campaignStatusLabel(campaignStatus)}</span>
          <span className="price">{minimumPrice === maximumPrice ? `$${minimumPrice}` : `$${minimumPrice}～$${maximumPrice}`}</span>
        </div>
        <h1>{publishedCampaign.title}</h1>
        {!liveDemo && <p className="arrival">🧊 {campaign.arrival}</p>}
        {publishedCampaign.openedAt && (
          <p className="campaign-time">開團時間 {formatZhTwTimestamp(publishedCampaign.openedAt)}</p>
        )}

        <div className="progress-copy">
          <strong>{summary.quantity} / {summary.threshold}</strong>
          <span>{summary.formed ? '已成團' : `還差 ${summary.remaining} 個成團`}</span>
        </div>
        <ProgressBar className="campaign-progress" label="成團進度" value={summary.quantity} max={publishedCampaign.threshold} />
        <p className="social-proof">已有 {orders.length} 戶參加，大家的訂單都看得到</p>
      </section>

      {currentResident ? <section className="panel order-panel" aria-labelledby="order-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">我的訂單</p>
            <h2 id="order-heading">{formatResidentPeriod(currentResident.period)} {currentResident.unit}・{currentResident.name}</h2>
          </div>
          <div className="my-total">
            <strong>我的訂單 {draftQuantity} 個</strong>
          </div>
        </div>

        <div className="product-list">
          {activeItems.map((item) => {
            const itemIndex = publishedCampaign.items.findIndex((candidate) => candidate.code === item.code)
            const displayLabel = itemLabel(itemIndex)
            const itemPrice = item.unitPrice ?? publishedCampaign.unitPrice
            const quantity = draft[item.code] ?? 0
            return (
              <div className="product-row" key={item.code}>
                <span className="product-code">{displayLabel}</span>
                <div className="product-name">
                  <strong>{item.name}</strong>
                  <span>${itemPrice}</span>
                </div>
                <QuantityControl
                  label={`${displayLabel} ${item.name}`}
                  value={quantity}
                  disabled={!editable}
                  onDecrement={() => adjust(item.code, -1)}
                  onIncrement={() => adjust(item.code, 1)}
                />
              </div>
            )
          })}
        </div>

        <StickyActionBar className="resident-order-action" ariaLabel="訂單摘要與送出">
          <div className="resident-order-action-total">
            <span>{draftQuantity} 個</span>
            <strong>${draftAmount}</strong>
          </div>
          <Button
            className="submit-button"
            onClick={() => { void submit() }}
            disabled={!editable || !draftDirty || draftQuantity === 0}
            loading={submitting}
            loadingLabel="訂單送出中…"
          >送出訂單</Button>
        </StickyActionBar>
        {notice?.tone === 'error' && <FeedbackMessage className="resident-order-feedback" tone="error">{notice.text}</FeedbackMessage>}
        {notice?.tone === 'success' && <FeedbackMessage className="resident-order-toast" tone="success">{notice.text}</FeedbackMessage>}
        <p className="privacy-note">
          {editable
            ? '送出後仍可在結單前修改。你只能修改自己的訂單。'
            : campaignStatus === 'arrived'
              ? '商品已到貨，訂單已鎖定。'
              : '本團已結單，暫停修改訂單。'}
        </p>
      </section> : (
        <section className="panel order-panel resident-binding" aria-labelledby="resident-binding-heading">
          <p className="section-kicker">我的訂單</p>
          <h2 id="resident-binding-heading">首次填寫住戶資料</h2>
          <p className="binding-intro">完成一次綁定後，即可選擇品項並送出訂單。</p>
          {verifiedResidentIdentity && (
            <div className="verified-resident-identity">
              {verifiedResidentIdentity.pictureUrl
                ? <img src={verifiedResidentIdentity.pictureUrl} alt={`${verifiedResidentIdentity.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
                : <span aria-hidden="true">{verifiedResidentIdentity.displayName.slice(0, 1)}</span>}
              <div><small>LINE驗證身分</small><strong>{verifiedResidentIdentity.displayName}</strong></div>
            </div>
          )}
          <div className="binding-fields">
            <label>
              <span>期別</span>
              <select value={residentPeriod} onChange={(event) => setResidentPeriod(Number(event.target.value) as ResidentPeriod)}>
                {RESIDENT_PERIODS.map((period) => (
                  <option key={period} value={period}>{new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(period)}期</option>
                ))}
              </select>
            </label>
            {residentPeriod !== 1 && <label>
              <span>前段</span>
              <select value={residentPrefix} onChange={(event) => setResidentPrefix(Number(event.target.value))}>
                {HOUSEHOLD_PREFIXES.map((prefix) => <option key={prefix} value={prefix}>{prefix}</option>)}
              </select>
            </label>}
            <label>
              <span>棟別</span>
              <select value={residentLetter} onChange={(event) => setResidentLetter(event.target.value)}>
                {HOUSEHOLD_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
              </select>
            </label>
            <label>
              <span>號碼</span>
              <select value={residentNumber} onChange={(event) => setResidentNumber(Number(event.target.value))}>
                {HOUSEHOLD_NUMBERS.map((number) => <option key={number} value={number}>{number}</option>)}
              </select>
            </label>
          </div>
          <Button
            className="submit-button"
            onClick={() => { void bindResident() }}
            disabled={!editable}
            loading={binding}
            loadingLabel="住戶資料儲存中…"
          >儲存住戶資料</Button>
          {bindingNotice && <FeedbackMessage className="resident-binding-feedback" tone="error">{bindingNotice}</FeedbackMessage>}
          <p className="privacy-note">住戶資料只用於辨識訂單；每個期別與戶號只能綁定一個帳號。</p>
        </section>
      )}

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
        <div
          id="campaign-announcement"
          className={`campaign-copy${hasLongAnnouncement && !announcementExpanded ? ' is-collapsed' : ''}`}
        ><LinkifiedText text={publishedCampaign.announcement} /></div>
        {hasLongAnnouncement && (
          <Button
            className="announcement-toggle"
            variant="tertiary"
            aria-controls="campaign-announcement"
            aria-expanded={announcementExpanded}
            onClick={() => setAnnouncementExpanded((current) => !current)}
          >
            {announcementExpanded ? '收合開團資訊' : '展開完整開團資訊'}
          </Button>
        )}
      </article>

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
              <article className={`wall-order ${order.customerId === currentResident?.customerId ? 'own' : ''}`} key={order.customerId}>
                {order.pictureUrl
                  ? <img className="avatar" src={order.pictureUrl} alt={`${order.name}的LINE頭貼`} referrerPolicy="no-referrer" />
                  : <div className="avatar" aria-hidden="true">{order.name.slice(0, 1).toUpperCase()}</div>}
                <div className="wall-main">
                  <div className="wall-name">
                    <strong>{order.name}</strong>
                    <span>{formatResidentPeriod(order.period)} {order.unit}</span>
                  </div>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([code, quantity]) => `${itemDisplayLabel(code)}+${quantity}`)
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
