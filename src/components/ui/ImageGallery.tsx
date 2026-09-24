import { useState } from 'react'
import type { CampaignImage } from '../../services/demoCampaignStore'

type ImageGalleryProps = {
  images: CampaignImage[]
  onOpen?: (index: number) => void
}

export function ImageGallery({ images, onOpen }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set())
  if (images.length === 0) return null

  const index = Math.min(activeIndex, images.length - 1)
  const image = images[index]

  const mainImage = (
    <>
      <span
        className="ui-gallery-backdrop"
        aria-hidden="true"
        style={{ backgroundImage: `url(${JSON.stringify(image.src)})` }}
      />
      <img
        className="ui-gallery-image"
        src={image.src}
        alt={image.alt}
        onError={() => setFailedSources((current) => new Set(current).add(image.src))}
      />
    </>
  )

  return (
    <div className="ui-gallery">
      {failedSources.has(image.src) ? (
        <div className="ui-gallery-fallback" role="status">圖片暫時無法顯示</div>
      ) : onOpen ? (
        <button
          type="button"
          className="ui-gallery-main"
          aria-label={`放大檢視 第 ${index + 1} 張圖片：${image.alt}`}
          onClick={() => onOpen(index)}
        >
          {mainImage}
          <span className="ui-gallery-zoom" aria-hidden="true">放大</span>
        </button>
      ) : (
        <div className="ui-gallery-main">{mainImage}</div>
      )}
      {images.length > 1 && (
        <div className="ui-gallery-thumbs" role="group" aria-label={`共 ${images.length} 張圖片`}>
          {images.map((thumbnail, thumbnailIndex) => (
            <button
              key={`${thumbnail.src}-${thumbnailIndex}`}
              type="button"
              className="ui-gallery-thumb"
              aria-label={`顯示第 ${thumbnailIndex + 1} 張圖片`}
              aria-pressed={thumbnailIndex === index}
              onClick={() => setActiveIndex(thumbnailIndex)}
            >
              <img src={thumbnail.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
