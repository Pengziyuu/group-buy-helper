import { useRef, useState } from 'react'
import './AdminApp.css'
import AdminOrdersPanel, { type FulfillmentUpdate } from './AdminOrdersPanel'
import { campaign, initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from './domain/adminOrders'
import { campaignStatusLabel, type CampaignStatus } from './domain/orderWorkflow'
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
  onPublish?: (content: CampaignContent) => Promise<void>
  onSignOut?: () => Promise<void>
  orderSummary?: OrganizerOrderSummary | null
  campaignStatus?: CampaignStatus
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onSetOrderFulfillment?: (orderId: string, update: FulfillmentUpdate) => Promise<void>
  onUploadImage?: (file: File) => Promise<string>
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
}: AdminAppProps = {}) {
  const [initialDraft] = useState(() => initialContent ?? loadDraftCampaign(defaultContent))
  const [initialPublished] = useState(() => initialContent ?? loadPublishedCampaign(defaultContent))
  const [title, setTitle] = useState(initialDraft.title)
  const [unitPrice, setUnitPrice] = useState(initialDraft.unitPrice)
  const [threshold, setThreshold] = useState(initialDraft.threshold)
  const [announcement, setAnnouncement] = useState(initialDraft.announcement)
  const [images, setImages] = useState(() => [...initialDraft.images])
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageAltInputRef = useRef<HTMLInputElement>(null)
  const operationLock = useRef(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [notice, setNotice] = useState('')
  const [busyAction, setBusyAction] = useState<'save' | 'publish' | 'signout' | null>(null)
  const [publicationState, setPublicationState] = useState<PublicationState>(() =>
    initialPublicationState
      ?? (campaignContentEquals(initialDraft, initialPublished) ? 'published' : 'draft'),
  )
  const editorBusy = busyAction !== null || uploadingImage
  const resolvedOrderSummary = orderSummary === undefined ? demoOrderSummary : orderSummary

  const currentContent = (): CampaignContent => ({ title, unitPrice, threshold, announcement, images })
  const markDraft = () => {
    setPublicationState('draft')
    setNotice('')
  }

  const saveDraft = async () => {
    if (operationLock.current) return
    operationLock.current = true
    setBusyAction('save')
    setNotice('')
    try {
      const content = currentContent()
      if (onSaveDraft) await onSaveDraft(content)
      else saveDraftCampaign(content)
      setPublicationState('draft')
      setNotice('開團資料已儲存')
    } catch (error) {
      setNotice(`儲存失敗：${messageFromError(error)}`)
    } finally {
      operationLock.current = false
      setBusyAction(null)
    }
  }

  const publish = async () => {
    if (operationLock.current) return
    operationLock.current = true
    setBusyAction('publish')
    setNotice('')
    try {
      const content = currentContent()
      if (onPublish) await onPublish(content)
      else publishCampaign(content)
      setPublicationState('published')
      setNotice('已發布到住戶端')
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
      if (imageInputRef.current) imageInputRef.current.value = ''
      setImageAlt('')
      if (onUploadImage) setNotice('圖片已上傳，請儲存草稿')
    } catch (error) {
      setNotice(`上傳失敗：${messageFromError(error)}`)
    } finally {
      operationLock.current = false
      setUploadingImage(false)
    }
  }

  const selectImageFile = (file: File | null) => {
    setImageFile(file)
    if (!file) {
      setNotice('')
      return
    }
    setNotice(`已選擇「${file.name}」，請填寫圖片說明後按「上傳圖片」。`)
    window.setTimeout(() => imageAltInputRef.current?.focus(), 0)
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
          <a href="/" className="resident-link">查看住戶端 ↗</a>
          {onSignOut && <button type="button" onClick={signOut} disabled={editorBusy}>登出</button>}
        </div>
      </header>

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
              <input disabled={editorBusy} type="number" min="0" value={unitPrice} onChange={(event) => { setUnitPrice(Number(event.target.value)); markDraft() }} />
            </label>
            <label className="field">
              <span>成團門檻</span>
              <input disabled={editorBusy} type="number" min="1" value={threshold} onChange={(event) => { setThreshold(Number(event.target.value)); markDraft() }} />
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
            <button className="secondary-action" type="button" onClick={saveDraft} disabled={editorBusy}>
              {busyAction === 'save' ? '儲存中…' : '儲存草稿'}
            </button>
            <button type="button" onClick={publish} disabled={editorBusy}>
              {busyAction === 'publish' ? '發布中…' : '發布到住戶端'}
            </button>
          </div>
        </section>

        <section className="resident-preview" aria-label="住戶端預覽">
          <div className="preview-bar">
            <span>住戶端預覽</span>
            <span>即時更新</span>
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
            <p className="preview-copy">{announcement}</p>
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
