import { useId, useRef, useState, type FormEvent } from 'react'
import type { CampaignTemplate, CreateFromTemplateResult } from '../../domain/campaignTemplate'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useModalDialog } from '../ui/useModalDialog'
import { noticeForTemplateResult, rememberCampaignNotice } from './campaignNotices'
import { useOrganizerNavigate, useOrganizerNavigationPreflight } from './organizerNavigation'
import { OrganizerThumb } from './OrganizerThumb'

export type CreateFromTemplateActions = {
  list: () => Promise<CampaignTemplate[]>
  create: (templateId: string, title: string) => Promise<CreateFromTemplateResult>
}

type CreateCampaignDialogProps = {
  onCreate: (title: string) => Promise<{ id: string }>
  templates?: CreateFromTemplateActions
  onClose: () => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function CreateCampaignDialog({ onCreate, templates, onClose }: CreateCampaignDialogProps) {
  const navigate = useOrganizerNavigate()
  const preflight = useOrganizerNavigationPreflight()
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const templateFieldId = useId()
  const [title, setTitle] = useState('未命名團購')
  const [source, setSource] = useState<'blank' | 'template'>('blank')
  const sourceRef = useRef(source)
  sourceRef.current = source
  const [templateList, setTemplateList] = useState<CampaignTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: inputRef, onDismiss: onClose, busy })

  const chooseTemplate = (id: string, list: CampaignTemplate[]) => {
    setTemplateId(id)
    const chosen = list.find((candidate) => candidate.id === id)
    if (chosen) setTitle(chosen.content.title)
  }

  const switchSource = (next: 'blank' | 'template') => {
    setSource(next)
    setError('')
    if (next !== 'template' || !templates || templateList !== null) return
    templates.list()
      .then((list) => {
        setTemplateList(list)
        if (sourceRef.current === 'template' && list[0]) chooseTemplate(list[0].id, list)
      })
      .catch((loadError: unknown) => setError(`讀取範本失敗：${messageOf(loadError)}`))
  }

  const usingTemplate = source === 'template'
  const canSubmit = !busy && title.trim() !== '' && (!usingTemplate || templateId !== '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const nextTitle = title.trim()
    setBusy(true)
    setError('')
    try {
      if (!await preflight()) {
        setError('請先儲存目前團購草稿或等待圖片上傳完成，再建立新團。')
        setBusy(false)
        return
      }
      if (usingTemplate && templates) {
        const result = await templates.create(templateId, nextTitle)
        const notice = noticeForTemplateResult(result)
        if (notice) rememberCampaignNotice(result.id, notice)
        onClose()
        navigate(`/admin/campaign/${result.id}/content`)
        return
      }
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
            {templates && (
              <SegmentedControl
                label="建立方式"
                value={source}
                onChange={switchSource}
                options={[{ value: 'blank', label: '空白團購' }, { value: 'template', label: '從範本建立' }]}
              />
            )}
            {usingTemplate && templateList !== null && (templateList.length === 0 ? (
              <p className="organizer-muted">還沒有範本，可以先在團購工作區按「存成範本」。</p>
            ) : (
              // Picture cards rather than a dropdown, so each template's first image shows before choosing.
              <div className="ui-field organizer-template-choices">
                <span id={templateFieldId} className="organizer-template-choices-label">範本</span>
                <div role="radiogroup" aria-labelledby={templateFieldId} aria-describedby={`${templateFieldId}-helper`}>
                  {templateList.map((candidate) => (
                    <label key={candidate.id} className="organizer-template-choice">
                      <input
                        type="radio"
                        name={`${templateFieldId}-choice`}
                        value={candidate.id}
                        checked={templateId === candidate.id}
                        aria-label={candidate.name}
                        onChange={() => chooseTemplate(candidate.id, templateList)}
                      />
                      <OrganizerThumb image={candidate.content.images[0]} />
                      <span>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.content.items.length} 個品項</small>
                      </span>
                    </label>
                  ))}
                </div>
                <div id={`${templateFieldId}-helper`} className="ui-field-helper">結單日期與到貨時間不會帶入，請在內容設定重新設定。</div>
              </div>
            ))}
            {usingTemplate && templateList === null && !error && <p className="organizer-muted">讀取範本中…</p>}
            <FormField id={inputId} label="團購標題" required>
              <input ref={inputRef} className="ui-input" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="建立中…" disabled={!canSubmit}>建立並編輯</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
