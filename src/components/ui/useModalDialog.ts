import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type ModalDialogOptions = {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  onDismiss: () => void
  busy?: boolean
}

export function useModalDialog({ dialogRef, initialFocusRef, onDismiss, busy = false }: ModalDialogOptions) {
  const busyRef = useRef(busy)
  const onDismissRef = useRef(onDismiss)
  busyRef.current = busy
  onDismissRef.current = onDismiss

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onDismissRef.current()
        return
      }
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [dialogRef])

  useEffect(() => {
    if (busy) dialogRef.current?.focus()
    else initialFocusRef.current?.focus()
  }, [busy, dialogRef, initialFocusRef])
}
