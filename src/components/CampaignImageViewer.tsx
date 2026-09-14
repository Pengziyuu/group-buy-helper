import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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
  const imageCountRef = useRef(images.length)
  const pointerStartRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const activePointersRef = useRef(new Set<number>())
  const multiPointerGestureRef = useRef(false)
  const titleId = useId()
  const image = images[index]
  const imageAvailable = Boolean(image)
  const [loadFailed, setLoadFailed] = useState(false)

  indexRef.current = index
  onIndexChangeRef.current = onIndexChange
  onCloseRef.current = onClose
  imageCountRef.current = images.length

  useEffect(() => setLoadFailed(false), [image?.src])

  useEffect(() => {
    if (!imageAvailable) return
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
      const imageCount = imageCountRef.current
      if (event.key === 'ArrowLeft' && imageCount > 1) {
        event.preventDefault()
        onIndexChangeRef.current((indexRef.current - 1 + imageCount) % imageCount)
        return
      }
      if (event.key === 'ArrowRight' && imageCount > 1) {
        event.preventDefault()
        onIndexChangeRef.current((indexRef.current + 1) % imageCount)
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
  }, [imageAvailable])

  if (!image) return null

  const previousIndex = (index - 1 + images.length) % images.length
  const nextIndex = (index + 1) % images.length
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (images.length < 2 || event.pointerType !== 'touch') return
    if (event.target instanceof Element && event.target.closest('button')) return
    activePointersRef.current.add(event.pointerId)
    if (activePointersRef.current.size > 1) {
      multiPointerGestureRef.current = true
      pointerStartRef.current = null
      return
    }
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId)
    if (multiPointerGestureRef.current) {
      pointerStartRef.current = null
      if (activePointersRef.current.size === 0) multiPointerGestureRef.current = false
      return
    }
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || start.id !== event.pointerId || images.length < 2) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return
    onIndexChange(deltaX < 0 ? nextIndex : previousIndex)
  }
  const cancelPointerGesture = (pointerId: number) => {
    activePointersRef.current.delete(pointerId)
    pointerStartRef.current = null
    if (activePointersRef.current.size === 0) multiPointerGestureRef.current = false
  }

  return (
    <div className="campaign-image-viewer-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={dialogRef} className="campaign-image-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header>
          <h2 id={titleId}>圖片檢視 {index + 1}／{images.length}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="關閉圖片檢視">×</button>
        </header>
        <div
          className="campaign-image-viewer-stage"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={(event) => cancelPointerGesture(event.pointerId)}
          onLostPointerCapture={(event) => cancelPointerGesture(event.pointerId)}
        >
          {loadFailed ? (
            <p className="campaign-image-viewer-fallback" role="status">圖片暫時無法顯示</p>
          ) : (
            <img src={image.src} alt={`${image.alt}（放大檢視）`} draggable={false} onError={() => setLoadFailed(true)} />
          )}
          {images.length > 1 && <>
            <button className="campaign-image-viewer-arrow campaign-image-viewer-previous" type="button" onClick={() => onIndexChange(previousIndex)} aria-label="上一張圖片"><span aria-hidden="true">‹</span></button>
            <button className="campaign-image-viewer-arrow campaign-image-viewer-next" type="button" onClick={() => onIndexChange(nextIndex)} aria-label="下一張圖片"><span aria-hidden="true">›</span></button>
          </>}
        </div>
      </section>
    </div>
  )
}
