self.addEventListener("push", (event) => {
  let data = { title: "QCC Attendance", body: "You have a new request.", url: "/dashboard" }
  try { data = { ...data, ...(event.data ? event.data.json() : {}) } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-light-32x32.png",
    badge: "/icon-light-32x32.png",
    tag: data.tag || "qcc-request",
    data: { url: data.url || "/dashboard" },
  }))
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
