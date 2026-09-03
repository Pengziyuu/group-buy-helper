import { createPickupNotificationHandler } from '../_shared/sendPickupNotification.ts'

Deno.serve(createPickupNotificationHandler('test'))
