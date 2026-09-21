import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  ariaLabel?: string
  onSelect?: () => void
  href?: string
  target?: string
  tone?: 'default' | 'danger'
  disabled?: boolean
  icon?: ReactNode
}

type MenuProps = {
  label: string
  items: MenuItem[]
  triggerContent?: ReactNode
  size?: 'md' | 'sm'
  className?: string
}

export function Menu({ label, items, triggerContent = '⋯', size = 'md', className = '' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const enabledItems = () => [
    ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []),
  ]

  useEffect(() => {
    if (!open) return
    enabledItems()[0]?.focus()
    const closeOnOutsidePointer = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const elements = enabledItems()
    if (elements.length === 0) return
    const index = elements.indexOf(document.activeElement as HTMLElement)
    const targets: Record<string, HTMLElement | undefined> = {
      ArrowDown: elements[(index + 1) % elements.length],
      ArrowUp: elements[(index - 1 + elements.length) % elements.length],
      Home: elements[0],
      End: elements[elements.length - 1],
    }
    const target = targets[event.key]
    if (target) {
      event.preventDefault()
      target.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className={`ui-menu ${className}`.trim()} data-size={size}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{triggerContent}</span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="ui-menu-popup" onKeyDown={moveFocus}>
          {items.map((item) => item.href && !item.disabled ? (
            <a
              key={item.label}
              role="menuitem"
              href={item.href}
              target={item.target}
              rel={item.target === '_blank' ? 'noreferrer' : undefined}
              tabIndex={-1}
              aria-label={item.ariaLabel}
              data-tone={item.tone}
              onClick={() => close(false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-label={item.ariaLabel}
              aria-disabled={item.disabled || undefined}
              data-tone={item.tone}
              onClick={() => {
                if (item.disabled) return
                close(true)
                item.onSelect?.()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
