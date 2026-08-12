import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import AdminApp from './AdminApp'
import type { FulfillmentUpdate } from './AdminOrdersPanel'
import App from './App'
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
  LOGOUT_TOMBSTONE_KEY,
  SUPABASE_AUTH_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  type AuthSessionStorage,
} from './services/authStorage'

export type LiveAdminRepository = {
  loadPublished(campaignId: string): Promise<CampaignContent>
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

type LocalLiveAppProps = {
  client: SupabaseClient<Database>
  campaignId: string
}

type LocalLiveResidentAppProps = LocalLiveAppProps & {
  campaignSlug: string
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
  'order_id' | 'customer_id' | 'customer_name' | 'period' | 'unit' | 'item_code' | 'qty' | 'ordered_at' | 'order_updated_at'
>

function visibleOrdersFromRows(rows: OrderWallRow[]): VisibleOrder[] {
  const orders = new Map<string, VisibleOrder>()
  for (const row of rows) {
    if (!row.order_id || !row.customer_id || !row.customer_name || row.period === null || !row.unit
      || !row.ordered_at || !row.order_updated_at) continue
    const order = orders.get(row.order_id) ?? {
      customerId: row.customer_id,
      name: row.customer_name,
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

function LiveError({ message }: { message: string }) {
  return (
    <main className="live-state-shell">
      <div className="live-state-card live-error" role="alert">
        <strong>無法載入 Supabase Live Demo</strong>
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
  authStorage = null,
  logoutFallbackStorage = null,
}: LocalLiveAppProps & {
  repository?: LiveAdminRepository
  ordersRepository?: LiveAdminOrdersRepository
  authStorage?: AuthSessionStorage | null
  logoutFallbackStorage?: AuthSessionStorage | null
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
  const [publicationState, setPublicationState] = useState<'draft' | 'published'>('published')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      return
    }
    let active = true
    setError('')
    void gateway.loadPublished(campaignId).then(async (published) => {
      const [draft, summary, status] = await Promise.all([
        gateway.loadOptionalDraft(campaignId),
        ordersGateway.loadSummary(campaignId, published.unitPrice, published.threshold),
        ordersGateway.loadCampaignStatus(campaignId),
      ])
      if (!active) return
      const editableContent = draft ? { ...draft, openedAt: published.openedAt } : published
      setContent(editableContent)
      setOrderSummary(summary)
      setCampaignStatus(status)
      setPublicationState(draft && !campaignContentEquals(editableContent, published) ? 'draft' : 'published')
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => {
      active = false
    }
  }, [campaignId, gateway, ordersGateway, organizerUserId])

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
    else {
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
        setSigningIn(false)
        return
      }
      setLogoutNotice('')
      validatedOrganizerId.current = data.session?.user?.id ?? null
      setSession(data.session)
    }
    setSigningIn(false)
  }

  if (signOutPending) return <LiveLoading label="登出中…" />
  if (fatalAuthError) return <LiveError message={fatalAuthError} />
  if (session === undefined) return <LiveLoading label="確認團主登入狀態…" />
  if (!session) {
    return (
      <main className="live-login-shell">
        <form className="live-login-card" onSubmit={signIn}>
          <p className="admin-eyebrow">SUPABASE LIVE DEMO</p>
          <h1>團主登入</h1>
          <p>登入後，草稿與發布內容會儲存在本機 Supabase。</p>
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
      </main>
    )
  }
  if (error) return <LiveError message={error} />
  if (!content || !orderSummary || !campaignStatus) return <LiveLoading label="載入團購草稿與訂單…" />

  return (
    <AdminApp
      initialContent={content}
      initialPublicationState={publicationState}
      orderSummary={orderSummary}
      campaignStatus={campaignStatus}
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
        setOrderSummary(await ordersGateway.loadSummary(campaignId, nextContent.unitPrice, nextContent.threshold))
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

async function ensureResidentSession(client: SupabaseClient<Database>): Promise<Session> {
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  if (data.session) return data.session
  const { data: anonymousData, error: anonymousError } = await client.auth.signInAnonymously()
  if (anonymousError || !anonymousData.session) {
    throw anonymousError ?? new Error('無法建立住戶匿名登入')
  }
  return anonymousData.session
}

export function LocalLiveResidentApp({ client, campaignId, campaignSlug }: LocalLiveResidentAppProps) {
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [orders, setOrders] = useState<VisibleOrder[]>([])
  const [residentCustomer, setResidentCustomer] = useState<ResidentCustomer | null | undefined>(undefined)
  const [error, setError] = useState('')
  const sessionPromise = useRef<Promise<Session> | null>(null)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof client.channel> | null = null

    const loadPublished = async () => {
      const { data, error: queryError } = await client
        .from('campaign_public')
        .select('title,unit_price,threshold,announcement,images,items,opened_at,status')
        .eq('id', campaignId)
        .single()
      if (queryError) throw queryError
      if (active) {
        setContent(campaignContentFromRow(data))
        setCampaignStatus(campaignStatusFromRow(data))
      }
    }

    const loadResidentData = async () => {
      const [wallResult, customerResult] = await Promise.all([
        client.from('order_wall')
          .select('order_id,customer_id,customer_name,period,unit,item_code,qty,ordered_at,order_updated_at')
          .eq('campaign_id', campaignId),
        client.rpc('get_customer_self'),
      ])
      if (wallResult.error) throw wallResult.error
      if (customerResult.error) throw customerResult.error
      if (active) {
        setOrders(visibleOrdersFromRows(wallResult.data ?? []))
        const customer = customerResult.data?.[0]
        setResidentCustomer(customer?.id && customer.name && customer.period !== null && customer.unit
          ? { customerId: customer.id, name: customer.name, period: customer.period, unit: customer.unit }
          : null)
      }
    }

    const initialize = async () => {
      sessionPromise.current ??= ensureResidentSession(client)
      await sessionPromise.current
      const { error: joinError } = await client.rpc('join_campaign_by_slug', {
        p_slug: campaignSlug,
      })
      if (joinError) throw joinError
      await Promise.all([loadPublished(), loadResidentData()])
      if (!active) return
      channel = client
        .channel(`campaign-live-${campaignId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'campaign', filter: `id=eq.${campaignId}` },
          () => { void loadPublished().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `campaign_id=eq.${campaignId}` },
          () => { void loadResidentData().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_item', filter: `campaign_id=eq.${campaignId}` },
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
  if (!content || !campaignStatus || residentCustomer === undefined) return <LiveLoading label="連線住戶端即時資料…" />
  return (
    <App
      publishedContent={content}
      campaignStatus={campaignStatus}
      liveDemo
      visibleOrders={orders}
      residentCustomer={residentCustomer}
      onSubmitOrder={async (items) => {
        const { error: submitError } = await client.rpc('submit_customer_order', {
          p_campaign_id: campaignId,
          p_items: items,
        })
        if (submitError) throw submitError
        const { data, error: wallError } = await client.from('order_wall')
          .select('order_id,customer_id,customer_name,period,unit,item_code,qty,ordered_at,order_updated_at')
          .eq('campaign_id', campaignId)
        if (wallError) throw wallError
        setOrders(visibleOrdersFromRows(data ?? []))
      }}
    />
  )
}
