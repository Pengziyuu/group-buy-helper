/** The first character a person would see in a name: a whole emoji (even a joined family one), never half of one. */
export function nameInitial(name: string) {
  const trimmed = name.trim()
  const first = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value?.segment
    : Array.from(trimmed)[0]
  return (first ?? '').toUpperCase()
}
