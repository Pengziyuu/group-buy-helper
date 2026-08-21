import { useEffect, useRef, useState } from 'react'
import './AdminApp.css'
import AdminOrdersPanel, { type FulfillmentUpdate } from './AdminOrdersPanel'
import { campaign, initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from './domain/adminOrders'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
import { itemLabel, MAX_ITEM_LETTERS } from './domain/itemLabel'
import {
  campaignContentEquals,
  loadDraftCampaign,
  loadPublishedCampaign,
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

const demoOrderSummary = buildOrganizerOrderSummary({
  orders: initialOrders,
  items,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
})

type PublicationState = 'draft' | 'published'

type AdminAppProps = {
  initialContent?: CampaignContent
  initialPublicationState?: PublicationState
  onSaveDraft?: (content: CampaignContent) => Promise<void>
  onPublish?: (content: CampaignContent) => Promise<CampaignContent | void>
  onSignOut?: () => Promise<void>
  orderSummary?: OrganizerOrderSummary | null
  campaignStatus?: CampaignStatus
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onSetOrderFulfillment?: (orderId: string, update: FulfillmentUpdate) => Promise<void>
  onUploadImage?: (file: File) => Promise<string>
  residentHref?: string | null
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function AdminApp({
  initialContent,
  initialPublicationState,
  onSaveDraft,
  onPublish,
  onSignOut,
  orderSummary,
  campaignStatus,
  onSetCampaignStatus,
  onSetOrderFulfillment,
  onUploadImage,
  residentHref = '/',
}: AdminAppProps = {}) {
  const [initialDraft] = useState(() => initialContent ?? loadDraftCampaign(defaultContent))
  const [initialPublished] = useState(() => initialContent ?? loadPublishedCampaign(defaultContent))
  const [title, setTitle] = useState(initialDraft.title)
  const [unitPrice, setUnitPrice] = useState(initialDraft.unitPrice)
  const [threshold, setThreshold] = useState(initialDraft.threshold)
  const [unitPriceInput, setUnitPriceInput] = useState(String(initialDraft.unitPrice))
  const [thresholdInput, setThresholdInput] = useState(String(initialDraft.threshold))
  const [announcement, setAnnouncement] = useState(initialDraft.announcement)
  const [images, setImages] = useState(() => [...initialDraft.images])
  const [campaignItems, setCampaignItems] = useState(() => initialDraft.items.map((item) => ({ ...item })))
  const [openedAt, setOpenedAt] = useState(initialDraft.openedAt)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageAltInputRef = useRef<HTMLInputElement>(null)
  const handledImageFileRef = useRef<File | null>(null)
  const operationLock = useRef(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [notice, setNotice] = useState('')
  const [busyAction, setBusyAction] = useState<'publish' | 'signout' | null>(null)
  const [draftRevision, setDraftRevision] = useState(0)
  const [autoSaveCycle, setAutoSaveCycle] = useState(0)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveFailedRevision, setAutoSaveFailedRevision] = useState<number | null>(null)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const savedRevisionRef = useRef(0)
  const latestRevisionRef = useRef(0)
  const autoSaveInFlightRef = useRef(false)
  const flushAutoSaveImmediatelyRef = useRef(false)
  const [publicationState, setPublicationState] = useState<PublicationState>(() =>
    initialPublicationState
      ?? (campaignContentEquals(initialDraft, initialPublished) ? 'published' : 'draft'),
  )
  const editorBusy = busyAction !== null || uploadingImage
  const unitPriceInputValid = /^\d+(?:\.\d{0,2})?$/.test(unitPriceInput) && Number(unitPriceInput) >= 0
  const thresholdInputValid = /^\d+$/.test(thresholdInput) && Number(thresholdInput) >= 1
  const numericInputsValid = unitPriceInputValid && thresholdInputValid
  const resolvedOrderSummary = orderSummary === undefined ? demoOrderSummary : orderSummary

  const currentContent = (): CampaignContent => ({
    title,
    unitPrice,
    threshold,
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
    setNotice('')
  }

  useEffect(() => {
    if (draftRevision === savedRevisionRef.current || editorBusy || autoSaveInFlightRef.current) return
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
          setNotice('已自動暫存')
        }
      }).catch((error: unknown) => {
        savedRevisionRef.current = revision
        if (latestRevisionRef.current === revision) {
          setAutoSaveFailedRevision(revision)
          setNotice(`自動暫存失敗：${messageFromError(error)}`)
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
  }, [announcement, autoSaveCycle, campaignItems, draftRevision, editorBusy, images, onSaveDraft, openedAt, threshold, title, unitPrice])

  const retryAutoSave = () => {
    if (autoSaveFailedRevision === null || editorBusy || autoSaveInFlightRef.current) return
    savedRevisionRef.current = Math.min(savedRevisionRef.current, autoSaveFailedRevision - 1)
    flushAutoSaveImmediatelyRef.current = true
    setAutoSaveFailedRevision(null)
    setNotice('正在重試暫存…')
    setAutoSaveCycle((cycle) => cycle + 1)
  }

  const publish = async () => {
    if (operationLock.current) return
    const wasOpened = itemsLocked
    operationLock.current = true
    setBusyAction('publish')
    setNotice('')
    try {
      if (!campaignItems.some((item) => item.active && item.name.trim())) {
        throw new Error('至少需要一個啟用且有名稱的品項')
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
        setUnitPrice(canonical.unitPrice)
        setThreshold(canonical.threshold)
        setUnitPriceInput(String(canonical.unitPrice))
        setThresholdInput(String(canonical.threshold))
        setAnnouncement(canonical.announcement)
        setImages([...canonical.images])
        setCampaignItems(canonical.items.map((item) => ({ ...item })))
        setOpenedAt(canonical.openedAt)
      }
      savedRevisionRef.current = draftRevision
      latestRevisionRef.current = draftRevision
      setPublicationState('published')
      setNotice(wasOpened ? '住戶公告已更新' : '已發布並開團')
    } catch (error) {
      setNotice(`發布失敗：${messageFromError(error)}`)
    } finally {
      operationLock.current = false
      setBusyAction(null)
    }
  }

  const signOut = async () => {
    if (!onSignOut || operationLock.current) return
    operationLock.current = true
    setBusyAction('signout')
    try {
      await onSignOut()
      operationLock.current = false
    } catch (error) {
      operationLock.current = false
      setNotice(`登出失敗：${messageFromError(error)}`)
      setBusyAction(null)
    }
  }

  const addImage = async () => {
    const alt = imageAlt.trim()
    if (!alt || images.length >= 10 || operationLock.current) return
    operationLock.current = true
    setNotice('')
    try {
      setUploadingImage(true)
      const src = onUploadImage
        ? imageFile && await onUploadImage(imageFile)
        : imageUrl.trim()
      if (!src) return
      setImages((current) => [...current, { src, alt }])
      markDraft()
      setImageUrl('')
      setImageFile(null)
      handledImageFileRef.current = null
      if (imageInputRef.current) imageInputRef.current.value = ''
      setImageAlt('')
      if (onUploadImage) setNotice('圖片已上傳，將自動暫存')
    } catch (error) {
      setNotice(`上傳失敗：${messageFromError(error)}`)
    } finally {
      operationLock.current = false
      setUploadingImage(false)
    }
  }

  const selectImageFile = (file: File | null) => {
    if (file && handledImageFileRef.current === file) return
    handledImageFileRef.current = file
    setImageFile(file)
    if (!file) {
      setNotice('')
      return
    }
    setNotice(`已選擇「${file.name}」，請填寫圖片說明後按「上傳圖片」。`)
    window.setTimeout(() => imageAltInputRef.current?.focus(), 0)
  }

  const itemsLocked = openedAt !== null

  const nextItemCode = () => {
    let suffix = 1
    while (campaignItems.some((item) => item.code === `ITEM${suffix}`)) suffix += 1
    return `ITEM${suffix}`
  }


  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">GROUP BUY HELPER</p>
          <h1>團主後台</h1>
          <p>編輯開團內容，右側即時確認住戶看到的畫面。</p>
        </div>
        <div className="admin-header-actions">
          <a href="/admin" className="resident-link">團購列表</a>
          {residentHref && <a href={residentHref} className="resident-link">查看住戶端 ↗</a>}
          {onSignOut && <button type="button" onClick={signOut} disabled={editorBusy}>登出</button>}
        </div>
      </header>

      <nav className="admin-section-nav" aria-label="編輯器區段">
        <a href="#editor-heading">基本資訊</a>
        <a href="#item-editor-heading">團購品項</a>
        <a href="#image-editor-heading">商品圖片</a>
        <a href="#admin-orders-heading">訂單管理</a>
      </nav>

      <div className="admin-workspace">
        <section className="editor-card" aria-labelledby="editor-heading">
          <div className="admin-section-heading">
            <div>
              <p>開團設定</p>
              <h2 id="editor-heading">基本資訊</h2>
            </div>
            <span>{publicationState === 'published' ? '已發布' : '草稿'}</span>
          </div>

          <div className="field-grid">
            <label className="field full-field">
              <span>團購標題</span>
              <input disabled={editorBusy} value={title} onChange={(event) => { setTitle(event.target.value); markDraft() }} />
            </label>
            <label className="field">
              <span>單價</span>
              <input
                disabled={editorBusy || itemsLocked}
                type="number"
                min="0"
                inputMode="numeric"
                value={unitPriceInput}
                onChange={(event) => {
                  const value = event.target.value
                  setUnitPriceInput(value)
                  if (/^\d+(?:\.\d{0,2})?$/.test(value)) {
                    setUnitPrice(Number(value))
                    markDraft()
                  }
                }}
                onBlur={() => {
                  if (!unitPriceInputValid) setUnitPriceInput(String(unitPrice))
                }}
              />
            </label>
            <label className="field">
              <span>成團門檻</span>
              <input
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
            </label>
            <div className="field full-field">
              <label htmlFor="campaign-announcement">開團資訊</label>
              <textarea
                id="campaign-announcement"
                rows={18}
                disabled={editorBusy}
                value={announcement}
                aria-describedby="announcement-count"
                onChange={(event) => { setAnnouncement(event.target.value); markDraft() }}
              />
              <small id="announcement-count">{announcement.length} / 20,000 字</small>
            </div>
            <section className="item-editor full-field" aria-labelledby="item-editor-heading">
              <div className="image-editor-heading">
                <h3 id="item-editor-heading">團購品項</h3>
                <span>{campaignItems.length} 個品項</span>
              </div>
              <p>商品名稱、口味與編號對照請寫在上方「開團資訊」。</p>
              <ol className="campaign-item-list">
                {campaignItems.map((item, index) => (
                  <li key={item.code} className={!item.active ? 'inactive' : ''}>
                    <strong>{itemLabel(index)}</strong>
                  </li>
                ))}
              </ol>
              {itemsLocked ? (
                <p>已正式開團，品項字母與單價已鎖定。</p>
              ) : (
                <div className="admin-workflow-actions">
                  <button
                    type="button"
                    disabled={editorBusy || campaignItems.length >= MAX_ITEM_LETTERS}
                    onClick={() => {
                      const label = itemLabel(campaignItems.length)
                      setCampaignItems((current) => [...current, { code: nextItemCode(), name: label, active: true }])
                      markDraft()
                    }}
                  >增加品項</button>
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={editorBusy || campaignItems.length <= 1}
                    onClick={() => {
                      setCampaignItems((current) => current.slice(0, -1))
                      markDraft()
                    }}
                  >減少品項</button>
                </div>
              )}
            </section>
            <section className="image-editor full-field" aria-labelledby="image-editor-heading">
              <div className="image-editor-heading">
                <h3 id="image-editor-heading">商品圖片</h3>
                <span>{images.length} / 10 張</span>
              </div>
              <div className="image-inputs">
                {onUploadImage ? (
                  <label className="field">
                    <span>商品圖片檔案</span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      disabled={editorBusy}
                      accept="image/jpeg,image/png,image/webp"
                      onInput={(event) => selectImageFile(event.currentTarget.files?.[0] ?? null)}
                      onChange={(event) => selectImageFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                ) : (
                  <label className="field">
                    <span>圖片網址</span>
                    <input disabled={editorBusy} value={imageUrl} placeholder="https://…" onChange={(event) => setImageUrl(event.target.value)} />
                  </label>
                )}
                <label className="field">
                  <span>圖片說明</span>
                  <input ref={imageAltInputRef} disabled={editorBusy} value={imageAlt} placeholder="例如：商品包裝正面" onChange={(event) => setImageAlt(event.target.value)} />
                </label>
                <button
                  type="button"
                  onClick={addImage}
                  disabled={
                    editorBusy
                    || !(onUploadImage ? imageFile : imageUrl.trim())
                    || !imageAlt.trim()
                    || images.length >= 10
                  }
                >
                  {uploadingImage ? '上傳中…' : onUploadImage ? '上傳圖片' : '新增圖片'}
                </button>
              </div>
              <ul className="image-list">
                {images.map((image, index) => (
                  <li key={`${image.src}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{image.alt}</strong><small>{image.src}</small></div>
                    <button disabled={editorBusy} type="button" aria-label={`移除 ${image.alt}`} onClick={() => { setImages((current) => current.filter((_, currentIndex) => currentIndex !== index)); markDraft() }}>移除</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="editor-actions">
            <p role="status">{notice}</p>
            {autoSaveFailedRevision !== null && (
              <button type="button" className="secondary-action" onClick={retryAutoSave} disabled={editorBusy || autoSaving}>立即重試暫存</button>
            )}
            <button type="button" onClick={publish} disabled={editorBusy || autoSaving || !numericInputsValid}>
              {busyAction === 'publish' ? '發布中…' : itemsLocked ? '更新住戶公告' : '發布並開團'}
            </button>
          </div>
        </section>

        <section className="resident-preview" aria-label="住戶端預覽">
          <div className="preview-bar">
            <span>住戶端預覽</span>
            <button type="button" aria-expanded={previewExpanded} aria-controls="resident-preview-announcement" onClick={() => setPreviewExpanded((expanded) => !expanded)}>
              {previewExpanded ? '收合完整預覽' : '展開完整預覽'}
            </button>
          </div>
          <article className="preview-phone">
            <div className="preview-status">
              <span>● {campaignStatus ? campaignStatusLabel(campaignStatus) : '收單中'}</span>
              <strong>每個 ${unitPrice}</strong>
            </div>
            <h2>{title || '未命名團購'}</h2>
            <p className="preview-threshold">結單：{threshold} 個成團</p>
            <div className="preview-images">
              {images.map((image, index) => (
                <img key={`${image.src}-${index}`} src={image.src} alt={image.alt} />
              ))}
            </div>
            <p id="resident-preview-announcement" className={`preview-copy ${previewExpanded ? 'is-expanded' : 'is-collapsed'}`}>{announcement}</p>
          </article>
        </section>
      </div>
      {resolvedOrderSummary && (
        <AdminOrdersPanel
          summary={resolvedOrderSummary}
          campaignStatus={campaignStatus}
          onSetCampaignStatus={onSetCampaignStatus}
          onSetOrderFulfillment={onSetOrderFulfillment}
        />
      )}
    </main>
  )
}

export default AdminApp
