import { useEffect, useId, useRef, useState } from 'react'
import type { CampaignImage } from '../services/demoCampaignStore'

type CampaignImageViewerProps = {
  images: CampaignImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

const focusableSelector = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function CampaignImageViewer({ images, index, onIndexChange, onClose }: CampaignImageViewerProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const indexRef = useRef(index)
  const onIndexChangeRef = useRef(onIndexChange)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const image = images[index]
  const [loadFailed, setLoadFailed] = useState(false)

  indexRef.current = index
  onIndexChangeRef.current = onIndexChange
  onCloseRef.current = onClose

  useEffect(() => setLoadFailed(false), [image?.src])

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key === 'ArrowLeft' && images.length > 1) {
        event.preventDefault()
        onIndexChangeRef.current((indexRef.current - 1 + images.length) % images.length)
        return
      }
      if (event.key === 'ArrowRight' && images.length > 1) {
        event.preventDefault()
        onIndexChangeRef.current((indexRef.current + 1) % images.length)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus()
    }
  }, [images.length])

  if (!image) return null

  const previousIndex = (index - 1 + images.length) % images.length
  const nextIndex = (index + 1) % images.length

  return (
    <div className="campaign-image-viewer-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={dialogRef} className="campaign-image-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header>
          <h2 id={titleId}>圖片檢視 {index + 1}／{images.length}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="關閉圖片檢視">×</button>
        </header>
        <div className="campaign-image-viewer-stage">
          {loadFailed ? (
            <p className="campaign-image-viewer-fallback" role="status">圖片暫時無法顯示</p>
          ) : (
            <img src={image.src} alt={`${image.alt}（放大檢視）`} draggable={false} onError={() => setLoadFailed(true)} />
          )}
        </div>
        {images.length > 1 && (
          <nav aria-label="圖片切換">
            <button type="button" onClick={() => onIndexChange(previousIndex)} aria-label="上一張圖片"><span aria-hidden="true">←</span> 上一張</button>
            <span>{index + 1}／{images.length}</span>
            <button type="button" onClick={() => onIndexChange(nextIndex)} aria-label="下一張圖片">下一張 <span aria-hidden="true">→</span></button>
          </nav>
        )}
      </section>
    </div>
  )
}
