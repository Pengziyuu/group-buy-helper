import { useLayoutEffect, useRef } from 'react'
import { SKELETON_SHEEN_MS, skeletonMarkup, type SkeletonPage } from './skeletonMarkup'
import './skeleton.css'

declare global {
  interface Window { __skeletonStart?: number }
}

// The same outline index.html shows before the scripts run, so React taking over changes nothing on
// screen; the sheen carries on from where the static outline's sweep has got to.
function Skeleton({ page, label }: { page: SkeletonPage; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const start = window.__skeletonStart ?? 0
    const elapsed = (performance.now() - start) % SKELETON_SHEEN_MS
    ref.current?.querySelectorAll<HTMLElement>('.sk-block').forEach((block) => {
      block.style.animationDelay = `-${Math.round(elapsed)}ms`
    })
  }, [])
  return <div ref={ref} dangerouslySetInnerHTML={{ __html: skeletonMarkup(page, label) }} />
}

/** The campaign list or my orders, before the resident and their data are known. */
export function ResidentListSkeleton({ page, label }: { page: 'campaigns' | 'orders'; label: string }) {
  return <Skeleton page={page} label={label} />
}

/** A campaign page while the resident is checked and the campaign loads. */
export function ResidentCampaignSkeleton({ label }: { label: string }) {
  return <Skeleton page="campaign" label={label} />
}
