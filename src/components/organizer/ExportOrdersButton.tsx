import { useId, useState } from 'react'
import type { OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { buildOrderExportRows, downloadOrderExport } from '../../services/orderExport'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'

type ExportOrdersButtonProps = {
  summary: OrganizerOrderSummary
  campaignTitle: string
  openedAt: string | null
  status: CampaignStatus
  onExport?: () => Promise<void>
}

export function ExportOrdersButton({ summary, campaignTitle, openedAt, status, onExport }: ExportOrdersButtonProps) {
  const reasonId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closed = status === 'closed' || status === 'arrived'
  const reason = !closed
    ? '結單後才能匯出'
    : buildOrderExportRows(summary, campaignTitle).length === 0 ? '目前沒有可匯出的訂單' : ''

  const exportOrders = async () => {
    if (busy || reason || !openedAt) return
    setBusy(true)
    setError('')
    try {
      await (onExport ? onExport() : downloadOrderExport({ summary, campaignTitle, openedAt }))
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '匯出 Excel 失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="organizer-export">
      <Button
        variant="secondary"
        size="sm"
        disabled={Boolean(reason) || !openedAt}
        loading={busy}
        loadingLabel="建立 Excel 中…"
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => { void exportOrders() }}
      >
        匯出 Excel
      </Button>
      {reason && <small id={reasonId}>{reason}</small>}
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
    </div>
  )
}
