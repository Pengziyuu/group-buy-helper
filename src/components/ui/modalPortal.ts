import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Puts a dialog or sheet at the end of <body>. Opened from inside a positioned box such as the
 * sticky workspace rail, its backdrop would otherwise be layered with that box, and positioned
 * controls elsewhere on the page (search field, ⋯ buttons) would show above it.
 */
export function modalPortal(modal: ReactNode) {
  return createPortal(modal, document.body)
}
