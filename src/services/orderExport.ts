import type { OrganizerOrderSummary } from '../domain/adminOrders'

export type OrderExportRow = {
  period: number
  unit: string
  campaignTitle: string
  itemName: string
  quantity: number
  unitPrice: number | null
  custom: boolean
}

type OrderExportInput = {
  summary: OrganizerOrderSummary
  campaignTitle: string
}

const unitCollator = new Intl.Collator('zh-TW', { numeric: true, sensitivity: 'base' })

export function buildOrderExportRows(summary: OrganizerOrderSummary, campaignTitle: string): OrderExportRow[] {
  const itemByCode = new Map(summary.itemRows.map((item, index) => [item.code, { ...item, index }]))
  const orders = [...summary.orderRows].sort((left, right) => (
    left.period - right.period || unitCollator.compare(left.unit, right.unit)
  ))

  return orders.flatMap((order) => {
    const formalRows = Object.entries(order.items)
      .filter(([, quantity]) => quantity > 0)
      .sort(([left], [right]) => {
        const leftItem = itemByCode.get(left)
        const rightItem = itemByCode.get(right)
        return (leftItem?.index ?? Number.MAX_SAFE_INTEGER) - (rightItem?.index ?? Number.MAX_SAFE_INTEGER)
          || unitCollator.compare(left, right)
      })
      .flatMap(([code, quantity]) => {
        const item = itemByCode.get(code)
        return item ? [{
          period: order.period,
          unit: order.unit,
          campaignTitle,
          itemName: `${item.label} ${item.name}`,
          quantity,
          unitPrice: item.unitPrice,
          custom: false,
        }] : []
      })
    const customRows = (order.customItems ?? [])
      .filter((item) => item.name.trim() && item.quantity > 0)
      .map((item) => ({
        period: order.period,
        unit: order.unit,
        campaignTitle,
        itemName: item.name.trim(),
        quantity: item.quantity,
        unitPrice: null,
        custom: true,
      }))
    return [...formalRows, ...customRows]
  })
}

function taiwanDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) throw new Error('開團日期格式錯誤，無法匯出')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function createOrderExportFileName(campaignTitle: string, openedAt: string): string {
  const safeTitle = campaignTitle.trim()
    .replace(/[\\/:*?"<>|／]/g, '_')
    .replace(/[. ]+$/g, '') || '未命名團購'
  return `${safeTitle}_${taiwanDate(openedAt)}.xlsx`
}

export async function createOrderExportWorkbook({ summary, campaignTitle }: OrderExportInput): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '團購小幫手'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const sheet = workbook.addWorksheet('成團明細', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = [
    { header: '到貨日期', key: 'arrivalDate', width: 13 },
    { header: '期別', key: 'period', width: 9 },
    { header: '戶號', key: 'unit', width: 13 },
    { header: '團購名', key: 'campaignTitle', width: 24 },
    { header: '品項／口味', key: 'itemName', width: 32 },
    { header: '數量', key: 'quantity', width: 10 },
    { header: '單價', key: 'unitPrice', width: 18 },
    { header: '總價', key: 'total', width: 15 },
    { header: '備註', key: 'note', width: 24 },
  ]
  sheet.autoFilter = 'A1:I1'
  sheet.getRow(1).height = 25
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF236B53' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF174D3D' } } }
  })

  const exportRows = buildOrderExportRows(summary, campaignTitle)
  if (exportRows.length === 0) throw new Error('目前沒有可匯出的訂單')
  const formalQuantityCells: string[] = []
  const formalTotalCells: string[] = []

  exportRows.forEach((item, index) => {
    const excelRowNumber = index + 2
    const row = sheet.addRow({
      arrivalDate: null,
      period: item.period,
      unit: item.unit,
      campaignTitle: item.campaignTitle,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.custom ? null : { formula: `F${excelRowNumber}*G${excelRowNumber}` },
      note: item.custom ? '額外品項，金額另計' : '',
    })
    row.height = 22
    row.getCell(1).numFmt = 'mm/dd'
    row.getCell(3).numFmt = '@'
    row.getCell(6).numFmt = '0'
    row.getCell(7).numFmt = '$#,##0'
    row.getCell(8).numFmt = '$#,##0'
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9E4DF' } } }
    })
    if (item.custom) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } }
      })
    } else {
      formalQuantityCells.push(`F${excelRowNumber}`)
      formalTotalCells.push(`H${excelRowNumber}`)
    }
  })

  const totalRow = sheet.addRow({
    itemName: '正式品項數量合計',
    quantity: { formula: formalQuantityCells.length ? `SUM(${formalQuantityCells.join(',')})` : '0' },
    unitPrice: '正式商品總金額',
    total: { formula: formalTotalCells.length ? `SUM(${formalTotalCells.join(',')})` : '0' },
  })
  totalRow.height = 25
  totalRow.font = { bold: true, color: { argb: 'FF174D3D' } }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F1EA' } }
  totalRow.getCell(6).numFmt = '0'
  totalRow.getCell(8).numFmt = '$#,##0'
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: 'medium', color: { argb: 'FF236B53' } } }
    cell.alignment = { vertical: 'middle', wrapText: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

export async function downloadOrderExport(input: OrderExportInput & { openedAt: string }): Promise<void> {
  const fileName = createOrderExportFileName(input.campaignTitle, input.openedAt)
  const bytes = await createOrderExportWorkbook(input)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  let anchor: HTMLAnchorElement | null = null
  try {
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor?.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
