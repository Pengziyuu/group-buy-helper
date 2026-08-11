import type { Order } from '../domain/campaign'

export type CampaignItem = {
  code: string
  name: string
  active: boolean
}

export type VisibleOrder = Order & {
  name: string
  period: number
  unit: string
  orderedAt: string
  updatedAt: string
}

export const campaign = {
  title: '一涼製冰所 超厚三明治冰餅',
  unitPrice: 45,
  threshold: 100,
  status: '收單中' as const,
  arrival: '貨到通知',
  openedAt: '2026-08-14T00:05:09.000Z',
  announcement: `🌞炎炎夏日 #冰品最佳首選🧊🍦
🌈一涼製冰所 超厚三明治冰餅🌈

🉐🉐美味代購價一個$４５元🉐🉐

(A)牛奶(招牌)
(B)花生(招牌)
(C)抹茶
(D)草莓
(E)可可
(F)黑芝麻
(G)OREO
(H)烏龍奶
(I)泰奶

📣此為排隊美食，接單後排單生產
源自雲林50年老店，引進嘉義後馬上掀起熱潮🔥
吃一次就忘不掉🥹

冰餅的餅乾體使用福義軒😊的餅乾
裡頭的冰淇淋口感細緻綿密，第一口咬下時酥酥香香！
🤤緊接著冰淇淋的沁涼風味～🧊

咬下時酥酥香香冰冰涼涼，透心涼呀又超好吃
🎉許願已久～心心念念的一涼～來了

到嘉義玩絕對不能錯過的排隊名店✨
趕快+2 +4⋯每個口味都好吃🤤🤤
牛奶、花生、OREO 都超級推薦

葷素別:蛋奶素
規格:每個大約3.774cm
產地:台灣
保存期限:冷凍約三個月
(新鮮吃最好吃，餅乾會因時間受潮慢慢變軟)

結單 : 100個成團
到貨 : 貨到通知`,
  images: [
    {
      src: '/ice-cream-sandwich-demo.svg',
      alt: '超厚三明治冰餅口味示意圖',
    },
  ],
}

export const items: CampaignItem[] = [
  { code: 'A', name: '牛奶（招牌）', active: true },
  { code: 'B', name: '花生（招牌）', active: true },
  { code: 'C', name: '抹茶', active: true },
  { code: 'D', name: '草莓', active: true },
  { code: 'E', name: '可可', active: true },
  { code: 'F', name: '黑芝麻', active: true },
  { code: 'G', name: 'OREO', active: true },
  { code: 'H', name: '烏龍奶', active: true },
  { code: 'I', name: '泰奶', active: true },
]

export const currentCustomerId = '2:2K13'

export const initialOrders: VisibleOrder[] = [
  { customerId: '2:2K13', name: '斯祈', period: 2, unit: '2K13', items: { B: 2, D: 2, E: 2 }, orderedAt: '2026-08-14T00:10:00Z', updatedAt: '2026-08-14T00:12:00Z' },
  { customerId: '1:H11', name: '佩怡', period: 1, unit: 'H11', items: { B: 1, C: 1, D: 1, F: 1 }, orderedAt: '2026-08-14T00:15:00Z', updatedAt: '2026-08-14T00:15:00Z' },
  { customerId: '2:3H15', name: 'Lena', period: 2, unit: '3H15', items: { C: 2, E: 1, F: 1, H: 2 }, orderedAt: '2026-08-14T00:20:00Z', updatedAt: '2026-08-14T00:20:00Z' },
  { customerId: '2:2I7', name: 'Sophie', period: 2, unit: '2I7', items: { A: 2, B: 2, C: 2, D: 2, E: 2, F: 2, G: 2, H: 2, I: 2 }, orderedAt: '2026-08-14T00:25:00Z', updatedAt: '2026-08-14T00:25:00Z' },
  { customerId: '2:1E7', name: 'Ashley Hsieh', period: 2, unit: '1E7', items: { B: 4, F: 2, G: 2, H: 2, I: 2 }, orderedAt: '2026-08-14T00:30:00Z', updatedAt: '2026-08-14T00:30:00Z' },
  { customerId: '2:3E9', name: '黃百后', period: 2, unit: '3E9', items: { B: 5, C: 3, D: 5, E: 3 }, orderedAt: '2026-08-14T00:35:00Z', updatedAt: '2026-08-14T00:35:00Z' },
]
