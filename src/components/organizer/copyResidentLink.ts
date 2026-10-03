/** Copies text, falling back to a hidden textarea where the async clipboard is unavailable. */
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand?.('copy') ?? false
  input.remove()
  if (!copied) throw new Error('這個瀏覽器不支援自動複製')
}

export async function copyResidentLink(path: string, copy?: (path: string) => Promise<void>): Promise<void> {
  if (copy) return copy(path)
  await copyText(new URL(path, window.location.origin).toString())
}
