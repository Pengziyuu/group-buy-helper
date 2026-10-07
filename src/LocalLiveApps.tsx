import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import NotificationTestLab from './NotificationTestLab'
import { LazySectionBoundary } from './components/ui/LazySectionBoundary'
import ResidentCampaignListApp, {
  type ResidentCampaignListItem,
  type ResidentLineIdentity,
} from './ResidentCampaignListApp'
import ResidentMyOrdersApp, { type ResidentMyOrder } from './ResidentMyOrdersApp'
import { residentMyOrdersRepository, type ResidentMyOrdersRepository } from './services/residentMyOrders'
import { ResidentCampaignSkeleton, ResidentListSkeleton } from './components/resident/ResidentSkeletons'
import { clearResidentPageCache, readResidentPageCache, writeResidentPageCache } from './services/residentPageCache'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'
import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
import { OrdersSection } from './components/organizer/OrdersSection'
import { OrganizerHome } from './components/organizer/OrganizerHome'
import { OrganizerSettings } from './components/organizer/OrganizerSettings'
import { OrganizerShell } from './components/organizer/OrganizerShell'
import { PickupSection } from './components/organizer/PickupSection'
import { isUnboundResident } from './components/organizer/residentView'
import type { WorkspaceCampaign } from './components/organizer/WorkspaceRail'
import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
import type { LiveState } from './components/organizer/LiveStatus'
import { residentCampaignPath, type ResidentFilter, type WorkspaceSection } from './routing'
import './LocalLiveApps.css'
import {
  createAdminCampaignGateway,
  type AdminCampaignSupabaseClient,
} from './services/adminCampaignGateway'
import {
  campaignContentEquals,
  normalizeCampaignContent,
  type CampaignContent,
  type CampaignImage,
} from './services/demoCampaignStore'
import type { Database } from './types/database'
import type { OrganizerOrderSummary } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'
import type { HouseholdKind } from './domain/household'
import type { VisibleOrder } from './data/demo'
import { createAdminOrdersGateway, type CampaignState } from './services/adminOrdersGateway'
import { createPickupNotificationGateway, type PickupNotificationCommand, type PickupNotificationPlanPreview, type PickupNotificationResponse } from './services/pickupNotificationGateway'
import type { PickupNotificationPlan } from './domain/pickupNotification'
import { createPickupNotificationTestCampaignGateway } from './services/pickupNotificationTestCampaignGateway'
import type { PickupNotificationAudience } from './domain/pickupNotification'
import { createCampaignImageGateway } from './services/campaignImageGateway'
import {
  createCampaignManagementGateway,
  type CampaignListItem,
} from './services/campaignManagementGateway'
import { createCampaignTemplateGateway, type CampaignTemplateRepository } from './services/campaignTemplateGateway'
import { createLineOrganizerGateway, type LineOrganizerResult } from './services/lineOrganizerGateway'
import { createLineResidentGateway, ResidentAdmissionError, type LineResidentSignInResult } from './services/lineResidentGateway'
import {
  createResidentMemberManagementGateway,
  type ResidentMember,
} from './services/residentMemberManagementGateway'
import {
  createAutoCloseNotificationSettingsGateway,
  type AutoCloseNotificationSettingState,
} from './services/autoCloseNotificationSettingsGateway'
import { loadLiffIdentity, type LiffClient } from './services/liffIdentity'
import { Button } from './components/ui/Button'
import { normalizeQuantityUnit, type QuantityUnit } from './domain/quantityUnit'
import { trimItemNames } from './domain/itemName'
import { customOrderItemsEqual, parseCustomOrderItems, type CustomOrderItem } from './domain/customOrderItem'
import { ErrorState, LoadingState } from './components/ui/AsyncState'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import {
  LOGOUT_TOMBSTONE_KEY,
  SUPABASE_AUTH_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  type AuthSessionStorage,
} from './services/authStorage'

const AdminApp = lazy(() => import('./AdminApp'))
// The campaign page's code is fetched as soon as the page starts signing in (see LocalLiveResidentCampaignApp),
// not once sign-in and the campaign data have arrived, which cost a further round trip.
const loadResidentCampaignPage = () => import('./App')
const App = lazy(loadResidentCampaignPage)

export type LiveAdminRepository = {
  loadPublished(campaignId: string): Promise<CampaignContent>
  loadOptionalPublished?(campaignId: string): Promise<CampaignContent | null>
  loadResidentSlug?(campaignId: string): Promise<string | null>
  loadOptionalDraft(campaignId: string): Promise<CampaignContent | null>
  saveDraft(campaignId: string, content: CampaignContent): Promise<CampaignContent>
  publish(campaignId: string): Promise<CampaignContent>
}

export type LiveAdminOrdersRepository = {
  loadCampaignState(campaignId: string): Promise<CampaignState>
  loadSummary(campaignId: string, threshold: number, thresholdKind?: 'quantity' | 'amount', amountThreshold?: number | null, quantityUnit?: QuantityUnit): Promise<OrganizerOrderSummary>
  setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void>
  setOrderPaid(orderId: string, paid: boolean): Promise<void>
  setOrderOrganizerNote(orderId: string, note: string): Promise<void>
  cancelOrder(orderId: string): Promise<void>
}

export type LivePickupNotificationRepository = {
  preview(campaignId: string, audience: PickupNotificationAudience, message: string): Promise<PickupNotificationResponse>
  createCommand(campaignId: string, audience: PickupNotificationAudience, message: string, previewToken: string): Promise<PickupNotificationCommand>
  previewPlan?(campaignId: string, plan: PickupNotificationPlan): Promise<PickupNotificationPlanPreview>
  createPlanCommand?(campaignId: string, plan: PickupNotificationPlan, previewToken: string): Promise<PickupNotificationCommand>
}

export type LivePickupNotificationTestCampaignRepository = {
  list(): Promise<string[]>
  setEnabled(campaignId: string, enabled: boolean): Promise<void>
}

export type LiveCampaignManagementRepository = {
  list(): Promise<CampaignListItem[]>
  create(title: string): Promise<CampaignListItem>
  delete(campaignId: string): Promise<{ warning: string | null }>
}

export type LiveResidentMemberRepository = {
  list(): Promise<ResidentMember[]>
  setBlocked(memberCode: string, blocked: boolean): Promise<void>
  updateHousehold(memberCode: string, household: { kind: HouseholdKind; period: number | null; unit: string | null }): Promise<void>
  refreshGroupStatuses?(memberCodes: string[]): Promise<import('./services/residentMemberManagementGateway').ResidentGroupStatusUpdate[]>
}

export type LiveAutoCloseNotificationSettingsRepository = {
  getState(): Promise<AutoCloseNotificationSettingState>
  selectCurrentUser(): Promise<void>
}

type LocalLiveAppProps = {
  client: SupabaseClient<Database>
  campaignId?: string
}

type LocalLiveResidentAppProps = {
  client: SupabaseClient<Database>
  campaignId?: string
  campaignSlug?: string
  liffId?: string
  liffClient?: LiffClient
  lineResidentGateway?: { signIn(idToken: string): Promise<LineResidentSignInResult> }
  residentListRepository?: LiveResidentListRepository
  residentOrdersRepository?: ResidentMyOrdersRepository
  /** The resident's own orders instead of the campaign list. */
  page?: 'orders'
}

export type LiveResidentListRepository = {
  list(): Promise<ResidentCampaignListItem[]>
}

type CampaignRow = {
  title: unknown
  unit_price: unknown
  threshold: unknown
  threshold_kind?: unknown
  amount_threshold?: unknown
  threshold_auto_close?: unknown
  quantity_unit?: unknown
  allow_custom_items?: unknown
  base_discount_rate?: unknown
  mix_match_name?: unknown
  mix_match_min_quantity?: unknown
  mix_match_discount_rate?: unknown
  arrival_label?: unknown
  auto_close_at?: unknown
  announcement: unknown
  images: unknown
  items: unknown
  opened_at: unknown
  status: unknown
}

type ResidentCustomer = Pick<VisibleOrder, 'customerId' | 'name'> & {
  period: number | null
  unit: string | null
  householdKind: HouseholdKind
}
type OrderWallRow = Pick<
  Database['public']['Views']['order_wall']['Row'],
  'order_id' | 'customer_id' | 'customer_name' | 'picture_url' | 'period' | 'unit' | 'household_kind' | 'item_code' | 'qty' | 'final_unit_price' | 'custom_items' | 'ordered_at' | 'order_updated_at'
>

function visibleOrdersFromRows(rows: OrderWallRow[]): VisibleOrder[] {
  const orders = new Map<string, VisibleOrder>()
  for (const row of rows) {
    // An 'other' household legitimately has a null period and unit (they are
    // outside the community), so only the fields every order genuinely
    // needs gate inclusion here - the same fix as adminOrdersGateway.ts
    // applies on the organizer side. The customer_household_format CHECK
    // constraint (supabase/migrations/20260919160000_household_kind.sql)
    // guarantees this is a total mapping - a 'resident' row always has both
    // period and unit, an 'other' row has neither - so there is no third
    // state this filter needs to account for.
    if (!row.order_id || !row.customer_id || !row.customer_name
      || !row.ordered_at || !row.order_updated_at) continue
    const order = orders.get(row.order_id) ?? {
      customerId: row.customer_id,
      name: row.customer_name,
      pictureUrl: row.picture_url,
      period: row.period,
      unit: row.unit,
      householdKind: (row.household_kind ?? (row.period === null ? 'other' : 'resident')) as HouseholdKind,
      items: {},
      itemUnitPrices: {},
      customItems: parseCustomOrderItems(row.custom_items),
      orderedAt: row.ordered_at,
      updatedAt: row.order_updated_at,
    }
    if (row.item_code && row.qty && row.qty > 0) {
      order.items[row.item_code] = row.qty
      if (row.final_unit_price !== null) order.itemUnitPrices![row.item_code] = row.final_unit_price
    }
    orders.set(row.order_id, order)
  }
  return [...orders.values()]
}

type PendingOwnOrder = { campaignId: string; customerId: string; items: Record<string, number>; customItems: CustomOrderItem[] }

function matchesPendingOwnOrder(orders: VisibleOrder[], pending: PendingOwnOrder): boolean {
  const ownOrder = orders.find((order) => order.customerId === pending.customerId)
  if (!ownOrder || !customOrderItemsEqual(ownOrder.customItems ?? [], pending.customItems)) return false
  const codes = new Set([...Object.keys(ownOrder.items), ...Object.keys(pending.items)])
  return [...codes].every((code) => (ownOrder.items[code] ?? 0) === (pending.items[code] ?? 0))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  if ('code' in error && typeof error.code === 'string') return error.code
  if ('error_code' in error && typeof error.error_code === 'string') return error.error_code
  return ''
}

function isRetryableAuthError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== 'object') return false
  if (['request_timeout', 'network_error', 'fetch_error', 'network_request_failed']
    .includes(authErrorCode(error))) return true
  const status = 'status' in error && typeof error.status === 'number' ? error.status : null
  return status === 0 || status === 408 || status === 429 || (status !== null && status >= 500)
}

function storedAuthKeys(storage: AuthSessionStorage): string[] {
  const keys = new Set([
    SUPABASE_AUTH_STORAGE_KEY,
    SUPABASE_AUTH_CODE_VERIFIER_KEY,
    SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  ])
  const validFlowId = /^[a-zA-Z0-9_-]{8,64}$/

  try {
    const rawFlowIndex = storage.getItem(SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY)
    if (rawFlowIndex) {
      const flowIndex: unknown = JSON.parse(rawFlowIndex)
      if (Array.isArray(flowIndex)) {
        for (const flowId of flowIndex) {
          if (typeof flowId === 'string' && validFlowId.test(flowId)) {
            keys.add(`${SUPABASE_AUTH_STORAGE_KEY}-flow-${flowId}-code-verifier`)
          }
        }
      }
    }
  } catch {
    // Fixed keys and any enumerable per-flow keys are still cleaned below.
  }

  let length = 0
  try {
    length = typeof storage.length === 'number' ? storage.length : 0
  } catch {
    length = 0
  }
  let keyAt: AuthSessionStorage['key']
  try {
    keyAt = storage.key
  } catch {
    keyAt = undefined
  }
  if (keyAt) {
    for (let index = 0; index < length; index += 1) {
      try {
        const key = keyAt.call(storage, index)
        if (key?.startsWith(`${SUPABASE_AUTH_STORAGE_KEY}-flow-`)
          && key.endsWith('-code-verifier')) keys.add(key)
      } catch {
        // One inaccessible slot must not prevent cleanup of every discovered key.
      }
    }
  }
  return [...keys]
}

function clearStoredAuth(storage: AuthSessionStorage | null): unknown[] {
  if (!storage) return []
  const failures: unknown[] = []
  let keys = [
    SUPABASE_AUTH_STORAGE_KEY,
    SUPABASE_AUTH_CODE_VERIFIER_KEY,
    SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  ]
  try {
    keys = storedAuthKeys(storage)
  } catch (error) {
    failures.push(error)
  }
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch (error) {
      failures.push(error)
    }
  }
  return failures
}

function clearLogoutMarkers(storages: Array<AuthSessionStorage | null>): unknown[] {
  const failures: unknown[] = []
  for (const storage of storages) {
    if (!storage) continue
    try {
      storage.removeItem(LOGOUT_TOMBSTONE_KEY)
    } catch (error) {
      failures.push(error)
    }
  }
  return failures
}

function isCampaignImage(image: unknown): image is CampaignImage {
  return Boolean(
    image
      && typeof image === 'object'
      && 'src' in image
      && typeof image.src === 'string'
      && 'alt' in image
      && typeof image.alt === 'string',
  )
}

function campaignContentFromRow(row: CampaignRow | null): CampaignContent {
  if (!row
    || typeof row.title !== 'string'
    || typeof row.unit_price !== 'number'
    || typeof row.threshold !== 'number'
    || typeof row.announcement !== 'string'
    || !Array.isArray(row.images)
    || !row.images.every(isCampaignImage)
    || !Array.isArray(row.items)) {
    throw new Error('Supabase 回傳的團購資料格式錯誤')
  }
  return normalizeCampaignContent({
    title: row.title,
    unitPrice: row.unit_price,
    threshold: row.threshold,
    thresholdKind: row.threshold_kind === 'amount' ? 'amount' : 'quantity',
    amountThreshold: row.threshold_kind === 'amount' && typeof row.amount_threshold === 'number' ? row.amount_threshold : null,
    thresholdAutoClose: typeof row.threshold_auto_close === 'boolean' ? row.threshold_auto_close : row.threshold_kind !== 'amount',
    quantityUnit: normalizeQuantityUnit(row.quantity_unit),
    allowCustomItems: row.allow_custom_items === true,
    baseDiscountRate: typeof row.base_discount_rate === 'number' ? row.base_discount_rate : 1,
    mixMatchDiscount: typeof row.mix_match_name === 'string'
      && typeof row.mix_match_min_quantity === 'number'
      && typeof row.mix_match_discount_rate === 'number'
      ? { name: row.mix_match_name, minimumQuantity: row.mix_match_min_quantity, rate: row.mix_match_discount_rate }
      : null,
    arrivalLabel: typeof row.arrival_label === 'string' ? row.arrival_label : '貨到通知',
    autoCloseAt: typeof row.auto_close_at === 'string' ? row.auto_close_at : null,
    announcement: row.announcement,
    images: row.images,
    items: trimItemNames(row.items as CampaignContent['items']),
    openedAt: typeof row.opened_at === 'string' ? row.opened_at : null,
  })
}

function campaignStatusFromRow(row: CampaignRow | null): CampaignStatus {
  if (!row || typeof row.status !== 'string' || !['open', 'closed', 'arrived'].includes(row.status)) {
    throw new Error('Supabase 回傳的活動狀態格式錯誤')
  }
  return row.status as CampaignStatus
}

function LiveLoading({ label }: { label: string }) {
  return (
    <main className="live-state-shell">
      <LoadingState label={label} page />
    </main>
  )
}

function LiveError({ message, title = '無法載入團購小幫手' }: { message: string; title?: string }) {
  return (
    <main className="live-state-shell">
      <ErrorState title={title} message={message} page />
    </main>
  )
}

export function LocalLiveAdminApp({
  client,
  campaignId,
  repository,
  ordersRepository,
  pickupNotificationRepository,
  pickupNotificationTestCampaignRepository,
  managementRepository,
  residentMemberRepository,
  autoCloseNotificationSettingsRepository,
  templateRepository,
  authStorage = null,
  logoutFallbackStorage = null,
  liffId,
  liffClient,
  lineOrganizerGateway,
  notificationLab = false,
  page = 'home',
  section = null,
  residentFilter = 'all',
}: LocalLiveAppProps & {
  repository?: LiveAdminRepository
  ordersRepository?: LiveAdminOrdersRepository
  pickupNotificationRepository?: LivePickupNotificationRepository
  pickupNotificationTestCampaignRepository?: LivePickupNotificationTestCampaignRepository
  managementRepository?: LiveCampaignManagementRepository
  residentMemberRepository?: LiveResidentMemberRepository
  autoCloseNotificationSettingsRepository?: LiveAutoCloseNotificationSettingsRepository
  templateRepository?: CampaignTemplateRepository
  authStorage?: AuthSessionStorage | null
  logoutFallbackStorage?: AuthSessionStorage | null
  liffId?: string
  liffClient?: LiffClient
  lineOrganizerGateway?: { signIn(): Promise<LineOrganizerResult> }
  notificationLab?: boolean
  page?: 'home' | 'residents' | 'settings'
  section?: WorkspaceSection | null
  residentFilter?: ResidentFilter
}) {
  const gateway = useMemo(
    () => repository ?? createAdminCampaignGateway(client as AdminCampaignSupabaseClient),
    [client, repository],
  )
  const ordersGateway = useMemo(
    () => ordersRepository ?? createAdminOrdersGateway(client),
    [client, ordersRepository],
  )
  const pickupNotificationGateway = useMemo(
    () => pickupNotificationRepository ?? createPickupNotificationGateway(client, 'production'),
    [client, pickupNotificationRepository],
  )
  const pickupNotificationTestGateway = useMemo(
    () => pickupNotificationRepository ?? createPickupNotificationGateway(client, 'test'),
    [client, pickupNotificationRepository],
  )
  const testCampaignGateway = useMemo(
    () => pickupNotificationTestCampaignRepository
      ?? createPickupNotificationTestCampaignGateway(client as never),
    [client, pickupNotificationTestCampaignRepository],
  )
  const testCampaignGatewayRef = useRef(testCampaignGateway)
  testCampaignGatewayRef.current = testCampaignGateway
  const imageGateway = useMemo(() => createCampaignImageGateway(client), [client])
  const campaignManagementGateway = useMemo(
    () => managementRepository ?? createCampaignManagementGateway(client),
    [client, managementRepository],
  )
  const residentMemberGateway = useMemo(
    () => residentMemberRepository ?? createResidentMemberManagementGateway(client),
    [client, residentMemberRepository],
  )
  const autoCloseNotificationSettingsGateway = useMemo(
    () => autoCloseNotificationSettingsRepository ?? createAutoCloseNotificationSettingsGateway(client),
    [autoCloseNotificationSettingsRepository, client],
  )
  const autoCloseNotificationSettingsGatewayRef = useRef(autoCloseNotificationSettingsGateway)
  autoCloseNotificationSettingsGatewayRef.current = autoCloseNotificationSettingsGateway
  const templateGateway = useMemo(
    () => templateRepository ?? createCampaignTemplateGateway(client, {
      createCampaign: (title) => campaignManagementGateway.create(title),
      saveDraft: (campaignId, content) => gateway.saveDraft(campaignId, content),
    }),
    [campaignManagementGateway, client, gateway, templateRepository],
  )
  const activeLineOrganizerGateway = useMemo(
    () => lineOrganizerGateway ?? (liffId && liffClient
      ? createLineOrganizerGateway(client, liffClient, liffId)
      : null),
    [client, liffClient, liffId, lineOrganizerGateway],
  )
  const authValidationGeneration = useRef(0)
  const signInGeneration = useRef(0)
  const signOutGeneration = useRef(0)
  const authEventsBlocked = useRef(false)
  const logoutBarrier = useRef(false)
  const activeSignOut = useRef(false)
  const validatedOrganizerId = useRef<string | null>(null)
  // The access token behind validatedOrganizerId; a refreshed token is checked again.
  const verifiedAccessToken = useRef<string | null>(null)
  const currentCampaignIdRef = useRef(campaignId)
  currentCampaignIdRef.current = campaignId
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [contentCampaignId, setContentCampaignId] = useState<string | null>(null)
  const [publishedContent, setPublishedContent] = useState<CampaignContent | null>(null)
  const [orderSummary, setOrderSummary] = useState<OrganizerOrderSummary | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [campaignClosedAt, setCampaignClosedAt] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null)
  const [testCampaignIds, setTestCampaignIds] = useState<string[] | null>(null)
  const [residentMembers, setResidentMembers] = useState<ResidentMember[] | null>(null)
  const [autoCloseNotificationState, setAutoCloseNotificationState] = useState<AutoCloseNotificationSettingState | null>(null)
  const [residentSlug, setResidentSlug] = useState<string | null>(null)
  const [publishSyncWarning, setPublishSyncWarning] = useState<{ campaignId: string; message: string } | null>(null)
  const [publicationState, setPublicationState] = useState<'draft' | 'published'>('published')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [linePending, setLinePending] = useState<{ requestCode: string; displayName: string | null } | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [logoutNotice, setLogoutNotice] = useState('')
  const [fatalAuthError, setFatalAuthError] = useState('')
  const [liveState, setLiveState] = useState<LiveState>('unavailable')
  const [liveAttempt, setLiveAttempt] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  // Points at the latest reloadOrderSummary so the subscription never calls a stale closure.
  const orderSyncRef = useRef<(() => Promise<void>) | null>(null)
  const organizerUserId = session?.user?.id ?? null

  const signOutRemotely = useCallback(async (): Promise<unknown> => {
    const signOutId = ++signOutGeneration.current
    const markerStorages = [authStorage, logoutFallbackStorage]
    logoutBarrier.current = true
    authEventsBlocked.current = true
    activeSignOut.current = true
    setSignOutPending(true)
    setLogoutNotice('')
    setFatalAuthError('')

    let markerWritten = markerStorages.every((storage) => !storage)
    const markerFailures: unknown[] = []
    for (const storage of markerStorages) {
      if (!storage) continue
      try {
        storage.setItem(LOGOUT_TOMBSTONE_KEY, '1')
        if (storage.getItem(LOGOUT_TOMBSTONE_KEY) === '1') markerWritten = true
        else markerFailures.push(new Error('瀏覽器未保存登出標記'))
      } catch (error) {
        markerFailures.push(error)
      }
    }
    if (!markerWritten) clearStoredAuth(authStorage)

    let remoteFailure: unknown = null
    try {
      const { error: signOutError } = await client.auth.signOut()
      remoteFailure = signOutError
    } catch (signOutError) {
      remoteFailure = signOutError
    } finally {
      const credentialFailures = clearStoredAuth(authStorage)
      const tombstoneFailures = credentialFailures.length === 0
        ? clearLogoutMarkers(markerStorages)
        : []
      activeSignOut.current = false
      if (signOutId === signOutGeneration.current) {
        setSignOutPending(false)
        if (credentialFailures.length > 0 || tombstoneFailures.length > 0) {
          const failure = credentialFailures[0] ?? tombstoneFailures[0]
          setFatalAuthError(`無法清除本機登入資料：${errorMessage(failure)}。請清除網站資料後再試。`)
        } else if (remoteFailure) {
          setLogoutNotice('本機已登出，但無法撤銷遠端工作階段；其他裝置可能仍保持登入。')
        } else if (markerFailures.length > 0) {
          setLogoutNotice('本機已登出；部分登出保護標記無法保存，已直接清除本機登入資料。')
        }
      }
    }
    return remoteFailure ?? markerFailures[0] ?? null
  }, [authStorage, client, logoutFallbackStorage])

  useEffect(() => {
    let active = true
    let authEventSeen = false
    signInGeneration.current += 1
    validatedOrganizerId.current = null
    setError('')
    setFatalAuthError('')
    setSession(undefined)
    setSigningIn(false)
    setSignOutPending(activeSignOut.current)

    let hasLogoutTombstone = logoutBarrier.current || activeSignOut.current
    for (const storage of [authStorage, logoutFallbackStorage]) {
      if (!storage) continue
      try {
        hasLogoutTombstone ||= storage.getItem(LOGOUT_TOMBSTONE_KEY) === '1'
      } catch (storageError) {
        hasLogoutTombstone = true
        setFatalAuthError(`無法讀取本機登入資料：${errorMessage(storageError)}。請清除網站資料後再試。`)
      }
    }

    if (hasLogoutTombstone) {
      logoutBarrier.current = true
      authEventsBlocked.current = true
      if (!activeSignOut.current) {
        const credentialFailures = clearStoredAuth(authStorage)
        const markerFailures = credentialFailures.length === 0
          ? clearLogoutMarkers([authStorage, logoutFallbackStorage])
          : []
        if (credentialFailures.length > 0 || markerFailures.length > 0) {
          const failure = credentialFailures[0] ?? markerFailures[0]
          setFatalAuthError(`無法清除本機登入資料：${errorMessage(failure)}。請清除網站資料後再試。`)
        } else {
          setLogoutNotice('先前的登出已在本機完成；如需使用團主功能，請重新登入。')
        }
      }
      setSession(null)
    } else {
      authEventsBlocked.current = false
    }

    const invalidateOrganizer = () => {
      authEventsBlocked.current = true
      signInGeneration.current += 1
      validatedOrganizerId.current = null
      setError('')
      setSession(null)
      setSigningIn(false)
      void signOutRemotely()
    }

    const validateRestoredSession = async (nextSession: Session | null, event?: AuthChangeEvent) => {
      if (!active) return
      // Opening the page, supabase-js reports the stored session more than once (INITIAL_SESSION, then
      // SIGNED_IN). When that same token for the same organizer was just checked, skip the second round
      // trip, before the generation bump below would cancel a check of a newer token still under way.
      // Any other event (TOKEN_REFRESHED, USER_UPDATED) is checked again.
      if (nextSession && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')
        && validatedOrganizerId.current === nextSession.user.id
        && verifiedAccessToken.current === nextSession.access_token) return
      const validationId = ++authValidationGeneration.current
      if (!nextSession) {
        authEventsBlocked.current = true
        logoutBarrier.current = true
        signInGeneration.current += 1
        validatedOrganizerId.current = null
        setError('')
        setSession(null)
        setSigningIn(false)
        return
      }

      const preserveVerifiedEditor = validatedOrganizerId.current === nextSession.user.id
      if (!preserveVerifiedEditor) setSession(undefined)
      const { data, error: userError } = await client.auth.getUser(nextSession.access_token)
      if (!active || validationId !== authValidationGeneration.current) return

      if (userError) {
        if (isRetryableAuthError(userError)) {
          if (preserveVerifiedEditor) return
          setError(`驗證登入狀態失敗：${errorMessage(userError)}，請重新整理後再試。`)
          setSession(null)
          return
        }
        invalidateOrganizer()
        return
      }

      const authoritativeUser = data.user
      if (!authoritativeUser
        || authoritativeUser.id !== nextSession.user.id
        || authoritativeUser.is_anonymous === true) {
        invalidateOrganizer()
        return
      }

      const { data: isAdmin, error: organizerError } = await client.rpc('is_admin')
      if (!active || validationId !== authValidationGeneration.current) return
      if (organizerError) {
        if (preserveVerifiedEditor) return
        setError(`驗證團主資格失敗：${errorMessage(organizerError)}，請重新整理後再試。`)
        setSession(null)
        return
      }
      if (isAdmin !== true) {
        invalidateOrganizer()
        return
      }

      validatedOrganizerId.current = authoritativeUser.id
      verifiedAccessToken.current = nextSession.access_token
      authEventsBlocked.current = false
      setError('')
      setSession({ ...nextSession, user: authoritativeUser })
    }

    const { data: authSubscription } = client.auth.onAuthStateChange((event, nextSession) => {
      authEventSeen = true
      if (authEventsBlocked.current) return
      void validateRestoredSession(nextSession, event)
    })

    if (!hasLogoutTombstone) {
      void client.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active || authEventSeen) return
        if (sessionError) {
          setError(sessionError.message)
          setSession(null)
        } else {
          void validateRestoredSession(data.session)
        }
      })
    }
    return () => {
      active = false
      authValidationGeneration.current += 1
      signInGeneration.current += 1
      authSubscription.subscription.unsubscribe()
    }
  }, [authStorage, client, logoutFallbackStorage, signOutRemotely])

  const listPage = campaignId ? null : notificationLab ? 'notification-lab' : page

  useEffect(() => {
    if (!organizerUserId) {
      setCampaigns(null)
      setTestCampaignIds(null)
      setResidentMembers(null)
      setAutoCloseNotificationState(null)
      return
    }
    if (!listPage) return
    let active = true
    setError('')
    const loaders: Record<'notification-lab' | 'home' | 'residents' | 'settings', () => Promise<void>> = {
      'notification-lab': async () => {
        const [items, markedIds] = await Promise.all([campaignManagementGateway.list(), testCampaignGatewayRef.current.list()])
        if (active) {
          setCampaigns(items)
          setTestCampaignIds(markedIds)
        }
      },
      residents: async () => {
        const members = await residentMemberGateway.list()
        if (active) setResidentMembers(members)
      },
      settings: async () => {
        const notificationState = await autoCloseNotificationSettingsGatewayRef.current.getState()
        if (active) setAutoCloseNotificationState(notificationState)
      },
      home: async () => {
        const [items, members, notificationState] = await Promise.all([
          campaignManagementGateway.list(),
          residentMemberGateway.list(),
          autoCloseNotificationSettingsGatewayRef.current.getState(),
        ])
        if (active) {
          setCampaigns(items)
          setResidentMembers(members)
          setAutoCloseNotificationState(notificationState)
        }
      },
    }
    loaders[listPage]().catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => { active = false }
  }, [campaignManagementGateway, listPage, organizerUserId, residentMemberGateway, reloadKey])

  useEffect(() => {
    // Clear first so a new campaign never renders with the previous campaign's draft.
    setContentCampaignId(null)
    setContent(null)
    setPublishedContent(null)
    setOrderSummary(null)
    setCampaignStatus(null)
    setCampaignClosedAt(null)
    setResidentSlug(null)
    setPublishSyncWarning(null)
    if (!organizerUserId || !campaignId) return
    let active = true
    setError('')
    const publishedPromise = gateway.loadOptionalPublished
      ? gateway.loadOptionalPublished(campaignId)
      : gateway.loadPublished(campaignId)
    void Promise.all([
      publishedPromise,
      gateway.loadOptionalDraft(campaignId),
      ordersGateway.loadCampaignState(campaignId),
      gateway.loadResidentSlug?.(campaignId) ?? Promise.resolve(null),
    ]).then(async ([published, draft, state, loadedResidentSlug]) => {
      if (!active) return
      const baseContent = draft ?? published
      if (!baseContent) throw new Error('找不到團購草稿')
      const editableContent = draft ? { ...draft, openedAt: published?.openedAt ?? null } : baseContent
      const summary = published
        ? await ordersGateway.loadSummary(campaignId, published.threshold, published.thresholdKind, published.amountThreshold, published.quantityUnit)
        : null
      if (!active) return
      setContentCampaignId(campaignId)
      setContent(editableContent)
      setPublishedContent(published)
      setOrderSummary(summary)
      setCampaignStatus(state.status)
      setCampaignClosedAt(state.closedAt)
      setResidentSlug(loadedResidentSlug)
      setPublicationState(!published || (draft && !campaignContentEquals(editableContent, published)) ? 'draft' : 'published')
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => { active = false }
  }, [campaignId, gateway, ordersGateway, organizerUserId, reloadKey])

  const liveCampaignId = organizerUserId && campaignId && contentCampaignId === campaignId && publishedContent
    ? campaignId
    : null

  useEffect(() => {
    if (!liveCampaignId) {
      setLiveState('unavailable')
      return
    }
    let active = true
    let running = false
    let queued = false
    // One reload at a time; events that arrive meanwhile collapse into a single follow-up reload.
    const sync = async () => {
      if (running) {
        queued = true
        return
      }
      running = true
      try {
        do {
          queued = false
          await orderSyncRef.current?.()
        } while (queued && active)
        if (active) setLiveState('live')
      } catch {
        if (active) setLiveState('offline')
      } finally {
        running = false
      }
    }
    const filter = `campaign_id=eq.${liveCampaignId}`
    setLiveState('connecting')
    const channel = client
      .channel(`organizer-campaign-${liveCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, () => { void sync() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter }, () => { void sync() })
      .subscribe((status) => {
        if (!active) return
        // Reload on (re)subscribing to catch changes made before the channel was ready.
        if (status === 'SUBSCRIBED') void sync()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveState('offline')
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [client, liveCampaignId, liveAttempt])

  const acceptSignedInSession = (signedInSession: Session | null) => {
    authValidationGeneration.current += 1
    authEventsBlocked.current = false
    logoutBarrier.current = false
    const markerFailures = clearLogoutMarkers([authStorage, logoutFallbackStorage])
    if (markerFailures.length > 0) {
      clearStoredAuth(authStorage)
      authEventsBlocked.current = true
      logoutBarrier.current = true
      setFatalAuthError(`無法清除登出保護標記：${errorMessage(markerFailures[0])}。請清除網站資料後再試。`)
      setSession(null)
      return false
    }
    setLogoutNotice('')
    validatedOrganizerId.current = signedInSession?.user?.id ?? null
    setSession(signedInSession)
    return true
  }

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (signOutPending || fatalAuthError) return
    const signInId = ++signInGeneration.current
    setSigningIn(true)
    setError('')
    const { data, error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInId !== signInGeneration.current) return
    if (signInError) setError(signInError.message)
    else acceptSignedInSession(data.session)
    setSigningIn(false)
  }

  const signInWithLine = async () => {
    if (!activeLineOrganizerGateway || signingIn || signOutPending || fatalAuthError) return
    setSigningIn(true)
    setError('')
    setLinePending(null)
    try {
      const result = await activeLineOrganizerGateway.signIn()
      if (result.status === 'pending') {
        setLinePending({ requestCode: result.requestCode, displayName: result.displayName })
      } else if (result.status === 'approved') {
        acceptSignedInSession(result.session)
      }
    } catch (lineError) {
      setError(errorMessage(lineError))
    } finally {
      setSigningIn(false)
    }
  }

  if (signOutPending) return <LiveLoading label="登出中…" />
  if (fatalAuthError) return <LiveError message={fatalAuthError} />
  if (session === undefined) return <LiveLoading label="確認團主登入狀態…" />
  if (!session) {
    return (
      <main className="live-login-shell">
        {activeLineOrganizerGateway ? (
          <section className="live-login-card">
            <p className="admin-eyebrow">LINE LIFF</p>
            <h1>團主登入</h1>
            <p>使用 LINE 驗證身分後進入團主後台。</p>
            {logoutNotice && <FeedbackMessage tone="warning" urgent>{logoutNotice}</FeedbackMessage>}
            {linePending && (
              <div className="line-organizer-pending" role="status">
                <strong>{linePending.displayName ? `${linePending.displayName}的團主資格尚待核准` : '團主資格尚待核准'}</strong>
                <p>請將下方申請代碼提供給系統管理者：</p>
                <code>{linePending.requestCode}</code>
              </div>
            )}
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
            <Button className="line-login-action" onClick={() => { void signInWithLine() }} loading={signingIn} loadingLabel="LINE 驗證中…">
              使用 LINE 登入
            </Button>
            <a href="/">先查看住戶端</a>
          </section>
        ) : (
          <form className="live-login-card" onSubmit={signIn}>
            <p className="admin-eyebrow">SUPABASE LIVE DEMO</p>
            <h1>團主登入</h1>
            <p>Email／密碼僅供本機測試或緊急備援。</p>
            {logoutNotice && <FeedbackMessage tone="warning" urgent>{logoutNotice}</FeedbackMessage>}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            </label>
            <label>
              <span>密碼</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
            <Button type="submit" loading={signingIn} loadingLabel="登入中…">登入</Button>
            <a href="/">先查看住戶端</a>
          </form>
        )}
      </main>
    )
  }
  const createCampaign = (title: string) => campaignManagementGateway.create(title)
  const createFromTemplate = {
    list: () => templateGateway.list(),
    create: (templateId: string, title: string) => templateGateway.createCampaign(templateId, title),
  }
  const shellCurrent = campaignId ? 'campaigns' : notificationLab ? 'settings' : page === 'home' ? 'campaigns' : page
  const inShell = (children: ReactNode) => (
    <OrganizerShell current={shellCurrent} onCreate={createCampaign} templates={createFromTemplate}>{children}</OrganizerShell>
  )
  const shellLoading = (label: string) => inShell(<LoadingState label={label} variant="skeleton" rows={4} />)

  if (error) {
    return inShell(
      <ErrorState
        title="無法載入這一頁"
        message={error}
        actionLabel="重試"
        onAction={() => {
          setError('')
          setReloadKey((current) => current + 1)
        }}
        page
      />,
    )
  }

  const signOut = async () => {
    authValidationGeneration.current += 1
    signInGeneration.current += 1
    authEventsBlocked.current = true
    validatedOrganizerId.current = null
    setError('')
    setSession(null)
    await signOutRemotely()
  }

  if (!campaignId) {
    if (notificationLab) {
      if (!campaigns || !testCampaignIds) return shellLoading('載入通知測試中心…')
      return (
        <OrganizerShell current="settings" onCreate={createCampaign} templates={createFromTemplate}>
          <NotificationTestLab
            campaigns={campaigns}
            testCampaignIds={testCampaignIds}
            onSetTestCampaign={async (targetCampaignId, enabled) => {
              await testCampaignGateway.setEnabled(targetCampaignId, enabled)
            }}
            onPreview={(targetCampaignId, audience, message) => pickupNotificationTestGateway.preview(targetCampaignId, audience, message)}
            onCreateCommand={(targetCampaignId, audience, message, previewToken) => pickupNotificationTestGateway.createCommand(targetCampaignId, audience, message, previewToken)}
            onPreviewPlan={pickupNotificationTestGateway.previewPlan && ((targetCampaignId, plan) => pickupNotificationTestGateway.previewPlan!(targetCampaignId, plan))}
            onCreatePlanCommand={pickupNotificationTestGateway.createPlanCommand && ((targetCampaignId, plan, token) => pickupNotificationTestGateway.createPlanCommand!(targetCampaignId, plan, token))}
          />
        </OrganizerShell>
      )
    }
    if (page === 'residents') {
      if (!residentMembers) return shellLoading('載入住戶…')
      return (
        <OrganizerShell current="residents" onCreate={createCampaign} templates={createFromTemplate}>
          <ResidentMemberManagementApp
            key={residentFilter}
            members={residentMembers}
            initialFilter={residentFilter}
            onRefreshGroupStatuses={residentMemberGateway.refreshGroupStatuses
              ? (memberCodes) => residentMemberGateway.refreshGroupStatuses!(memberCodes)
              : undefined}
            onSetBlocked={async (memberCode, blocked) => {
              await residentMemberGateway.setBlocked(memberCode, blocked)
              setResidentMembers(await residentMemberGateway.list())
            }}
            onUpdateHousehold={async (memberCode, household) => {
              await residentMemberGateway.updateHousehold(memberCode, household)
              setResidentMembers(await residentMemberGateway.list())
            }}
          />
        </OrganizerShell>
      )
    }
    if (page === 'settings') {
      if (!autoCloseNotificationState) return shellLoading('載入設定…')
      return (
        <OrganizerShell current="settings" onCreate={createCampaign} templates={createFromTemplate}>
          <OrganizerSettings
            autoCloseNotificationState={autoCloseNotificationState}
            onSelectCurrentUserForAutoCloseNotification={async () => {
              await autoCloseNotificationSettingsGateway.selectCurrentUser()
              setAutoCloseNotificationState(await autoCloseNotificationSettingsGateway.getState())
            }}
            onSignOut={signOut}
            templateActions={{
              list: () => templateGateway.list(),
              rename: (templateId, name) => templateGateway.rename(templateId, name),
              remove: (templateId) => templateGateway.delete(templateId),
            }}
          />
        </OrganizerShell>
      )
    }
    if (!campaigns || !residentMembers || !autoCloseNotificationState) return shellLoading('載入團購、住戶與通知設定…')
    return (
      <OrganizerShell current="campaigns" onCreate={createCampaign} templates={createFromTemplate}>
        <OrganizerHome
          campaigns={campaigns}
          autoCloseNotificationState={autoCloseNotificationState}
          unboundResidentCount={residentMembers.filter(isUnboundResident).length}
          onDelete={async (targetCampaignId) => {
            const result = await campaignManagementGateway.delete(targetCampaignId)
            setCampaigns((current) => current?.filter((campaign) => campaign.id !== targetCampaignId) ?? null)
            return result
          }}
        />
      </OrganizerShell>
    )
  }
  if (!content || !campaignStatus || contentCampaignId !== campaignId) return shellLoading('載入團購草稿與訂單…')

  const reloadOrderSummary = async () => {
    if (!publishedContent) return
    const requestedCampaignId = campaignId
    const summary = await ordersGateway.loadSummary(
      campaignId,
      publishedContent.threshold,
      publishedContent.thresholdKind,
      publishedContent.amountThreshold,
      publishedContent.quantityUnit,
    )
    if (currentCampaignIdRef.current !== requestedCampaignId) return
    setOrderSummary(summary)
  }
  orderSyncRef.current = reloadOrderSummary
  const retrySync = () => setLiveAttempt((current) => current + 1)
  const published = publishedContent !== null
  const shownSection = resolveWorkspaceSection(section, published, campaignStatus)
  const refreshPublishedMetadata = async (targetId: string, publishedVersion: CampaignContent) => {
    const [slugResult, summaryResult] = await Promise.allSettled([
      gateway.loadResidentSlug?.(targetId) ?? Promise.resolve(null),
      ordersGateway.loadSummary(targetId, publishedVersion.threshold, publishedVersion.thresholdKind, publishedVersion.amountThreshold, publishedVersion.quantityUnit),
    ])
    if (currentCampaignIdRef.current !== targetId) return
    if (slugResult.status === 'fulfilled') setResidentSlug(slugResult.value)
    if (summaryResult.status === 'fulfilled') setOrderSummary(summaryResult.value)
    const failures = [slugResult, summaryResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => errorMessage(result.reason))
    setPublishSyncWarning(failures.length > 0
      ? { campaignId: targetId, message: `發布已成功，但部分資訊暫時無法更新：${failures.join('；')}` }
      : null)
  }
  // The write already succeeded; a failed refresh only means the list may be stale, which the live status reports.
  const refreshAfterWrite = async () => {
    const requestedCampaignId = campaignId
    try {
      await reloadOrderSummary()
    } catch {
      // A late failure for a campaign the organizer has since navigated away
      // from must not mark the campaign now on screen as offline.
      if (currentCampaignIdRef.current === requestedCampaignId) setLiveState('offline')
    }
  }
  const setOrderOrganizerNote = async (orderId: string, note: string) => {
    await ordersGateway.setOrderOrganizerNote(orderId, note)
    await refreshAfterWrite()
  }
  const cancelOrder = async (orderId: string) => {
    await ordersGateway.cancelOrder(orderId)
    await refreshAfterWrite()
  }
  const workspaceCampaign: WorkspaceCampaign = {
    id: campaignId,
    title: content.title,
    status: campaignStatus,
    published,
    coverImage: content.images[0] ?? null,
    openedAt: publishedContent?.openedAt ?? null,
    autoCloseAt: content.autoCloseAt,
    arrivalLabel: content.arrivalLabel,
    thresholdKind: content.thresholdKind,
    closedAt: campaignClosedAt,
    orderCount: orderSummary?.orderCount ?? null,
    residentHref: residentSlug ? residentCampaignPath(residentSlug) : null,
  }

  // Templates are taken from what is stored, so an unsaved edit in the editor is not included.
  const loadSavedContent = async () => {
    const draft = await gateway.loadOptionalDraft(campaignId)
    if (draft) return draft
    const publishedContentForTemplate = gateway.loadOptionalPublished ? await gateway.loadOptionalPublished(campaignId) : null
    return publishedContentForTemplate ?? gateway.loadPublished(campaignId)
  }

  return (
    <OrganizerShell current="campaigns" onCreate={createCampaign} templates={createFromTemplate}>
      <CampaignWorkspace
        key={campaignId}
        campaign={workspaceCampaign}
        requestedSection={section}
        section={shownSection}
        saveTemplate={{
          loadTemplates: () => templateGateway.list(),
          saveNew: async (name) => templateGateway.create(name, await loadSavedContent()),
          replace: async (templateId) => templateGateway.replace(templateId, await loadSavedContent()),
        }}
        onSetCampaignStatus={async (status) => {
          const requestedCampaignId = campaignId
          await ordersGateway.setCampaignStatus(campaignId, status)
          const next = await ordersGateway.loadCampaignState(campaignId)
          if (currentCampaignIdRef.current !== requestedCampaignId) return
          setCampaignStatus(next.status)
          setCampaignClosedAt(next.closedAt)
        }}
      >
        {shownSection === 'content' && publishSyncWarning?.campaignId === campaignId && (
          <FeedbackMessage tone="warning" urgent actionLabel="重新讀取發布資訊"
            onAction={() => { if (publishedContent) void refreshPublishedMetadata(campaignId, publishedContent) }}>
            {publishSyncWarning.message}
          </FeedbackMessage>
        )}
        <LazySectionBoundary key={campaignId}>
          <Suspense fallback={shownSection === 'content' ? <LiveLoading label="載入團購內容設定…" /> : null}>
        <AdminApp
          section={shownSection === 'content' ? 'content' : null}
          initialContent={content}
          initialPublicationState={publicationState}
          publishedContent={publishedContent}
          campaignStatus={campaignStatus}
          onUploadImage={(file) => imageGateway.upload(campaignId, file)}
          onSaveDraft={async (nextContent) => {
            await gateway.saveDraft(campaignId, nextContent)
          }}
          onPublish={async (nextContent) => {
            const requestedCampaignId = campaignId
            await gateway.saveDraft(campaignId, nextContent)
            const nextPublished = await gateway.publish(campaignId)
            if (currentCampaignIdRef.current === requestedCampaignId) {
              setContent(nextPublished)
              setPublishedContent(nextPublished)
              setPublishSyncWarning(null)
            }
            await refreshPublishedMetadata(requestedCampaignId, nextPublished)
            return nextPublished
          }}
        />
          </Suspense>
        </LazySectionBoundary>
        {shownSection === 'orders' && orderSummary && (
          <OrdersSection
            campaignId={campaignId}
            campaignTitle={content.title}
            openedAt={publishedContent?.openedAt ?? null}
            summary={orderSummary}
            status={campaignStatus}
            liveState={liveState}
            onRetrySync={retrySync}
            onSetOrderOrganizerNote={setOrderOrganizerNote}
            onCancelOrder={cancelOrder}
          />
        )}
        {shownSection === 'pickup' && (
          <PickupSection
            campaignId={campaignId}
            campaignTitle={content.title}
            campaignStatus={campaignStatus}
            published={published}
            excludedOtherCount={orderSummary?.orderRows.filter((row) => row.householdKind === 'other').length ?? 0}
            onPreview={(audience, message) => pickupNotificationGateway.preview(campaignId, audience, message)}
            onCreateCommand={(audience, message, previewToken) => pickupNotificationGateway.createCommand(campaignId, audience, message, previewToken)}
            onPreviewPlan={pickupNotificationGateway.previewPlan && ((plan) => pickupNotificationGateway.previewPlan!(campaignId, plan))}
            onCreatePlanCommand={pickupNotificationGateway.createPlanCommand && ((plan, token) => pickupNotificationGateway.createPlanCommand!(campaignId, plan, token))}
          />
        )}
      </CampaignWorkspace>
    </OrganizerShell>
  )
}

function residentCampaignListRepository(client: SupabaseClient<Database>): LiveResidentListRepository {
  return {
    async list() {
      const { data, error } = await client.rpc('list_resident_campaigns')
      if (error) throw error
      return (data ?? []).flatMap((row) => {
        if (!row.slug || !row.title || !row.status || !row.opened_at || row.unit_price === null
          || row.threshold === null || row.total_quantity === null || row.total_amount === null) return []
        if (!['open', 'closed', 'arrived'].includes(row.status)) return []
        return [{
          slug: row.slug,
          title: row.title,
          status: row.status as CampaignStatus,
          unitPrice: Number(row.unit_price),
          maxUnitPrice: row.max_unit_price === null || row.max_unit_price === undefined ? undefined : Number(row.max_unit_price),
          openedAt: row.opened_at,
          totalQuantity: Number(row.total_quantity),
          totalAmount: Number(row.total_amount),
          threshold: row.threshold,
          thresholdKind: row.threshold_kind === 'amount' ? 'amount' : 'quantity',
          amountThreshold: row.amount_threshold === null ? null : Number(row.amount_threshold),
          thresholdAutoClose: row.threshold_auto_close ?? row.threshold_kind !== 'amount',
          quantityUnit: normalizeQuantityUnit(row.quantity_unit),
          images: Array.isArray(row.images) ? row.images.filter(isCampaignImage) : [],
          arrivalLabel: row.arrival_label ?? '貨到通知',
          autoCloseAt: row.auto_close_at ?? null,
          closedAt: row.closed_at ?? null,
          myQuantity: Number(row.my_quantity ?? 0),
          myCustomQuantity: Number(row.my_custom_quantity ?? 0),
          orderHouseholdCount: Number(row.order_household_count ?? 0),
        }]
      })
    },
  }
}

function ResidentAdmissionPrompt({ error, onRetry }: { error: ResidentAdmissionError; onRetry: () => void }) {
  const required = error.code === 'GROUP_MEMBERSHIP_REQUIRED'
  return <main className="live-state-shell">
    <ErrorState title={required ? '請先加入社區團購群組' : '暫時無法確認群組資格'} message={error.message} page />
    <Button onClick={onRetry}>{required ? '已加入，重新確認' : '重試'}</Button>
  </main>
}

/**
 * The signed-in resident, plus whatever the page loads first. With a stored session the page's own
 * query goes out together with the session check and the name lookup, so the page waits for one
 * round trip instead of three; it is thrown away if the stored session turns out to be unusable.
 */
async function authenticateResident<T>(
  { client, liffId, liffClient, lineResidentGateway }: LocalLiveResidentAppProps,
  recheck: boolean,
  loadData: () => Promise<T>,
): Promise<{ identity: ResidentLineIdentity; data: T } | null> {
  // Restored admitted residents are not subject to a new group-membership gate.
  const restored = recheck ? null : await loadRestoredResident(client, loadData)
  if (restored) return restored
  if (!liffId || !liffClient) throw new Error('住戶 LINE 登入設定不完整')
  const identity = await loadLiffIdentity(liffClient, liffId)
  if (!identity) return null
  const result = await (lineResidentGateway ?? createLineResidentGateway(client)).signIn(identity.idToken)
  return { identity: result.identity, data: await loadData() }
}

function LocalLiveResidentListApp({
  client,
  liffId,
  liffClient,
  lineResidentGateway,
  residentListRepository,
  residentOrdersRepository,
  page,
}: LocalLiveResidentAppProps) {
  // What this resident saw last time shows at once; the fresh copy replaces it when it arrives.
  const [cached] = useState(() => page === 'orders'
    ? { orders: readResidentPageCache<ResidentMyOrder[]>('orders'), campaigns: null }
    : { orders: null, campaigns: readResidentPageCache<ResidentCampaignListItem[]>('campaigns') })
  const [identity, setIdentity] = useState<ResidentLineIdentity | null>(cached.orders?.identity ?? cached.campaigns?.identity ?? null)
  const [campaigns, setCampaigns] = useState<ResidentCampaignListItem[] | null>(cached.campaigns?.data ?? null)
  const [orders, setOrders] = useState<ResidentMyOrder[] | null>(cached.orders?.data ?? null)
  const [error, setError] = useState('')
  const [admissionError, setAdmissionError] = useState<ResidentAdmissionError | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const initialize = async () => {
      const auth = { client, liffId, liffClient, lineResidentGateway }
      if (page === 'orders') {
        const signedIn = await authenticateResident(auth, attempt > 0, () => (residentOrdersRepository ?? residentMyOrdersRepository(client)).list())
        if (!signedIn || !active) return
        setIdentity(signedIn.identity)
        setOrders(signedIn.data)
        writeResidentPageCache('orders', signedIn.identity, signedIn.data)
        return
      }
      const signedIn = await authenticateResident(auth, attempt > 0, () => (residentListRepository ?? residentCampaignListRepository(client)).list())
      if (!signedIn || !active) return
      setIdentity(signedIn.identity)
      setCampaigns(signedIn.data)
      writeResidentPageCache('campaigns', signedIn.identity, signedIn.data)
    }
    void initialize().catch((loadError: unknown) => {
      if (!active) return
      // No longer admitted: what was saved for this account should not open next time either.
      if (loadError instanceof ResidentAdmissionError) {
        clearResidentPageCache()
        setAdmissionError(loadError)
      } else setError(errorMessage(loadError))
    })
    return () => { active = false }
  }, [client, liffClient, liffId, lineResidentGateway, residentListRepository, residentOrdersRepository, page, attempt])

  if (admissionError) return <ResidentAdmissionPrompt error={admissionError} onRetry={() => {
    setAdmissionError(null)
    setAttempt((current) => current + 1)
  }} />
  if (error) return <LiveError message={error} title="無法載入住戶入口" />
  const logout = async () => {
    clearResidentPageCache()
    const { error: remoteError } = await client.auth.signOut()
    if (remoteError) {
      await client.auth.signOut({ scope: 'local' })
      setIdentity(null)
      setCampaigns([])
      setOrders([])
      setError('遠端登出失敗，但已清除此裝置的登入狀態')
      return
    }
    setIdentity(null)
    setCampaigns([])
    setOrders([])
    setError('已登出，請重新開啟住戶 LINE 入口')
  }
  if (page === 'orders') {
    if (!identity || !orders) return <ResidentListSkeleton page="orders" label="確認 LINE 住戶身分並載入我的訂單…" />
    return <ResidentMyOrdersApp identity={identity} orders={orders} onLogout={logout} />
  }
  if (!identity || !campaigns) return <ResidentListSkeleton page="campaigns" label="確認 LINE 住戶身分並載入開團列表…" />
  return <ResidentCampaignListApp identity={identity} campaigns={campaigns} onLogout={logout} />
}

async function loadRestoredResident<T>(
  client: SupabaseClient<Database>,
  loadData: () => Promise<T>,
): Promise<{ identity: ResidentLineIdentity; data: T } | null> {
  const { data, error } = await client.auth.getSession()
  if (error) {
    if (isRetryableAuthError(error)) throw error
    await client.auth.signOut({ scope: 'local' })
    return null
  }
  const session = data.session
  if (!session) return null

  // All three in flight together; the session check still decides, before either result is used.
  const [verification, identityResult, dataResult] = await Promise.allSettled([
    client.auth.getUser(session.access_token),
    client.rpc('get_line_resident_self'),
    loadData(),
  ])
  if (verification.status === 'rejected') throw verification.reason
  const { data: verified, error: verificationError } = verification.value
  if (verificationError && isRetryableAuthError(verificationError)) throw verificationError
  if (verificationError
    || !verified.user
    || verified.user.id !== session.user.id
    || verified.user.is_anonymous === true) {
    await client.auth.signOut({ scope: 'local' })
    return null
  }

  if (identityResult.status === 'rejected') throw identityResult.reason
  const { data: identityRows, error: identityError } = identityResult.value
  if (identityError) throw identityError
  const row = identityRows?.[0]
  if (!row?.display_name) return null
  if (dataResult.status === 'rejected') throw dataResult.reason
  return { identity: { displayName: row.display_name, pictureUrl: row.picture_url }, data: dataResult.value }
}

async function ensureResidentSession(client: SupabaseClient<Database>, allowAnonymous = true): Promise<Session> {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (data.session) {
    const { data: verified, error: verificationError } = await client.auth.getUser(data.session.access_token)
    if (verificationError || !verified.user || verified.user.id !== data.session.user.id) {
      throw verificationError ?? new Error('住戶登入狀態無效，請重新開啟頁面')
    }
    return { ...data.session, user: verified.user }
  }
  if (!allowAnonymous) throw new Error('請先從住戶 LINE 入口登入')
  const { data: anonymousData, error: anonymousError } = await client.auth.signInAnonymously()
  if (anonymousError || !anonymousData.session) {
    throw anonymousError ?? new Error('無法建立住戶匿名登入')
  }
  return anonymousData.session
}

function LocalLiveResidentCampaignApp({ client, campaignId, campaignSlug, liffId, liffClient, lineResidentGateway }: LocalLiveResidentAppProps & { campaignSlug: string }) {
  // A failed early fetch is left to the page's own load, which shows the error and a retry.
  useEffect(() => { loadResidentCampaignPage().catch(() => undefined) }, [])
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [campaignClosedAt, setCampaignClosedAt] = useState<string | null>(null)
  const [orders, setOrders] = useState<VisibleOrder[]>([])
  const [residentCustomer, setResidentCustomer] = useState<ResidentCustomer | null | undefined>(undefined)
  const [residentIdentity, setResidentIdentity] = useState<ResidentLineIdentity | null>(null)
  const [joinedCampaignId, setJoinedCampaignId] = useState<string | null>(campaignId ?? null)
  const [admissionError, setAdmissionError] = useState<ResidentAdmissionError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [submitRefreshError, setSubmitRefreshError] = useState('')
  const sessionPromise = useRef<Promise<Session> | null>(null)
  const retrySyncRef = useRef<(() => Promise<void>) | null>(null)
  const residentGeneration = useRef(0)
  const awaitingOwnOrder = useRef<PendingOwnOrder | null>(null)

  const applyWall = (rows: OrderWallRow[], customerId: string | undefined) => {
    const nextOrders = visibleOrdersFromRows(rows)
    const pending = awaitingOwnOrder.current
    if (pending && pending.customerId === customerId && !matchesPendingOwnOrder(nextOrders, pending)) {
      // A successful query alone does not prove the committed order is visible.
      setSubmitRefreshError((current) => current || '訂單已送出，但訂單牆尚未顯示本次訂單，請重新同步。')
      return
    }
    awaitingOwnOrder.current = null
    setOrders(nextOrders)
    setSubmitRefreshError('')
  }

  useEffect(() => {
    let active = true
    let publishedGeneration = 0
    let publishedSyncError = ''
    let residentSyncError = ''
    let channelSyncError = ''
    let channel: ReturnType<typeof client.channel> | null = null
    let resolvedCampaignId = campaignId
    // Who the resident is does not change between reloads: kept from LINE sign-in, or the first load.
    let knownIdentity: ResidentLineIdentity | null = null
    const reportSyncError = () => {
      if (active) setSyncError([channelSyncError, publishedSyncError, residentSyncError].filter(Boolean).join('；'))
    }

    const loadPublished = async (generation?: number) => {
      if (!resolvedCampaignId) throw new Error('找不到團購活動')
      const { data, error: queryError } = await client
        .from('campaign_public')
        .select('title,unit_price,threshold,threshold_kind,amount_threshold,threshold_auto_close,quantity_unit,allow_custom_items,base_discount_rate,mix_match_name,mix_match_min_quantity,mix_match_discount_rate,arrival_label,auto_close_at,closed_at,announcement,images,items,opened_at,status')
        .eq('id', resolvedCampaignId)
        .single()
      if (queryError) throw queryError
      if (active && (generation === undefined || generation === publishedGeneration)) {
        setContent(campaignContentFromRow(data))
        setCampaignStatus(campaignStatusFromRow(data))
        setCampaignClosedAt(typeof data.closed_at === 'string' ? data.closed_at : null)
      }
    }

    const loadResidentData = async (generation?: number) => {
      if (!resolvedCampaignId) throw new Error('找不到團購活動')
      const [wallResult, customerResult, identityResult] = await Promise.all([
        client.from('order_wall')
          .select('order_id,customer_id,customer_name,picture_url,period,unit,household_kind,item_code,qty,final_unit_price,custom_items,ordered_at,order_updated_at')
          .eq('campaign_id', resolvedCampaignId),
        client.rpc('get_customer_self'),
        knownIdentity ? null : client.rpc('get_line_resident_self'),
      ])
      if (wallResult.error) throw wallResult.error
      if (customerResult.error) throw customerResult.error
      if (identityResult?.error) throw identityResult.error
      if (active && (generation === undefined || generation === residentGeneration.current)) {
        applyWall(wallResult.data ?? [], customerResult.data?.[0]?.id)
        if (identityResult) {
          const identity = identityResult.data?.[0]
          if (!identity?.display_name) throw new Error('請先從住戶 LINE 入口登入')
          knownIdentity = { displayName: identity.display_name, pictureUrl: identity.picture_url }
          setResidentIdentity(knownIdentity)
        }
        const customer = customerResult.data?.[0]
        // get_customer_self() does not report household_kind directly, but it
        // is still derivable without a migration: the customer_household_format
        // CHECK constraint (supabase/migrations/20260919160000_household_kind.sql)
        // guarantees a total mapping - a 'resident' row always has both period
        // and unit, an 'other' row has neither, with no third state. So a bound
        // customer with a null period is 'other', not "not yet bound".
        setResidentCustomer(customer?.id && customer.name
          ? {
              customerId: customer.id,
              name: customer.name,
              period: customer.period,
              unit: customer.unit,
              householdKind: customer.period === null ? 'other' : 'resident',
            }
          : null)
      }
    }

    const joinCampaign = async () => {
      const { data: joinedRows, error: joinError } = await client.rpc('join_campaign_by_slug', {
        p_slug: campaignSlug,
      })
      if (joinError) throw joinError
      return Array.isArray(joinedRows) && joinedRows[0]
        && typeof joinedRows[0] === 'object' && 'id' in joinedRows[0]
        && typeof joinedRows[0].id === 'string'
        ? joinedRows[0].id
        : null
    }

    const initialize = async () => {
      let resolvedId: string | null
      if (liffId || liffClient) {
        // Joining goes out with the session check, as the list does with its own query.
        const signedIn = await authenticateResident({ client, liffId, liffClient, lineResidentGateway }, attempt > 0, joinCampaign)
        if (!signedIn || !active) return
        resolvedId = signedIn.data
        knownIdentity = signedIn.identity
        setResidentIdentity(signedIn.identity)
      } else {
        // Preserve the local-live fixture/session path when no LIFF is configured.
        sessionPromise.current ??= ensureResidentSession(client, false)
        await sessionPromise.current
        if (!active) return
        resolvedId = await joinCampaign()
      }
      if (!active) return
      if (!resolvedId) throw new Error('找不到已發布的團購活動')
      if (campaignId && campaignId !== resolvedId) throw new Error('團購連結與活動不一致')
      if (awaitingOwnOrder.current && awaitingOwnOrder.current.campaignId !== resolvedId) {
        awaitingOwnOrder.current = null
        setSubmitRefreshError('')
      }
      resolvedCampaignId = resolvedId
      if (active) setJoinedCampaignId(resolvedId)
      await Promise.all([loadPublished(), loadResidentData()])
      if (!active) return
      const runSync = async (...loaders: Array<(generation?: number) => Promise<void>>) => {
        await Promise.all(loaders.map(async (loader) => {
          const published = loader === loadPublished
          const generation = published ? ++publishedGeneration : ++residentGeneration.current
          try {
            await loader(generation)
            if (!active || generation !== (published ? publishedGeneration : residentGeneration.current)) return
            if (published) publishedSyncError = ''
            else residentSyncError = ''
          } catch (syncFailure) {
            if (!active || generation !== (published ? publishedGeneration : residentGeneration.current)) return
            if (published) publishedSyncError = errorMessage(syncFailure)
            else residentSyncError = errorMessage(syncFailure)
          }
          reportSyncError()
        }))
      }
      retrySyncRef.current = () => runSync(loadPublished, loadResidentData)
      channel = client
        .channel(`campaign-live-${resolvedCampaignId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'campaign', filter: `id=eq.${resolvedCampaignId}` },
          () => { void runSync(loadPublished) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `campaign_id=eq.${resolvedCampaignId}` },
          () => { void runSync(loadResidentData) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_item', filter: `campaign_id=eq.${resolvedCampaignId}` },
          () => { void runSync(loadResidentData) },
        )
        .subscribe((status) => {
          if (!active) return
          if (status === 'SUBSCRIBED') {
            // Close the gap between the first fetch and a ready Realtime channel.
            channelSyncError = ''
            reportSyncError()
            void runSync(loadPublished, loadResidentData)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            channelSyncError = '即時連線中斷，請重新同步；若持續發生請重新整理頁面。'
            reportSyncError()
          }
        })
    }

    void initialize().catch((loadError: unknown) => {
      if (!active) return
      if (loadError instanceof ResidentAdmissionError) setAdmissionError(loadError)
      else setError(errorMessage(loadError))
    })

    return () => {
      active = false
      publishedGeneration += 1
      residentGeneration.current += 1
      retrySyncRef.current = null
      if (channel) void client.removeChannel(channel)
    }
  }, [campaignId, campaignSlug, client, liffId, liffClient, lineResidentGateway, attempt])

  if (admissionError) return <ResidentAdmissionPrompt error={admissionError} onRetry={() => {
    setAdmissionError(null)
    setAttempt((current) => current + 1)
  }} />
  if (error) return <LiveError message={error} />
  if (!joinedCampaignId || !content || !campaignStatus || residentCustomer === undefined || !residentIdentity) return <ResidentCampaignSkeleton label="連線住戶端即時資料…" />
  return (
    <LazySectionBoundary>
      <Suspense fallback={<ResidentCampaignSkeleton label="載入住戶團購頁…" />}>
    <App
      publishedContent={content}
      campaignStatus={campaignStatus}
      campaignClosedAt={campaignClosedAt}
      liveDemo
      visibleOrders={orders}
      residentCustomer={residentCustomer}
      verifiedResidentIdentity={residentIdentity}
      syncError={[syncError, submitRefreshError].filter(Boolean).join('；')}
      onSyncRetry={() => {
        void retrySyncRef.current?.()
      }}
      onBindResident={async ({ kind, period, unit }) => {
        // The generated Database type still claims p_period/p_unit are
        // non-null (Supabase's codegen does not carry SQL nullability for
        // function parameters), but bind_customer_self genuinely accepts
        // null period/unit for an 'other' household - see
        // supabase/migrations/20260919161000_household_kind_binding.sql.
        const { data, error: bindError } = await client.rpc('bind_customer_self', {
          p_household_kind: kind,
          p_period: period,
          p_unit: unit,
        } as unknown as { p_household_kind: string; p_period: number; p_unit: string })
        if (bindError) throw bindError
        const customer = data?.[0]
        if (!customer?.id || !customer.name) throw new Error('住戶資料綁定結果無效')
        if (kind === 'resident' && (customer.period === null || !customer.unit)) {
          throw new Error('住戶資料綁定結果無效')
        }
        const bound = {
          customerId: customer.id,
          name: customer.name,
          period: customer.period,
          unit: customer.unit,
          householdKind: kind,
        }
        setResidentCustomer(bound)
        return bound
      }}
      onSubmitOrder={async (items, customItems: CustomOrderItem[]) => {
        const { error: submitError } = await client.rpc('submit_customer_order', {
          p_campaign_id: joinedCampaignId,
          p_items: items,
          p_custom_items: customItems,
        })
        if (submitError) throw submitError
        // Invalidate Realtime queries started before this committed RPC.
        const generation = ++residentGeneration.current
        if (residentCustomer) awaitingOwnOrder.current = {
          campaignId: joinedCampaignId,
          customerId: residentCustomer.customerId,
          items: { ...items },
          customItems: customItems.map((item) => ({ ...item })),
        }
        try {
          const { data, error: wallError } = await client.from('order_wall')
            .select('order_id,customer_id,customer_name,picture_url,period,unit,household_kind,item_code,qty,final_unit_price,custom_items,ordered_at,order_updated_at')
            .eq('campaign_id', joinedCampaignId)
          if (wallError) throw wallError
          if (generation === residentGeneration.current) applyWall(data ?? [], residentCustomer?.customerId)
        } catch (refreshError) {
          // The RPC committed. A failed follow-up read is a sync warning,
          // never an invitation for the resident to submit the same order again.
          if (generation === residentGeneration.current) {
            setSubmitRefreshError(`訂單已送出，但訂單牆暫時無法更新：${errorMessage(refreshError)}`)
          }
        }
      }}
    />
      </Suspense>
    </LazySectionBoundary>
  )
}

export function LocalLiveResidentApp(props: LocalLiveResidentAppProps) {
  if (props.page === 'orders' || (!props.campaignSlug && !props.campaignId)) return <LocalLiveResidentListApp {...props} />
  if (!props.campaignSlug) return <LiveError message="找不到團購分享連結" />
  return <LocalLiveResidentCampaignApp {...props} campaignSlug={props.campaignSlug} />
}
