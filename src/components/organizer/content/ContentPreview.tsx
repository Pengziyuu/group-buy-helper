import { useLayoutEffect, useRef, useState } from 'react'
import LinkifiedText from '../../LinkifiedText'
import { itemLabel } from '../../../domain/itemLabel'
import { campaignStatusLabel, type CampaignStatus } from '../../../domain/orderWorkflow'
import type { CampaignImage, CampaignItem } from '../../../services/demoCampaignStore'
import { describeResidentSchedule } from '../../resident/residentSchedule'
import { ImageGallery } from '../../ui/ImageGallery'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { StatusBadge } from '../../ui/StatusBadge'

type PreviewDevice = 'phone' | 'desktop'
const DESKTOP_WIDTH = 1024

type ContentPreviewProps = {
  status?: CampaignStatus
  title: string
  priceText: string
  arrivalLabel: string
  autoCloseAt: string | null
  thresholdKind?: 'quantity' | 'amount'
  thresholdAutoClose?: boolean
  thresholdText: string
  allowCustomItems: boolean
  images: CampaignImage[]
  announcement: string
  items: CampaignItem[]
}

export function ContentPreview({
  status = 'open', title, priceText, arrivalLabel, autoCloseAt, thresholdKind = 'quantity', thresholdAutoClose, thresholdText, allowCustomItems, images, announcement, items,
}: ContentPreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>('phone')
  // Same wording as the resident campaign page, so the preview never promises a different schedule.
  const { closing, arrival } = describeResidentSchedule({ status, autoCloseAt, thresholdKind, thresholdAutoClose, arrivalLabel }, new Date())
  const [expanded, setExpanded] = useState(false)
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const desktop = device === 'desktop'

  // The desktop layout is drawn at its real width and scaled down to fit the column.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const frame = frameRef.current
    if (!desktop || !viewport || !frame || typeof ResizeObserver === 'undefined') {
      setFit(null)
      return
    }
    const update = () => {
      const scale = Math.min(1, viewport.clientWidth / DESKTOP_WIDTH)
      setFit({ scale, height: frame.offsetHeight * scale })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [desktop])

  return (
    <section className="content-preview" aria-label="住戶端預覽">
      <div className="content-preview-bar">
        <h3>住戶頁預覽</h3>
        <SegmentedControl
          label="預覽裝置"
          value={device}
          onChange={setDevice}
          options={[{ value: 'phone', label: '手機' }, { value: 'desktop', label: '電腦' }]}
        />
      </div>
      <div className="content-preview-viewport" ref={viewportRef} style={fit ? { height: fit.height } : undefined}>
        <div
          ref={frameRef}
          className="content-preview-frame"
          data-device={device}
          inert={desktop || undefined}
          style={desktop ? { width: DESKTOP_WIDTH, transform: fit ? `scale(${fit.scale})` : undefined } : undefined}
        >
          <div className="content-preview-page">
            <div className="content-preview-card content-preview-summary">
              <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
              <p className="content-preview-title">{title.trim() || '未命名團購'}</p>
              <p className="content-preview-price">{priceText}</p>
              {/* The same two boxes, in the same order, as the resident campaign page. */}
              <dl className="content-preview-schedule" role="group" aria-label="團購時程">
                <div>
                  <dt>結單</dt>
                  <dd>{closing?.value ?? '已結單'}</dd>
                  {closing?.note && <dd className="content-preview-schedule-note">{closing.note}</dd>}
                </div>
                <div><dt>預計到貨</dt><dd>{arrival.value}</dd></div>
              </dl>
              <div className="content-preview-facts">
                <p>{thresholdText}</p>
                {allowCustomItems && <p>可新增自訂額外品項，金額由團主另計</p>}
              </div>
            </div>
            <div className="content-preview-card content-preview-info">
              <div role="region" tabIndex={0} aria-label={`住戶端圖片預覽，共 ${images.length} 張`}>
                <ImageGallery images={images} />
              </div>
              <p id="content-preview-announcement" className={`content-preview-copy ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                <LinkifiedText text={announcement} />
              </p>
              <button
                type="button"
                className="content-preview-toggle"
                aria-expanded={expanded}
                aria-controls="content-preview-announcement"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '收合完整預覽' : '展開完整預覽'}
              </button>
            </div>
            <ul className="content-preview-card content-preview-items" aria-label="品項預覽">
              {items.map((item, index) => item.active ? (
                <li key={item.code}>
                  <span className="content-preview-code">{itemLabel(index)}</span>
                  <span>{item.name.trim() || '未命名品項'}</span>
                  <span>{item.unitPrice === undefined ? '未定價' : `$${item.unitPrice}`}</span>
                </li>
              ) : null)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
