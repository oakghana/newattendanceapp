"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Shield, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from "lucide-react"
import Link from "next/link"

interface TableHealth {
  name: string
  label: string
  status: "ok" | "missing" | "policy_error" | "error"
  rowCount: number | null
  recentCount: number | null
  error: string | null
}

interface DiagnosticsData {
  overall: "healthy" | "degraded" | "warning"
  tables: TableHealth[]
  checkedAt: string
  enforcementEnabled: boolean
}

function StatusIcon({ status }: { status: TableHealth["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === "missing" || status === "error") return <XCircle className="h-4 w-4 text-red-500" />
  return <AlertTriangle className="h-4 w-4 text-amber-500" />
}

function StatusBadge({ status }: { status: TableHealth["status"] }) {
  if (status === "ok")
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">OK</Badge>
  if (status === "missing")
    return <Badge variant="destructive">Missing</Badge>
  if (status === "policy_error")
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">Policy Error</Badge>
  return <Badge variant="destructive">Error</Badge>
}

export function SecurityHealthCard() {
  const [data, setData] = useState<DiagnosticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/security-diagnostics", { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnostics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDiagnostics()
  }, [fetchDiagnostics])

  const overallColor =
    data?.overall === "healthy"
      ? "from-emerald-500/10 to-teal-500/10 border-emerald-200/50 dark:border-emerald-800/50"
      : data?.overall === "degraded"
      ? "from-red-500/10 to-rose-500/10 border-red-200/50 dark:border-red-800/50"
      : "from-amber-500/10 to-orange-500/10 border-amber-200/50 dark:border-amber-800/50"

  const overallIcon =
    data?.overall === "healthy" ? (
      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    ) : data?.overall === "degraded" ? (
      <XCircle className="h-5 w-5 text-red-600" />
    ) : (
      <AlertTriangle className="h-5 w-5 text-amber-600" />
    )

  return (
    <Card className={`bg-gradient-to-br ${overallColor} backdrop-blur-xl shadow-xl`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            Security Table Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && overallIcon}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchDiagnostics}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">
          {data
            ? `Last checked ${new Date(data.checkedAt).toLocaleTimeString()}`
            : loading
            ? "Checking…"
            : "Device-sharing security tables"}
          {data && (
            <span className={`ml-2 font-semibold ${data.enforcementEnabled ? "text-emerald-600" : "text-amber-600"}`}>
              · Policy {data.enforcementEnabled ? "ON" : "OFF"}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 rounded-lg px-3 py-2 border border-red-200/50 dark:border-red-800/50">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-slate-200/60 dark:bg-slate-700/40 animate-pulse" />
            ))}
          </div>
        )}

        {data?.tables.map((table) => (
          <div
            key={table.name}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/50 dark:bg-slate-900/40 border border-white/40 dark:border-slate-700/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon status={table.status} />
              <span className="text-sm font-medium truncate">{table.label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {table.status === "ok" && (
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {table.recentCount !== null ? `+${table.recentCount} (7d)` : `${table.rowCount} rows`}
                </span>
              )}
              <StatusBadge status={table.status} />
            </div>
          </div>
        ))}

        {data && (
          <div className="pt-1 flex justify-end">
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <Link href="/dashboard/device-violations">
                View Violations
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
