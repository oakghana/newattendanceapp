const activeBroadcasts = new Map<string, { cancelled: boolean; createdAt: number }>()

export function startEmailBroadcast(id: string) {
  activeBroadcasts.set(id, { cancelled: false, createdAt: Date.now() })
}

export function cancelEmailBroadcast(id: string) {
  const broadcast = activeBroadcasts.get(id)
  if (!broadcast) return false
  broadcast.cancelled = true
  return true
}

export function isEmailBroadcastCancelled(id: string) {
  return activeBroadcasts.get(id)?.cancelled === true
}

export function finishEmailBroadcast(id: string) {
  activeBroadcasts.delete(id)
}
