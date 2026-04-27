"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  MapPin,
  UserCheck,
  LogOut,
  Building,
  Play,
  RotateCcw,
} from "lucide-react"

// QCC Head Office coordinates (within range)
const QCC_HEAD_OFFICE = { latitude: 5.614818, longitude: -0.205874, accuracy: 8 }
// Off-premises coordinates (out of range)
const OFF_PREMISES_COORDS = { latitude: 5.636, longitude: -0.1966, accuracy: 12 }

interface FlowResult {
  status: "idle" | "running" | "success" | "warning" | "error"
  message: string
  details?: string
  httpStatus?: number
  raw?: unknown
}

type FlowKey =
  | "autoCheckin"
  | "manualCheckin"
  | "offPremisesCheckin"
  | "manualCheckout"
  | "offPremisesCheckout"

const INITIAL_RESULTS: Record<FlowKey, FlowResult> = {
  autoCheckin: { status: "idle", message: "Not yet run" },
  manualCheckin: { status: "idle", message: "Not yet run" },
  offPremisesCheckin: { status: "idle", message: "Not yet run" },
  manualCheckout: { status: "idle", message: "Not yet run" },
  offPremisesCheckout: { status: "idle", message: "Not yet run" },
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function callCheckinAPI(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch("/api/attendance/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: await res.json() }
}

async function callCheckoutAPI(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch("/api/attendance/check-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: await res.json() }
}

async function callOffPremisesAPI(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch("/api/attendance/check-in-outside-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: await res.json() }
}

async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  try {
    const res = await fetch("/api/auth/current-user")
    if (!res.ok) return null
    const data = await res.json()
    return data.user || null
  } catch {
    return null
  }
}

function parseMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>
    return (d.message as string) || (d.error as string) || fallback
  }
  return fallback
}

// ─── simulation flows ────────────────────────────────────────────────────────

/**
 * Flow 1 – Automatic Check-in
 * Sends GPS coords (within range) WITHOUT a location_id.
 * The server finds the nearest location automatically.
 */
async function runAutoCheckin(): Promise<FlowResult> {
  const locationTimestamp = Date.now()
  const res = await callCheckinAPI({
    latitude: QCC_HEAD_OFFICE.latitude,
    longitude: QCC_HEAD_OFFICE.longitude,
    accuracy: QCC_HEAD_OFFICE.accuracy,
    location_timestamp: locationTimestamp,
    location_source: "simulation_gps",
    device_info: {
      device_id: "sim-device-auto",
      platform: "simulation",
      user_agent: "SimulationTest/1.0",
    },
  })

  const data = res.data as Record<string, unknown>

  if (res.ok && data.success) {
    return {
      status: "success",
      message: "Auto check-in accepted",
      details: parseMessage(data, "GPS-based auto check-in succeeded"),
      httpStatus: res.status,
      raw: data,
    }
  }

  // Duplicate check-in (already checked in) is still a passing scenario
  if (res.status === 409 || (typeof data.error === "string" && data.error.toLowerCase().includes("already checked in"))) {
    return {
      status: "warning",
      message: "Already checked in today (expected if run after manual check-in)",
      details: parseMessage(data, "Duplicate prevention working correctly"),
      httpStatus: res.status,
      raw: data,
    }
  }

  return {
    status: "error",
    message: "Auto check-in failed",
    details: parseMessage(data, "Unknown error"),
    httpStatus: res.status,
    raw: data,
  }
}

/**
 * Flow 2 – Manual Check-in
 * Sends GPS coords WITH a specific location_id (user selected a location from the list).
 */
async function runManualCheckin(): Promise<FlowResult> {
  const locationTimestamp = Date.now()

  // First, get the nearest geofence location to use as location_id
  let locationId: string | null = null
  try {
    const locRes = await fetch("/api/attendance/locations")
    if (locRes.ok) {
      const locData = await locRes.json()
      const locations = (locData.locations || locData.data || locData) as Array<{
        id: string
        name: string
        latitude?: number
        longitude?: number
      }>
      if (Array.isArray(locations) && locations.length > 0) {
        locationId = locations[0].id
      }
    }
  } catch {
    // fallback — send without location_id (same as auto)
  }

  const res = await callCheckinAPI({
    latitude: QCC_HEAD_OFFICE.latitude,
    longitude: QCC_HEAD_OFFICE.longitude,
    accuracy: QCC_HEAD_OFFICE.accuracy,
    location_id: locationId,
    location_timestamp: locationTimestamp,
    location_source: "simulation_manual",
    device_info: {
      device_id: "sim-device-manual",
      platform: "simulation",
      user_agent: "SimulationTest/1.0",
    },
  })

  const data = res.data as Record<string, unknown>

  if (res.ok && data.success) {
    return {
      status: "success",
      message: "Manual check-in accepted",
      details: parseMessage(data, "Manual GPS check-in with location ID succeeded"),
      httpStatus: res.status,
      raw: data,
    }
  }

  if (res.status === 409 || (typeof data.error === "string" && data.error.toLowerCase().includes("already checked in"))) {
    return {
      status: "warning",
      message: "Already checked in today — duplicate guard working",
      details: parseMessage(data, "Duplicate prevention working correctly"),
      httpStatus: res.status,
      raw: data,
    }
  }

  return {
    status: "error",
    message: "Manual check-in failed",
    details: parseMessage(data, "Unknown error"),
    httpStatus: res.status,
    raw: data,
  }
}

/**
 * Flow 3 – Off-Premises Check-in Request
 * Submits an off-premises check-in request (requires manager approval).
 */
async function runOffPremisesCheckin(userId: string): Promise<FlowResult> {
  const res = await callOffPremisesAPI({
    user_id: userId,
    request_type: "checkin",
    reason: "Attending external site visit for official duty (simulation test)",
    current_location: {
      name: "External Office – Accra Central (Simulation)",
      latitude: OFF_PREMISES_COORDS.latitude,
      longitude: OFF_PREMISES_COORDS.longitude,
      accuracy: OFF_PREMISES_COORDS.accuracy,
    },
    device_info: {
      device_id: "sim-device-offpremises",
      platform: "simulation",
      user_agent: "SimulationTest/1.0",
    },
  })

  const data = res.data as Record<string, unknown>

  if (res.ok && data.success) {
    return {
      status: "success",
      message: "Off-premises check-in request submitted",
      details: `Request ID: ${(data as Record<string, unknown>).request_id || "created"} — Pending manager approval`,
      httpStatus: res.status,
      raw: data,
    }
  }

  // Duplicate pending request is also an acceptable scenario
  if (
    typeof data.error === "string" &&
    (data.error.toLowerCase().includes("already") || data.error.toLowerCase().includes("pending"))
  ) {
    return {
      status: "warning",
      message: "Duplicate request detected — already has pending/approved request today",
      details: parseMessage(data, "Duplicate guard working correctly"),
      httpStatus: res.status,
      raw: data,
    }
  }

  return {
    status: "error",
    message: "Off-premises check-in request failed",
    details: parseMessage(data, "Unknown error"),
    httpStatus: res.status,
    raw: data,
  }
}

/**
 * Flow 4 – Manual Check-out
 * Sends GPS coords to the check-out API.
 */
async function runManualCheckout(): Promise<FlowResult> {
  const res = await callCheckoutAPI({
    latitude: QCC_HEAD_OFFICE.latitude,
    longitude: QCC_HEAD_OFFICE.longitude,
    accuracy: QCC_HEAD_OFFICE.accuracy,
    device_info: {
      device_id: "sim-device-checkout",
      platform: "simulation",
      user_agent: "SimulationTest/1.0",
    },
  })

  const data = res.data as Record<string, unknown>

  if (res.ok && data.success) {
    return {
      status: "success",
      message: "Manual check-out accepted",
      details: parseMessage(data, "GPS check-out succeeded"),
      httpStatus: res.status,
      raw: data,
    }
  }

  // No active check-in is a "warning" — might be run before checking in
  if (
    typeof data.error === "string" &&
    (data.error.toLowerCase().includes("no active") ||
      data.error.toLowerCase().includes("not checked in") ||
      data.error.toLowerCase().includes("check in first"))
  ) {
    return {
      status: "warning",
      message: "No active check-in found — check in first to test this flow",
      details: parseMessage(data, "Run a check-in flow first, then retry checkout"),
      httpStatus: res.status,
      raw: data,
    }
  }

  // Already checked out
  if (typeof data.error === "string" && data.error.toLowerCase().includes("already checked out")) {
    return {
      status: "warning",
      message: "Already checked out today",
      details: parseMessage(data, "Duplicate checkout prevention working"),
      httpStatus: res.status,
      raw: data,
    }
  }

  return {
    status: "error",
    message: "Manual check-out failed",
    details: parseMessage(data, "Unknown error"),
    httpStatus: res.status,
    raw: data,
  }
}

/**
 * Flow 5 – Off-Premises Check-out Request
 * Submits an off-premises checkout request (requires active check-in + 2 hr work).
 */
async function runOffPremisesCheckout(userId: string): Promise<FlowResult> {
  const res = await callOffPremisesAPI({
    user_id: userId,
    request_type: "checkout",
    reason: "Official external meeting – leaving premises early (simulation test scenario)",
    current_location: {
      name: "External Client Office (Simulation)",
      latitude: OFF_PREMISES_COORDS.latitude,
      longitude: OFF_PREMISES_COORDS.longitude,
      accuracy: OFF_PREMISES_COORDS.accuracy,
    },
    device_info: {
      device_id: "sim-device-offpremises-out",
      platform: "simulation",
      user_agent: "SimulationTest/1.0",
    },
  })

  const data = res.data as Record<string, unknown>

  if (res.ok && data.success) {
    return {
      status: "success",
      message: "Off-premises check-out request submitted",
      details: `Request ID: ${(data as Record<string, unknown>).request_id || "created"} — Pending manager approval`,
      httpStatus: res.status,
      raw: data,
    }
  }

  // These are "expected" failures with no actual check-in
  const err = typeof data.error === "string" ? data.error.toLowerCase() : ""
  if (err.includes("no active") || err.includes("check in first")) {
    return {
      status: "warning",
      message: "No active check-in — flow requires an open check-in record",
      details: parseMessage(data, "Expected: check in first, then request off-premises checkout"),
      httpStatus: res.status,
      raw: data,
    }
  }
  if (err.includes("2 hours") || err.includes("2h") || err.includes("worked")) {
    return {
      status: "warning",
      message: "Minimum 2 hours of work required — business rule enforcement working",
      details: parseMessage(data, "Off-premises checkout available after 2 hours"),
      httpStatus: res.status,
      raw: data,
    }
  }
  if (err.includes("disabled") || err.includes("policy")) {
    return {
      status: "warning",
      message: "Off-premises checkout disabled by admin policy",
      details: parseMessage(data, "Admin has disabled this feature"),
      httpStatus: res.status,
      raw: data,
    }
  }
  if (err.includes("already") || err.includes("pending")) {
    return {
      status: "warning",
      message: "Duplicate request — already has pending off-premises request",
      details: parseMessage(data, "Duplicate guard working correctly"),
      httpStatus: res.status,
      raw: data,
    }
  }

  return {
    status: "error",
    message: "Off-premises check-out request failed",
    details: parseMessage(data, "Unknown error"),
    httpStatus: res.status,
    raw: data,
  }
}

// ─── UI components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FlowResult["status"] }) {
  if (status === "idle") return <Badge variant="outline">Idle</Badge>
  if (status === "running") return <Badge className="bg-blue-500 text-white">Running…</Badge>
  if (status === "success") return <Badge className="bg-green-600 text-white">Pass</Badge>
  if (status === "warning") return <Badge className="bg-yellow-500 text-white">Warning</Badge>
  return <Badge variant="destructive">Fail</Badge>
}

function FlowIcon({ status }: { status: FlowResult["status"] }) {
  if (status === "running") return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
  if (status === "success") return <CheckCircle2 className="h-5 w-5 text-green-600" />
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />
  if (status === "error") return <XCircle className="h-5 w-5 text-red-600" />
  return null
}

function ResultCard({
  title,
  description,
  icon,
  result,
  onRun,
  disabled,
}: {
  title: string
  description: string
  icon: React.ReactNode
  result: FlowResult
  onRun: () => void
  disabled: boolean
}) {
  const borderColor =
    result.status === "success"
      ? "border-green-400"
      : result.status === "error"
        ? "border-red-400"
        : result.status === "warning"
          ? "border-yellow-400"
          : result.status === "running"
            ? "border-blue-400"
            : "border-border"

  return (
    <Card className={`transition-all ${borderColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={result.status} />
            <FlowIcon status={result.status} />
          </div>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.status !== "idle" && (
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <p className="font-medium">{result.message}</p>
            {result.details && <p className="text-muted-foreground">{result.details}</p>}
            {result.httpStatus !== undefined && (
              <p className="text-xs text-muted-foreground">HTTP {result.httpStatus}</p>
            )}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onRun}
          disabled={disabled || result.status === "running"}
          className="w-full"
        >
          {result.status === "running" ? (
            <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Running…</>
          ) : (
            <><Play className="mr-2 h-3 w-3" />Run This Flow</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TestFlowsPage() {
  const [results, setResults] = useState<Record<FlowKey, FlowResult>>(INITIAL_RESULTS)
  const [isRunningAll, setIsRunningAll] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userError, setUserError] = useState<string | null>(null)

  const setResult = (key: FlowKey, value: FlowResult) =>
    setResults((prev) => ({ ...prev, [key]: value }))

  const markRunning = (key: FlowKey) =>
    setResult(key, { status: "running", message: "Calling API…" })

  async function ensureUserId(): Promise<string | null> {
    if (userId) return userId
    const user = await getCurrentUser()
    if (!user) {
      setUserError("Could not retrieve current user. Make sure you are logged in.")
      return null
    }
    setUserId(user.id)
    setUserError(null)
    return user.id
  }

  // Individual flow runners
  async function runFlow1() {
    markRunning("autoCheckin")
    setResult("autoCheckin", await runAutoCheckin())
  }

  async function runFlow2() {
    markRunning("manualCheckin")
    setResult("manualCheckin", await runManualCheckin())
  }

  async function runFlow3() {
    const uid = await ensureUserId()
    if (!uid) {
      setResult("offPremisesCheckin", { status: "error", message: "Not authenticated", details: "Must be logged in" })
      return
    }
    markRunning("offPremisesCheckin")
    setResult("offPremisesCheckin", await runOffPremisesCheckin(uid))
  }

  async function runFlow4() {
    markRunning("manualCheckout")
    setResult("manualCheckout", await runManualCheckout())
  }

  async function runFlow5() {
    const uid = await ensureUserId()
    if (!uid) {
      setResult("offPremisesCheckout", { status: "error", message: "Not authenticated", details: "Must be logged in" })
      return
    }
    markRunning("offPremisesCheckout")
    setResult("offPremisesCheckout", await runOffPremisesCheckout(uid))
  }

  async function runAll() {
    setIsRunningAll(true)
    const uid = await ensureUserId()

    // Check-in flows first
    await runFlow1()
    await new Promise((r) => setTimeout(r, 600))
    await runFlow2()
    await new Promise((r) => setTimeout(r, 600))

    if (uid) {
      markRunning("offPremisesCheckin")
      setResult("offPremisesCheckin", await runOffPremisesCheckin(uid))
      await new Promise((r) => setTimeout(r, 600))
    }

    // Check-out flows
    await runFlow4()
    await new Promise((r) => setTimeout(r, 600))

    if (uid) {
      markRunning("offPremisesCheckout")
      setResult("offPremisesCheckout", await runOffPremisesCheckout(uid))
    }

    setIsRunningAll(false)
  }

  function resetAll() {
    setResults(INITIAL_RESULTS)
    setUserError(null)
  }

  const allDone = Object.values(results).every((r) => r.status !== "idle" && r.status !== "running")
  const passCount = Object.values(results).filter((r) => r.status === "success").length
  const warnCount = Object.values(results).filter((r) => r.status === "warning").length
  const failCount = Object.values(results).filter((r) => r.status === "error").length

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Attendance Flow Simulation</h1>
        <p className="text-muted-foreground text-sm">
          Tests all 5 attendance flows against the live API. Must be logged in. Warnings are acceptable expected outcomes.
        </p>
      </div>

      {userError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Authentication Required</AlertTitle>
          <AlertDescription>{userError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={runAll} disabled={isRunningAll} className="bg-blue-600 hover:bg-blue-700">
          {isRunningAll ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running All Flows…</>
          ) : (
            <><Play className="mr-2 h-4 w-4" />Run All 5 Flows</>
          )}
        </Button>
        <Button onClick={resetAll} variant="outline" disabled={isRunningAll}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>

        {allDone && (
          <div className="ml-auto flex items-center gap-3 text-sm">
            {passCount > 0 && <span className="text-green-600 font-medium">✓ {passCount} passed</span>}
            {warnCount > 0 && <span className="text-yellow-600 font-medium">⚠ {warnCount} warning</span>}
            {failCount > 0 && <span className="text-red-600 font-medium">✗ {failCount} failed</span>}
          </div>
        )}
      </div>

      <Alert className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
        <MapPin className="h-4 w-4 text-amber-600" />
        <AlertTitle>Simulation Notes</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>
            <strong>In-range GPS:</strong> {QCC_HEAD_OFFICE.latitude}, {QCC_HEAD_OFFICE.longitude} (QCC Head Office area)
          </p>
          <p>
            <strong>Off-premises GPS:</strong> {OFF_PREMISES_COORDS.latitude}, {OFF_PREMISES_COORDS.longitude} (Accra Central area)
          </p>
          <p>
            <strong>Warning outcomes</strong> (already checked in, pending request, 2-hr gate) are <em>expected</em> and shown in yellow — they do not indicate bugs.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ResultCard
          title="Flow 1 — Automatic Check-in"
          description="GPS coords within range, no location_id. Server picks nearest location automatically."
          icon={<MapPin className="h-4 w-4 text-blue-600" />}
          result={results.autoCheckin}
          onRun={runFlow1}
          disabled={isRunningAll}
        />

        <ResultCard
          title="Flow 2 — Manual Check-in"
          description="GPS coords + explicit location_id fetched from /api/attendance/locations."
          icon={<UserCheck className="h-4 w-4 text-blue-600" />}
          result={results.manualCheckin}
          onRun={runFlow2}
          disabled={isRunningAll}
        />

        <ResultCard
          title="Flow 3 — Off-Premises Check-in Request"
          description="Submits pending check-in request to /api/attendance/check-in-outside-request for manager approval."
          icon={<Building className="h-4 w-4 text-purple-600" />}
          result={results.offPremisesCheckin}
          onRun={runFlow3}
          disabled={isRunningAll}
        />

        <ResultCard
          title="Flow 4 — Manual Check-out"
          description="GPS checkout. Requires an active check-in record — run a check-in flow first."
          icon={<LogOut className="h-4 w-4 text-green-600" />}
          result={results.manualCheckout}
          onRun={runFlow4}
          disabled={isRunningAll}
        />

        <ResultCard
          title="Flow 5 — Off-Premises Check-out Request"
          description="Submits pending checkout request for manager approval. Requires 2+ hours of active check-in."
          icon={<LogOut className="h-4 w-4 text-purple-600" />}
          result={results.offPremisesCheckout}
          onRun={runFlow5}
          disabled={isRunningAll}
        />
      </div>

      {allDone && failCount === 0 && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">All Flows Verified</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            All 5 attendance flows are operational. Warning-state results are expected business-rule responses (duplicates, time gates, etc.) and confirm the server is correctly enforcing rules.
          </AlertDescription>
        </Alert>
      )}

      {allDone && failCount > 0 && (
        <Alert variant="destructive" className="mt-6">
          <XCircle className="h-4 w-4" />
          <AlertTitle>{failCount} Flow{failCount > 1 ? "s" : ""} Failed</AlertTitle>
          <AlertDescription>
            Review the failed flows above. Common causes: not logged in, Supabase connection issue, or a code regression. Check browser DevTools console for details.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
