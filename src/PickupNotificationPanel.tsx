import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { CampaignStatus } from './domain/orderWorkflow'
import {
  pickupNotificationAudienceLabel,
  pickupNotificationTemplate,
  type PickupNotificationAudience,
  type PickupNotificationRecipient,
} from './domain/pickupNotification'
import type { PickupNotificationResponse } from './services/pickupNotificationGateway'
import { formatResidentPeriod } from './domain/household'
import './PickupNotificationPanel.css'

type PickupNotificationPanelProps = {
  campaignId: string
  campaignTitle: string
  campaignStatus: CampaignStatus
  mode?: 'production' | 'test'
  onPreview: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onSend: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationResponse>
}

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
          <span>
            <strong>{recipientLabel(recipient)}</strong>
            <small>{recipient.paid ? '已付款' : '未付款'}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PickupNotificationPanel({
  campaignId,
  campaignTitle,
  campaignStatus,
  mode = 'production',
  onPreview,
  onSend,
}: PickupNotificationPanelProps) {
  const isTest = mode === 'test'
  const messageLimit = 4500 - (isTest ? '【測試】\n'.length : 0)
  const idPrefix = useId()
  const panelHeadingId = `${idPrefix}-panel-heading`
  const dialogHeadingId = `${idPrefix}-dialog-heading`
  const mentionableHeadingId = `${idPrefix}-mentionable-heading`
  const unavailableHeadingId = `${idPrefix}-unavailable-heading`
  const [audience, setAudience] = useState<PickupNotificationAudience | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PickupNotificationResponse | null>(null)
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null)
  const [busyAudience, setBusyAudience] = useState<PickupNotificationAudience | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const successCloseRef = useRef<HTMLButtonElement>(null)
  const operationLock = useRef(false)

  useEffect(() => {
    if (!audience) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus())
    return () => { document.body.style.overflow = previousOverflow }
  }, [audience])

  useEffect(() => {
    if (campaignStatus === 'open' && audience) setAudience(null)
  }, [audience, campaignStatus])

  useEffect(() => {
    if (busy === 'send') queueMicrotask(() => dialogRef.current?.focus())
  }, [busy])

  useEffect(() => {
    if (busy !== null) return
    if (success) queueMicrotask(() => successCloseRef.current?.focus())
    else if (error && audience) queueMicrotask(() => sendButtonRef.current?.focus())
  }, [audience, busy, error, success])

  if (campaignStatus === 'open') return null

  const outboundMessage = (body: string) => isTest ? `【測試】\n${body}` : body

  const openPreview = async (nextAudience: PickupNotificationAudience, trigger: HTMLButtonElement) => {
    if (operationLock.current) return
    operationLock.current = true
    triggerRef.current = trigger
    const nextMessage = pickupNotificationTemplate(nextAudience, campaignTitle)
    setBusy('preview')
    setBusyAudience(nextAudience)
    setError('')
    setSuccess('')
    try {
      const result = await onPreview(nextAudience, outboundMessage(nextMessage))
      setAudience(nextAudience)
      setMessage(nextMessage)
      setPreview(result)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError))
    } finally {
      operationLock.current = false
      setBusy(null)
      setBusyAudience(null)
    }
  }

  const send = async () => {
    if (!audience || !preview?.previewToken || operationLock.current || !message.trim()) return
    operationLock.current = true
    setBusy('send')
    setError('')
    setSuccess('')
    try {
      await onSend(audience, outboundMessage(message), preview.previewToken)
      setSuccess(isTest ? 'LINE測試通知已發送至測試群組。' : 'LINE領取通知已發送。')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError))
    } finally {
      operationLock.current = false
      setBusy(null)
    }
  }

  const close = () => {
    if (operationLock.current) return
    const trigger = triggerRef.current
    setAudience(null)
    setPreview(null)
    setMessage('')
    setError('')
    setSuccess('')
    queueMicrotask(() => trigger?.focus())
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
    ) ?? [])]
    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <section className="pickup-notification-panel" data-campaign-id={campaignId} aria-labelledby={panelHeadingId}>
      <div>
        <h3 id={panelHeadingId}>{isTest ? `LINE通知測試：${campaignTitle}` : 'LINE領取通知'}</h3>
        <p>{isTest ? '發送目的地：測試群組' : '發送目的地：正式社區群組'}</p>
      </div>
      <div className="pickup-notification-actions" aria-busy={busy === 'preview'}>
        <button type="button" aria-label={isTest ? `預覽${campaignTitle}一期、三期測試通知` : undefined} disabled={busy !== null} onClick={(event) => { void openPreview('phase13', event.currentTarget) }}>
          {busy === 'preview' && busyAudience === 'phase13' ? '讀取一期、三期名單中…' : `預覽一期、三期${isTest ? '測試' : ''}通知`}
        </button>
        <button type="button" aria-label={isTest ? `預覽${campaignTitle}二期測試通知` : undefined} disabled={busy !== null} onClick={(event) => { void openPreview('phase2', event.currentTarget) }}>
          {busy === 'preview' && busyAudience === 'phase2' ? '讀取二期名單中…' : `預覽二期${isTest ? '測試' : ''}通知`}
        </button>
      </div>
      <span className="pickup-sr-status" aria-live="polite">
        {busy === 'preview' ? `正在讀取${busyAudience ? pickupNotificationAudienceLabel(busyAudience) : ''}名單` : busy === 'send' ? '正在發送LINE領取通知' : ''}
      </span>
      {error && !audience && <p className="pickup-notification-error" role="alert">{error}</p>}

      {audience && preview && (
        <div className="pickup-dialog-backdrop">
          <div ref={dialogRef} tabIndex={-1} className="pickup-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogHeadingId} aria-busy={busy === 'send'} onKeyDown={handleDialogKeyDown}>
            <div className="pickup-dialog-heading">
              <div>
                <p>LINE官方帳號</p>
                <h4 id={dialogHeadingId}>{pickupNotificationAudienceLabel(audience)}領取通知</h4>
              </div>
              <button type="button" className="pickup-dialog-close" aria-label="關閉領取通知" disabled={busy !== null} onClick={close}>×</button>
            </div>

            <section aria-labelledby={mentionableHeadingId}>
              <h5 id={mentionableHeadingId}>可＠{preview.mentionableCount}位</h5>
              <p>將分成{preview.messageCount}則LINE訊息發送。</p>
              {preview.mentionableCount > 0
                ? <RecipientList recipients={preview.mentionableRecipients} />
                : <p className="pickup-empty-state">目前沒有符合條件且仍在群組中的購買者，因此不能發送。</p>}
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
              {isTest && <small>系統發送時會自動加上「【測試】」前綴。</small>}
              <textarea aria-label={isTest ? '測試通知正文' : '通知內容'} value={message} maxLength={messageLimit} rows={8} disabled={busy === 'send' || success !== ''} onChange={(event) => setMessage(event.target.value)} />
            </label>
            {error && <p className="pickup-notification-error" role="alert">{error}</p>}
            {success && <p className="pickup-notification-success" role="status">{success}</p>}
            <div className="pickup-dialog-actions">
              {success ? (
                <button ref={successCloseRef} type="button" className="pickup-send-action" onClick={close}>關閉</button>
              ) : (
                <>
                  <button type="button" disabled={busy !== null} onClick={close}>取消</button>
                  <button
                    ref={sendButtonRef}
                    type="button"
                    className="pickup-send-action"
                    disabled={busy !== null || preview.mentionableCount === 0 || !preview.previewToken || !message.trim()}
                    onClick={() => { void send() }}
                  >
                    {busy === 'send' ? '發送中…' : `確認發送${isTest ? '測試通知' : ''}並＠${preview.mentionableCount}位住戶`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default PickupNotificationPanel
