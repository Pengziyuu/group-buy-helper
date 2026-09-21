import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeCampaign } from './domain/campaign'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from './domain/timestamp'
import type { CampaignStatus } from './domain/orderWorkflow'
import { itemLabel } from './domain/itemLabel'
import { normalizeQuantityUnit } from './domain/quantityUnit'
import { describeAutoClose } from './domain/campaignSchedule'
import { customOrderItemsEqual, validCustomOrderItems, type CustomOrderItem } from './domain/customOrderItem'
import { discountedUnitPrice, priceOrder, type DiscountPricing } from './domain/discountPricing'
import { formatHousehold, type HouseholdKind } from './domain/household'
import { campaign, currentCustomerId, initialOrders, items, type VisibleOrder } from './data/demo'
import { loadPublishedCampaign, normalizeCampaignContent, type CampaignContent } from './services/demoCampaignStore'
import { BottomSheet } from './components/ui/BottomSheet'
import { Button } from './components/ui/Button'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { QuantityControl } from './components/ui/QuantityControl'
import { Toast } from './components/ui/Toast'
import { CampaignImageViewer } from './components/CampaignImageViewer'
import { CampaignInfo } from './components/resident/CampaignInfo'
import { CampaignSummary, type CampaignProgress } from './components/resident/CampaignSummary'
import { OrderBreakdown, type BreakdownLine } from './components/resident/OrderBreakdown'
import { OrderSummaryBar } from './components/resident/OrderSummaryBar'
import { OrderWall } from './components/resident/OrderWall'
import { ProductRow } from './components/resident/ProductRow'
import {
  ResidentBindingForm,
  type ResidentBindingInput,
  type VerifiedResidentIdentity,
} from './components/resident/ResidentBindingForm'
import './components/resident/resident.css'

const defaultContent: CampaignContent = {
  title: campaign.title,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
  announcement: campaign.announcement,
  images: campaign.images,
  items,
  openedAt: campaign.openedAt,
}

const SUCCESS_NOTICE_DURATION = 3500

const orderQuantity = (orderItems: Record<string, number>) =>
  Object.values(orderItems).reduce((sum, quantity) => sum + quantity, 0)

const formatDiscountRate = (rate: number) => {
  const tenths = Number((rate * 10).toFixed(2))
  return `${Number.isInteger(tenths) ? tenths : Number((rate * 100).toFixed(2))}折`
}

const orderItemsEqual = (left: Record<string, number>, right: Record<string, number>) => {
  const codes = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...codes].every((code) => (left[code] ?? 0) === (right[code] ?? 0))
}

type ResidentCustomer = Pick<VisibleOrder, 'customerId' | 'name'> & {
  period: number | null
  unit: string | null
  householdKind: HouseholdKind
}

type AppProps = {
  publishedContent?: CampaignContent
  liveDemo?: boolean
  campaignStatus?: CampaignStatus
  visibleOrders?: VisibleOrder[]
  residentCustomer?: ResidentCustomer | null
  verifiedResidentIdentity?: VerifiedResidentIdentity
  onBindResident?: (input: ResidentBindingInput) => Promise<ResidentCustomer>
  onSubmitOrder?: (items: Record<string, number>, customItems: CustomOrderItem[]) => Promise<void>
  syncError?: string
  onSyncRetry?: () => void
}

type Notice = { id: number; tone: 'success' | 'error'; text: string }

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
  const mixMatchItems = publishedCampaign.mixMatchDiscount
    ? activeItems.filter((item) => item.discountEligible)
    : []
  const regularItems = publishedCampaign.mixMatchDiscount
    ? activeItems.filter((item) => !item.discountEligible)
    : activeItems
  const [localOrders, setLocalOrders] = useState<VisibleOrder[]>(initialOrders)
  const orders = visibleOrders ?? localOrders
  const effectiveCustomer: ResidentCustomer | null = residentCustomer === undefined
    ? { ...initialOrders.find((order) => order.customerId === currentCustomerId)!, householdKind: 'resident' }
    : residentCustomer
  const [boundResident, setBoundResident] = useState<ResidentCustomer | null>(effectiveCustomer)
  const currentResident = residentCustomer === null ? boundResident : effectiveCustomer
  const ownOrder = currentResident
    ? orders.find((order) => order.customerId === currentResident.customerId)
    : undefined

  const [draft, setDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [savedDraft, setSavedDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [customDraft, setCustomDraft] = useState<CustomOrderItem[]>(() => ownOrder?.customItems?.map((item) => ({ ...item })) ?? [])
  const [savedCustomDraft, setSavedCustomDraft] = useState<CustomOrderItem[]>(() => ownOrder?.customItems?.map((item) => ({ ...item })) ?? [])
  const customItemSequence = useRef(0)
  const noticeSequence = useRef(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const draftDirty = !orderItemsEqual(draft, savedDraft) || !customOrderItemsEqual(customDraft, savedCustomDraft)
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)

  useEffect(() => {
    if (activeImageIndex !== null && !publishedCampaign.images[activeImageIndex]) {
      setActiveImageIndex(null)
    }
  }, [activeImageIndex, publishedCampaign.images])

  useEffect(() => {
    if (visibleOrders && !draftDirty) {
      const nextSavedDraft = { ...(ownOrder?.items ?? {}) }
      setDraft(nextSavedDraft)
      setSavedDraft(nextSavedDraft)
      const nextCustomDraft = ownOrder?.customItems?.map((item) => ({ ...item })) ?? []
      setCustomDraft(nextCustomDraft)
      setSavedCustomDraft(nextCustomDraft)
    }
  }, [draftDirty, ownOrder, visibleOrders])

  const showNotice = (tone: Notice['tone'], text: string) => {
    noticeSequence.current += 1
    setNotice({ id: noticeSequence.current, tone, text })
  }

  const thresholdKind = publishedCampaign.thresholdKind ?? 'quantity'
  const quantityUnit = normalizeQuantityUnit(publishedCampaign.quantityUnit)
  const thresholdTarget = thresholdKind === 'amount'
    ? (publishedCampaign.amountThreshold ?? publishedCampaign.threshold)
    : publishedCampaign.threshold
  const summary = useMemo(
    () => summarizeCampaign(
      orders,
      publishedCampaign.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? publishedCampaign.unitPrice })),
      { kind: thresholdKind, target: thresholdTarget },
    ),
    [orders, publishedCampaign, thresholdKind, thresholdTarget],
  )
  const draftQuantity = orderQuantity(draft)
  const customDraftQuantity = customDraft.reduce((sum, item) => sum + item.quantity, 0)
  const customDraftValid = customDraft.every((item) => item.name.trim().length > 0 && item.name.trim().length <= 100 && item.quantity >= 1 && item.quantity <= 20)
  const hasDraftItems = draftQuantity > 0 || customDraftQuantity > 0
  const hasSubmittedOrder = orderQuantity(savedDraft) > 0 || savedCustomDraft.length > 0
  const pricedItems = publishedCampaign.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? publishedCampaign.unitPrice }))
  const discountPricing: DiscountPricing = {
    baseRate: publishedCampaign.baseDiscountRate ?? 1,
    mixMatch: publishedCampaign.mixMatchDiscount ? {
      ...publishedCampaign.mixMatchDiscount,
      itemCodes: publishedCampaign.items.filter((item) => item.discountEligible).map((item) => item.code),
    } : null,
  }
  const draftPricing = priceOrder(draft, pricedItems, discountPricing)
  const savedPricing = priceOrder(savedDraft, pricedItems, discountPricing)
  const activePrices = activeItems.map((item) => discountedUnitPrice(
    item.unitPrice ?? publishedCampaign.unitPrice,
    publishedCampaign.baseDiscountRate ?? 1,
  ))
  const minimumPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0
  const maximumPrice = activePrices.length > 0 ? Math.max(...activePrices) : 0
  const editable = campaignStatus === 'open'
  const controlsEditable = editable && !submitting

  const progress: CampaignProgress = {
    value: thresholdKind === 'amount' ? summary.amount : summary.quantity,
    max: summary.threshold,
    text: thresholdKind === 'amount'
      ? `NT$ ${summary.amount.toLocaleString('zh-TW')} / NT$ ${summary.threshold.toLocaleString('zh-TW')}`
      : `${summary.quantity} ${quantityUnit} / ${summary.threshold} ${quantityUnit}`,
    remainingText: summary.formed
      ? '已成團'
      : thresholdKind === 'amount'
        ? `還差 NT$ ${summary.remaining.toLocaleString('zh-TW')} 成團`
        : `還差 ${summary.remaining} ${quantityUnit}成團`,
    formed: summary.formed,
  }
  const priceText = minimumPrice === maximumPrice ? `$${minimumPrice}／${quantityUnit}` : `$${minimumPrice}～$${maximumPrice}`
  const closing = describeAutoClose(publishedCampaign.autoCloseAt)
  const breakdownLines: BreakdownLine[] = draftPricing.lines.map((line) => {
    const index = publishedCampaign.items.findIndex((item) => item.code === line.code)
    return {
      ...line,
      label: itemLabel(index),
      name: publishedCampaign.items[index]?.name ?? line.code,
      discountText: line.discountType === 'mix_match'
        ? line.promotionName ?? ''
        : line.discountType === 'base' ? formatDiscountRate(line.discountRate) : '原價',
    }
  })
  const submittedAt = ownOrder
    ? wasMeaningfullyUpdated(ownOrder.orderedAt, ownOrder.updatedAt)
      ? `最後修改 ${formatZhTwTimestamp(ownOrder.updatedAt)}`
      : `下單 ${formatZhTwTimestamp(ownOrder.orderedAt)}`
    : null
  const savedCustomQuantity = savedCustomDraft.reduce((sum, item) => sum + item.quantity, 0)
  const submitHint = !editable
    ? '本團已結單，無法修改訂單。'
    : !hasDraftItems
      ? hasSubmittedOrder ? '想整筆取消訂單，請聯繫團主協助取消。' : '選擇品項後即可送出。'
      : !customDraftValid ? '請填寫額外品項的名稱與數量。' : null

  const adjust = (code: string, delta: number) => {
    if (!controlsEditable) return
    setNotice(null)
    const currentQuantity = draft[code] ?? 0
    const nextQuantity = Math.max(0, currentQuantity + delta)
    const nextDraftQuantity = draftQuantity - currentQuantity + nextQuantity
    if (thresholdKind === 'quantity' && delta > 0) {
      const otherQuantity = Math.max(0, summary.quantity - orderQuantity(savedDraft))
      const maxOrderQuantity = Math.max(0, publishedCampaign.threshold - otherQuantity)
      if (nextDraftQuantity > maxOrderQuantity) {
        showNotice('error', `目前其他住戶已訂 ${otherQuantity} ${quantityUnit}，成團上限為 ${thresholdTarget} ${quantityUnit}，本次最多可訂 ${maxOrderQuantity} ${quantityUnit}。`)
        return
      }
    }
    setDraft((current) => {
      if (nextQuantity === 0) {
        const { [code]: _removed, ...remaining } = current
        return remaining
      }
      return { ...current, [code]: nextQuantity }
    })
  }

  const renderProductRows = (itemsToRender: typeof activeItems) => itemsToRender.map((item) => {
    const itemIndex = publishedCampaign.items.findIndex((candidate) => candidate.code === item.code)
    const displayLabel = itemLabel(itemIndex)
    const itemPrice = item.unitPrice ?? publishedCampaign.unitPrice
    const usesMixMatch = draftPricing.mixMatchApplied && item.discountEligible
    const appliedRate = usesMixMatch
      ? publishedCampaign.mixMatchDiscount?.rate ?? publishedCampaign.baseDiscountRate ?? 1
      : publishedCampaign.baseDiscountRate ?? 1
    const currentUnitPrice = discountedUnitPrice(itemPrice, appliedRate)
    const priceLabel = usesMixMatch
      ? `任選價 $${currentUnitPrice}`
      : appliedRate < 1 ? `${formatDiscountRate(appliedRate)}價 $${currentUnitPrice}` : `$${currentUnitPrice}`
    const hint = item.discountEligible && publishedCampaign.mixMatchDiscount && !usesMixMatch
      ? `任選滿${publishedCampaign.mixMatchDiscount.minimumQuantity}件可享 $${discountedUnitPrice(itemPrice, publishedCampaign.mixMatchDiscount.rate)}`
      : undefined
    return (
      <ProductRow
        key={item.code}
        code={displayLabel}
        name={item.name}
        priceText={priceLabel}
        listPrice={appliedRate < 1 ? itemPrice : undefined}
        hint={hint}
        quantity={draft[item.code] ?? 0}
        disabled={!controlsEditable}
        onDecrement={() => adjust(item.code, -1)}
        onIncrement={() => adjust(item.code, 1)}
      />
    )
  })

  const addCustomItem = () => {
    if (!controlsEditable || customDraft.length >= 10) return
    customItemSequence.current += 1
    setCustomDraft((current) => [...current, {
      id: `custom-${Date.now()}-${customItemSequence.current}`,
      name: '',
      quantity: 0,
    }])
    setNotice(null)
  }

  const updateCustomItem = (id: string, update: Partial<Pick<CustomOrderItem, 'name' | 'quantity'>>) => {
    if (!controlsEditable) return
    setCustomDraft((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))
    setNotice(null)
  }

  const removeCustomItem = (id: string) => {
    if (!controlsEditable) return
    setCustomDraft((current) => current.filter((item) => item.id !== id))
    setNotice(null)
  }

  const bindResident = async (input: ResidentBindingInput) => {
    if (!onBindResident) return
    const customer = await onBindResident(input)
    setBoundResident(customer)
  }

  const submit = async () => {
    if (onSubmitOrder) {
      setSubmitting(true)
      setNotice(null)
      try {
        const submittedCustomItems = validCustomOrderItems(customDraft)
        await onSubmitOrder(draft, submittedCustomItems)
        setSavedDraft({ ...draft })
        setCustomDraft(submittedCustomItems)
        setSavedCustomDraft(submittedCustomItems)
        showNotice('success', '訂單已更新')
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : '訂單更新失敗')
      } finally {
        setSubmitting(false)
      }
      return
    }
    setLocalOrders((current) =>
      current.map((order) =>
        order.customerId === currentCustomerId
          ? { ...order, items: { ...draft }, customItems: validCustomOrderItems(customDraft), updatedAt: new Date().toISOString() }
          : order,
      ),
    )
    setSavedDraft({ ...draft })
    const submittedCustomItems = validCustomOrderItems(customDraft)
    setCustomDraft(submittedCustomItems)
    setSavedCustomDraft(submittedCustomItems)
    showNotice('success', '訂單已更新')
  }

  return (
    <div className={`resident-page${currentResident ? ' is-ordering' : ''}`}>
      <header className="resident-topbar">
        <a className="resident-back-link" href="/"><span aria-hidden="true">‹</span>全部團購</a>
      </header>
      {syncError && (
        <FeedbackMessage
          className="resident-sync-feedback"
          tone="warning"
          urgent
          actionLabel={onSyncRetry ? '重新同步' : undefined}
          onAction={onSyncRetry}
        >{syncError}</FeedbackMessage>
      )}
      <main className="resident-campaign">
        <CampaignSummary
          title={publishedCampaign.title}
          status={campaignStatus}
          priceText={priceText}
          arrivalLabel={publishedCampaign.arrivalLabel}
          closingText={closing?.when ?? null}
          progress={progress}
          orderCount={orders.length}
          openedAt={publishedCampaign.openedAt}
        />
        <CampaignInfo
          images={publishedCampaign.images}
          announcement={publishedCampaign.announcement}
          onOpenImage={setActiveImageIndex}
        />
        <section className="resident-card resident-order" aria-labelledby="order-heading">
          <div className="resident-section-heading">
            <h2 id="order-heading">我的訂單</h2>
            {currentResident && (
              <span>{formatHousehold(currentResident.householdKind, currentResident.period, currentResident.unit)}・{currentResident.name}</span>
            )}
          </div>
          {currentResident ? (
            <>
              {hasSubmittedOrder && (
                <p className="resident-sent">
                  <strong>{`你已送出 ${orderQuantity(savedDraft)} ${quantityUnit}・$${savedPricing.total}`}</strong>
                  {savedCustomQuantity > 0 && <span>{`・另有 ${savedCustomQuantity} ${quantityUnit}額外品項`}</span>}
                  {submittedAt && <span>{`・${submittedAt}`}</span>}
                </p>
              )}
              {publishedCampaign.mixMatchDiscount && (
                <div className={`resident-discount-status${draftPricing.mixMatchApplied ? ' is-applied' : ''}`} role="status">
                  <strong>{draftPricing.mixMatchApplied
                    ? `已套用${publishedCampaign.mixMatchDiscount.name}`
                    : `再選${Math.max(0, publishedCampaign.mixMatchDiscount.minimumQuantity - draftPricing.mixMatchQuantity)}件即可享${formatDiscountRate(publishedCampaign.mixMatchDiscount.rate)}`}</strong>
                  <span>{draftPricing.mixMatchApplied
                    ? `限定區共${draftPricing.mixMatchQuantity}件，全部享優惠價`
                    : `限定區目前${draftPricing.mixMatchQuantity}件，未達標維持${formatDiscountRate(publishedCampaign.baseDiscountRate ?? 1)}`}</span>
                </div>
              )}
              <div className="resident-order-items">
                {mixMatchItems.length > 0 && publishedCampaign.mixMatchDiscount && (
                  <section className="resident-product-section" aria-labelledby="mix-match-products-heading">
                    <h3 id="mix-match-products-heading">任選優惠專區</h3>
                    <p className="resident-product-section-note">共同累計件數・{publishedCampaign.mixMatchDiscount.name}</p>
                    {renderProductRows(mixMatchItems)}
                  </section>
                )}
                {regularItems.length > 0 && (
                  <section className="resident-product-section" aria-label={publishedCampaign.mixMatchDiscount ? '其他商品' : '商品選擇'}>
                    <h3>{publishedCampaign.mixMatchDiscount ? '其他商品' : '選擇品項'}</h3>
                    {renderProductRows(regularItems)}
                  </section>
                )}
                {publishedCampaign.allowCustomItems && (
                  <section className="resident-custom-items" aria-labelledby="custom-order-items-heading">
                    <div className="resident-custom-items-heading">
                      <div>
                        <h3 id="custom-order-items-heading">額外品項</h3>
                        <p>名稱由你填寫，金額由團主另計；不納入成團門檻。</p>
                      </div>
                      <Button variant="secondary" onClick={addCustomItem} disabled={!controlsEditable || customDraft.length >= 10}>
                        <span aria-hidden="true">＋</span> 新增額外品項
                      </Button>
                    </div>
                    {customDraft.map((item, index) => (
                      <div className="resident-custom-item-row" key={item.id}>
                        <label>
                          <span>品項名稱</span>
                          <input
                            className="ui-input"
                            aria-label={`額外品項 ${index + 1} 名稱`}
                            value={item.name}
                            maxLength={100}
                            disabled={!controlsEditable}
                            placeholder="例如：限定口味"
                            onChange={(event) => updateCustomItem(item.id, { name: event.target.value })}
                          />
                        </label>
                        <QuantityControl
                          label={`額外品項 ${index + 1}`}
                          value={item.quantity}
                          max={20}
                          disabled={!controlsEditable}
                          onDecrement={() => updateCustomItem(item.id, { quantity: Math.max(0, item.quantity - 1) })}
                          onIncrement={() => updateCustomItem(item.id, { quantity: Math.min(20, item.quantity + 1) })}
                        />
                        <Button
                          variant="utility"
                          aria-label={`移除額外品項 ${index + 1}`}
                          disabled={!controlsEditable}
                          onClick={() => removeCustomItem(item.id)}
                        >移除</Button>
                      </div>
                    ))}
                    {customDraft.length > 0 && <p className="resident-custom-items-note">金額由團主另計</p>}
                  </section>
                )}
              </div>
              {editable && <p className="resident-order-rule">結單前都可以回來改數量；要整筆取消請找團主。</p>}
              {notice?.tone === 'error' && <FeedbackMessage className="resident-order-feedback" tone="error">{notice.text}</FeedbackMessage>}
              <OrderSummaryBar
                quantity={draftQuantity}
                quantityUnit={quantityUnit}
                amount={draftPricing.total}
                customQuantity={customDraftQuantity}
                onShowBreakdown={hasDraftItems ? () => setBreakdownOpen(true) : undefined}
                submitDisabled={!controlsEditable || !draftDirty || !hasDraftItems || !customDraftValid}
                submitting={submitting}
                onSubmit={() => { void submit() }}
                hint={submitHint}
              />
            </>
          ) : (
            <ResidentBindingForm identity={verifiedResidentIdentity} disabled={!editable} onBind={bindResident} />
          )}
        </section>
        <OrderWall
          orders={orders}
          currentCustomerId={currentResident?.customerId}
          quantityUnit={quantityUnit}
          itemDisplayLabel={itemDisplayLabel}
        />
      </main>
      <footer className="resident-footer">
        {liveDemo
          ? 'Supabase Live Demo・發布內容由資料庫即時同步'
          : '這是本機示範模式；接上 LIFF 與 Supabase 後會自動辨識身分並即時同步。'}
      </footer>
      {notice?.tone === 'success' && (
        <Toast
          key={notice.id}
          className="resident-order-toast"
          message={notice.text}
          duration={SUCCESS_NOTICE_DURATION}
          onDismiss={() => setNotice(null)}
        />
      )}
      {breakdownOpen && (
        <BottomSheet title="訂單明細" onClose={() => setBreakdownOpen(false)}>
          <OrderBreakdown
            lines={breakdownLines}
            customItems={customDraft}
            total={draftPricing.total}
            savings={draftPricing.savings}
            quantityUnit={quantityUnit}
          />
        </BottomSheet>
      )}
      {activeImageIndex !== null && (
        <CampaignImageViewer
          images={publishedCampaign.images}
          index={activeImageIndex}
          onIndexChange={setActiveImageIndex}
          onClose={() => setActiveImageIndex(null)}
        />
      )}
    </div>
  )
}

export default App
