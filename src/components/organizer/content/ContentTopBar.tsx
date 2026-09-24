import { useId } from 'react'
import { Button } from '../../ui/Button'
import { StatusBadge } from '../../ui/StatusBadge'
import { PUBLICATION_TEXT, type PublicationStatus, type SaveState } from './contentChecks'

export type ContentNotice = { tone: 'info' | 'error'; text: string }

type ContentTopBarProps = {
  saveState: SaveState
  onRetrySave?: () => void
  retryDisabled: boolean
  publication: PublicationStatus
  residentHref: string | null
  primaryLabel: string
  publishing: boolean
  publishDisabledReason: string | null
  onPublish: () => void
  notice: ContentNotice | null
}

export function ContentTopBar({
  saveState, onRetrySave, retryDisabled, publication, residentHref, primaryLabel, publishing, publishDisabledReason, onPublish, notice,
}: ContentTopBarProps) {
  const reasonId = useId()
  return (
    <div className="content-topbar">
      <div className="content-topbar-row">
        <div className="content-topbar-main">
          <h2 id="content-heading">內容設定</h2>
          <p className="content-save-state" data-tone={saveState.tone} role="status">{saveState.text}</p>
          {saveState.tone === 'error' && onRetrySave && (
            <Button variant="utility" size="sm" disabled={retryDisabled} onClick={onRetrySave}>重試</Button>
          )}
        </div>
        <div className="content-topbar-actions">
          <StatusBadge tone={publication === 'current' ? 'success' : 'warning'}>{PUBLICATION_TEXT[publication]}</StatusBadge>
          {residentHref && (
            <a className="content-preview-link" href={residentHref} target="_blank" rel="noreferrer">
              預覽住戶頁<span aria-hidden="true"> ↗</span>
            </a>
          )}
          <Button
            onClick={onPublish}
            disabled={publishDisabledReason !== null}
            loading={publishing}
            loadingLabel="發布中…"
            aria-describedby={publishDisabledReason ? reasonId : undefined}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
      {publishDisabledReason && <p id={reasonId} className="content-publish-reason">{publishDisabledReason}</p>}
      <p className="content-notice" aria-live="polite">{notice?.tone === 'info' ? notice.text : ''}</p>
      {notice?.tone === 'error' && <p className="content-notice content-notice-error" role="alert">{notice.text}</p>}
    </div>
  )
}
