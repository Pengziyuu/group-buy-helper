import type { Order } from '../domain/campaign'

export type CampaignItem = {
  code: string
  name: string
}

export type VisibleOrder = Order & {
  name: string
  period: number
  unit: string
}

export const campaign = {
  title: '一涼製冰所 超厚三明治冰餅',
  unitPrice: 45,
  threshold: 100,
  status: '收單中' as const,
  arrival: '貨到通知',
}

export const items: CampaignItem[] = [
  { code: 'A', name: '牛奶（招牌）' },
  { code: 'B', name: '花生（招牌）' },
  { code: 'C', name: '抹茶' },
  { code: 'D', name: '草莓' },
  { code: 'E', name: '可可' },
  { code: 'F', name: '黑芝麻' },
  { code: 'G', name: 'OREO' },
  { code: 'H', name: '烏龍奶' },
  { code: 'I', name: '泰奶' },
]

export const currentCustomerId = '2:2K13'

export const initialOrders: VisibleOrder[] = [
  { customerId: '2:2K13', name: '斯祈', period: 2, unit: '2K13', items: { B: 2, D: 2, E: 2 } },
  { customerId: '1:H11', name: '佩怡', period: 1, unit: 'H11', items: { B: 1, C: 1, D: 1, F: 1 } },
  { customerId: '2:3H15', name: 'Lena', period: 2, unit: '3H15', items: { C: 2, E: 1, F: 1, H: 2 } },
  { customerId: '2:2I7', name: 'Sophie', period: 2, unit: '2I7', items: { A: 2, B: 2, C: 2, D: 2, E: 2, F: 2, G: 2, H: 2, I: 2 } },
  { customerId: '2:1E7', name: 'Ashley Hsieh', period: 2, unit: '1E7', items: { B: 4, F: 2, G: 2, H: 2, I: 2 } },
  { customerId: '2:3E9', name: '黃百后', period: 2, unit: '3E9', items: { B: 5, C: 3, D: 5, E: 3 } },
]
