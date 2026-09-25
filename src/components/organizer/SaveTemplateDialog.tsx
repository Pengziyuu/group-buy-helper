import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { templateNameError, type CampaignTemplate } from '../../domain/campaignTemplate'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useModalDialog } from '../ui/useModalDialog'

export type SaveTemplateActions = {
  loadTemplates: () => Promise<CampaignTemplate[]>
  saveNew: (name: string) => Promise<CampaignTemplate>
  replace: (templateId: string) => Promise<CampaignTemplate>
}

type SaveTemplateDialogProps = SaveTemplateActions & {
  defaultName: string
  onSaved: (template: CampaignTemplate) => void
  onClose: () => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function SaveTemplateDialog({ defaultName, loadTemplates, saveNew, replace, onSaved, onClose }: SaveTemplateDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const loadRef = useRef(loadTemplates)
  const defaultNameRef = useRef(defaultName)
  defaultNameRef.current = defaultName
  const titleId = useId()
  const nameId = useId()
  const targetId = useId()
  const [mode, setMode] = useState<'new' | 'replace'>('new')
  const [name, setName] = useState(defaultName)
  const [templates, setTemplates] = useState<CampaignTemplate[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: nameRef, onDismiss: onClose, busy })

  useEffect(() => {
    let active = true
    loadRef.current()
      .then((list) => {
        if (!active) return
        setTemplates(list)
        const defaultKey = defaultNameRef.current.trim().toLowerCase()
        const matching = list.find((candidate) => candidate.name.trim().toLowerCase() === defaultKey)
        setTarget(matching?.id ?? list[0]?.id ?? '')
      })
      .catch((loadFailure: unknown) => { if (active) setLoadError(messageOf(loadFailure)) })
    return () => { active = false }
  }, [])

  const nameError = mode === 'new' && templates ? templateNameError(name, templates) : null
  const canSubmit = !busy && templates !== null && (mode === 'new' ? name.trim() !== '' && !nameError : target !== '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const saved = mode === 'new' ? await saveNew(name.trim()) : await replace(target)
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(messageOf(saveError))
      setBusy(false)
    }
  }

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section ref={dialogRef} className="ui-dialog organizer-template-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>存成範本</h2>
        <form onSubmit={(event) => { void submit(event) }}>
          <div className="ui-dialog-content">
            <SegmentedControl
              label="儲存方式"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'new', label: '存成新範本' },
                { value: 'replace', label: '取代既有範本', disabled: !templates || templates.length === 0 },
              ]}
            />
            {mode === 'new' ? (
              <FormField id={nameId} label="範本名稱" required error={nameError ?? undefined}>
                <input ref={nameRef} className="ui-input" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
            ) : (
              <FormField id={targetId} label="要取代的範本" helper="範本名稱不變，內容換成這一團目前已儲存的內容。">
                <select className="ui-input" value={target} onChange={(event) => setTarget(event.target.value)}>
                  {(templates ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </FormField>
            )}
            <p className="organizer-muted">會使用這一團已儲存的內容；還在編輯的修改，請等內容設定顯示「已自動儲存」後再存。</p>
            {templates === null && !loadError && <p className="organizer-muted">讀取範本中…</p>}
            {loadError && <FeedbackMessage tone="error">讀取範本失敗：{loadError}</FeedbackMessage>}
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="儲存中…" disabled={!canSubmit}>儲存範本</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
