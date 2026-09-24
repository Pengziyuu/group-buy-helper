import { useEffect, useRef, useState } from 'react'
import './AdminApp.css'
import './components/organizer/content/content.css'
import { ContentPreview } from './components/organizer/content/ContentPreview'
import { ContentSectionNav } from './components/organizer/content/ContentSectionNav'
import { ContentTopBar, type ContentNotice } from './components/organizer/content/ContentTopBar'
import {
  describeSaveState,
  publicationStatus,
  publishBlockers,
  publishBlockReason,
  sectionCompletion,
} from './components/organizer/content/contentChecks'
import { ImageManager } from './components/organizer/content/ImageManager'
import { ItemTable } from './components/organizer/content/ItemTable'
import { PublishChecklist } from './components/organizer/content/PublishChecklist'
import { FormField } from './components/ui/FormField'
import { SegmentedControl } from './components/ui/SegmentedControl'
import { Switch } from './components/ui/Switch'
import { campaign, items } from './data/demo'
import type { CampaignStatus } from './domain/orderWorkflow'
import { normalizeQuantityUnit, QUANTITY_UNITS, type QuantityUnit } from './domain/quantityUnit'
import {
  buildArrivalLabel,
  daysInMonth,
  formatArrivalLabel,
  parseArrivalLabel,
  taipeiDateInputFromIso,
  taipeiNoonIso,
  todayInTaipei,
  validDateInput,
  type ArrivalMode,
  type ArrivalPeriod,
} from './domain/campaignSchedule'
import {
  campaignContentEquals,
  loadDraftCampaign,
  loadPublishedCampaign,
  normalizeCampaignContent,
  publishCampaign,
  saveDraftCampaign,
  type CampaignContent,
} from './services/demoCampaignStore'

const defaultContent: CampaignContent = {
  title: campaign.title,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
  announcement: campaign.announcement,
  images: campaign.images,
  items,
  openedAt: campaign.openedAt,
}

type PublicationState = 'draft' | 'published'

type AdminAppProps = {
  initialContent?: CampaignContent
  initialPublicationState?: PublicationState
  onSaveDraft?: (content: CampaignContent) => Promise<void>
  onPublish?: (content: CampaignContent) => Promise<CampaignContent | void>
  campaignStatus?: CampaignStatus
  onUploadImage?: (file: File) => Promise<string>
  residentHref?: string | null
  section?: 'content' | null
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const ARRIVAL_OPTIONS: Array<{ value: ArrivalMode; label: string }> = [
  { value: 'notice', label: '貨到通知' },
  { value: 'date', label: '指定日期' },
  { value: 'month-period', label: '月份時段' },
]

function AdminApp({
  initialContent,
  initialPublicationState,
  onSaveDraft,
  onPublish,
  campaignStatus,
  onUploadImage,
  residentHref = null,
  section = 'content',
}: AdminAppProps = {}) {
  const [initialDraft] = useState(() => initialContent
    ? normalizeCampaignContent(initialContent)
    : loadDraftCampaign(defaultContent))
  const [initialPublished] = useState(() => initialContent
    ? normalizeCampaignContent(initialContent)
    : loadPublishedCampaign(defaultContent))
  const [title, setTitle] = useState(initialDraft.title)
  const [threshold, setThreshold] = useState(initialDraft.threshold)
  const [thresholdInput, setThresholdInput] = useState(String(initialDraft.threshold))
  const [thresholdKind, setThresholdKind] = useState<'quantity' | 'amount'>(initialDraft.thresholdKind ?? 'quantity')
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>(() => normalizeQuantityUnit(initialDraft.quantityUnit))
  const [allowCustomItems, setAllowCustomItems] = useState(initialDraft.allowCustomItems ?? false)
  const [baseDiscountEnabled, setBaseDiscountEnabled] = useState((initialDraft.baseDiscountRate ?? 1) < 1)
  const [baseDiscountRate, setBaseDiscountRate] = useState(initialDraft.baseDiscountRate ?? 0.9)
  const [mixMatchEnabled, setMixMatchEnabled] = useState(initialDraft.mixMatchDiscount !== null && initialDraft.mixMatchDiscount !== undefined)
  const [mixMatchName, setMixMatchName] = useState(initialDraft.mixMatchDiscount?.name ?? '任選三件85折')
  const [mixMatchMinimumQuantity, setMixMatchMinimumQuantity] = useState(initialDraft.mixMatchDiscount?.minimumQuantity ?? 3)
  const [mixMatchDiscountRate, setMixMatchDiscountRate] = useState(initialDraft.mixMatchDiscount?.rate ?? 0.85)
  const [amountThreshold, setAmountThreshold] = useState(initialDraft.amountThreshold ?? Math.max(1, initialDraft.threshold * initialDraft.unitPrice))
  const [amountThresholdInput, setAmountThresholdInput] = useState(String(initialDraft.amountThreshold ?? Math.max(1, initialDraft.threshold * initialDraft.unitPrice)))
  const [announcement, setAnnouncement] = useState(initialDraft.announcement)
  const initialArrival = parseArrivalLabel(initialDraft.arrivalLabel)
  const [arrivalMode, setArrivalMode] = useState<ArrivalMode>(initialArrival.mode)
  const [arrivalMonth, setArrivalMonth] = useState(initialArrival.month)
  const [arrivalDay, setArrivalDay] = useState(initialArrival.day)
  const [arrivalPeriod, setArrivalPeriod] = useState<ArrivalPeriod>(initialArrival.period)
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(Boolean(initialDraft.autoCloseAt))
  const [autoCloseDate, setAutoCloseDate] = useState(() => taipeiDateInputFromIso(initialDraft.autoCloseAt))
  const [images, setImages] = useState(() => [...initialDraft.images])
  const [campaignItems, setCampaignItems] = useState(() => initialDraft.items.map((item) => ({ ...item })))
  const [openedAt, setOpenedAt] = useState(initialDraft.openedAt)
  const operationLock = useRef(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [notice, setNotice] = useState<ContentNotice | null>(null)
  const [busyAction, setBusyAction] = useState<'publish' | null>(null)
  const [draftRevision, setDraftRevision] = useState(0)
  const [autoSaveCycle, setAutoSaveCycle] = useState(0)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveFailedRevision, setAutoSaveFailedRevision] = useState<number | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const savedRevisionRef = useRef(0)
  const latestRevisionRef = useRef(0)
  const autoSaveInFlightRef = useRef(false)
  const flushAutoSaveImmediatelyRef = useRef(false)
  const [publicationState, setPublicationState] = useState<PublicationState>(() =>
    initialPublicationState
      ?? (campaignContentEquals(initialDraft, initialPublished) ? 'published' : 'draft'),
  )
  const editorBusy = busyAction !== null || uploadingImage
  const activeItemPrices = campaignItems
    .filter((item) => item.active)
    .flatMap((item) => item.unitPrice === undefined ? [] : [item.unitPrice])
  const unitPrice = activeItemPrices.length > 0 ? Math.min(...activeItemPrices) : 0
  const maximumItemPrice = activeItemPrices.length > 0 ? Math.max(...activeItemPrices) : 0
  const itemPricesValid = campaignItems.every((item) => Number.isFinite(item.unitPrice) && (item.unitPrice ?? -1) >= 0)
  const discountRulesValid = (!baseDiscountEnabled || (baseDiscountRate > 0 && baseDiscountRate <= 1))
    && (!mixMatchEnabled || (mixMatchName.trim().length > 0
      && mixMatchName.length <= 100
      && Number.isInteger(mixMatchMinimumQuantity)
      && mixMatchMinimumQuantity >= 2
      && mixMatchDiscountRate > 0
      && mixMatchDiscountRate <= (baseDiscountEnabled ? baseDiscountRate : 1)
      && campaignItems.some((item) => item.active && item.discountEligible)))
  const thresholdInputValid = /^\d+$/.test(thresholdInput) && Number(thresholdInput) >= 1
  const amountThresholdInputValid = /^\d+(?:\.\d{0,2})?$/.test(amountThresholdInput)
    && Number(amountThresholdInput) > 0
    && Number(amountThresholdInput) <= 999999999999.99
  const thresholdValid = thresholdKind === 'quantity' ? thresholdInputValid : amountThresholdInputValid
  const numericInputsValid = itemPricesValid && discountRulesValid && thresholdValid
  const scheduleInputsValid = !autoCloseEnabled || (validDateInput(autoCloseDate) && autoCloseDate >= todayInTaipei())
  const arrivalLabel = buildArrivalLabel(arrivalMode, arrivalMonth, arrivalDay, arrivalPeriod)
  const autoCloseAt = autoCloseEnabled && scheduleInputsValid ? taipeiNoonIso(autoCloseDate) : null
  const draftSavePending = draftRevision !== savedRevisionRef.current
  const itemsLocked = openedAt !== null
  const customItemsLocked = openedAt !== null

  const currentContent = (): CampaignContent => ({
    title,
    unitPrice,
    threshold,
    thresholdKind,
    amountThreshold: thresholdKind === 'amount' ? amountThreshold : null,
    quantityUnit,
    allowCustomItems,
    baseDiscountRate: baseDiscountEnabled ? baseDiscountRate : 1,
    mixMatchDiscount: mixMatchEnabled ? {
      name: mixMatchName.trim(),
      minimumQuantity: mixMatchMinimumQuantity,
      rate: mixMatchDiscountRate,
    } : null,
    arrivalLabel,
    autoCloseAt,
    announcement,
    images,
    items: campaignItems,
    openedAt,
  })

  const markDraft = () => {
    latestRevisionRef.current += 1
    setDraftRevision(latestRevisionRef.current)
    setPublicationState('draft')
    setAutoSaveFailedRevision(null)
    setAutoSaveError(null)
    setNotice(null)
  }

  useEffect(() => {
    if (draftRevision === savedRevisionRef.current || editorBusy || autoSaveInFlightRef.current || !numericInputsValid || !scheduleInputsValid) return
    const revision = draftRevision
    const delay = flushAutoSaveImmediatelyRef.current ? 0 : 500
    flushAutoSaveImmediatelyRef.current = false
    const timer = window.setTimeout(() => {
      autoSaveInFlightRef.current = true
      setAutoSaving(true)
      const content: CampaignContent = {
        title,
        unitPrice,
        threshold,
        thresholdKind,
        amountThreshold: thresholdKind === 'amount' ? amountThreshold : null,
        quantityUnit,
        allowCustomItems,
        baseDiscountRate: baseDiscountEnabled ? baseDiscountRate : 1,
        mixMatchDiscount: mixMatchEnabled ? {
          name: mixMatchName.trim(),
          minimumQuantity: mixMatchMinimumQuantity,
          rate: mixMatchDiscountRate,
        } : null,
        arrivalLabel,
        autoCloseAt,
        announcement,
        images,
        items: campaignItems,
        openedAt,
      }
      const saving = onSaveDraft ? onSaveDraft(content) : Promise.resolve(saveDraftCampaign(content))
      void saving.then(() => {
        savedRevisionRef.current = revision
        if (latestRevisionRef.current === revision) {
          setAutoSaveFailedRevision(null)
          setAutoSaveError(null)
          setLastSavedAt(new Date())
        }
      }).catch((error: unknown) => {
        savedRevisionRef.current = revision
        if (latestRevisionRef.current === revision) {
          setAutoSaveFailedRevision(revision)
          setAutoSaveError(messageFromError(error))
        }
      }).finally(() => {
        autoSaveInFlightRef.current = false
        const hasNewerRevision = latestRevisionRef.current > revision
        flushAutoSaveImmediatelyRef.current = hasNewerRevision
        if (!hasNewerRevision) setAutoSaving(false)
        setAutoSaveCycle((cycle) => cycle + 1)
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [allowCustomItems, amountThreshold, announcement, arrivalLabel, autoCloseAt, autoSaveCycle, baseDiscountEnabled, baseDiscountRate, campaignItems, draftRevision, editorBusy, images, mixMatchDiscountRate, mixMatchEnabled, mixMatchMinimumQuantity, mixMatchName, numericInputsValid, onSaveDraft, openedAt, quantityUnit, scheduleInputsValid, threshold, thresholdKind, title, unitPrice])

  const retryAutoSave = () => {
    if (autoSaveFailedRevision === null || editorBusy || autoSaveInFlightRef.current) return
    savedRevisionRef.current = Math.min(savedRevisionRef.current, autoSaveFailedRevision - 1)
    flushAutoSaveImmediatelyRef.current = true
    setAutoSaveFailedRevision(null)
    setAutoSaveError(null)
    setAutoSaveCycle((cycle) => cycle + 1)
  }

  const publish = async () => {
    if (operationLock.current) return
    const wasOpened = itemsLocked
    operationLock.current = true
    setBusyAction('publish')
    setNotice(null)
    try {
      if (!campaignItems.some((item) => item.active && item.name.trim())) {
        throw new Error('至少需要一個啟用且有名稱的品項')
      }
      if (!itemPricesValid) {
        throw new Error('每個品項都需要有效的單價')
      }
      if (!discountRulesValid) {
        throw new Error('請完成折扣優惠設定，且至少選擇一個任選品項')
      }
      const content = currentContent()
      if (!onPublish && !content.openedAt) content.openedAt = new Date().toISOString()
      const canonical = onPublish ? await onPublish(content) : undefined
      if (!onPublish) {
        publishCampaign(content)
        setOpenedAt(content.openedAt)
      }
      if (canonical) {
        setTitle(canonical.title)
        setThreshold(canonical.threshold)
        setThresholdInput(String(canonical.threshold))
        setThresholdKind(canonical.thresholdKind ?? 'quantity')
        setQuantityUnit(normalizeQuantityUnit(canonical.quantityUnit))
        setAllowCustomItems(canonical.allowCustomItems ?? false)
        setBaseDiscountEnabled((canonical.baseDiscountRate ?? 1) < 1)
        setBaseDiscountRate(canonical.baseDiscountRate ?? 0.9)
        setMixMatchEnabled(canonical.mixMatchDiscount !== null && canonical.mixMatchDiscount !== undefined)
        setMixMatchName(canonical.mixMatchDiscount?.name ?? '任選三件85折')
        setMixMatchMinimumQuantity(canonical.mixMatchDiscount?.minimumQuantity ?? 3)
        setMixMatchDiscountRate(canonical.mixMatchDiscount?.rate ?? 0.85)
        const canonicalArrival = parseArrivalLabel(canonical.arrivalLabel)
        setArrivalMode(canonicalArrival.mode)
        setArrivalMonth(canonicalArrival.month)
        setArrivalDay(canonicalArrival.day)
        setArrivalPeriod(canonicalArrival.period)
        setAutoCloseEnabled(Boolean(canonical.autoCloseAt))
        setAutoCloseDate(taipeiDateInputFromIso(canonical.autoCloseAt))
        const canonicalAmountThreshold = canonical.amountThreshold ?? Math.max(1, canonical.threshold * canonical.unitPrice)
        setAmountThreshold(canonicalAmountThreshold)
        setAmountThresholdInput(String(canonicalAmountThreshold))
        setAnnouncement(canonical.announcement)
        setImages([...canonical.images])
        setCampaignItems(canonical.items.map((item) => ({ ...item })))
        setOpenedAt(canonical.openedAt)
      }
      savedRevisionRef.current = draftRevision
      latestRevisionRef.current = draftRevision
      setPublicationState('published')
      setNotice({ tone: 'info', text: wasOpened ? '住戶頁已更新' : '已發布並開團' })
    } catch (error) {
      setNotice({ tone: 'error', text: `發布失敗：${messageFromError(error)}` })
    } finally {
      operationLock.current = false
      setBusyAction(null)
    }
  }

  const addImage = (src: string) => {
    setImages((current) => [...current, { src, alt: `${title.trim() || '商品'}第 ${current.length + 1} 張商品圖片` }])
    markDraft()
  }

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    markDraft()
  }

  const readiness = {
    title,
    announcement,
    items: campaignItems,
    itemPricesValid,
    thresholdValid,
    scheduleValid: scheduleInputsValid,
    discountRulesValid,
  }
  const blockers = publishBlockers(readiness)
  const saveState = describeSaveState({
    pending: draftSavePending,
    saving: autoSaving,
    failedMessage: autoSaveError,
    canSave: numericInputsValid && scheduleInputsValid,
    lastSavedAt,
  })
  const publishing = busyAction === 'publish'
  const publishDisabledReason = publishing
    ? null
    : publishBlockReason({ blockers, uploading: uploadingImage, savePending: autoSaving || draftSavePending })
  const priceText = unitPrice === maximumItemPrice ? `$${unitPrice}` : `$${unitPrice}～$${maximumItemPrice}`
  const thresholdText = thresholdKind === 'amount'
    ? `滿 NT$ ${amountThreshold.toLocaleString('zh-TW')} 成團`
    : `結單：${threshold} ${quantityUnit}成團`

  return (
    <div className="admin-shell">
      <section id="admin-settings-panel" className="content-editor" aria-labelledby="content-heading" hidden={section !== 'content'}>
        <ContentTopBar
          saveState={saveState}
          onRetrySave={retryAutoSave}
          retryDisabled={editorBusy || autoSaving}
          publication={publicationStatus(openedAt, publicationState)}
          residentHref={residentHref}
          primaryLabel={itemsLocked ? '更新住戶頁' : '發布並開團'}
          publishing={publishing}
          publishDisabledReason={publishDisabledReason}
          onPublish={() => { void publish() }}
          notice={notice}
        />
        <ContentSectionNav completion={sectionCompletion(readiness)} />
        <div className="content-layout">
          <div className="content-form">
            <section id="content-announcement" className="content-section" aria-labelledby="content-announcement-heading">
              <h3 id="content-announcement-heading" tabIndex={-1}>公告與圖片</h3>
              <FormField id="content-title" label="團購標題" required>
                <input className="ui-input" disabled={editorBusy} value={title} onChange={(event) => { setTitle(event.target.value); markDraft() }} />
              </FormField>
              <FormField id="campaign-announcement" label="開團資訊" helper={`${announcement.length.toLocaleString('en-US')} / 20,000 字`}>
                <textarea
                  className="ui-input content-announcement"
                  rows={10}
                  maxLength={20000}
                  disabled={editorBusy}
                  value={announcement}
                  onChange={(event) => { setAnnouncement(event.target.value); markDraft() }}
                />
              </FormField>
              <h4 className="content-subheading">商品圖片</h4>
              <ImageManager
                images={images}
                disabled={publishing}
                onUploadImage={onUploadImage}
                onAddImage={addImage}
                onRemoveImage={removeImage}
                onUploadingChange={setUploadingImage}
              />
            </section>

            <section id="content-items" className="content-section" aria-labelledby="content-items-heading">
              <h3 id="content-items-heading" tabIndex={-1}>品項與價格</h3>
              {itemsLocked
                ? <p className="content-lock-note">已開團，品項與價格已鎖定</p>
                : <p className="content-help">代碼會自動延伸為 A～Z、AA～AZ；每個品項都要有名稱與單價。</p>}
              <ItemTable
                items={campaignItems}
                locked={itemsLocked}
                disabled={editorBusy}
                mixMatchEnabled={mixMatchEnabled}
                onChange={(nextItems) => { setCampaignItems(nextItems); markDraft() }}
              />
            </section>

            <section id="content-schedule" className="content-section" aria-labelledby="content-schedule-heading">
              <h3 id="content-schedule-heading" tabIndex={-1}>成團與時程</h3>
              <div className="content-field-group">
                <span className="content-group-label" aria-hidden="true">門檻類型</span>
                <SegmentedControl
                  label="門檻類型"
                  value={thresholdKind}
                  onChange={(kind) => { setThresholdKind(kind); markDraft() }}
                  options={[
                    { value: 'quantity', label: '數量', disabled: editorBusy },
                    { value: 'amount', label: '總金額', disabled: editorBusy },
                  ]}
                />
              </div>
              <div className="content-field-grid">
                {thresholdKind === 'quantity' ? (
                  <FormField id="content-threshold" label="成團門檻" helper="剛好達標後自動結單，超過門檻的訂單不會送出。">
                    <input
                      className="ui-input"
                      disabled={editorBusy}
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={thresholdInput}
                      onChange={(event) => {
                        const value = event.target.value
                        setThresholdInput(value)
                        if (value !== '' && /^\d+$/.test(value) && Number(value) >= 1) {
                          setThreshold(Number(value))
                          markDraft()
                        }
                      }}
                      onBlur={() => {
                        if (!thresholdInputValid) setThresholdInput(String(threshold))
                      }}
                    />
                  </FormField>
                ) : (
                  <FormField id="content-amount-threshold" label="成團門檻金額" helper="只顯示成團進度，達到金額後不會自動結單。">
                    <input
                      className="ui-input"
                      disabled={editorBusy}
                      type="number"
                      min="0.01"
                      max="999999999999.99"
                      step="0.01"
                      inputMode="decimal"
                      value={amountThresholdInput}
                      onChange={(event) => {
                        const value = event.target.value
                        if (value !== '' && !/^\d+(?:\.\d{0,2})?$/.test(value)) return
                        setAmountThresholdInput(value)
                        if (value !== '' && Number(value) > 0 && Number(value) <= 999999999999.99) {
                          setAmountThreshold(Number(value))
                          markDraft()
                        }
                      }}
                      onBlur={() => {
                        if (!amountThresholdInputValid) setAmountThresholdInput(String(amountThreshold))
                      }}
                    />
                  </FormField>
                )}
                <FormField id="content-quantity-unit" label="數量單位" helper="套用於成團進度、訂單總數與品項彙總。">
                  <select
                    className="ui-input"
                    disabled={editorBusy}
                    value={quantityUnit}
                    onChange={(event) => {
                      setQuantityUnit(normalizeQuantityUnit(event.target.value))
                      markDraft()
                    }}
                  >
                    {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="content-field-group">
                <span className="content-group-label" aria-hidden="true">預計到貨</span>
                <SegmentedControl
                  label="預計到貨"
                  value={arrivalMode}
                  onChange={(mode) => { setArrivalMode(mode); markDraft() }}
                  options={ARRIVAL_OPTIONS.map((option) => ({ ...option, disabled: editorBusy }))}
                />
                {arrivalMode !== 'notice' && (
                  <div className="content-inline-fields">
                    <FormField id="content-arrival-month" label="到貨月份">
                      <select className="ui-input" value={arrivalMonth} disabled={editorBusy} onChange={(event) => {
                        const month = Number(event.target.value)
                        setArrivalMonth(month)
                        setArrivalDay((current) => Math.min(current, daysInMonth(month)))
                        markDraft()
                      }}>
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}月</option>)}
                      </select>
                    </FormField>
                    {arrivalMode === 'date' ? (
                      <FormField id="content-arrival-day" label="到貨日期">
                        <select className="ui-input" value={arrivalDay} disabled={editorBusy} onChange={(event) => { setArrivalDay(Number(event.target.value)); markDraft() }}>
                          {Array.from({ length: daysInMonth(arrivalMonth) }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}日</option>)}
                        </select>
                      </FormField>
                    ) : (
                      <FormField id="content-arrival-period" label="到貨時段">
                        <select className="ui-input" value={arrivalPeriod} disabled={editorBusy} onChange={(event) => { setArrivalPeriod(event.target.value as ArrivalPeriod); markDraft() }}>
                          <option value="初">月初</option>
                          <option value="中">月中</option>
                          <option value="底">月底</option>
                        </select>
                      </FormField>
                    )}
                  </div>
                )}
                <p className="content-help">{formatArrivalLabel(arrivalLabel)}</p>
              </div>
              <Switch
                label="設定結單日期"
                description="台灣時間當日中午12:00自動結單；若數量先達門檻，會提前結單。"
                checked={autoCloseEnabled}
                disabled={editorBusy}
                onChange={(checked) => {
                  setAutoCloseEnabled(checked)
                  if (checked && !autoCloseDate) setAutoCloseDate(todayInTaipei())
                  markDraft()
                }}
              />
              {autoCloseEnabled && (
                <FormField id="content-auto-close" label="結單日期" error={scheduleInputsValid ? undefined : '結單日期要是今天或之後'}>
                  <input
                    className="ui-input content-date"
                    type="date"
                    min={todayInTaipei()}
                    value={autoCloseDate}
                    disabled={editorBusy}
                    onChange={(event) => { setAutoCloseDate(event.target.value); markDraft() }}
                  />
                </FormField>
              )}
            </section>

            <section id="content-advanced" className="content-section" aria-labelledby="content-advanced-heading">
              <h3 id="content-advanced-heading" tabIndex={-1}>優惠與進階</h3>
              {itemsLocked
                ? <p className="content-lock-note">已開團，優惠與額外品項設定已鎖定</p>
                : <p className="content-help">選填，開啟才會套用。</p>}
              <Switch
                label="啟用全團基本折扣"
                description="所有正式品項預設套用；額外品項不計價。"
                checked={baseDiscountEnabled}
                disabled={editorBusy || itemsLocked}
                onChange={(checked) => {
                  setBaseDiscountEnabled(checked)
                  if (checked && baseDiscountRate >= 1) setBaseDiscountRate(0.9)
                  markDraft()
                }}
              />
              {baseDiscountEnabled && (
                <FormField id="content-base-discount" label="基本折數" helper="例如輸入9代表9折。" className="content-number-field">
                  <input
                    className="ui-input"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={Number((baseDiscountRate * 10).toFixed(2))}
                    disabled={editorBusy || itemsLocked}
                    onChange={(event) => {
                      const fold = Number(event.target.value)
                      if (fold > 0 && fold <= 10) { setBaseDiscountRate(fold / 10); markDraft() }
                    }}
                  />
                </FormField>
              )}
              <Switch
                label="啟用任選優惠"
                description="同一住戶在參加任選的品項合計達到最低件數後，這些品項全部套用優惠折數；參加的品項在「品項與價格」勾選。"
                checked={mixMatchEnabled}
                disabled={editorBusy || itemsLocked}
                onChange={(checked) => {
                  setMixMatchEnabled(checked)
                  if (!checked) {
                    setCampaignItems((current) => current.map((item) => ({ ...item, discountEligible: false })))
                  }
                  markDraft()
                }}
              />
              {mixMatchEnabled && (
                <div className="content-field-grid">
                  <FormField id="content-mix-name" label="任選優惠名稱">
                    <input className="ui-input" maxLength={100} value={mixMatchName} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { setMixMatchName(event.target.value); markDraft() }} />
                  </FormField>
                  <FormField id="content-mix-minimum" label="任選最低件數" className="content-number-field">
                    <input className="ui-input" type="number" min="2" max="100" step="1" value={mixMatchMinimumQuantity} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 2 && value <= 100) { setMixMatchMinimumQuantity(value); markDraft() } }} />
                  </FormField>
                  <FormField id="content-mix-rate" label="任選優惠折數" helper="例如輸入8.5代表85折。" className="content-number-field">
                    <input className="ui-input" type="number" min="0.1" max="10" step="0.1" value={Number((mixMatchDiscountRate * 10).toFixed(2))} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { const fold = Number(event.target.value); if (fold > 0 && fold <= 10) { setMixMatchDiscountRate(fold / 10); markDraft() } }} />
                  </FormField>
                </div>
              )}
              <Switch
                label="允許住戶新增額外品項"
                description={customItemsLocked
                  ? '正式開團後此設定不可變更。'
                  : '住戶可填名稱與數量，不輸入金額；額外品項不納入成團門檻。'}
                checked={allowCustomItems}
                disabled={editorBusy || customItemsLocked}
                onChange={(checked) => { setAllowCustomItems(checked); markDraft() }}
              />
            </section>
          </div>

          <aside className="content-side" aria-label="住戶頁預覽與發布前檢查">
            <ContentPreview
              status={campaignStatus}
              title={title}
              priceText={priceText}
              arrivalLabel={arrivalLabel}
              autoCloseAt={autoCloseAt}
              thresholdText={thresholdText}
              allowCustomItems={allowCustomItems}
              images={images}
              announcement={announcement}
              items={campaignItems}
            />
            <PublishChecklist blockers={blockers} />
          </aside>
        </div>
      </section>
    </div>
  )
}

export default AdminApp
