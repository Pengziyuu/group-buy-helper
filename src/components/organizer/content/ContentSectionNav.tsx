import type { MouseEvent } from 'react'
import { CONTENT_SECTIONS, type ContentSectionId } from './contentChecks'

export function ContentSectionNav({ completion }: { completion: Record<ContentSectionId, boolean> }) {
  // Scroll instead of following the hash: a history entry would trigger the organizer's page-change focus handling.
  const jump = (event: MouseEvent<HTMLAnchorElement>, anchor: string) => {
    event.preventDefault()
    const heading = document.getElementById(`${anchor}-heading`)
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  return (
    <nav className="content-section-nav" aria-label="內容設定段落">
      <ol>
        {CONTENT_SECTIONS.map((section) => {
          const complete = completion[section.id]
          return (
            <li key={section.id}>
              <a href={`#${section.anchor}`} onClick={(event) => jump(event, section.anchor)}>
                <span className="content-section-mark" data-complete={complete || undefined} aria-hidden="true">{complete ? '✓' : '•'}</span>
                {section.label}
                <span className="ui-visually-hidden">{complete ? '（已填妥）' : '（尚未完成）'}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
