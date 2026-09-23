export async function copyResidentLink(path: string, copy?: (path: string) => Promise<void>): Promise<void> {
  if (copy) return copy(path)
  const value = new URL(path, window.location.origin).toString()
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
