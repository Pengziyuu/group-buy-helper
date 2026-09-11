import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import { buildOrganizerOrderSummary } from '../domain/adminOrders'
import {
  buildOrderExportRows,
  createOrderExportFileName,
  createOrderExportWorkbook,
  downloadOrderExport,
} from './orderExport'

const summary = buildOrganizerOrderSummary({
  items: [
    { code: 'A', name: '蛋黃酥', unitPrice: 290 },
    { code: 'B', name: '小月餅', unitPrice: 180 },
  ],
  orders: [
    { customerId: 'u14', name: '不應匯出', period: 2, unit: 'U14', items: { B: 1 }, customItems: [{ id: 'c3', name: '加購提袋', quantity: 2 }] },
    { customerId: 'e10', name: '不應匯出', period: 1, unit: 'E10', items: { A: 1 } },
    { customerId: 'e2', name: '不應匯出', period: 1, unit: 'E2', items: { B: 2 }, customItems: [{ id: 'c1', name: '  紙盒  ', quantity: 1 }] },
  ],
  threshold: 10,
})

describe('order Excel export', () => {
  it('creates naturally sorted formal and custom rows without resident names', () => {
    expect(buildOrderExportRows(summary, '榮泉餅店')).toEqual([
      { period: 1, unit: 'E2', campaignTitle: '榮泉餅店', itemName: 'B 小月餅', quantity: 2, unitPrice: 180, custom: false },
      { period: 1, unit: 'E2', campaignTitle: '榮泉餅店', itemName: '紙盒', quantity: 1, unitPrice: null, custom: true },
      { period: 1, unit: 'E10', campaignTitle: '榮泉餅店', itemName: 'A 蛋黃酥', quantity: 1, unitPrice: 290, custom: false },
      { period: 2, unit: 'U14', campaignTitle: '榮泉餅店', itemName: 'B 小月餅', quantity: 1, unitPrice: 180, custom: false },
      { period: 2, unit: 'U14', campaignTitle: '榮泉餅店', itemName: '加購提袋', quantity: 2, unitPrice: null, custom: true },
    ])
  })

  it('rejects a workbook with no valid formal or custom rows', async () => {
    const emptySummary = {
      ...summary,
      orderRows: [{
        ...summary.orderRows[0],
        items: { A: 0 },
        customItems: [{ id: 'blank', name: '   ', quantity: 0 }],
      }],
    }

    await expect(createOrderExportWorkbook({
      summary: emptySummary,
      campaignTitle: '空團',
    })).rejects.toThrow('目前沒有可匯出的訂單')
  })

  it('uses the Taiwan opening date in a safe xlsx filename', () => {
    expect(createOrderExportFileName('榮泉／餅店:限定?', '2026-09-10T16:30:00.000Z')).toBe('榮泉_餅店_限定__2026-09-11.xlsx')
  })

  it('validates the filename before creating a download URL', async () => {
    const createObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL })
    try {
      await expect(downloadOrderExport({
        summary,
        campaignTitle: '榮泉餅店',
        openedAt: 'invalid-date',
      })).rejects.toThrow('開團日期格式錯誤，無法匯出')
      expect(createObjectURL).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('cleans up the anchor and Object URL when the browser click fails', async () => {
    const createObjectURL = vi.fn(() => 'blob:order-export')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('瀏覽器拒絕下載')
    })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    try {
      await expect(downloadOrderExport({
        summary,
        campaignTitle: '榮泉餅店',
        openedAt: '2026-09-11T05:00:00.000Z',
      })).rejects.toThrow('瀏覽器拒絕下載')
      expect(document.querySelector('a[download]')).toBeNull()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:order-export')
    } finally {
      click.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('builds a styled workbook with formulas, filters, frozen headers and formal-only totals', async () => {
    const buffer = await createOrderExportWorkbook({
      summary,
      campaignTitle: '榮泉餅店',
    })
    const workbook = new ExcelJS.Workbook()
    const workbookBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    await workbook.xlsx.load(workbookBuffer)
    const sheet = workbook.getWorksheet('成團明細')

    expect(sheet).toBeDefined()
    expect(sheet?.views).toEqual(expect.arrayContaining([expect.objectContaining({ state: 'frozen', ySplit: 1 })]))
    expect(sheet?.autoFilter).toBe('A1:I1')
    expect(sheet?.getRow(1).values).toEqual([
      undefined, '到貨日期', '期別', '戶號', '團購名', '品項／口味', '數量', '單價', '總價', '備註',
    ])
    expect(sheet?.getCell('A2').numFmt).toBe('mm/dd')
    expect(sheet?.getCell('C2').numFmt).toBe('@')
    expect(sheet?.getCell('H2').value).toEqual({ formula: 'F2*G2' })
    expect(sheet?.getCell('G3').value).toBeNull()
    expect(sheet?.getCell('H3').value).toBeNull()
    expect(sheet?.getCell('I3').value).toBe('額外品項，金額另計')
    expect(sheet?.getCell('E7').value).toBe('正式品項數量合計')
    expect(sheet?.getCell('F7').value).toEqual({ formula: 'SUM(F2,F4,F5)' })
    expect(sheet?.getCell('G7').value).toBe('正式商品總金額')
    expect(sheet?.getCell('H7').value).toEqual({ formula: 'SUM(H2,H4,H5)' })
  })
})
