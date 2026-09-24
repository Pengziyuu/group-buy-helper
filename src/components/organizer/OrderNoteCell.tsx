import { useEffect, useRef, useState } from 'react'
import type { OrganizerOrderRow } from '../../domain/adminOrders'

type OrderNoteCellProps = {
  order: OrganizerOrderRow
  controlLabel: string
  disabled: boolean
  onSave?: (note: string) => Promise<void>
  onSavingChange: (saving: boolean) => void
}

export function OrderNoteCell({ order, controlLabel, disabled, onSave, onSavingChange }: OrderNoteCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Set once Enter or Escape has decided this edit, so the blur that follows does not save again.
  const settledRef = useRef(false)
  const returnFocusRef = useRef(false)
  const note = savedNote ?? order.organizerNote

  // The reloaded server copy replaces the note shown right after saving.
  useEffect(() => { setSavedNote(null) }, [order.organizerNote])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => {
    if (editing || !returnFocusRef.current) return
    returnFocusRef.current = false
    buttonRef.current?.focus()
  }, [editing])

  const start = () => {
    settledRef.current = false
    setDraft(note)
    setError('')
    setEditing(true)
  }

  const finish = (returnFocus: boolean) => {
    returnFocusRef.current = returnFocus
    setError('')
    setEditing(false)
  }

  const save = async (returnFocus: boolean): Promise<boolean> => {
    if (!onSave) return false
    if (draft === note) {
      finish(returnFocus)
      return true
    }
    setSaving(true)
    setError('')
    onSavingChange(true)
    try {
      await onSave(draft)
      setSavedNote(draft)
      // The input is readOnly while saving, so the organizer can Tab away to
      // something else (e.g. the row's 更多操作 menu) before this resolves.
      // Only pull focus back to the note button if it is still where this
      // edit left it (the input) or nothing claimed it (document.body).
      finish(returnFocus && (document.activeElement === inputRef.current || document.activeElement === document.body))
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存備註失敗')
      return false
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className="organizer-note-button"
        aria-label={`編輯 ${controlLabel} 備註`}
        disabled={disabled || !onSave}
        onClick={start}
      >
        {note || <span className="organizer-muted">新增備註</span>}
      </button>
    )
  }

  return (
    <div className="organizer-note-editor">
      <input
        ref={inputRef}
        className="ui-input"
        aria-label={`${controlLabel} 備註`}
        maxLength={500}
        value={draft}
        readOnly={saving}
        aria-busy={saving || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (saving) return
          if (event.key === 'Enter') {
            event.preventDefault()
            settledRef.current = true
            void save(true).then((saved) => { if (!saved) settledRef.current = false })
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            settledRef.current = true
            finish(true)
          }
        }}
        onBlur={() => { if (!settledRef.current && !saving) void save(false) }}
      />
      {saving && <small role="status">儲存中…</small>}
      {error && <small className="organizer-note-error" role="alert">{error}</small>}
    </div>
  )
}
