import { useId, useRef, useState, type FormEvent } from 'react'
import type { CampaignTemplate, CreateFromTemplateResult } from '../../domain/campaignTemplate'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useModalDialog } from '../ui/useModalDialog'
import { noticeForTemplateResult, rememberCampaignNotice } from './campaignNotices'
import { useOrganizerNavigate } from './organizerNavigation'

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
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const templateFieldId = useId()
  const [title, setTitle] = useState('未命名團購')
  const [source, setSource] = useState<'blank' | 'template'>('blank')
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
        if (list[0]) chooseTemplate(list[0].id, list)
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
              <FormField id={templateFieldId} label="範本" helper="結單日期與到貨時間不會帶入，請在內容設定重新設定。">
                <select className="ui-input" value={templateId} onChange={(event) => chooseTemplate(event.target.value, templateList)}>
                  {templateList.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </FormField>
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
