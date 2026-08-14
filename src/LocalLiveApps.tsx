import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import AdminApp from './AdminApp'
import CampaignListApp from './CampaignListApp'
import type { FulfillmentUpdate } from './AdminOrdersPanel'
import App from './App'
import ResidentCampaignListApp, {
  type ResidentCampaignListItem,
  type ResidentLineIdentity,
} from './ResidentCampaignListApp'
import './LocalLiveApps.css'
import {
  createAdminCampaignGateway,
  type AdminCampaignSupabaseClient,
} from './services/adminCampaignGateway'
import {
  campaignContentEquals,
  type CampaignContent,
  type CampaignImage,
} from './services/demoCampaignStore'
import type { Database } from './types/database'
import type { OrganizerOrderSummary } from './domain/adminOrders'
import type { CampaignStatus } from './domain/orderWorkflow'
import type { VisibleOrder } from './data/demo'
import { createAdminOrdersGateway } from './services/adminOrdersGateway'
import { createCampaignImageGateway } from './services/campaignImageGateway'
import {
  createCampaignManagementGateway,
  type CampaignListItem,
} from './services/campaignManagementGateway'
import { createLineOrganizerGateway, type LineOrganizerResult } from './services/lineOrganizerGateway'
import { createLineResidentGateway, type LineResidentSignInResult } from './services/lineResidentGateway'
import { loadLiffIdentity, type LiffClient } from './services/liffIdentity'
import {
  LOGOUT_TOMBSTONE_KEY,
  SUPABASE_AUTH_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  type AuthSessionStorage,
} from './services/authStorage'

export type LiveAdminRepository = {
  loadPublished(campaignId: string): Promise<CampaignContent>
  loadOptionalPublished?(campaignId: string): Promise<CampaignContent | null>
  loadResidentSlug?(campaignId: string): Promise<string | null>
  loadOptionalDraft(campaignId: string): Promise<CampaignContent | null>
  saveDraft(campaignId: string, content: CampaignContent): Promise<CampaignContent>
  publish(campaignId: string): Promise<CampaignContent>
}

export type LiveAdminOrdersRepository = {
  loadCampaignStatus(campaignId: string): Promise<CampaignStatus>
  loadSummary(campaignId: string, unitPrice: number, threshold: number): Promise<OrganizerOrderSummary>
  setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void>
  setOrderFulfillment(orderId: string, update: FulfillmentUpdate): Promise<void>
}

export type LiveCampaignManagementRepository = {
  list(): Promise<CampaignListItem[]>
  create(title: string): Promise<CampaignListItem>
  delete(campaignId: string): Promise<{ warning: string | null }>
}

type LocalLiveAppProps = {
  client: SupabaseClient<Database>
  campaignId?: string
}

type LocalLiveResidentAppProps = {
  client: SupabaseClient<Database>
  campaignId?: string
  campaignSlug?: string
  inviteSlug?: string
  liffId?: string
  liffClient?: LiffClient
  lineResidentGateway?: { signIn(idToken: string, inviteSlug: string): Promise<LineResidentSignInResult> }
  residentListRepository?: LiveResidentListRepository
}

export type LiveResidentListRepository = {
  list(): Promise<ResidentCampaignListItem[]>
}

type CampaignRow = {
  title: unknown
  unit_price: unknown
  threshold: unknown
  announcement: unknown
  images: unknown
  items: unknown
  opened_at: unknown
  status: unknown
}

type ResidentCustomer = Pick<VisibleOrder, 'customerId' | 'name' | 'period' | 'unit'>
type OrderWallRow = Pick<
  Database['public']['Views']['order_wall']['Row'],
  'order_id' | 'customer_id' | 'customer_name' | 'picture_url' | 'period' | 'unit' | 'item_code' | 'qty' | 'ordered_at' | 'order_updated_at'
>

function visibleOrdersFromRows(rows: OrderWallRow[]): VisibleOrder[] {
  const orders = new Map<string, VisibleOrder>()
  for (const row of rows) {
    if (!row.order_id || !row.customer_id || !row.customer_name || row.period === null || !row.unit
      || !row.ordered_at || !row.order_updated_at) continue
    const order = orders.get(row.order_id) ?? {
      customerId: row.customer_id,
      name: row.customer_name,
      pictureUrl: row.picture_url,
      period: row.period,
      unit: row.unit,
      items: {},
      orderedAt: row.ordered_at,
      updatedAt: row.order_updated_at,
    }
    if (row.item_code && row.qty && row.qty > 0) order.items[row.item_code] = row.qty
    orders.set(row.order_id, order)
  }
  return [...orders.values()]
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
  return {
    title: row.title,
    unitPrice: row.unit_price,
    threshold: row.threshold,
    announcement: row.announcement,
    images: row.images,
    items: row.items as CampaignContent['items'],
    openedAt: typeof row.opened_at === 'string' ? row.opened_at : null,
  }
}

function campaignStatusFromRow(row: CampaignRow | null): CampaignStatus {
  if (!row || typeof row.status !== 'string' || !['open', 'closed', 'arrived'].includes(row.status)) {
    throw new Error('Supabase 回傳的活動狀態格式錯誤')
  }
  return row.status as CampaignStatus
}

function LiveLoading({ label }: { label: string }) {
  return (
    <main className="live-state-shell" aria-busy="true">
      <div className="live-state-card">
        <span className="live-spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </main>
  )
}

function LiveError({ message, title = '無法載入團購小幫手' }: { message: string; title?: string }) {
  return (
    <main className="live-state-shell">
      <div className="live-state-card live-error" role="alert">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </main>
  )
}

export function LocalLiveAdminApp({
  client,
  campaignId,
  repository,
  ordersRepository,
  managementRepository,
  authStorage = null,
  logoutFallbackStorage = null,
  liffId,
  liffClient,
  lineOrganizerGateway,
}: LocalLiveAppProps & {
  repository?: LiveAdminRepository
  ordersRepository?: LiveAdminOrdersRepository
  managementRepository?: LiveCampaignManagementRepository
  authStorage?: AuthSessionStorage | null
  logoutFallbackStorage?: AuthSessionStorage | null
  liffId?: string
  liffClient?: LiffClient
  lineOrganizerGateway?: { signIn(): Promise<LineOrganizerResult> }
}) {
  const gateway = useMemo(
    () => repository ?? createAdminCampaignGateway(client as AdminCampaignSupabaseClient),
    [client, repository],
  )
  const ordersGateway = useMemo(
    () => ordersRepository ?? createAdminOrdersGateway(client),
    [client, ordersRepository],
  )
  const imageGateway = useMemo(() => createCampaignImageGateway(client), [client])
  const campaignManagementGateway = useMemo(
    () => managementRepository ?? createCampaignManagementGateway(client),
    [client, managementRepository],
  )
  const activeLineOrganizerGateway = useMemo(
    () => lineOrganizerGateway ?? (liffId && liffClient
      ? createLineOrganizerGateway(client, liffClient, liffId)
      : null),
    [client, liffClient, liffId, lineOrganizerGateway],
  )
  const activeCampaignManagementGateway = campaignId ? null : campaignManagementGateway
  const authValidationGeneration = useRef(0)
  const signInGeneration = useRef(0)
  const signOutGeneration = useRef(0)
  const authEventsBlocked = useRef(false)
  const logoutBarrier = useRef(false)
  const activeSignOut = useRef(false)
  const validatedOrganizerId = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [orderSummary, setOrderSummary] = useState<OrganizerOrderSummary | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignListItem[] | null>(null)
  const [residentSlug, setResidentSlug] = useState<string | null>(null)
  const [publicationState, setPublicationState] = useState<'draft' | 'published'>('published')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [linePending, setLinePending] = useState<{ requestCode: string; displayName: string | null } | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [logoutNotice, setLogoutNotice] = useState('')
  const [fatalAuthError, setFatalAuthError] = useState('')
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

    const validateRestoredSession = async (nextSession: Session | null) => {
      if (!active) return
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

      validatedOrganizerId.current = authoritativeUser.id
      authEventsBlocked.current = false
      setError('')
      setSession({ ...nextSession, user: authoritativeUser })
    }

    const { data: authSubscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true
      if (authEventsBlocked.current) return
      void validateRestoredSession(nextSession)
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

  useEffect(() => {
    if (!organizerUserId) {
      setContent(null)
      setOrderSummary(null)
      setCampaignStatus(null)
      setCampaigns(null)
      setResidentSlug(null)
      return
    }
    let active = true
    setError('')
    if (!campaignId) {
      setContent(null)
      setOrderSummary(null)
      setCampaignStatus(null)
      setResidentSlug(null)
      if (!activeCampaignManagementGateway) return
      void activeCampaignManagementGateway.list().then((items) => {
        if (active) setCampaigns(items)
      }).catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
      return () => { active = false }
    }
    setCampaigns(null)
    const publishedPromise = gateway.loadOptionalPublished
      ? gateway.loadOptionalPublished(campaignId)
      : gateway.loadPublished(campaignId)
    void Promise.all([
      publishedPromise,
      gateway.loadOptionalDraft(campaignId),
      ordersGateway.loadCampaignStatus(campaignId),
      gateway.loadResidentSlug?.(campaignId) ?? Promise.resolve(null),
    ]).then(async ([published, draft, status, loadedResidentSlug]) => {
      if (!active) return
      const baseContent = draft ?? published
      if (!baseContent) throw new Error('找不到團購草稿')
      const editableContent = draft ? { ...draft, openedAt: published?.openedAt ?? null } : baseContent
      const summary = published
        ? await ordersGateway.loadSummary(campaignId, editableContent.unitPrice, editableContent.threshold)
        : null
      if (!active) return
      setContent(editableContent)
      setOrderSummary(summary)
      setCampaignStatus(status)
      setResidentSlug(loadedResidentSlug)
      setPublicationState(!published || (draft && !campaignContentEquals(editableContent, published)) ? 'draft' : 'published')
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => {
      active = false
    }
  }, [activeCampaignManagementGateway, campaignId, gateway, ordersGateway, organizerUserId])

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
            <p>使用LINE驗證身分後進入團主後台。</p>
            {logoutNotice && <p className="live-form-error" role="alert">{logoutNotice}</p>}
            {linePending && (
              <div className="line-organizer-pending" role="status">
                <strong>{linePending.displayName ? `${linePending.displayName}的團主資格尚待核准` : '團主資格尚待核准'}</strong>
                <p>請將下方申請代碼提供給系統管理者：</p>
                <code>{linePending.requestCode}</code>
              </div>
            )}
            {error && <p className="live-form-error" role="alert">{error}</p>}
            <button type="button" className="line-login-action" onClick={() => { void signInWithLine() }} disabled={signingIn}>
              {signingIn ? 'LINE驗證中…' : '使用 LINE 登入'}
            </button>
            <a href="/">先查看住戶端</a>
          </section>
        ) : (
          <form className="live-login-card" onSubmit={signIn}>
            <p className="admin-eyebrow">SUPABASE LIVE DEMO</p>
            <h1>團主登入</h1>
            <p>Email／密碼僅供本機測試或緊急備援。</p>
            {logoutNotice && <p className="live-form-error" role="alert">{logoutNotice}</p>}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            </label>
            <label>
              <span>密碼</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error && <p className="live-form-error" role="alert">{error}</p>}
            <button type="submit" disabled={signingIn}>{signingIn ? '登入中…' : '登入'}</button>
            <a href="/">先查看住戶端</a>
          </form>
        )}
      </main>
    )
  }
  if (error) return <LiveError message={error} />
  if (!campaignId) {
    if (!campaigns) return <LiveLoading label="載入團購列表…" />
    return (
      <CampaignListApp
        campaigns={campaigns}
        onCreate={(title) => campaignManagementGateway.create(title)}
        onDelete={async (campaignId) => {
          const result = await campaignManagementGateway.delete(campaignId)
          setCampaigns((current) => current?.filter((campaign) => campaign.id !== campaignId) ?? null)
          return result
        }}
        onSignOut={async () => {
          authValidationGeneration.current += 1
          signInGeneration.current += 1
          authEventsBlocked.current = true
          validatedOrganizerId.current = null
          setError('')
          setSession(null)
          await signOutRemotely()
        }}
      />
    )
  }
  if (!content || !campaignStatus) return <LiveLoading label="載入團購草稿與訂單…" />

  return (
    <AdminApp
      initialContent={content}
      initialPublicationState={publicationState}
      orderSummary={orderSummary}
      campaignStatus={campaignStatus}
      residentHref={residentSlug ? `/campaign/${residentSlug}` : null}
      onUploadImage={(file) => imageGateway.upload(campaignId, file)}
      onSetCampaignStatus={async (status) => {
        await ordersGateway.setCampaignStatus(campaignId, status)
        setCampaignStatus(await ordersGateway.loadCampaignStatus(campaignId))
      }}
      onSetOrderFulfillment={async (orderId, update) => {
        await ordersGateway.setOrderFulfillment(orderId, update)
        setOrderSummary(await ordersGateway.loadSummary(campaignId, content.unitPrice, content.threshold))
      }}
      onSaveDraft={async (nextContent) => {
        await gateway.saveDraft(campaignId, nextContent)
      }}
      onPublish={async (nextContent) => {
        await gateway.saveDraft(campaignId, nextContent)
        const published = await gateway.publish(campaignId)
        setContent(published)
        setResidentSlug(await gateway.loadResidentSlug?.(campaignId) ?? null)
        setOrderSummary(await ordersGateway.loadSummary(campaignId, published.unitPrice, published.threshold))
        return published
      }}
      onSignOut={async () => {
        authValidationGeneration.current += 1
        signInGeneration.current += 1
        authEventsBlocked.current = true
        validatedOrganizerId.current = null
        setError('')
        setSession(null)
        await signOutRemotely()
      }}
    />
  )
}

function residentCampaignListRepository(client: SupabaseClient<Database>): LiveResidentListRepository {
  return {
    async list() {
      const { data, error } = await client.rpc('list_resident_campaigns')
      if (error) throw error
      return (data ?? []).flatMap((row) => {
        if (!row.slug || !row.title || !row.status || !row.opened_at || row.unit_price === null
          || row.threshold === null || row.total_quantity === null) return []
        if (!['open', 'closed', 'arrived'].includes(row.status)) return []
        return [{
          slug: row.slug,
          title: row.title,
          status: row.status as CampaignStatus,
          unitPrice: Number(row.unit_price),
          openedAt: row.opened_at,
          totalQuantity: Number(row.total_quantity),
          threshold: row.threshold,
        }]
      })
    },
  }
}

function LocalLiveResidentListApp({
  client,
  inviteSlug,
  liffId,
  liffClient,
  lineResidentGateway,
  residentListRepository,
}: LocalLiveResidentAppProps) {
  const [identity, setIdentity] = useState<ResidentLineIdentity | null>(null)
  const [campaigns, setCampaigns] = useState<ResidentCampaignListItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const initialize = async () => {
      let trustedIdentity: ResidentLineIdentity
      if (inviteSlug) {
        if (!liffId || !liffClient) throw new Error('住戶LINE登入設定不完整')
        const liffIdentity = await loadLiffIdentity(liffClient, liffId)
        if (!liffIdentity) return
        const gateway = lineResidentGateway ?? createLineResidentGateway(client)
        const result = await gateway.signIn(liffIdentity.idToken, inviteSlug)
        trustedIdentity = result.identity
      } else {
        const session = await ensureResidentSession(client, false)
        const { data, error: identityError } = await client.rpc('get_line_resident_self')
        if (identityError) throw identityError
        const row = data?.[0]
        if (!row?.display_name) throw new Error('請從LINE群組內的固定住戶入口進入')
        trustedIdentity = { displayName: row.display_name, pictureUrl: row.picture_url }
        if (!session.user?.id) throw new Error('住戶登入狀態無效')
      }
      const nextCampaigns = await (residentListRepository ?? residentCampaignListRepository(client)).list()
      if (active) {
        setIdentity(trustedIdentity)
        setCampaigns(nextCampaigns)
      }
    }
    void initialize().catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => { active = false }
  }, [client, inviteSlug, liffClient, liffId, lineResidentGateway, residentListRepository])

  if (error) return <LiveError message={error} title="無法載入住戶入口" />
  if (!identity || !campaigns) return <LiveLoading label="確認LINE住戶身分並載入開團列表…" />
  return (
    <ResidentCampaignListApp
      identity={identity}
      campaigns={campaigns}
      onLogout={async () => {
        const { error: remoteError } = await client.auth.signOut()
        if (remoteError) {
          await client.auth.signOut({ scope: 'local' })
          setIdentity(null)
          setCampaigns([])
          setError('遠端登出失敗，但已清除此裝置的登入狀態')
          return
        }
        setIdentity(null)
        setCampaigns([])
        setError('已登出，請從LINE群組內的固定住戶入口重新進入')
      }}
    />
  )
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
  if (!allowAnonymous) throw new Error('請從LINE群組內的固定住戶入口進入')
  const { data: anonymousData, error: anonymousError } = await client.auth.signInAnonymously()
  if (anonymousError || !anonymousData.session) {
    throw anonymousError ?? new Error('無法建立住戶匿名登入')
  }
  return anonymousData.session
}

function LocalLiveResidentCampaignApp({ client, campaignId, campaignSlug }: LocalLiveResidentAppProps & { campaignSlug: string }) {
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [orders, setOrders] = useState<VisibleOrder[]>([])
  const [residentCustomer, setResidentCustomer] = useState<ResidentCustomer | null | undefined>(undefined)
  const [residentIdentity, setResidentIdentity] = useState<ResidentLineIdentity | null>(null)
  const [joinedCampaignId, setJoinedCampaignId] = useState<string | null>(campaignId ?? null)
  const [error, setError] = useState('')
  const sessionPromise = useRef<Promise<Session> | null>(null)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof client.channel> | null = null
    let resolvedCampaignId = campaignId

    const loadPublished = async () => {
      if (!resolvedCampaignId) throw new Error('找不到團購活動')
      const { data, error: queryError } = await client
        .from('campaign_public')
        .select('title,unit_price,threshold,announcement,images,items,opened_at,status')
        .eq('id', resolvedCampaignId)
        .single()
      if (queryError) throw queryError
      if (active) {
        setContent(campaignContentFromRow(data))
        setCampaignStatus(campaignStatusFromRow(data))
      }
    }

    const loadResidentData = async () => {
      if (!resolvedCampaignId) throw new Error('找不到團購活動')
      const [wallResult, customerResult, identityResult] = await Promise.all([
        client.from('order_wall')
          .select('order_id,customer_id,customer_name,picture_url,period,unit,item_code,qty,ordered_at,order_updated_at')
          .eq('campaign_id', resolvedCampaignId),
        client.rpc('get_customer_self'),
        client.rpc('get_line_resident_self'),
      ])
      if (wallResult.error) throw wallResult.error
      if (customerResult.error) throw customerResult.error
      if (identityResult.error) throw identityResult.error
      if (active) {
        setOrders(visibleOrdersFromRows(wallResult.data ?? []))
        const identity = identityResult.data?.[0]
        if (!identity?.display_name) throw new Error('請從LINE群組內的固定住戶入口進入')
        setResidentIdentity({ displayName: identity.display_name, pictureUrl: identity.picture_url })
        const customer = customerResult.data?.[0]
        setResidentCustomer(customer?.id && customer.name && customer.period !== null && customer.unit
          ? { customerId: customer.id, name: customer.name, period: customer.period, unit: customer.unit }
          : null)
      }
    }

    const initialize = async () => {
      sessionPromise.current ??= ensureResidentSession(client, false)
      await sessionPromise.current
      const { data: joinedRows, error: joinError } = await client.rpc('join_campaign_by_slug', {
        p_slug: campaignSlug,
      })
      if (joinError) throw joinError
      const resolvedId = Array.isArray(joinedRows) && joinedRows[0]
        && typeof joinedRows[0] === 'object' && 'id' in joinedRows[0]
        && typeof joinedRows[0].id === 'string'
        ? joinedRows[0].id
        : null
      if (!resolvedId) throw new Error('找不到已發布的團購活動')
      if (campaignId && campaignId !== resolvedId) throw new Error('團購連結與活動不一致')
      resolvedCampaignId = resolvedId
      if (active) setJoinedCampaignId(resolvedId)
      await Promise.all([loadPublished(), loadResidentData()])
      if (!active) return
      channel = client
        .channel(`campaign-live-${resolvedCampaignId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'campaign', filter: `id=eq.${resolvedCampaignId}` },
          () => { void loadPublished().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `campaign_id=eq.${resolvedCampaignId}` },
          () => { void loadResidentData().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_item', filter: `campaign_id=eq.${resolvedCampaignId}` },
          () => { void loadResidentData().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
        )
        .subscribe()
    }

    void initialize().catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })

    return () => {
      active = false
      if (channel) void client.removeChannel(channel)
    }
  }, [campaignId, campaignSlug, client])

  if (error) return <LiveError message={error} />
  if (!joinedCampaignId || !content || !campaignStatus || residentCustomer === undefined || !residentIdentity) return <LiveLoading label="連線住戶端即時資料…" />
  return (
    <App
      publishedContent={content}
      campaignStatus={campaignStatus}
      liveDemo
      visibleOrders={orders}
      residentCustomer={residentCustomer}
      verifiedResidentIdentity={residentIdentity}
      onBindResident={async ({ period, unit }) => {
        const { data, error: bindError } = await client.rpc('bind_customer_self', {
          p_period: period,
          p_unit: unit,
        })
        if (bindError) throw bindError
        const customer = data?.[0]
        if (!customer?.id || !customer.name || customer.period === null || !customer.unit) {
          throw new Error('住戶資料綁定結果無效')
        }
        const bound = {
          customerId: customer.id,
          name: customer.name,
          period: customer.period,
          unit: customer.unit,
        }
        setResidentCustomer(bound)
        return bound
      }}
      onSubmitOrder={async (items) => {
        const { error: submitError } = await client.rpc('submit_customer_order', {
          p_campaign_id: joinedCampaignId,
          p_items: items,
        })
        if (submitError) throw submitError
        const { data, error: wallError } = await client.from('order_wall')
          .select('order_id,customer_id,customer_name,picture_url,period,unit,item_code,qty,ordered_at,order_updated_at')
          .eq('campaign_id', joinedCampaignId)
        if (wallError) throw wallError
        setOrders(visibleOrdersFromRows(data ?? []))
      }}
    />
  )
}

export function LocalLiveResidentApp(props: LocalLiveResidentAppProps) {
  if (!props.campaignSlug && !props.campaignId) return <LocalLiveResidentListApp {...props} />
  if (!props.campaignSlug) return <LiveError message="找不到團購分享連結" />
  return <LocalLiveResidentCampaignApp {...props} campaignSlug={props.campaignSlug} />
}
