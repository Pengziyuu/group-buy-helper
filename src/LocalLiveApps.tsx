import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
import { createAdminOrdersGateway } from './services/adminOrdersGateway'
import { createCampaignImageGateway } from './services/campaignImageGateway'

export type LiveAdminRepository = {
  loadPublished(campaignId: string): Promise<CampaignContent>
  loadOptionalDraft(campaignId: string): Promise<CampaignContent | null>
  saveDraft(campaignId: string, content: CampaignContent): Promise<CampaignContent>
  publish(campaignId: string): Promise<unknown>
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
  status: unknown
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function isAnonymousSession(session: Session | null): boolean {
  return session?.user?.is_anonymous === true
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
    || !row.images.every(isCampaignImage)) {
    throw new Error('Supabase 回傳的團購資料格式錯誤')
  }
  return {
    title: row.title,
    unitPrice: row.unit_price,
    threshold: row.threshold,
    announcement: row.announcement,
    images: row.images,
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
}: LocalLiveAppProps & {
  repository?: LiveAdminRepository
  ordersRepository?: LiveAdminOrdersRepository
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
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [content, setContent] = useState<CampaignContent | null>(null)
  const [orderSummary, setOrderSummary] = useState<OrganizerOrderSummary | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus | null>(null)
  const [publicationState, setPublicationState] = useState<'draft' | 'published'>('published')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let active = true
    void client.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      else if (isAnonymousSession(data.session)) {
        await client.auth.signOut()
        if (active) setSession(null)
      } else setSession(data.session)
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      if (isAnonymousSession(nextSession)) {
        setSession(null)
        void client.auth.signOut()
      } else setSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  useEffect(() => {
    if (!session) {
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
      setContent(draft ?? published)
      setOrderSummary(summary)
      setCampaignStatus(status)
      setPublicationState(draft && !campaignContentEquals(draft, published) ? 'draft' : 'published')
    }).catch((loadError: unknown) => {
      if (active) setError(errorMessage(loadError))
    })
    return () => {
      active = false
    }
  }, [campaignId, gateway, ordersGateway, session])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setSigningIn(true)
    setError('')
    const { data, error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) setError(signInError.message)
    else setSession(data.session)
    setSigningIn(false)
  }

  if (session === undefined) return <LiveLoading label="確認團主登入狀態…" />
  if (!session) {
    return (
      <main className="live-login-shell">
        <form className="live-login-card" onSubmit={signIn}>
          <p className="admin-eyebrow">SUPABASE LIVE DEMO</p>
          <h1>團主登入</h1>
          <p>登入後，草稿與發布內容會儲存在本機 Supabase。</p>
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
        await gateway.publish(campaignId)
        setOrderSummary(await ordersGateway.loadSummary(campaignId, nextContent.unitPrice, nextContent.threshold))
      }}
      onSignOut={async () => {
        const { error: signOutError } = await client.auth.signOut()
        if (signOutError) throw signOutError
        setSession(null)
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
  const [error, setError] = useState('')
  const sessionPromise = useRef<Promise<Session> | null>(null)

  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof client.channel> | null = null

    const loadPublished = async () => {
      const { data, error: queryError } = await client
        .from('campaign_public')
        .select('title,unit_price,threshold,announcement,images,status')
        .eq('id', campaignId)
        .single()
      if (queryError) throw queryError
      if (active) {
        setContent(campaignContentFromRow(data))
        setCampaignStatus(campaignStatusFromRow(data))
      }
    }

    const initialize = async () => {
      sessionPromise.current ??= ensureResidentSession(client)
      await sessionPromise.current
      const { error: joinError } = await client.rpc('join_campaign_by_slug', {
        p_slug: campaignSlug,
      })
      if (joinError) throw joinError
      await loadPublished()
      if (!active) return
      channel = client
        .channel(`campaign-live-${campaignId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'campaign', filter: `id=eq.${campaignId}` },
          () => { void loadPublished().catch((realtimeError: unknown) => setError(errorMessage(realtimeError))) },
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
  if (!content || !campaignStatus) return <LiveLoading label="連線住戶端即時資料…" />
  return <App publishedContent={content} campaignStatus={campaignStatus} liveDemo />
}
