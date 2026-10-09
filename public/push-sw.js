self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = { title: "QCC Attendance", body: "You have a new request.", url: "/dashboard" }
  try { data = { ...data, ...(event.data ? event.data.json() : {}) } } catch {}

  const urgent = data.requireInteraction === true || data.kind === "leave-reminder"

  event.waitUntil((async () => {
    // Tell any open tab so it can flash the reminder modal and play a sound
    // immediately; a service worker itself cannot play audio.
    const openClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of openClients) client.postMessage({ type: "qcc-push", kind: data.kind || "request", payload: data })

    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-light-32x32.png",
      badge: "/icon-light-32x32.png",
      tag: data.tag || "qcc-request",
      renotify: true,
      silent: false,
      requireInteraction: urgent,
      vibrate: urgent ? [250, 120, 250, 120, 400] : [150],
      timestamp: Date.now(),
      data: { url: data.url || "/dashboard" },
      actions: urgent ? [{ action: "open", title: "Apply now" }] : [],
    })
  })())
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/dashboard"
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client)
    if (existing) { existing.navigate(url); return existing.focus() }
    return self.clients.openWindow(url)
  }))
})
