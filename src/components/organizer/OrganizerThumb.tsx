import { useEffect, useState } from 'react'
import type { CampaignImage } from '../../services/demoCampaignStore'

/** A small square of a campaign's or template's first image, or a 無圖 placeholder when there is none or it fails to load. */
export function OrganizerThumb({ image }: { image?: CampaignImage }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [image?.src])
  if (image && !failed) {
    return <img className="organizer-thumb" src={image.src} alt="" loading="lazy" onError={() => setFailed(true)} />
  }
  return <span className="organizer-thumb organizer-thumb-empty" aria-hidden="true">無圖</span>
}
