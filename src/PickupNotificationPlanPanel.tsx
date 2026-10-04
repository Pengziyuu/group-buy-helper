import { useEffect, useState } from 'react'
import { Button } from './components/ui/Button'
import { pickupNotificationPlan, type PickupNotificationMode, type PickupNotificationPlan } from './domain/pickupNotification'
import type { PickupNotificationCommand, PickupNotificationPlanPreview } from './services/pickupNotificationGateway'
import { formatResidentPeriod } from './domain/household'

type Props = {
  campaignTitle: string
  campaignStatus: string
  mode: 'production' | 'test'
  onPreviewPlan: (plan: PickupNotificationPlan) => Promise<PickupNotificationPlanPreview>
  onCreatePlanCommand: (plan: PickupNotificationPlan, token: string) => Promise<PickupNotificationCommand>
}

const labels = { all: '一期、二期、三期合併', phase13: '一期、三期', phase2: '二期' } as const

export default function PickupNotificationPlanPanel({ campaignTitle, campaignStatus, mode, onPreviewPlan, onCreatePlanCommand }: Props) {
  const [notificationMode, setNotificationMode] = useState<PickupNotificationMode>('ambient')
  const [plan, setPlan] = useState<PickupNotificationPlan>(() => pickupNotificationPlan('ambient', campaignTitle))
  const [preview, setPreview] = useState<PickupNotificationPlanPreview | null>(null)
  const [command, setCommand] = useState<PickupNotificationCommand | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (campaignStatus === 'open') {
      setPreview(null)
      setCommand(null)
      setRevision((value) => value + 1)
    }
  }, [campaignStatus])
  if (campaignStatus === 'open') return null
  const keys = notificationMode === 'ambient' ? ['all'] as const : ['phase13', 'phase2'] as const
  const total = preview ? Object.values(preview.groups).reduce((sum, group) => sum + (group?.mentionableCount ?? 0), 0) : 0
  const outboundPlan = (): PickupNotificationPlan => mode === 'test'
    ? notificationMode === 'ambient'
      ? { mode: 'ambient', messages: { all: `【測試】\n${(plan as Extract<PickupNotificationPlan, { mode: 'ambient' }>).messages.all}` } }
      : { mode: 'cold', messages: Object.fromEntries((['phase13', 'phase2'] as const).map((key) => [key, `【測試】\n${(plan as Extract<PickupNotificationPlan, { mode: 'cold' }>).messages[key]}`])) as Record<'phase13' | 'phase2', string> }
    : plan
  const selectMode = (next: PickupNotificationMode) => {
    if (busy) return
    setNotificationMode(next)
    setPlan(pickupNotificationPlan(next, campaignTitle))
    setPreview(null)
    setCommand(null)
    setError('')
    setRevision((value) => value + 1)
  }
  const changeMessage = (key: 'all' | 'phase13' | 'phase2', text: string) => {
    setPlan((current) => current.mode === 'ambient'
      ? { mode: 'ambient', messages: { all: text } }
      : { mode: 'cold', messages: { ...current.messages, [key]: text } })
    setCommand(null)
    setError('')
  }
  const readPreview = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setCommand(null)
    try {
      setPreview(await onPreviewPlan(outboundPlan()))
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : '目前無法讀取通知名單，請稍後再試。')
    } finally { setBusy(false) }
  }
  const createCommand = async () => {
    if (busy || !preview?.previewToken || preview.messageCount > 5 || total === 0) return
    setBusy(true)
    setError('')
    try { setCommand(await onCreatePlanCommand(outboundPlan(), preview.previewToken)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '目前無法產生通知指令，請稍後再試。') }
    finally { setBusy(false) }
  }
  return <section className="pickup-notification-panel pickup-plan-panel" aria-label="LINE 領取通知">
    <header className="pickup-plan-header">
      <h3>{mode === 'test' ? `LINE 通知測試：${campaignTitle}` : 'LINE 領取通知'}</h3>
      <p>先核對名單與文案，再產生一次性指令；此頁不會直接發送。</p>
    </header>
    <div className="pickup-plan-setup">
      <div className="pickup-plan-setup-heading"><strong>通知方式</strong><span>{mode === 'test' ? '僅限測試群組' : '正式社區群組'}</span></div>
      <div className="pickup-step-actions pickup-plan-modes" role="group" aria-label="通知模式">
        <Button variant={notificationMode === 'ambient' ? 'primary' : 'secondary'} aria-pressed={notificationMode === 'ambient'} disabled={busy} onClick={() => selectMode('ambient')}>常溫</Button>
        <Button variant={notificationMode === 'cold' ? 'primary' : 'secondary'} aria-pressed={notificationMode === 'cold'} disabled={busy} onClick={() => selectMode('cold')}>冷凍／冷藏</Button>
      </div>
      <p className="pickup-plan-hint">{notificationMode === 'ambient' ? '三期合併一份通知' : '一期＋三期、二期各一份通知'}</p>
      <Button className="pickup-plan-action" disabled={busy} onClick={() => { void readPreview() }}>{busy ? '讀取中…' : '預覽名單'}</Button>
    </div>
    {error && <p role="alert" className="pickup-notification-error">{error}</p>}
    {preview && <div key={revision} className="pickup-steps pickup-plan-preview">
      <div className="pickup-plan-preview-heading"><h4>通知預覽</h4><span>{keys.length} 組名單</span></div>
      {keys.map((key) => {
        const group = preview.groups[key]
        const body = plan.mode === 'ambient' ? plan.messages.all : plan.messages[key as 'phase13' | 'phase2']
        return <section className="pickup-step" key={key} aria-label={`${labels[key]}通知`}>
          <div className="pickup-plan-group-heading"><h4>{labels[key]}名單</h4><span>{group?.mentionableCount ?? 0} 位可＠</span></div>
          <p className="pickup-plan-group-meta">預計 {group?.messageCount ?? 0} 則訊息 · 每則最多 20 位{(group?.messageCount ?? 0) > 1 ? ' · 完整文案只在最後一則' : ''}</p>
          {group?.mentionableRecipients.length ? <details className="pickup-plan-roster"><summary>查看名單（{group.mentionableCount} 位）</summary><ul className="pickup-recipient-list">{group.mentionableRecipients.map((recipient) => <li key={recipient.memberCode}><span>{formatResidentPeriod(recipient.period)}・{recipient.unit}</span><strong>{recipient.displayName}</strong></li>)}</ul></details> : <p className="pickup-empty-state">目前沒有可＠的購買者。</p>}
          {Boolean(group?.unavailableRecipients.length) && <details className="pickup-plan-roster pickup-unavailable"><summary>無法＠ {group?.unavailableRecipients.length} 位</summary><p>以下住戶不會包含於指令：</p><ul className="pickup-recipient-list">{group?.unavailableRecipients.map((recipient) => <li key={recipient.memberCode}><span>{formatResidentPeriod(recipient.period)}・{recipient.unit}</span><strong>{recipient.displayName}</strong></li>)}</ul></details>}
          <label className="pickup-message-field"><span>{key === 'all' ? '通知內容' : `${labels[key]}通知內容`}</span><textarea aria-label={key === 'all' ? '通知內容' : `${labels[key]}通知內容`} maxLength={mode === 'test' ? 4495 : 4500} rows={5} disabled={busy || Boolean(command)} value={body} onChange={(event) => changeMessage(key, event.target.value)} /></label>
        </section>
      })}
      <div className="pickup-plan-summary"><strong>合計 {total} 位可＠</strong><span>預計 {preview.messageCount} 則 LINE 訊息／上限 5 則</span></div>
      {preview.messageCount > 5 && <p role="alert" className="pickup-notification-error">需要 {preview.messageCount} 則訊息，超過單一指令 5 則上限；目前無法產生涵蓋全部住戶的指令。</p>}
      {!command && <Button className="pickup-plan-action" disabled={busy || !preview.previewToken || preview.messageCount > 5 || total === 0 || keys.some((key) => !(plan.mode === 'ambient' ? plan.messages.all : plan.messages[key as 'phase13' | 'phase2']).trim())} onClick={() => { void createCommand() }}>產生指令</Button>}
      {command && <section className="pickup-command-result" aria-label="一次性 LINE 群組指令"><strong>指令已產生，通知尚未發送。</strong><p>複製後貼到{mode === 'test' ? '測試群組' : '正式社區群組'}。</p><input className="ui-input" aria-label="一次性 LINE 群組指令" readOnly value={command.command} onFocus={(event) => event.currentTarget.select()} /><div className="pickup-step-actions"><Button onClick={() => { void navigator.clipboard.writeText(command.command).then(() => setCopyStatus('指令已複製，等待貼到群組。'), () => setError('無法自動複製，請手動選取指令複製。')) }}>複製指令</Button><Button variant="secondary" onClick={() => { setPreview(null); setCommand(null) }}>完成</Button></div>{copyStatus && <p role="status">{copyStatus}</p>}</section>}
    </div>}
  </section>
}
