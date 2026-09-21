import { useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { useModalDialog } from './useModalDialog'

type BottomSheetProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useModalDialog({ dialogRef: sheetRef, initialFocusRef: closeRef, onDismiss: onClose })

  return (
    <div className="ui-sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={sheetRef} className="ui-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="ui-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <Button ref={closeRef} variant="utility" className="ui-icon-button" aria-label={`關閉${title}`} onClick={onClose}>×</Button>
        </header>
        <div className="ui-sheet-body">{children}</div>
      </section>
    </div>
  )
}
