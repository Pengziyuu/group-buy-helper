import { ResidentTabBar, type ResidentTab } from './ResidentTabBar'

// Grey outlines of the page that is loading, drawn in its real layout so the content drops into place
// instead of replacing a spinner card. Screen readers hear only the label.
const Block = ({ className = '' }: { className?: string }) => <span className={`resident-skeleton-block ${className}`} aria-hidden="true" />

function CardSkeleton() {
  return (
    <div className="resident-skeleton-card" aria-hidden="true">
      <Block className="is-thumb" />
      <div className="resident-skeleton-lines">
        <Block className="is-title" />
        <Block className="is-short" />
        <Block className="is-bar" />
      </div>
    </div>
  )
}

/** The campaign list or my orders, before the resident and their data are known. */
export function ResidentListSkeleton({ page, label }: { page: ResidentTab; label: string }) {
  return (
    <div className="resident-page has-tabbar">
      <header className="resident-topbar">
        <span className="resident-topbar-brand">團購小幫手</span>
        <div className="resident-topbar-end">
          <ResidentTabBar current={page} />
          <Block className="is-avatar" />
        </div>
      </header>
      <main className="resident-list" role="status" aria-label={label} aria-busy="true">
        <Block className="is-heading" />
        <div className="resident-skeleton-cards">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </main>
    </div>
  )
}

/** A campaign page while the resident is checked and the campaign loads. */
export function ResidentCampaignSkeleton({ label }: { label: string }) {
  return (
    <div className="resident-page">
      <header className="resident-topbar">
        <a className="resident-back-link" href="/"><span aria-hidden="true">‹</span>全部團購</a>
      </header>
      <main className="resident-campaign" role="status" aria-label={label} aria-busy="true">
        <div className="resident-card resident-skeleton-section" aria-hidden="true">
          <Block className="is-badge" />
          <Block className="is-title" />
          <Block className="is-short" />
          <div className="resident-skeleton-pair"><Block className="is-box" /><Block className="is-box" /></div>
          <Block className="is-bar" />
        </div>
        <div className="resident-card resident-skeleton-section" aria-hidden="true">
          <Block className="is-heading" />
          <Block className="is-picture" />
          <Block className="is-title" />
          <Block className="is-short" />
        </div>
      </main>
    </div>
  )
}
