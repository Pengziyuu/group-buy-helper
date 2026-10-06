import { useSyncExternalStore } from 'react'

// The width where the campaign page puts the order card in a column beside the content.
const WIDE_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(WIDE_QUERY)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

/** True from 1024px, where the order bar closes the order card right under the items. */
export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(WIDE_QUERY).matches ?? false, () => false)
}
