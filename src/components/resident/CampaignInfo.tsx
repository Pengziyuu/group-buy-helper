import { useState } from 'react'
import LinkifiedText from '../LinkifiedText'
import { Button } from '../ui/Button'
import { ImageGallery } from '../ui/ImageGallery'
import type { CampaignImage } from '../../services/demoCampaignStore'

const COLLAPSE_LINE_COUNT = 10
const COLLAPSE_CHARACTER_COUNT = 400

type CampaignInfoProps = {
  images: CampaignImage[]
  announcement: string
  onOpenImage: (index: number) => void
}

export function CampaignInfo({ images, announcement, onOpenImage }: CampaignInfoProps) {
  const [expanded, setExpanded] = useState(false)
  const hasAnnouncement = announcement.trim().length > 0
  if (images.length === 0 && !hasAnnouncement) return null
  const collapsible = announcement.split('\n').length > COLLAPSE_LINE_COUNT || announcement.length > COLLAPSE_CHARACTER_COUNT

  return (
    <section className="resident-card resident-info" aria-labelledby="campaign-info-heading">
      <h2 id="campaign-info-heading">開團資訊</h2>
      <div className="resident-info-body" data-has-images={images.length > 0 || undefined}>
        {images.length > 0 && <ImageGallery images={images} onOpen={onOpenImage} />}
        {hasAnnouncement && (
          <div>
            <div id="campaign-announcement" className={`resident-announcement${collapsible && !expanded ? ' is-collapsed' : ''}`}>
              <LinkifiedText text={announcement} />
            </div>
            {collapsible && (
              <Button
                variant="utility"
                size="sm"
                className="resident-announcement-toggle"
                aria-controls="campaign-announcement"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >{expanded ? '收合' : '展開全文'}</Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
