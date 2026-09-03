export type PickupNotificationAudience = 'phase13' | 'phase2'

export type PickupNotificationRecipient = {
  memberCode: string
  displayName: string
  pictureUrl: string | null
  period: number
  unit: string
  paid: boolean
}

export type PickupNotificationRecipientGroups = Record<PickupNotificationAudience, PickupNotificationRecipient[]>

export function groupPickupNotificationRecipients(
  recipients: PickupNotificationRecipient[],
): PickupNotificationRecipientGroups {
  const unique = new Map<string, PickupNotificationRecipient>()
  for (const recipient of recipients) {
    if (!unique.has(recipient.memberCode)) unique.set(recipient.memberCode, recipient)
  }

  const values = [...unique.values()]
  return {
    phase13: values.filter((recipient) => recipient.period === 1 || recipient.period === 3),
    phase2: values.filter((recipient) => recipient.period === 2),
  }
}

export function pickupNotificationAudienceLabel(audience: PickupNotificationAudience): string {
  return audience === 'phase13' ? '一期、三期' : '二期'
}

export function pickupNotificationTemplate(
  audience: PickupNotificationAudience,
  campaignTitle: string,
): string {
  const title = campaignTitle.trim()
  if (audience === 'phase13') {
    return `🔔 溫馨提醒一期、三期芳鄰【${title}】已寄櫃囉～\n\n請儘早向保全領取，尚未付款的鄰居，有空再麻煩 LINE Pay，感恩 🙏❤️🙇`
  }

  return `🔔 溫馨提醒二期有購買【${title}】的鄰居：\n今天＿＿＿＿晚上＿＿＿＿於＿＿＿＿發貨。\n\n若有事的鄰居再請私訊告訴我，您的份我就不帶下樓退冰，我們再約其他時間。尚未付款的鄰居，有空再麻煩 LINE Pay，感恩 🙏❤️🙇`
}
