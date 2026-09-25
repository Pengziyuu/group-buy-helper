import { useEffect, useId, useRef, useState } from 'react'
import { templateNameError, type CampaignTemplate } from '../../domain/campaignTemplate'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { ErrorState, LoadingState } from '../ui/AsyncState'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type TemplateSettingsActions = {
  list: () => Promise<CampaignTemplate[]>
  rename: (templateId: string, name: string) => Promise<CampaignTemplate>
  remove: (templateId: string) => Promise<{ warning: string | null }>
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function TemplateSettings({ actions }: { actions: TemplateSettingsActions }) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const [templates, setTemplates] = useState<CampaignTemplate[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState<CampaignTemplate | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameErrorId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const renameButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusAfterRenameId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    setLoadError('')
    actionsRef.current.list()
      .then((list) => { if (active) setTemplates(list) })
      .catch((error: unknown) => { if (active) setLoadError(messageOf(error)) })
    return () => { active = false }
  }, [reloadKey])

  useEffect(() => {
    if (editingId) {
      renameInputRef.current?.focus()
    } else if (focusAfterRenameId.current) {
      renameButtonRefs.current.get(focusAfterRenameId.current)?.focus()
      focusAfterRenameId.current = null
    }
  }, [editingId])

  const startRename = (template: CampaignTemplate) => {
    setEditingId(template.id)
    setDraftName(template.name)
    setRenameError('')
    setNotice(null)
  }

  const cancelRename = (templateId: string) => {
    focusAfterRenameId.current = templateId
    setEditingId(null)
  }

  const saveName = async (template: CampaignTemplate) => {
    const error = templateNameError(draftName, templates ?? [], template.id)
    if (error) {
      setRenameError(error)
      return
    }
    setRenaming(true)
    try {
      const updated = await actions.rename(template.id, draftName.trim())
      setTemplates((current) => (current ?? []).map((candidate) => candidate.id === updated.id ? updated : candidate))
      focusAfterRenameId.current = updated.id
      setEditingId(null)
      setNotice({ tone: 'success', text: `已改名為「${updated.name}」` })
    } catch (renameFailure) {
      setRenameError(messageOf(renameFailure))
    } finally {
      setRenaming(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const target = deleting
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const result = await actions.remove(target.id)
      setTemplates((current) => (current ?? []).filter((candidate) => candidate.id !== target.id))
      renameButtonRefs.current.delete(target.id)
      setDeleting(null)
      setNotice(result.warning ? { tone: 'warning', text: result.warning } : { tone: 'success', text: `已刪除範本「${target.name}」` })
      headingRef.current?.focus()
    } catch (deleteFailure) {
      setDeleteError(messageOf(deleteFailure))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="organizer-settings-section organizer-template-settings" aria-labelledby="template-settings-heading">
      <h2 id="template-settings-heading" ref={headingRef} tabIndex={-1}>團購範本</h2>
      {loadError ? (
        <ErrorState title="無法讀取範本" message={loadError} actionLabel="重試" onAction={() => { setTemplates(null); setReloadKey((key) => key + 1) }} />
      ) : templates === null ? (
        <LoadingState label="讀取範本中…" variant="skeleton" rows={2} />
      ) : templates.length === 0 ? (
        <p>還沒有範本。在團購工作區按「存成範本」就會出現在這裡。</p>
      ) : (
        <div className="organizer-table-wrap">
          <table className="organizer-table" aria-label="團購範本">
            <thead>
              <tr>
                <th scope="col">名稱</th>
                <th scope="col">品項數</th>
                <th scope="col">最後更新</th>
                <th scope="col"><span className="ui-visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const editing = editingId === template.id
                return (
                  <tr key={template.id}>
                    <th scope="row">
                      {editing ? (
                        <div className="organizer-template-rename">
                          <input
                            ref={renameInputRef}
                            className="ui-input"
                            aria-label={`${template.name} 的新名稱`}
                            aria-invalid={renameError ? 'true' : 'false'}
                            aria-describedby={renameError ? renameErrorId : undefined}
                            maxLength={100}
                            value={draftName}
                            readOnly={renaming}
                            onChange={(event) => { setDraftName(event.target.value); setRenameError('') }}
                            onKeyDown={(event) => {
                              if (event.nativeEvent.isComposing || renaming) return
                              if (event.key === 'Enter') { event.preventDefault(); void saveName(template) }
                              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename(template.id) }
                            }}
                          />
                          {renameError && <small id={renameErrorId} role="alert">{renameError}</small>}
                        </div>
                      ) : template.name}
                    </th>
                    <td data-label="品項數">{template.content.items.length} 個</td>
                    <td data-label="最後更新">{formatZhTwTimestamp(template.updatedAt)}</td>
                    <td className="organizer-template-actions">
                      {editing ? (
                        <>
                          <Button size="sm" loading={renaming} loadingLabel="儲存中…" onClick={() => { void saveName(template) }}>儲存</Button>
                          <Button size="sm" variant="utility" disabled={renaming} onClick={() => cancelRename(template.id)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button
                            ref={(node) => {
                              if (node) renameButtonRefs.current.set(template.id, node)
                              else renameButtonRefs.current.delete(template.id)
                            }}
                            size="sm"
                            variant="utility"
                            aria-label={`改名 ${template.name}`}
                            onClick={() => startRename(template)}
                          >改名</Button>
                          <Button size="sm" variant="danger" aria-label={`刪除 ${template.name}`} onClick={() => { setDeleteError(''); setNotice(null); setDeleting(template) }}>刪除</Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {notice && <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage>}
      {deleting && (
        <ConfirmDialog
          title="刪除範本"
          confirmLabel="刪除範本"
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { void confirmDelete() }}
        >
          <p>刪除範本「{deleting.name}」？已用這個範本建立的團購不受影響。</p>
          {deleteError && <FeedbackMessage tone="error">{deleteError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </section>
  )
}
