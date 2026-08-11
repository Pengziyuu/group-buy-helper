import { useState } from 'react'
import './AdminApp.css'
import { campaign } from './data/demo'

function AdminApp() {
  const [title, setTitle] = useState(campaign.title)
  const [unitPrice, setUnitPrice] = useState(campaign.unitPrice)
  const [threshold, setThreshold] = useState(campaign.threshold)
  const [announcement, setAnnouncement] = useState(campaign.announcement)
  const [images, setImages] = useState(() => [...campaign.images])
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [notice, setNotice] = useState('')

  const addImage = () => {
    const src = imageUrl.trim()
    const alt = imageAlt.trim()
    if (!src || !alt || images.length >= 10) return
    setImages((current) => [...current, { src, alt }])
    setImageUrl('')
    setImageAlt('')
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">GROUP BUY HELPER</p>
          <h1>團主後台</h1>
          <p>編輯開團內容，右側即時確認住戶看到的畫面。</p>
        </div>
        <a href="/" className="resident-link">查看住戶端 ↗</a>
      </header>

      <div className="admin-workspace">
        <section className="editor-card" aria-labelledby="editor-heading">
          <div className="admin-section-heading">
            <div>
              <p>開團設定</p>
              <h2 id="editor-heading">基本資訊</h2>
            </div>
            <span>草稿</span>
          </div>

          <div className="field-grid">
            <label className="field full-field">
              <span>團購標題</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>單價</span>
              <input type="number" min="0" value={unitPrice} onChange={(event) => setUnitPrice(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>成團門檻</span>
              <input type="number" min="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            </label>
            <div className="field full-field">
              <label htmlFor="campaign-announcement">開團資訊</label>
              <textarea
                id="campaign-announcement"
                rows={18}
                value={announcement}
                aria-describedby="announcement-count"
                onChange={(event) => setAnnouncement(event.target.value)}
              />
              <small id="announcement-count">{announcement.length} / 20,000 字</small>
            </div>
            <section className="image-editor full-field" aria-labelledby="image-editor-heading">
              <div className="image-editor-heading">
                <h3 id="image-editor-heading">商品圖片</h3>
                <span>{images.length} / 10 張</span>
              </div>
              <div className="image-inputs">
                <label className="field">
                  <span>圖片網址</span>
                  <input value={imageUrl} placeholder="https://…" onChange={(event) => setImageUrl(event.target.value)} />
                </label>
                <label className="field">
                  <span>圖片說明</span>
                  <input value={imageAlt} placeholder="例如：商品包裝正面" onChange={(event) => setImageAlt(event.target.value)} />
                </label>
                <button type="button" onClick={addImage} disabled={!imageUrl.trim() || !imageAlt.trim() || images.length >= 10}>新增圖片</button>
              </div>
              <ul className="image-list">
                {images.map((image, index) => (
                  <li key={`${image.src}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{image.alt}</strong><small>{image.src}</small></div>
                    <button type="button" aria-label={`移除 ${image.alt}`} onClick={() => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}>移除</button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="editor-actions">
            <p role="status">{notice}</p>
            <button type="button" onClick={() => setNotice('開團資料已儲存')}>儲存草稿</button>
          </div>
        </section>

        <section className="resident-preview" aria-label="住戶端預覽">
          <div className="preview-bar">
            <span>住戶端預覽</span>
            <span>即時更新</span>
          </div>
          <article className="preview-phone">
            <div className="preview-status">
              <span>● 收單中</span>
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
    </main>
  )
}

export default AdminApp
