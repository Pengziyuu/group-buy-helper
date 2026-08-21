import type { ReactNode } from 'react'

type AppHeaderProps = {
  title: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  subtitle?: ReactNode
}

export function AppHeader({ title, leading, trailing, subtitle }: AppHeaderProps) {
  return (
    <header className="ui-app-header">
      {leading && <div className="ui-app-header-leading">{leading}</div>}
      <div className="ui-app-header-title"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
      {trailing && <div className="ui-app-header-trailing">{trailing}</div>}
    </header>
  )
}

type BreadcrumbItem = { label: string; href?: string }

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="ui-breadcrumbs" aria-label="麵包屑">
      <ol>{items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
        </li>
      ))}</ol>
    </nav>
  )
}

type SectionNavItem = { label: string; href: string; current?: boolean }

export function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  return (
    <nav className="ui-section-nav" aria-label={label}>
      {items.map((item) => <a key={item.href} href={item.href} aria-current={item.current ? 'page' : undefined}>{item.label}</a>)}
    </nav>
  )
}
