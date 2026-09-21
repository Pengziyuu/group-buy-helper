import { useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { useModalDialog } from './useModalDialog'

type ConfirmDialogProps = {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = '取消',
  busy = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useModalDialog({ dialogRef, initialFocusRef: cancelRef, onDismiss: onCancel, busy })

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section ref={dialogRef} className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        <div className="ui-dialog-content">{children}</div>
        <div className="ui-dialog-actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy} loadingLabel="處理中…">
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}
