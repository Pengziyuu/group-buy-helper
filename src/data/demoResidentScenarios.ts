// Made-up resident campaigns for the local demo. Each one exercises a layout case the
// single seed campaign never hits: amount thresholds, mix-and-match pricing, custom items,
// long names, a long order wall, an unbound resident, and closed or arrived campaigns.
// All names, households and images are fictional.
import { summarizeCampaign } from '../domain/campaign'
import type { CampaignStatus } from '../domain/orderWorkflow'
import type { ResidentCampaignListItem } from '../ResidentCampaignListApp'
import type { HouseholdKind } from '../domain/household'
import type { CampaignContent } from '../services/demoCampaignStore'
import type { VisibleOrder } from './demo'

export type DemoResidentScenario = {
  slug: string
  content: CampaignContent
  status: CampaignStatus
  orders: VisibleOrder[]
  /** The signed-in resident; null shows the first-time binding form. */
  customer: { customerId: string; name: string; period: number | null; unit: string | null; householdKind: HouseholdKind } | null
}

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

const residentNames = [
  '陳小姐', '林媽媽', 'Kevin', '王大明', '吳佩珊', 'Amy Chen', '張家豪', '黃小玲', '李阿姨', 'Jason',
  '周怡君', '許志明', '蔡依婷', 'Mia', '鄭先生', '謝雅雯', '郭建宏', '洪淑芬', 'Tony Lin', '曾美玲',
  '邱俊傑', '廖小萍', '賴怡如', 'Grace', '徐國華', '楊舒涵', '劉芳瑜', '蘇文彬', '潘小華', '葉子',
  '簡單生活', '🌸花花', 'Chloe 吳', '羅伯特', '范姐', '陳建宇', 'Vivian', '施媽媽', '江小魚', '何志強',
  '呂佳蓉', 'Eric Wang', '朱阿伯', '孫小萱', '馬克', '胡美華', 'Olivia', '高家', '宋太太', '蕭先生',
]

const units = ['1A3', '2B7', '3C12', '1D5', '2E9', '3F2', '1G11', '2H4', '3I8', '1J6', '2K13', '3L10']

function fakeOrders(
  now: number,
  count: number,
  itemsFor: (index: number) => Record<string, number>,
  firstMinutesAgo: number,
  customItemsFor?: (index: number) => VisibleOrder['customItems'],
): VisibleOrder[] {
  return Array.from({ length: count }, (_, index) => {
    const orderedAt = new Date(now - (firstMinutesAgo - index * Math.max(1, Math.floor(firstMinutesAgo / (count + 1)))) * MINUTE).toISOString()
    const edited = index % 7 === 3
    return {
      customerId: `demo-scenario-customer-${index + 1}`,
      name: residentNames[index % residentNames.length],
      pictureUrl: null,
      period: (index % 3) + 1,
      unit: units[index % units.length],
      householdKind: 'resident' as const,
      items: itemsFor(index),
      customItems: customItemsFor?.(index),
      orderedAt,
      updatedAt: edited ? new Date(Date.parse(orderedAt) + 25 * MINUTE).toISOString() : orderedAt,
    }
  })
}

const me = { customerId: 'demo-scenario-me', name: '測試住戶', period: 2, unit: '2K13', householdKind: 'resident' as const }

function myOrder(items: Record<string, number>, minutesAgo: number, now: number, customItems?: VisibleOrder['customItems']): VisibleOrder {
  const at = new Date(now - minutesAgo * MINUTE).toISOString()
  return { ...me, pictureUrl: null, items, customItems, orderedAt: at, updatedAt: at }
}

export function demoResidentScenarios(clock = Date.now()): DemoResidentScenario[] {
  // Whole minutes, like closing times set in the editor, so the demo content opens up to date.
  const now = Math.floor(clock / MINUTE) * MINUTE
  const openedHoursAgo = (hours: number) => new Date(now - hours * HOUR).toISOString()
  return [
    {
      // Amount threshold, two prices, closing within a day, resident has not ordered yet.
      slug: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
      status: 'open',
      customer: me,
      orders: fakeOrders(now, 6, (index): Record<string, number> => (index % 2 === 0 ? { A: 1 } : { B: 2 }), 240),
      content: {
        title: '冷凍烤地瓜／紅燒牛肉湯',
        unitPrice: 70,
        threshold: 3000,
        thresholdKind: 'amount',
        amountThreshold: 3000,
        quantityUnit: '包',
        arrivalLabel: '10月中',
        autoCloseAt: new Date(now + 18 * HOUR).toISOString(),
        announcement: '冬天必備的暖心組合🍠\n\n(A) 冷凍烤地瓜 $149／包\n(B) 紅燒牛肉湯 $70／包\n\n滿 NT$ 3,000 成團，冷凍配送。\n微波 3 分鐘即可食用，也可以冷吃，口感像冰淇淋。\n\n保存方式：冷凍 -18°C 以下，約 6 個月。',
        images: [
          { src: '/demo/sweet-potato.svg', alt: '烤地瓜示意圖' },
          { src: '/demo/beef-soup.svg', alt: '牛肉湯示意圖' },
        ],
        items: [
          { code: 'A', name: '冷凍烤地瓜', unitPrice: 149, active: true },
          { code: 'B', name: '紅燒牛肉湯', unitPrice: 70, active: true },
        ],
        openedAt: openedHoursAgo(5),
      },
    },
    {
      // Mix-and-match promotion, many items with long names, custom items, an existing order.
      slug: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
      status: 'open',
      customer: me,
      orders: [
        myOrder({ A: 2, C: 1, J: 1 }, 50, now, [{ id: 'demo-custom-1', name: '限定口味（如果有的話）', quantity: 1 }]),
        ...fakeOrders(now, 9, (index) => ({ [String.fromCharCode(65 + (index % 12))]: 1 + (index % 3), E: 1 }), 600,
          (index) => (index === 4 ? [{ id: `demo-custom-other-${index}`, name: '辣味加量', quantity: 2 }] : undefined)),
      ],
      content: {
        title: '人氣零食任選｜12 種口味大集合（品名很長時的排版測試）',
        unitPrice: 60,
        threshold: 60,
        quantityUnit: '包',
        allowCustomItems: true,
        baseDiscountRate: 1,
        mixMatchDiscount: { name: '任選 5 包 9 折', minimumQuantity: 5, rate: 0.9 },
        arrivalLabel: '結單後約 2 週',
        autoCloseAt: new Date(now + 5 * 24 * HOUR).toISOString(),
        announcement: '任選專區的口味可以混搭，合計滿 5 包全部 9 折！\n其他商品不參加優惠。\n\n想要清單上沒有的口味，可以用「額外品項」許願，團主會另外問。',
        images: [{ src: '/demo/snack-box.svg', alt: '零食任選示意圖（直式圖片）' }],
        items: [
          { code: 'A', name: '經典原味洋芋片', unitPrice: 60, active: true, discountEligible: true },
          { code: 'B', name: '海苔口味洋芋片（期間限定・數量有限）', unitPrice: 60, active: true, discountEligible: true },
          { code: 'C', name: '辣味', unitPrice: 60, active: true, discountEligible: true },
          { code: 'D', name: '起司玉米棒', unitPrice: 55, active: true, discountEligible: true },
          { code: 'E', name: '焦糖爆米花', unitPrice: 65, active: true, discountEligible: true },
          { code: 'F', name: '黑糖麻花捲', unitPrice: 60, active: true, discountEligible: true },
          { code: 'G', name: '芥末青豆', unitPrice: 50, active: true, discountEligible: true },
          { code: 'H', name: '蒜味花生', unitPrice: 50, active: true, discountEligible: true },
          { code: 'I', name: '綜合堅果禮盒（大）', unitPrice: 380, active: true },
          { code: 'J', name: '牛軋糖', unitPrice: 120, active: true },
          { code: 'K', name: '手工鳳梨酥 6 入', unitPrice: 240, active: true },
          { code: 'L', name: '已下架口味', unitPrice: 60, active: false },
        ],
        openedAt: openedHoursAgo(26),
      },
    },
    {
      // Formed yet still open, which only an amount threshold allows (a quantity threshold
      // closes the campaign the moment it is reached), plus 50 orders, the organizer's usual volume.
      slug: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
      status: 'open',
      customer: me,
      orders: [
        myOrder({ A: 1 }, 30, now),
        ...fakeOrders(now, 49, (index) => (index % 4 === 0 ? { A: 1, B: 1 } : { [['A', 'B', 'C'][index % 3]]: 1 }), 2880),
      ],
      content: {
        title: '保久乳（鮮乳坊、初鹿、東海大學）',
        unitPrice: 730,
        threshold: 25000,
        thresholdKind: 'amount',
        amountThreshold: 25000,
        quantityUnit: '箱',
        arrivalLabel: '10/07',
        autoCloseAt: null,
        announcement: '三款保久乳任選，一箱 24 瓶。\n滿 NT$ 25,000 成團；已成團，結單前還可以繼續 +1。',
        images: [{ src: '/demo/milk.svg', alt: '保久乳示意圖' }],
        items: [
          { code: 'A', name: '鮮乳坊保久乳', unitPrice: 730, active: true },
          { code: 'B', name: '初鹿保久乳', unitPrice: 760, active: true },
          { code: 'C', name: '東海大學保久乳', unitPrice: 690, active: true },
        ],
        openedAt: openedHoursAgo(50),
      },
    },
    {
      // First visit: the resident still has to bind a household.
      slug: 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4',
      status: 'open',
      customer: null,
      orders: fakeOrders(now, 4, (index) => ({ A: 1 + (index % 2) }), 90),
      content: {
        title: '薄鹽醬油・醬油膏',
        unitPrice: 450,
        threshold: 9,
        quantityUnit: '組',
        arrivalLabel: '貨到通知',
        autoCloseAt: null,
        announcement: '一組 = 醬油 2 瓶 + 醬油膏 1 瓶。',
        images: [{ src: '/demo/soy-sauce.svg', alt: '醬油示意圖（橫式圖片）' }],
        items: [
          { code: 'A', name: '薄鹽醬油組', unitPrice: 450, active: true },
          { code: 'B', name: '醬油膏組', unitPrice: 420, active: true },
        ],
        openedAt: openedHoursAgo(8),
      },
    },
    {
      // Long title, no image, no orders yet.
      slug: 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',
      status: 'open',
      customer: me,
      orders: [],
      content: {
        title: '社區二手書交換與愛心義賣活動（沒有圖片、還沒有人下單時的樣子）',
        unitPrice: 100,
        threshold: 5,
        quantityUnit: '份',
        arrivalLabel: '',
        autoCloseAt: new Date(now + 3 * HOUR).toISOString(),
        announcement: '每份 $100，所得全數捐出。',
        images: [],
        items: [{ code: 'A', name: '愛心福袋', unitPrice: 100, active: true }],
        openedAt: openedHoursAgo(1),
      },
    },
    {
      // Closed without reaching the threshold.
      slug: 'f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6',
      status: 'closed',
      customer: me,
      orders: [myOrder({ A: 1 }, 3000, now), ...fakeOrders(now, 3, () => ({ A: 1, B: 1 }), 4000)],
      content: {
        title: '義大利橄欖油',
        unitPrice: 220,
        threshold: 12,
        quantityUnit: '瓶',
        arrivalLabel: '貨到通知',
        autoCloseAt: new Date(now - 20 * HOUR).toISOString(),
        announcement: '結單時未達 12 瓶，本團不成團。',
        images: [],
        items: [
          { code: 'A', name: '特級初榨橄欖油', unitPrice: 220, active: true },
          { code: 'B', name: '葡萄籽油', unitPrice: 199, active: true },
        ],
        openedAt: openedHoursAgo(24 * 6),
      },
    },
    {
      // Arrived and formed.
      slug: '9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a',
      status: 'arrived',
      customer: me,
      orders: [myOrder({ A: 2 }, 9000, now), ...fakeOrders(now, 9, () => ({ A: 2 }), 10000)],
      content: {
        title: '手工蛋捲禮盒',
        unitPrice: 280,
        threshold: 20,
        quantityUnit: '盒',
        arrivalLabel: '已到貨',
        autoCloseAt: new Date(now - 4 * 24 * HOUR).toISOString(),
        announcement: '已到貨，請到管理室領取。',
        images: [{ src: '/demo/snack-box.svg', alt: '蛋捲禮盒示意圖' }],
        items: [{ code: 'A', name: '原味蛋捲禮盒', unitPrice: 280, active: true }],
        openedAt: openedHoursAgo(24 * 10),
      },
    },
  ]
}

function pricedItems(scenario: DemoResidentScenario) {
  return scenario.content.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? scenario.content.unitPrice }))
}

export function demoScenarioListItem(scenario: DemoResidentScenario): ResidentCampaignListItem {
  const { content } = scenario
  const kind = content.thresholdKind ?? 'quantity'
  const summary = summarizeCampaign(scenario.orders, pricedItems(scenario), {
    kind,
    target: kind === 'amount' ? content.amountThreshold ?? content.threshold : content.threshold,
  })
  const prices = content.items.filter((item) => item.active).map((item) => item.unitPrice ?? content.unitPrice)
  return {
    slug: scenario.slug,
    title: content.title,
    status: scenario.status,
    unitPrice: prices.length > 0 ? Math.min(...prices) : content.unitPrice,
    openedAt: content.openedAt ?? new Date().toISOString(),
    totalQuantity: summary.quantity,
    totalAmount: summary.amount,
    threshold: content.threshold,
    thresholdKind: kind,
    thresholdAutoClose: content.thresholdAutoClose ?? kind === 'quantity',
    amountThreshold: content.amountThreshold ?? null,
    quantityUnit: content.quantityUnit,
    images: content.images,
    arrivalLabel: content.arrivalLabel,
    autoCloseAt: content.autoCloseAt ?? null,
  }
}
