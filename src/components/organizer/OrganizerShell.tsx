import { useState, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { CreateCampaignDialog } from './CreateCampaignDialog'
import { OrganizerLink } from './OrganizerLink'
import './organizer.css'

export type OrganizerSection = 'campaigns' | 'residents' | 'settings'

const NAV_ITEMS: Array<{ key: OrganizerSection; label: string; href: string }> = [
  { key: 'campaigns', label: '團購', href: '/admin' },
  { key: 'residents', label: '住戶', href: '/admin/residents' },
  { key: 'settings', label: '設定', href: '/admin/settings' },
]

type OrganizerShellProps = {
  current: OrganizerSection
  onCreate?: (title: string) => Promise<{ id: string }>
  children: ReactNode
}

export function OrganizerShell({ current, onCreate, children }: OrganizerShellProps) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="organizer-app">
      <header className="organizer-topbar">
        <OrganizerLink className="organizer-brand" href="/admin">團購小幫手</OrganizerLink>
        <nav className="organizer-nav" aria-label="團主後台">
          {NAV_ITEMS.map((item) => (
            <OrganizerLink key={item.key} href={item.href} aria-current={current === item.key ? 'page' : undefined}>
              {item.label}
            </OrganizerLink>
          ))}
        </nav>
        {onCreate && (
          <Button className="organizer-create" size="sm" onClick={() => setCreating(true)}>
            <span aria-hidden="true">＋</span> 建立新團
          </Button>
        )}
      </header>
      {children}
      {creating && onCreate && <CreateCampaignDialog onCreate={onCreate} onClose={() => setCreating(false)} />}
    </div>
  )
}
