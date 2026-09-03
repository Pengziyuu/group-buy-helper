import { describe, expect, it } from 'vitest'
import {
  groupPickupNotificationRecipients,
  pickupNotificationTemplate,
  type PickupNotificationRecipient,
} from './pickupNotification'

const recipients: PickupNotificationRecipient[] = [
  { memberCode: 'member-a', displayName: '一期住戶', pictureUrl: null, period: 1, unit: 'A1', paid: false },
  { memberCode: 'member-b', displayName: '二期住戶', pictureUrl: null, period: 2, unit: '1B2', paid: true },
  { memberCode: 'member-c', displayName: '三期住戶', pictureUrl: null, period: 3, unit: '2C3', paid: false },
  { memberCode: 'member-a', displayName: '一期住戶', pictureUrl: null, period: 1, unit: 'A1', paid: false },
]

describe('pickup notification domain', () => {
  it('groups unique purchasers into phase one plus three and phase two audiences', () => {
    const grouped = groupPickupNotificationRecipients(recipients)

    expect(grouped.phase13.map((recipient) => recipient.memberCode)).toEqual(['member-a', 'member-c'])
    expect(grouped.phase2.map((recipient) => recipient.memberCode)).toEqual(['member-b'])
  })

  it('builds one-campaign Traditional Chinese templates without mention placeholders', () => {
    expect(pickupNotificationTemplate('phase13', '神農包子')).toContain('一期、三期芳鄰【神農包子】已寄櫃囉')
    expect(pickupNotificationTemplate('phase2', '神農包子')).toContain('二期有購買【神農包子】的鄰居')
    expect(pickupNotificationTemplate('phase13', '神農包子')).not.toMatch(/[{}]/)
  })
})
