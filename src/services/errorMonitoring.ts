// Reports uncaught errors on the live site to Sentry, without anything that identifies a resident.
// Loaded on its own (see main.tsx), so pages that never report don't download it.
import * as Sentry from '@sentry/react'
import type { Breadcrumb, ErrorEvent } from '@sentry/react'
import type { RuntimeConfig } from './runtime'
import { shouldMonitorErrors } from './errorMonitoringPolicy'

// A DSN only says where to send reports; Sentry designs it to be public in browser code.
const SENTRY_DSN = 'https://78cf2b66d94552140eb099239a0ab60a@o4512182152658944.ingest.us.sentry.io/4512182174744576'

// LINE login puts tokens in the query string and fragment, and Supabase queries put ids there.
function withoutQuery(url: unknown): unknown {
  if (typeof url !== 'string') return url
  return url.replace(/[?#].*$/, '')
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user
  if (event.request) {
    event.request.url = withoutQuery(event.request.url) as string | undefined
    delete event.request.query_string
    delete event.request.headers
    delete event.request.cookies
    delete event.request.data
  }
  return event
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console lines and clicked elements can carry names, households and order details.
  if (breadcrumb.category === 'console' || breadcrumb.category?.startsWith('ui.')) return null
  if (breadcrumb.data) {
    for (const key of ['url', 'from', 'to']) {
      if (key in breadcrumb.data) breadcrumb.data[key] = withoutQuery(breadcrumb.data[key])
    }
  }
  return breadcrumb
}

export function startErrorMonitoring(config: RuntimeConfig, productionBuild: boolean): void {
  if (!shouldMonitorErrors(config, productionBuild)) return
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    // Sentry collects all of these by default; none of them helps find a bug, and some identify a resident.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Breadcrumbs')
      .concat(Sentry.breadcrumbsIntegration({ dom: false })),
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  })
}
