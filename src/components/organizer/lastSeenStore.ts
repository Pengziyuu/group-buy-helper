type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const storageKey = (campaignId: string) => `group-buy-helper:organizer-last-seen:${campaignId}`

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Private browsing can block storage entirely; the overview then just shows no "new" dots.
export function readLastSeen(campaignId: string, storage: ReadableStorage | null = browserStorage()): string | null {
  try {
    const value = storage?.getItem(storageKey(campaignId)) ?? null
    return value && Number.isFinite(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

export function writeLastSeen(campaignId: string, value: string, storage: WritableStorage | null = browserStorage()): void {
  try {
    storage?.setItem(storageKey(campaignId), value)
  } catch {
    // Ignore: the dots are a convenience, not state the organizer relies on.
  }
}
