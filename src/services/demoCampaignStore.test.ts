import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadDraftCampaign,
  loadPublishedCampaign,
  publishCampaign,
  saveDraftCampaign,
  type CampaignContent,
} from './demoCampaignStore'

const original: CampaignContent = {
  title: '原始團購',
  unitPrice: 45,
  threshold: 100,
  announcement: '原始公告',
  images: [],
}

const edited: CampaignContent = {
  ...original,
  title: '更新後團購',
  announcement: '更新後公告',
}

beforeEach(() => localStorage.clear())

describe('demo campaign draft and publishing store', () => {
  it('keeps a saved draft separate from the resident published version', () => {
    saveDraftCampaign(edited)

    expect(loadDraftCampaign(original)).toEqual(edited)
    expect(loadPublishedCampaign(original)).toEqual(original)
  })

  it('changes the resident version only after publishing', () => {
    saveDraftCampaign(edited)
    publishCampaign(edited)

    expect(loadPublishedCampaign(original)).toEqual(edited)
  })
})
