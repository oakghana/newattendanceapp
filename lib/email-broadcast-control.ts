import "server-only"

type BroadcastClient = {
  from: (table: string) => any
}

const activeBroadcasts = new Map<string, { cancelled: boolean }>()

export async function startEmailBroadcast(id: string, client?: BroadcastClient) {
  activeBroadcasts.set(id, { cancelled: false })
  if (client) {
    await client.from("email_broadcasts").upsert({ id, status: "running", created_at: new Date().toISOString() })
  }
}

export async function cancelEmailBroadcast(id: string, client?: BroadcastClient, userId?: string) {
  const broadcast = activeBroadcasts.get(id)
  if (broadcast) broadcast.cancelled = true
  if (!client) return Boolean(broadcast)
  const update = { status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: userId || null }
  const { data, error } = await client.from("email_broadcasts").update(update).eq("id", id).eq("status", "running").select("id").maybeSingle()
  return !error && Boolean(data || broadcast)
}

export async function isEmailBroadcastCancelled(id: string, client?: BroadcastClient) {
  if (activeBroadcasts.get(id)?.cancelled) return true
  if (!client) return false
  const { data } = await client.from("email_broadcasts").select("status").eq("id", id).maybeSingle()
  return data?.status === "cancelled"
}

export async function finishEmailBroadcast(id: string, client?: BroadcastClient, attemptedCount = 0, cancelled = false) {
  activeBroadcasts.delete(id)
  if (client) {
    await client.from("email_broadcasts").update({ status: cancelled ? "cancelled" : "completed", completed_at: new Date().toISOString(), attempted_count: attemptedCount }).eq("id", id)
  }
}
