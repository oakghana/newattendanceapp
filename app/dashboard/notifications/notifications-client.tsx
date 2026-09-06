"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Hourglass,
  LogIn,
  LogOut,
  MapPin,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type OffPremisesRequest = {
  id: string
  current_location_name?: string | null
  google_maps_name?: string | null
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  created_at: string
  status: string
  approved_at?: string | null
  rejection_reason?: string | null
  reason?: string | null
  request_type?: string | null
}

type StatusFilter = "all" | "pending" | "approved" | "rejected"

const STATUS_META: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Awaiting approval", className: "border-amber-200 bg-amber-50 text-amber-700", icon: Hourglass },
  approved: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Declined", className: "border-rose-200 bg-rose-50 text-rose-700", icon: XCircle },
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function NotificationsClient({ displayName }: { displayName: string | null }) {
  const [requests, setRequests] = useState<OffPremisesRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/attendance/offpremises/pending?status=all", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? "Unable to load your notifications.")
      setRequests(Array.isArray(body?.requests) ? body.requests : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
    }),
    [requests],
  )

  const visible = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Notifications</p>
              <h1 className="text-3xl font-semibold tracking-tight">Off-premises requests</h1>
              <p className="leading-6 text-muted-foreground">
                {displayName ? `${displayName}, track ` : "Track "}
                the status of every off-premises check-in and check-out you have submitted for approval.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" asChild>
              <a href="/dashboard">
                <ArrowLeft className="mr-2 size-4" /> Dashboard
              </a>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total requests" value={counts.all} icon={Bell} tone="bg-primary/10 text-primary" />
        <StatCard label="Awaiting approval" value={counts.pending} icon={Hourglass} tone="bg-amber-100 text-amber-700" />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" />
        <StatCard label="Declined" value={counts.rejected} icon={XCircle} tone="bg-rose-100 text-rose-700" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
            className="capitalize"
          >
            {key === "all" ? "All" : STATUS_META[key]?.label ?? key}
            <span className="ml-2 rounded-full bg-black/10 px-1.5 text-xs">{counts[key]}</span>
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-rose-700">
            <XCircle className="size-5 shrink-0" />
            <div className="flex-1">{error}</div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && !requests.length ? (
        <div className="grid gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/40" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Bell className="size-6" />
            </div>
            <p className="font-medium text-foreground">You&apos;re all caught up</p>
            <p className="max-w-sm text-sm">
              {filter === "all"
                ? "You have not submitted any off-premises requests yet. When you do, their approval status will appear here."
                : `You have no ${STATUS_META[filter]?.label.toLowerCase() ?? filter} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {visible.map((request) => {
            const meta = STATUS_META[request.status] ?? STATUS_META.pending
            const StatusIcon = meta.icon
            const isCheckout = String(request.request_type ?? "").toLowerCase().includes("checkout")
            const TypeIcon = isCheckout ? LogOut : LogIn
            const mapHref =
              request.latitude != null && request.longitude != null
                ? `https://www.google.com/maps?q=${request.latitude},${request.longitude}`
                : null
            return (
              <article key={request.id} className="overflow-hidden rounded-xl border shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <TypeIcon className="size-4" />
                    </span>
                    Off-premises {isCheckout ? "check-out" : "check-in"}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                  >
                    <StatusIcon className="size-3.5" />
                    {meta.label}
                  </span>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium">
                        {request.google_maps_name || request.current_location_name || "Location captured"}
                      </p>
                      {mapHref && (
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View on map <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Submitted</p>
                      <p className="font-medium">{formatDateTime(request.created_at)}</p>
                    </div>
                  </div>
                  {request.status !== "pending" && (
                    <div className="flex items-start gap-2">
                      <StatusIcon className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {request.status === "approved" ? "Approved" : "Reviewed"}
                        </p>
                        <p className="font-medium">{formatDateTime(request.approved_at)}</p>
                      </div>
                    </div>
                  )}
                  {request.reason && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="text-xs text-muted-foreground">Your reason</p>
                      <p className="text-sm leading-6">{request.reason}</p>
                    </div>
                  )}
                  {request.status === "rejected" && request.rejection_reason && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2 lg:col-span-3">
                      <p className="font-medium">Reason for decline</p>
                      <p className="leading-6">{request.rejection_reason}</p>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof Clock
  tone: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
