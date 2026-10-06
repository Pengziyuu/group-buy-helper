import { useSyncExternalStore } from 'react'

// The width below which organizer tables become one card per row (organizer.css).
const CARD_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(CARD_QUERY)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

/** True on phones, where organizer tables show each row as a card. */
export function useCardLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(CARD_QUERY).matches ?? false, () => false)
}
