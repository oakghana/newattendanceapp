"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, X, UserPlus, Plus, Route, Search, Clock3, CheckCircle2, ClipboardCheck, Truck, Users, ArrowRight, Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function NonRegionalRequisitionDashboard({ role }: { role: string }) {
  const [requests, setRequests] = useState<any[]>([])
  const [drivers, setDrivers] = useState<any[]>([])
  const [unavailableDriverIds, setUnavailableDriverIds] = useState<string[]>([])
  const [vehicles, setVehicles] = useState<any[]>([])
  const [vehicleLoadError, setVehicleLoadError] = useState<string | null>(null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [viewerLocation, setViewerLocation] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<any | null>(null)
  const [previewRequest, setPreviewRequest] = useState<any | null>(null)
  const [assignDriverId, setAssignDriverId] = useState("")
  const [assignVehicleId, setAssignVehicleId] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRequests, setTotalRequests] = useState(0)
  const [requiredDate, setRequiredDate] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<"all" | "pending" | "approved" | "completed">(
    role === "department_head" ? "pending" : "all",
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load(requestedPage = page, requestedDate = requiredDate) {
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: "25" })
      if (requestedDate) params.set("date", requestedDate)
      const response = await fetch(`/api/transport/nonregional?${params}`)
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? "Unable to load non-regional transport requests.")
      setRequests(body?.requests ?? [])
      setDrivers(body?.drivers ?? [])
      setUnavailableDriverIds(body?.unavailableDriverIds ?? [])
      const vehiclesResponse = await fetch("/api/transport/vehicles")
      const vehiclesBody = await vehiclesResponse.json().catch(() => null)
      setVehicles(vehiclesResponse.ok ? vehiclesBody?.vehicles ?? [] : [])
      setVehicleLoadError(
        vehiclesResponse.ok
          ? null
          : vehiclesBody?.error ?? "Fleet vehicles could not be loaded.",
      )
      setViewerId(body?.viewerId ?? null)
      setViewerLocation(body?.viewerLocation ?? null)
      setPage(body?.pagination?.page ?? requestedPage)
      setTotalPages(body?.pagination?.totalPages ?? 1)
      setTotalRequests(body?.pagination?.total ?? 0)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load transport requests.")
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function decide(id: string, decision: string, extra: Record<string, unknown> = {}) {
    setBusy(id)
    const response = await fetch("/api/transport/nonregional", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, ...extra }),
    })
    setBusy(null)
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast({ title: "Action failed", description: body?.error ?? "Please try again.", variant: "destructive" })
      return
    }
    toast({
      title:
        decision === "approve" || decision === "approve_hod"
          ? "Approval completed"
          : decision === "assign_driver"
            ? "Driver assignment completed"
            : "Requisition updated",
      description: "The transport workflow has been updated successfully.",
    })
    load()
  }

  const canCreate = ["staff", "hr", "department_head", "admin", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "it-admin"].includes(role)
  const isRequesterView = ["staff", "hr", "department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role)

  function awaitingHod(request: any) {
    return request.status === "awaiting_hod_approval" || request.hod_decision === "pending"
  }

  function canHodAct(request: any) {
    if (!awaitingHod(request)) return false
    if (role === "admin" || role === "it-admin") return true
    if (role === "department_head" && viewerId && request.hod_id === viewerId) return true
    return false
  }

  function canMdAct(request: any) {
    const hodOk = request.hod_decision === "approved"
    return (
      (role === "managing_director" || role === "admin" || role === "it-admin") &&
      hodOk &&
      request.md_decision === "pending" &&
      request.status !== "awaiting_hod_approval"
    )
  }

  function canAssign(request: any) {
    return (
      (role === "transport_manager" || role === "chief_driver" || role === "admin" || role === "it-admin") &&
      request.md_decision === "approved" &&
      request.status !== "assigned"
    )
  }

  const driverLocationName = (driver: any) =>
    ((driver?.geofence_locations as { name?: string } | null)?.name ?? "").trim()

  const driverLabel = (driver: any) => {
    const name = `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || "Unnamed driver"
    const location = driverLocationName(driver)
    return location ? `${name} — ${location}` : name
  }

  // Location drivers first; the Transport Manager may also pick drivers from
  // other locations. The Chief Driver only sees drivers at his own location.
  const assignableDrivers = useMemo(() => {
    if (!assignTarget) return { locationDrivers: [] as any[], otherDrivers: [] as any[] }
    const availableDrivers = drivers.filter((driver) => !unavailableDriverIds.includes(driver.id))
    if (role === "chief_driver") {
      const own = availableDrivers.filter((driver) => viewerLocation && driverLocationName(driver) === viewerLocation)
      return { locationDrivers: own, otherDrivers: [] as any[] }
    }
    const locationDrivers = availableDrivers.filter((driver) => driverLocationName(driver) === assignTarget.location)
    const otherDrivers = availableDrivers.filter((driver) => driverLocationName(driver) !== assignTarget.location)
    return { locationDrivers, otherDrivers }
  }, [assignTarget, drivers, role, unavailableDriverIds, viewerLocation])

  const assignableVehicles = useMemo(() => {
    if (!assignTarget) return [] as any[]
    const requiredCapacity = Number(assignTarget.persons_requiring_transport ?? 0)
    return vehicles.filter((vehicle) =>
      vehicle.status === "available" &&
      (!requiredCapacity || Number(vehicle.capacity ?? 0) >= requiredCapacity),
    )
  }, [assignTarget, vehicles])

  const vehicleLabel = (vehicle: any) =>
    `${vehicle.registration_number ?? "Vehicle"} - ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()

  function openAssignment(request: any) {
    setAssignTarget(request)
    setAssignVehicleId("")
    const locationMatch = drivers.find(
      (driver) => !unavailableDriverIds.includes(driver.id) && driverLocationName(driver) === request.location,
    )
    setAssignDriverId(locationMatch?.id ?? "")
  }

  async function confirmAssignment() {
    if (!assignTarget || !assignDriverId) return
    const target = assignTarget
    await decide(target.id, "assign_driver", {
      driverId: assignDriverId,
      vehicleId: assignVehicleId,
      transportUseDate: new Date().toISOString().slice(0, 10),
    })
    setAssignTarget(null)
    setAssignDriverId("")
    setAssignVehicleId("")
  }

  const summary = useMemo(() => ({
    total: totalRequests,
    awaitingHod: requests.filter(awaitingHod).length,
    awaitingMd: requests.filter((request) => request.status === "awaiting_md_approval" && request.md_decision === "pending").length,
    readyToAssign: requests.filter((request) => request.md_decision === "approved" && request.status !== "assigned").length,
    assigned: requests.filter((request) => request.status === "assigned").length,
    approved: requests.filter((request) => request.md_decision === "approved").length,
    completed: requests.filter((request) => ["completed", "closed"].includes(request.status)).length,
  }), [requests, totalRequests])

  const visibleRequests = useMemo(() => requests.filter((request) => {
    const matchesQuery = `${request.department ?? ""} ${request.location ?? ""} ${request.purpose ?? ""} ${request.origin ?? ""} ${request.destination ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase().trim())
    const matchesStage = stage === "all"
      || (stage === "pending" && !["completed", "closed", "rejected"].includes(request.status) && request.md_decision !== "approved")
      || (stage === "approved" && request.md_decision === "approved")
      || (stage === "completed" && ["completed", "closed"].includes(request.status))
    return matchesQuery && matchesStage
  }), [requests, query, stage])

  const workflowLabel = (request: any) => {
    if (request.status === "assigned") return "Driver assigned"
    if (request.md_decision === "approved") return "Approved - awaiting assignment"
    if (awaitingHod(request)) return "Awaiting HOD authorization"
    if (request.status === "awaiting_md_approval") return "Awaiting MD approval"
    if (request.status === "rejected") return "Not approved"
    return request.status?.replace(/_/g, " ") || "Submitted"
  }

  function workflowProgress(request: any) {
    const rejected = request.status === "rejected" || request.hod_decision === "rejected" || request.md_decision === "rejected"
    const hodApproved = request.hod_decision === "approved"
    const mdApproved = request.md_decision === "approved"
    const assigned = request.status === "assigned" || Boolean(request.recommended_driver_id)
    return {
      value: rejected ? 25 : assigned ? 100 : mdApproved ? 75 : hodApproved ? 50 : 25,
      rejected,
      steps: [
        ["Submitted", true],
        ["HOD authorization", hodApproved],
        ["MD approval", mdApproved],
        ["Driver assignment", assigned],
      ] as const,
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 pb-10" data-print={previewRequest ? "hide" : undefined}>
      <header className="overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/50 shadow-sm dark:border-emerald-950 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-5 border-b border-emerald-200/70 p-6 md:flex-row md:items-end md:justify-between dark:border-emerald-950">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Truck className="size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Non-regional transport</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {role === "department_head" ? "HOD transport authorization" : isRequesterView ? "My transport requests" : "Non-regional requisitions"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {isRequesterView
                ? role === "department_head"
                  ? "Authorize staff requisitions assigned to you, then track Managing Director approval and driver assignment."
                  : "Track each request from Head of Department authorization to Managing Director approval and driver assignment."
                : "Operational workflow: requester, Head of Department, Managing Director, then Transport Manager."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/dashboard/transport">
              <ArrowLeft data-icon="inline-start" /> Back to Transport Management
            </a>
          </Button>
          {canCreate && (
            <Button asChild>
              <a href="/dashboard/transport/nonregional/new">
                <Plus data-icon="inline-start" /> New request
              </a>
            </Button>
          )}
        </div>
        </div>
        <div className="grid divide-y divide-emerald-200/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5 dark:divide-emerald-950">
          {[
            ["All requisitions", summary.total, ClipboardCheck],
            ["Awaiting HOD", summary.awaitingHod, Users],
            ["Awaiting MD", summary.awaitingMd, Clock3],
            ["Approved", summary.approved, Route],
            ["Completed", summary.completed, CheckCircle2],
          ].map(([label, value, Icon]) => (
            <div key={String(label)} className="flex items-center gap-3 bg-white/55 px-5 py-4 dark:bg-background/20">
              <div className="flex size-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><Icon className="size-4" /></div>
              <div><p className="text-xl font-semibold tabular-nums">{String(value)}</p><p className="text-xs text-muted-foreground">{String(label)}</p></div>
            </div>
          ))}
        </div>
      </header>

      {isRequesterView && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm dark:border-emerald-950 dark:bg-emerald-950/20">
          <span className="text-muted-foreground">{role === "department_head" ? "Requests awaiting your authorization appear first." : "Your requests are grouped below by current workflow status."}</span>
          <Button variant="outline" onClick={() => setStage("pending")}>{role === "department_head" ? "Open authorization queue" : "View pending requests"}</Button>
        </div>
      )}

      <section className="grid gap-3 rounded-lg border bg-card p-3 shadow-sm lg:grid-cols-[1fr_auto_auto]" aria-label="Requisition filters">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this page by department, route, location, or purpose" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-emerald-600" /></div>
        <label className="flex items-center gap-2 text-sm font-medium"><span className="whitespace-nowrap">Required date</span><input type="date" value={requiredDate} onChange={(event) => { const nextDate = event.target.value; setRequiredDate(nextDate); void load(1, nextDate) }} className="h-10 rounded-md border bg-background px-3 text-sm" /></label>
        <div className="flex overflow-x-auto rounded-md border bg-muted/30 p-1">
          {(["all", "pending", "approved", "completed"] as const).map((value) => <button key={value} onClick={() => setStage(value)} className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${stage === value ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:bg-background"}`}>{value === "all" ? "All requests" : value === "pending" ? "Pending" : value === "approved" ? "Approved" : "Completed"}</button>)}
        </div>
      </section>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <span>{loadError}</span>
          <Button variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="grid gap-3">
        {visibleRequests.map((request) => {
          const progress = workflowProgress(request)
          return (
            <Card key={request.id} className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="border-b bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-accent/40 bg-accent/15 text-accent-foreground">
                      Non-Regional Requisition
                    </Badge>
                    <CardTitle className="text-base">
                      {request.department} — {request.location}
                    </CardTitle>
                  </div>
                  <Badge className={request.status === "assigned" ? "bg-emerald-600" : request.status === "rejected" ? "bg-destructive" : "bg-amber-500 text-amber-950 hover:bg-amber-500"}>{workflowLabel(request)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-4">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-muted-foreground">Route</p><p className="mt-1 font-medium">{request.origin} <ArrowRight className="mx-1 inline size-3" /> {request.destination}</p></div>
                  <div><p className="text-xs text-muted-foreground">Required</p><p className="mt-1 font-medium">{request.required_at || "Not specified"}</p></div>
                  <div><p className="text-xs text-muted-foreground">People</p><p className="mt-1 font-medium">{request.persons_requiring_transport || "Not specified"}</p>{request.person_names && <p className="text-xs text-muted-foreground">{request.person_names}</p>}</div>
                  <div><p className="text-xs text-muted-foreground">Decision progress</p><p className="mt-1 font-medium">HOD: {request.hod_decision || "pending"} · MD: {request.md_decision || "pending"}</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Request information</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Submitted transport request</DialogTitle>
                        <DialogDescription>
                          The information below is the requisition submitted by the requester. This non-regional request is not converted into a memo.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                        <p><strong>Requisition date:</strong> {request.requisition_date || "Not provided"}</p>
                        <p><strong>Requester:</strong> {[request.requester?.first_name, request.requester?.last_name].filter(Boolean).join(" ") || "Name unavailable"}</p>
                        <p><strong>Department:</strong> {request.department}</p>
                        <p><strong>Location:</strong> {request.location}</p>
                        <p><strong>Number of people:</strong> {request.persons_requiring_transport}</p>
                        <p><strong>Names of people:</strong> {request.person_names || "Not provided"}</p>
                        <p><strong>From:</strong> {request.origin}</p>
                        <p><strong>To:</strong> {request.destination}</p>
                        <p><strong>Required:</strong> {request.required_at}</p>
                        <p><strong>Return:</strong> {request.return_at || "Not provided"}</p>
                        <p className="sm:col-span-2"><strong>Purpose:</strong> {request.purpose}</p>
                        <p><strong>HOD authorization:</strong> {request.hod_authorization || "Pending — blank until HOD signs"}</p>
                        <p><strong>HOD decision:</strong> {request.hod_decision || "Pending"}</p>
                        <p><strong>MD decision:</strong> {request.md_decision || "Pending"}</p>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" onClick={() => setPreviewRequest(request)}>
                    <FileText data-icon="inline-start" /> View / save PDF
                  </Button>
                </div>
                {request.requester_signature_data_url && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">Requester signature:</strong>
                    <img src={request.requester_signature_data_url} alt="Requester signature" className="h-12 max-w-40 object-contain" />
                  </div>
                )}
                <section className="grid gap-3 rounded-lg border bg-muted/20 p-4" aria-label="Request workflow progress">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Request progress</p>
                    <span className={progress.rejected ? "text-xs font-medium text-destructive" : "text-xs font-medium text-emerald-700"}>{workflowLabel(request)}</span>
                  </div>
                  <Progress value={progress.value} className={progress.rejected ? "[&>div]:bg-destructive" : "[&>div]:bg-emerald-600"} />
                  <ol className="grid gap-2 text-xs sm:grid-cols-4">
                    {progress.steps.map(([label, complete], index) => (
                      <li key={label} className={complete ? "font-medium text-emerald-700" : "text-muted-foreground"}>
                        <span className={`mr-1 inline-flex size-5 items-center justify-center rounded-full ${complete ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </section>
                {request.md_decision === "approved" && isRequesterView && (
                  <section
                    className="grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4 sm:grid-cols-2 lg:grid-cols-4"
                    aria-label="Transport assignment details"
                  >
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Assigned driver</p>
                      <p className="mt-1 font-medium">
                        {request.driver
                          ? `${request.driver.first_name ?? ""} ${request.driver.last_name ?? ""}`.trim()
                          : "Awaiting assignment"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Vehicle</p>
                      <p className="mt-1 font-medium">{request.recommended_vehicle || "Awaiting assignment"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Meet / leave</p>
                      <p className="mt-1 font-medium">{request.transport_use_date || request.required_at || "To be confirmed"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Assignment status</p>
                      <p className="mt-1 font-medium">
                        {request.status === "assigned" ? "Driver assigned" : "Approved — awaiting assignment"}
                      </p>
                    </div>
                  </section>
                )}
                <div className="flex flex-wrap gap-2">
                  {canHodAct(request) && (
                    <>
                      <Button
                        onClick={() => decide(request.id, "approve_hod", { stage: "hod" })}
                        disabled={busy === request.id}
                      >
                        <Check data-icon="inline-start" /> Authorize as HOD
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => decide(request.id, "reject_hod", { stage: "hod" })}
                        disabled={busy === request.id}
                      >
                        <X data-icon="inline-start" /> Reject
                      </Button>
                    </>
                  )}
                  {canMdAct(request) && (
                    <>
                      <Button
                        onClick={() => decide(request.id, "approve", { stage: "md" })}
                        disabled={busy === request.id}
                      >
                        <Check data-icon="inline-start" /> Approve (MD)
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => decide(request.id, "reject", { stage: "md" })}
                        disabled={busy === request.id}
                      >
                        <X data-icon="inline-start" /> Reject
                      </Button>
                    </>
                  )}
                  {canAssign(request) && (
                    <Button
                      variant="outline"
                      onClick={() => openAssignment(request)}
                    >
                      <UserPlus data-icon="inline-start" /> Assign location driver
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {visibleRequests.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No requisitions match this view.
            </CardContent>
          </Card>
        )}
      </div>

      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm" aria-label="Requisition pages">
        <span className="text-muted-foreground">
          Page {page} of {totalPages} · {totalRequests} requisition{totalRequests === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => void load(page + 1)}>Next</Button>
        </div>
      </nav>

      <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => { if (!open) setAssignTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign driver and vehicle</DialogTitle>
            <DialogDescription>
              {role === "chief_driver"
                ? "Select a driver from your own location. Drivers outside your location cannot be assigned."
                : `Drivers at ${assignTarget?.location ?? "the trip location"} are listed first. You may also select a driver from another location for this task.`}
            </DialogDescription>
          </DialogHeader>
          {assignTarget && (
            <div className="grid gap-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{assignTarget.origin} → {assignTarget.destination}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {assignTarget.department} — {assignTarget.location} · Required: {assignTarget.required_at || "Not specified"}
                </p>
              </div>
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Driver</span>
                <select
                  value={assignDriverId}
                  onChange={(event) => setAssignDriverId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select driver</option>
                  {assignableDrivers.locationDrivers.length > 0 && (
                    <optgroup label={`Drivers at ${role === "chief_driver" ? viewerLocation ?? "your location" : assignTarget.location}`}>
                      {assignableDrivers.locationDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>{driverLabel(driver)}</option>
                      ))}
                    </optgroup>
                  )}
                  {assignableDrivers.otherDrivers.length > 0 && (
                    <optgroup label="Drivers at other locations">
                      {assignableDrivers.otherDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>{driverLabel(driver)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {assignableDrivers.locationDrivers.length === 0 && assignableDrivers.otherDrivers.length === 0 && (
                  <span className="text-xs text-destructive">No active drivers available for assignment.</span>
                )}
                {role !== "chief_driver" && assignableDrivers.locationDrivers.length === 0 && assignableDrivers.otherDrivers.length > 0 && (
                  <span className="text-xs text-muted-foreground">No drivers are listed at this location — pick a driver from another location below.</span>
                )}
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Available vehicle</span>
                <select
                  value={assignVehicleId}
                  onChange={(event) => setAssignVehicleId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  required
                >
                  <option value="">Select vehicle</option>
                  {assignableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicleLabel(vehicle)} ({vehicle.capacity} seats)
                    </option>
                  ))}
                </select>
                {assignableVehicles.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span>
                      {vehicleLoadError || "No available fleet vehicle has enough capacity."}
                    </span>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href="/dashboard/transport/fleet">Open Fleet Inventory</a>
                    </Button>
                  </div>
                )}
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAssignTarget(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!assignDriverId || !assignVehicleId || busy === assignTarget.id}
                  onClick={confirmAssignment}
                >
                  <UserPlus data-icon="inline-start" /> {busy === assignTarget.id ? "Assigning…" : "Assign driver and vehicle"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewRequest)} onOpenChange={(open) => { if (!open) setPreviewRequest(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl">
          {previewRequest && (
            <>
              <DialogHeader className="print-hide flex flex-row items-center justify-between gap-4 border-b p-5">
                <div>
                  <DialogTitle>Non-regional requisition preview</DialogTitle>
                  <DialogDescription>Review the requisition, then print or save it as a PDF.</DialogDescription>
                </div>
                <Button type="button" onClick={() => window.print()}>
                  <Download data-icon="inline-start" /> Print / Save PDF
                </Button>
              </DialogHeader>
              <article className="print-container mx-auto w-full max-w-3xl bg-background px-6 py-8 text-foreground sm:px-12 sm:py-10">
                <header className="border-b-2 border-primary pb-5 text-center">
                  <img src="/images/qcc-logo.png" alt="Quality Control Company logo" className="mx-auto size-16 object-contain" />
                  <h2 className="mt-3 font-serif text-xl font-bold tracking-wide sm:text-2xl">QUALITY CONTROL COMPANY LTD.</h2>
                  <p className="mt-1 text-xs font-medium tracking-[0.16em] text-muted-foreground">NON-REGIONAL TRANSPORT REQUISITION</p>
                </header>
                <div className="grid gap-2 border-b py-5 text-sm sm:grid-cols-2">
                  <p><span className="font-semibold">Reference:</span> NRT/{String(previewRequest.id).slice(0, 8).toUpperCase()}</p>
                  <p><span className="font-semibold">Requisition date:</span> {previewRequest.requisition_date || "Not provided"}</p>
                  <p><span className="font-semibold">Department:</span> {previewRequest.department || "Not provided"}</p>
                  <p><span className="font-semibold">Location:</span> {previewRequest.location || "Not provided"}</p>
                </div>
                <section className="grid gap-4 py-6 text-sm leading-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <p><span className="font-semibold">Requester:</span> {[previewRequest.requester?.first_name, previewRequest.requester?.last_name].filter(Boolean).join(" ") || "Name unavailable"}</p>
                    <p><span className="font-semibold">Passengers:</span> {previewRequest.persons_requiring_transport || "Not specified"}</p>
                    <p><span className="font-semibold">From:</span> {previewRequest.origin || "Not provided"}</p>
                    <p><span className="font-semibold">To:</span> {previewRequest.destination || "Not provided"}</p>
                    <p><span className="font-semibold">Required:</span> {previewRequest.required_at || "Not specified"}</p>
                    <p><span className="font-semibold">Return:</span> {previewRequest.return_at || "Not required"}</p>
                  </div>
                  <div><p className="font-semibold">Names of people</p><p>{previewRequest.person_names || "Not provided"}</p></div>
                  <div><p className="font-semibold">Purpose of journey</p><p className="whitespace-pre-wrap">{previewRequest.purpose || "Not provided"}</p></div>
                </section>
                <section className="grid gap-4 border-t py-6 text-sm sm:grid-cols-2">
                  <div><p className="font-semibold">HOD authorization</p><p className="mt-1">{previewRequest.hod_authorization || "Pending"}</p><p className="mt-1 text-muted-foreground">Decision: {previewRequest.hod_decision || "pending"}</p></div>
                  <div><p className="font-semibold">Managing Director decision</p><p className="mt-1 capitalize">{previewRequest.md_decision || "pending"}</p><p className="mt-1 text-muted-foreground">Status: {workflowLabel(previewRequest)}</p></div>
                </section>
                {previewRequest.md_decision === "approved" && (
                  <section className="border-t py-6 text-sm">
                    <p className="font-semibold">Transport assignment</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <p><span className="font-medium">Driver:</span> {previewRequest.driver ? `${previewRequest.driver.first_name ?? ""} ${previewRequest.driver.last_name ?? ""}`.trim() : "Awaiting assignment"}</p>
                      <p><span className="font-medium">Vehicle:</span> {previewRequest.recommended_vehicle || "Awaiting assignment"}</p>
                      <p><span className="font-medium">Meet / leave:</span> {previewRequest.transport_use_date || "To be confirmed"}</p>
                    </div>
                  </section>
                )}
                <footer className="border-t pt-6 text-xs text-muted-foreground">Generated from the QCC Electronic Attendance System.</footer>
              </article>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
