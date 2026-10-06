import type { LucideIcon } from 'lucide-react'

/**
 * One look for every icon: Lucide outlines at the app's stroke weight, sized to the text beside them.
 * Icons only ever sit beside a visible word or inside a labelled button, so they are hidden from
 * screen readers.
 */
export function Icon({ icon: Glyph, size = 16, className = '' }: { icon: LucideIcon; size?: number; className?: string }) {
  return <Glyph className={`ui-icon ${className}`.trim()} size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />
}
