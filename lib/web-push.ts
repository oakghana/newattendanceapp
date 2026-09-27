import webpush from "web-push"
import { createAdminClient } from "@/lib/supabase/server"

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

function configureWebPush() {
  const subject = process.env.WEB_PUSH_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export async function sendWebPushToUsers(userIds: string[], payload: PushPayload, requestId?: string) {
  if (!configureWebPush() || userIds.length === 0) return { sent: 0, skipped: true }
  const admin = createAdminClient()
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", [...new Set(userIds)])

  let sent = 0
  for (const subscription of subscriptions || []) {
    if (requestId) {
      const { data: claimed } = await admin.from("push_delivery_log").upsert({
        recipient_id: subscription.user_id,
        request_id: requestId,
        notification_type: payload.tag || "request",
      }, { onConflict: "recipient_id,request_id,notification_type", ignoreDuplicates: true }).select("id")
      if (!claimed?.length) continue
    }
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload))
      sent += 1
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id)
      }
    }
  }
  return { sent, skipped: false }
}
