import { useState, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { CreateCampaignDialog, type CreateFromTemplateActions } from './CreateCampaignDialog'
import { OrganizerLink } from './OrganizerLink'
import './organizer.css'
import { Plus, Settings, ShoppingBag, Users, type LucideIcon } from 'lucide-react'
import { Icon } from '../ui/Icon'

export type OrganizerSection = 'campaigns' | 'residents' | 'settings'

const NAV_ITEMS: Array<{ key: OrganizerSection; label: string; href: string; icon: LucideIcon }> = [
  { key: 'campaigns', label: '團購', href: '/admin', icon: ShoppingBag },
  { key: 'residents', label: '住戶', href: '/admin/residents', icon: Users },
  { key: 'settings', label: '設定', href: '/admin/settings', icon: Settings },
]

type OrganizerShellProps = {
  current: OrganizerSection
  onCreate?: (title: string) => Promise<{ id: string }>
  templates?: CreateFromTemplateActions
  children: ReactNode
}

export function OrganizerShell({ current, onCreate, templates, children }: OrganizerShellProps) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="organizer-app">
      <header className="organizer-topbar">
        <OrganizerLink className="organizer-brand" href="/admin">團購小幫手</OrganizerLink>
        <nav className="organizer-nav" aria-label="團主後台">
          {NAV_ITEMS.map((item) => (
            <OrganizerLink key={item.key} href={item.href} aria-current={current === item.key ? 'page' : undefined}>
              <Icon icon={item.icon} />{item.label}
            </OrganizerLink>
          ))}
        </nav>
        {onCreate && (
          <Button className="organizer-create" size="sm" onClick={() => setCreating(true)}>
            <Icon icon={Plus} />建立新團
          </Button>
        )}
      </header>
      {children}
      {creating && onCreate && <CreateCampaignDialog onCreate={onCreate} templates={templates} onClose={() => setCreating(false)} />}
    </div>
  )
}
