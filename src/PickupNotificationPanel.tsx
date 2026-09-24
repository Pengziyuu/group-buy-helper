import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './components/ui/Button'
import type { CampaignStatus } from './domain/orderWorkflow'
import {
  pickupNotificationAudienceLabel,
  pickupNotificationTemplate,
  type PickupNotificationAudience,
  type PickupNotificationRecipient,
} from './domain/pickupNotification'
import type { PickupNotificationCommand, PickupNotificationResponse } from './services/pickupNotificationGateway'
import { formatResidentPeriod } from './domain/household'
import './PickupNotificationPanel.css'

type PickupNotificationPanelProps = {
  campaignId: string
  campaignTitle: string
  campaignStatus: CampaignStatus
  mode?: 'production' | 'test'
  excludedOtherCount?: number
  onPreview: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onCreateCommand: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationCommand>
}

type FocusTarget = 'step-two' | 'copy' | 'command' | 'first-choice' | 'second-choice'

function recipientLabel(recipient: PickupNotificationRecipient): string {
  return `${formatResidentPeriod(recipient.period)}・${recipient.unit}・${recipient.displayName}`
}

function RecipientList({ recipients }: { recipients: PickupNotificationRecipient[] }) {
  return (
    <ul className="pickup-recipient-list">
      {recipients.map((recipient) => (
        <li key={recipient.memberCode}>
          {recipient.pictureUrl
            ? <img src={recipient.pictureUrl} alt="" />
            : <span className="pickup-recipient-avatar" aria-hidden="true">{recipient.displayName.slice(0, 1)}</span>}
          <strong>{recipientLabel(recipient)}</strong>
        </li>
      ))}
    </ul>
  )
}

function PickupNotificationPanel({ campaignId, campaignTitle, campaignStatus, mode = 'production', excludedOtherCount, onPreview, onCreateCommand }: PickupNotificationPanelProps) {
  const isTest = mode === 'test'
  const messageLimit = 4500 - (isTest ? '【測試】\n'.length : 0)
  const idPrefix = useId()
  const panelHeadingId = `${idPrefix}-panel-heading`
  const stepOneId = `${idPrefix}-step-one`
  const stepTwoId = `${idPrefix}-step-two`
  const stepThreeId = `${idPrefix}-step-three`
  const mentionableHeadingId = `${idPrefix}-mentionable-heading`
  const unavailableHeadingId = `${idPrefix}-unavailable-heading`
  const [audience, setAudience] = useState<PickupNotificationAudience | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PickupNotificationResponse | null>(null)
  const [command, setCommand] = useState<PickupNotificationCommand | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [busy, setBusy] = useState<'preview' | 'create-command' | null>(null)
  const [busyAudience, setBusyAudience] = useState<PickupNotificationAudience | null>(null)
  const [error, setError] = useState('')
  const firstChoiceRef = useRef<HTMLButtonElement>(null)
  const secondChoiceRef = useRef<HTMLButtonElement>(null)
  const stepTwoHeadingRef = useRef<HTMLHeadingElement>(null)
  const commandButtonRef = useRef<HTMLButtonElement>(null)
  const copyButtonRef = useRef<HTMLButtonElement>(null)
  const operationLock = useRef(false)
  const focusTargetRef = useRef<FocusTarget | null>(null)

  // Reopening the campaign discards any preview token or command from the closed period.
  useEffect(() => {
    if (campaignStatus !== 'open') return
    setAudience(null)
    setPreview(null)
    setMessage('')
    setCommand(null)
    setCopyStatus('')
    setError('')
  }, [campaignStatus])

  // Focus follows the step the organizer has just reached.
  useEffect(() => {
    const target = focusTargetRef.current
    if (!target || busy !== null) return
    focusTargetRef.current = null
    const elements: Record<FocusTarget, HTMLElement | null> = {
      'step-two': stepTwoHeadingRef.current,
      copy: copyButtonRef.current,
      command: commandButtonRef.current,
      'first-choice': firstChoiceRef.current,
      'second-choice': secondChoiceRef.current,
    }
    elements[target]?.focus()
  }, [audience, busy, command, error, preview])

  if (campaignStatus === 'open') return null

  const outboundMessage = (body: string) => isTest ? `【測試】\n${body}` : body

  const openPreview = async (nextAudience: PickupNotificationAudience) => {
    if (operationLock.current) return
    operationLock.current = true
    const nextMessage = pickupNotificationTemplate(nextAudience, campaignTitle)
    setBusy('preview')
    setBusyAudience(nextAudience)
    setError('')
    setCommand(null)
    setCopyStatus('')
    try {
      const result = await onPreview(nextAudience, outboundMessage(nextMessage))
      setAudience(nextAudience)
      setMessage(nextMessage)
      setPreview(result)
      focusTargetRef.current = 'step-two'
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '目前無法讀取通知名單，請稍後再試。')
      focusTargetRef.current = nextAudience === 'phase2' ? 'second-choice' : 'first-choice'
    } finally {
      operationLock.current = false
      setBusy(null)
      setBusyAudience(null)
    }
  }

  const createCommand = async () => {
    if (!audience || !preview?.previewToken || operationLock.current || !message.trim()) return
    operationLock.current = true
    setBusy('create-command')
    setError('')
    setCopyStatus('')
    try {
      setCommand(await onCreateCommand(audience, outboundMessage(message), preview.previewToken))
      focusTargetRef.current = 'copy'
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : '目前無法產生通知指令，請稍後再試。')
      focusTargetRef.current = 'command'
    } finally {
      operationLock.current = false
      setBusy(null)
    }
  }

  const copyCommand = async () => {
    if (!command) return
    setError('')
    try {
      await navigator.clipboard.writeText(command.command)
      setCopyStatus(isTest ? '指令已複製，等待您貼到測試群組。' : '指令已複製，等待您貼到正式社區群組。')
    } catch {
      setError('無法自動複製，請手動選取指令複製。')
    }
  }

  const startOver = () => {
    if (operationLock.current) return
    setAudience(null)
    setPreview(null)
    setMessage('')
    setError('')
    setCommand(null)
    setCopyStatus('')
    focusTargetRef.current = 'first-choice'
  }

  const chosen = audience && preview

  return (
    <section className="pickup-notification-panel" data-campaign-id={campaignId} aria-labelledby={panelHeadingId}>
      <div>
        <h3 id={panelHeadingId}>{isTest ? `LINE通知測試：${campaignTitle}` : 'LINE領取通知'}</h3>
        <p>{isTest ? '發送方式：複製一次性測試指令並貼到測試群組' : '發送方式：複製一次性指令並貼到正式社區群組'}</p>
      </div>
      {Boolean(excludedOtherCount) && <p className="pickup-notification-excluded">本團另有 {excludedOtherCount} 位「其他」身分的訂購者不會收到通知，請自行聯繫。</p>}

      <ol className="pickup-steps">
        <li className="pickup-step" data-state={chosen ? 'done' : 'current'} aria-labelledby={stepOneId}>
          <h4 id={stepOneId}>1. 選擇通知對象</h4>
          {chosen ? (
            <div className="pickup-step-actions">
              <p>已選擇：{pickupNotificationAudienceLabel(audience)}</p>
              <Button variant="utility" size="sm" disabled={busy !== null} onClick={startOver}>重新選擇</Button>
            </div>
          ) : (
            <div className="pickup-step-actions" aria-busy={busy === 'preview'}>
              <Button ref={firstChoiceRef} variant="secondary" aria-label={isTest ? `預覽${campaignTitle}一期、三期測試通知` : undefined} disabled={busy !== null} onClick={() => { void openPreview('phase13') }}>
                {busy === 'preview' && busyAudience === 'phase13' ? '讀取一期、三期名單中…' : `預覽一期、三期${isTest ? '測試' : ''}通知`}
              </Button>
              <Button ref={secondChoiceRef} variant="secondary" aria-label={isTest ? `預覽${campaignTitle}二期測試通知` : undefined} disabled={busy !== null} onClick={() => { void openPreview('phase2') }}>
                {busy === 'preview' && busyAudience === 'phase2' ? '讀取二期名單中…' : `預覽二期${isTest ? '測試' : ''}通知`}
              </Button>
            </div>
          )}
          {error && !chosen && <p className="pickup-notification-error" role="alert">{error}</p>}
        </li>

        {chosen && (
          <li className="pickup-step" data-state={command ? 'done' : 'current'} aria-labelledby={stepTwoId}>
            <h4 id={stepTwoId} ref={stepTwoHeadingRef} tabIndex={-1}>2. 確認名單與訊息</h4>
            <section aria-labelledby={mentionableHeadingId}>
              <h5 id={mentionableHeadingId}>可＠{preview.mentionableCount}位</h5>
              <p>將分成{preview.messageCount}則LINE訊息回覆。</p>
              {preview.mentionableCount > 0
                ? <RecipientList recipients={preview.mentionableRecipients} />
                : <p className="pickup-empty-state">目前沒有符合條件且仍在群組中的購買者，因此不能產生指令。</p>}
            </section>
            {preview.unavailableRecipients.length > 0 && (
              <section className="pickup-unavailable" aria-labelledby={unavailableHeadingId}>
                <h5 id={unavailableHeadingId}>以下{preview.unavailableRecipients.length}位目前無法＠</h5>
                <p>可能已不在通知群組中；本次不會＠這些住戶。</p>
                <RecipientList recipients={preview.unavailableRecipients} />
              </section>
            )}
            <label className="pickup-message-field">
              <span>{isTest ? '測試通知正文' : '通知內容'}</span>
              {isTest && <small>系統回覆時會自動加上「【測試】」前綴。</small>}
              <textarea aria-label={isTest ? '測試通知正文' : '通知內容'} value={message} maxLength={messageLimit} rows={8} disabled={busy === 'create-command' || command !== null} onChange={(event) => setMessage(event.target.value)} />
            </label>
            {error && <p className="pickup-notification-error" role="alert">{error}</p>}
            {!command && (
              <div className="pickup-step-actions">
                <Button ref={commandButtonRef} disabled={busy !== null || preview.mentionableCount === 0 || !preview.previewToken || !message.trim()} onClick={() => { void createCommand() }}>
                  {busy === 'create-command' ? '產生指令中…' : `產生${isTest ? '測試' : '正式'}群組指令並＠${preview.mentionableCount}位住戶`}
                </Button>
              </div>
            )}
          </li>
        )}

        {chosen && command && (
          <li className="pickup-step" data-state="current" aria-labelledby={stepThreeId}>
            <h4 id={stepThreeId}>3. 複製指令到群組</h4>
            <section className="pickup-command-result" aria-label="一次性LINE群組指令">
              <strong>{isTest ? '測試群組指令已產生' : '正式群組指令已產生'}</strong>
              <p>請複製並貼到{isTest ? '測試群組' : '正式社區群組'}。此頁尚未代表通知已發送。</p>
              <input className="ui-input" aria-label="一次性LINE群組指令" readOnly value={command.command} onFocus={(event) => event.currentTarget.select()} />
              <div className="pickup-step-actions">
                <Button ref={copyButtonRef} onClick={() => { void copyCommand() }}>複製指令</Button>
                <Button variant="secondary" onClick={startOver}>完成</Button>
              </div>
              {copyStatus && <p className="pickup-notification-success" role="status">{copyStatus}</p>}
            </section>
          </li>
        )}
      </ol>
      <span className="pickup-sr-status" aria-live="polite">
        {busy === 'preview' ? `正在讀取${busyAudience ? pickupNotificationAudienceLabel(busyAudience) : ''}名單` : busy === 'create-command' ? '正在產生一次性群組指令' : ''}
      </span>
    </section>
  )
}

export default PickupNotificationPanel
