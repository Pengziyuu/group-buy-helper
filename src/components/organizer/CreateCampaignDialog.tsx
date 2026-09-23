import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { useModalDialog } from '../ui/useModalDialog'
import { useOrganizerNavigate } from './organizerNavigation'

type CreateCampaignDialogProps = {
  onCreate: (title: string) => Promise<{ id: string }>
  onClose: () => void
}

export function CreateCampaignDialog({ onCreate, onClose }: CreateCampaignDialogProps) {
  const navigate = useOrganizerNavigate()
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [title, setTitle] = useState('未命名團購')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: inputRef, onDismiss: onClose, busy })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || busy) return
    setBusy(true)
    setError('')
    try {
      const campaign = await onCreate(nextTitle)
      onClose()
      navigate(`/admin/campaign/${campaign.id}/content`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '建立團購失敗')
      setBusy(false)
    }
  }

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section ref={dialogRef} className="ui-dialog organizer-create-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>建立新團</h2>
        <form onSubmit={(event) => { void submit(event) }}>
          <div className="ui-dialog-content">
            <FormField id={inputId} label="團購標題" required>
              <input ref={inputRef} className="ui-input" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="建立中…" disabled={busy || !title.trim()}>建立並編輯</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
