import { nameInitial } from './nameInitial'

const AVATAR_TONES = 6

/** A stable 1–6 palette slot per name, so a resident keeps their colour across visits and pages. */
function avatarTone(name: string) {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return String((hash % AVATAR_TONES) + 1)
}

/**
 * A resident's LINE picture, or their initial on a colour chosen from their name. Size comes from className.
 * Pictures load as they near the screen: order lists and the wall can hold dozens of them.
 */
export function Avatar({ name, pictureUrl, className = '' }: { name: string; pictureUrl?: string | null; className?: string }) {
  const classes = `ui-avatar ${className}`.trim()
  return pictureUrl
    ? <img className={classes} src={pictureUrl} alt={`${name}的 LINE 頭貼`} referrerPolicy="no-referrer" loading="lazy" />
    : <span className={classes} data-tone={avatarTone(name)} aria-hidden="true">{nameInitial(name)}</span>
}
