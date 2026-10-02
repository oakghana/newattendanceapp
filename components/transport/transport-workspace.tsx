"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSignature,
  FileText,
  IdCard,
  Inbox,
  MapPin,
  Navigation,
  Paperclip,
  Plus,
  Route,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { isChiefDriverRole, isRegionalManagerRole, NON_REGIONAL_TRANSPORT_LOCATIONS } from "@/lib/role-capabilities"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type QueueRow = {
  id: string
  purpose: string
  origin: string
  destination: string
  event_date: string | null
  reference_number: string | null
  request_type?: "regional" | "nonregional"
}

type TransportWorkspaceProps = {
  role: string
  pendingCount?: number
  totalCount?: number
  queueRows?: QueueRow[]
  regionalPendingCount?: number
  nonRegionalPendingCount?: number
  approvedCount?: number
  assignedCount?: number
  requesterName?: string
  requesterDepartment?: string
  requesterLocation?: string
  scopeLabel?: string
  driverKind?: "regional" | "nonregional"
  isLinkedHod?: boolean
  isNonRegionalLocation?: boolean
  isRegionalStaff?: boolean
  isChiefDriver?: boolean
}

function MetricTile({
  label,
  value,
  note,
  icon: Icon,
  tone = "primary",
}: {
  label: string
  value: string | number
  note: string
  icon: typeof Bus
  tone?: "primary" | "emerald" | "amber" | "slate"
}) {
  const tones = {
    primary: "from-primary/15 to-primary/5 text-primary border-primary/20",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/20",
    slate: "from-slate-500/15 to-slate-500/5 text-slate-700 dark:text-slate-200 border-slate-500/20",
  } as const
  return (
    <Card className="group relative overflow-hidden border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[tone].split(" ").slice(0, 2).join(" ")}`} />
      <CardContent className="flex items-start justify-between gap-3 p-5 pt-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="text-xs leading-5 text-muted-foreground">{note}</p>
        </div>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function ModuleCard({
  title,
  description,
  href,
  icon: Icon,
  cta,
  badge,
  onClick,
}: {
  title: string
  description: string
  href: string
  icon: typeof Bus
  cta: string
  badge?: string
  onClick?: () => void
}) {
  return (
    <Card className="group relative flex min-h-56 flex-col overflow-hidden border-border/70 bg-card shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-emerald-500 to-accent opacity-80" />
      <CardHeader className="gap-4 p-5 pb-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="size-5" />
          </div>
          {badge ? <Badge variant="secondary" className="border-primary/15 bg-primary/8">{badge}</Badge> : <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
          <CardDescription className="text-sm leading-6">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto px-5 pb-5 pt-2">
        <Button size="sm" className="w-full sm:w-auto" asChild>
          <Link href={href} onClick={onClick ? (event) => { event.preventDefault(); onClick() } : undefined}>
            {cta}
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function TransportWorkspace({
  role,
  pendingCount = 0,
  totalCount = 0,
  queueRows = [],
  regionalPendingCount = 0,
  nonRegionalPendingCount = 0,
  approvedCount = 0,
  assignedCount = 0,
  requesterName = "",
  requesterDepartment = "",
  requesterLocation = "",
  scopeLabel = "",
  driverKind,
  isLinkedHod = false,
  isNonRegionalLocation = false,
  isRegionalStaff = false,
  isChiefDriver: isChiefDriverProp = false,
}: TransportWorkspaceProps) {
  const normalizedRole = role.toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isManagingDirector = ["managing_director", "director"].includes(normalizedRole)
  const isHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const isRegionalHr = ["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)
  const isDriver = ["driver", "drivers"].includes(normalizedRole)
  const isRegionalDriver = isDriver && driverKind === "regional"
  const isNonRegionalDriver = isDriver && driverKind !== "regional"
  const canManage = ["admin", "administrator", "it_admin", "it_admin_role"].includes(normalizedRole)
  const isDepartmentHead = normalizedRole === "department_head"
  const isActingHod = isDepartmentHead || isLinkedHod
  const isTransportManager = normalizedRole === "transport_manager"
  const isChiefDriver = isChiefDriverProp || isChiefDriverRole(normalizedRole)
  const isRegionalManager = isRegionalManagerRole(normalizedRole) || normalizedRole === "regional_manager" || normalizedRole === "regional manager"
  const isRegionalOnlyWorkspace = isRegionalManager || isRegionalHr || isRegionalDriver || isChiefDriver || isRegionalStaff
  const isBasicStaff = ["staff", "contract", "audit_staff"].includes(normalizedRole)
  const isNonRegionalWorkspaceRole = isNonRegionalLocation && !isRegionalOnlyWorkspace
  const isNonRegionalStaff = !isRegionalOnlyWorkspace && !canManage && !isTransportManager && !isManagingDirector && (isBasicStaff || isNonRegionalWorkspaceRole)
  const isHeadOfficeRequester = !isRegionalOnlyWorkspace && (isNonRegionalStaff || isNonRegionalLocation)
  const canViewDriverLicense = isChiefDriver || isRegionalHr || isRegionalManager || isDriver || isTransportManager || canManage
  const canManageFleet = isManagingDirector || isChiefDriver || isRegionalHr || isRegionalManager || isTransportManager || canManage
  const [requestOpen, setRequestOpen] = useState(false)
  const [hodRequiredOpen, setHodRequiredOpen] = useState(false)
  const router = useRouter()
  const regionalRouteRequired = isRegionalOnlyWorkspace && !isRegionalStaff


  async function handleRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selectedFiles = Array.from(form.getAll("supportingDocuments")).filter((value): value is File => value instanceof File && value.size > 0)
    if (selectedFiles.some((file) => file.size > 5 * 1024 * 1024)) {
      toast({ title: "Document is too large", description: "Each supporting document must be 5 MB or smaller.", variant: "destructive" })
      return
    }
    const documents = []
    for (const file of selectedFiles) {
      const uploadForm = new FormData()
      uploadForm.append("file", file)
      uploadForm.append("folder", "transport-supporting-documents")
      const uploadResponse = await fetch("/api/upload", { method: "POST", body: uploadForm })
      if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.json().catch(() => null)
        toast({ title: "Document upload failed", description: errorBody?.error ?? `Unable to upload ${file.name}. Please try again.`, variant: "destructive" })
        return
      }
      const uploaded = await uploadResponse.json()
      documents.push({ name: file.name, url: uploaded.url, type: file.type, size: file.size })
    }
    const isNonRegionalRequester = isNonRegionalStaff || isActingHod
    const submittedLocation = String(requesterLocation || "").trim()
    const approvedLocation = NON_REGIONAL_TRANSPORT_LOCATIONS.includes(submittedLocation as (typeof NON_REGIONAL_TRANSPORT_LOCATIONS)[number])
      ? submittedLocation
      : NON_REGIONAL_TRANSPORT_LOCATIONS[0]
    const response = await fetch(isNonRegionalRequester ? "/api/transport/nonregional" : "/api/transport/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isNonRegionalRequester
          ? {
              requisitionDate: form.get("eventDate"),
              department: requesterDepartment,
              location: approvedLocation,
              origin: form.get("origin"),
              destination: form.get("destination"),
              requiredAt: form.get("eventDate"),
              returnAt: form.get("returnDate"),
  personsCount: form.get("passengerCount"),
  personNames: form.get("personNames"),
  personsRequiringTransport: form.get("personNames"),
  purpose: form.get("purpose"),
              hodAuthorization: requesterName,
            }
          : {
              purpose: form.get("purpose"),
              origin: form.get("origin"),
              destination: form.get("destination"),
              eventDate: form.get("eventDate"),
              passengerCount: form.get("passengerCount"),
              supportingDocuments: documents,
              regionalRoute: isRegionalStaff ? "local_regional" : form.get("regionalRoute"),
            },
      ),
    })
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      toast({ title: "Unable to submit request", description: errorBody?.error ?? "The request could not be saved. Please try again.", variant: "destructive", duration: 6000 })
      return
    }
    setRequestOpen(false)
    toast({
      title: "Transport request submitted",
  description: isRegionalOnlyWorkspace
  ? "Your regional or district transport request was sent through the location-based review workflow."
  : isActingHod
  ? "Your Head Office request is awaiting Managing Director approval."
  : regionalRouteRequired && form.get("regionalRoute") === "local_regional"
  ? "Your local regional request was sent to the Regional Manager for endorsement, then the Regional Chief Driver for dispatch."
  : "Your Head Office transport request was sent to the Regional Manager for endorsement, then the Managing Director for approval.",
  })
  router.push(isRegionalOnlyWorkspace || isRegionalStaff ? "/dashboard/transport/requests" : isActingHod ? "/dashboard/transport/nonregional" : "/dashboard/transport/requests")
    router.refresh()
  }

  if ((normalizedRole === "it_admin" || normalizedRole === "it-admin") && !isRegionalStaff) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <header className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-background to-background shadow-sm">
          <div className="flex flex-col gap-5 border-b border-border/50 bg-background/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bus className="size-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">IT Admin transport</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">Request non-regional transport</h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Submit a transport requisition for your work trip and track only requests submitted from your account.</p>
              </div>
            </div>
            <Button size="lg" asChild>
              <Link href="/dashboard/transport/nonregional/new">
                <Plus data-icon="inline-start" /> New non-regional request
              </Link>
            </Button>
          </div>
          <div className="grid gap-px bg-border/50 sm:grid-cols-4">
            <div className="flex items-center gap-3 bg-background/90 p-5"><Inbox className="size-5 text-primary" /><div><p className="text-2xl font-semibold tracking-tight">{totalCount}</p><p className="text-xs text-muted-foreground">My requests</p></div></div>
            <div className="flex items-center gap-3 bg-background/90 p-5"><Clock3 className="size-5 text-amber-600" /><div><p className="text-2xl font-semibold tracking-tight">{pendingCount}</p><p className="text-xs text-muted-foreground">Awaiting approval</p></div></div>
            <div className="flex items-center gap-3 bg-background/90 p-5"><CheckCircle2 className="size-5 text-emerald-600" /><div><p className="text-2xl font-semibold tracking-tight">{approvedCount}</p><p className="text-xs text-muted-foreground">Approved</p></div></div>
            <div className="flex items-center gap-3 bg-background/90 p-5"><Truck className="size-5 text-muted-foreground" /><div><p className="text-2xl font-semibold tracking-tight">{assignedCount}</p><p className="text-xs text-muted-foreground">Transport assigned</p></div></div>
          </div>
        </header>
        <section className="grid gap-5 lg:grid-cols-2">
          <ModuleCard title="New non-regional request" description="Request transport for an official Head Office trip. Your request will follow the standard approval workflow." href="/dashboard/transport/nonregional/new" icon={Route} cta="Request transport" badge="Self-service" />
          <ModuleCard title="My requests" description="View the status and approval progress of transport requests submitted by you." href="/dashboard/transport/nonregional" icon={Inbox} cta="Track my requests" badge="Private view" />
        </section>
      </div>
    )
  }

  if (isManagingDirector || isHrExecutive) {
    const accentClass = isManagingDirector ? "text-primary" : "text-accent"
    const accentBg = isManagingDirector ? "bg-primary/10" : "bg-accent/10"
    const accentBorder = isManagingDirector ? "border-primary/25" : "border-accent/25"
    const accentTint = isManagingDirector ? "bg-gradient-to-br from-primary/[0.08] via-background to-background" : "bg-gradient-to-br from-accent/[0.08] via-background to-background"
    const Icon = isManagingDirector ? ShieldCheck : FileSignature
    const officeLabel = isManagingDirector ? "Office of the Managing Director" : "HR Executive Office"
    const deskTitle = isManagingDirector ? "Transport approval desk" : "Memo signing desk"
    const deskDescription = isManagingDirector
      ? "Regional and Head Office requests are shown separately. Preview the correct request before approving it."
      : "Regional transport requests approved by the Managing Director are ready for your rejoinder memo and signature."
    const actionLabel = isManagingDirector ? "Open approval desk" : "Open signing desk"
    const pendingLabel = isManagingDirector ? "Awaiting your approval" : "Awaiting your signature"

    return (
      <div className="flex min-w-0 flex-col gap-6">
        <header className={`overflow-hidden rounded-2xl border ${accentBorder} ${accentTint} shadow-sm`}>
          <div className="flex flex-col gap-5 border-b border-border/50 bg-background/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${accentBg} ${accentClass}`}>
                <Icon className="size-6" />
              </div>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${accentClass}`}>{officeLabel}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{deskTitle}</h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{deskDescription}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isHrExecutive && (
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" asChild>
                <Link href="/dashboard/transport/nonregional/new">
                  <Route data-icon="inline-start" /> New Head Office request
                </Link>
                </Button>
              )}
              <Button size="lg" variant={isHrExecutive ? "outline" : "default"} asChild>
                <Link href="/dashboard/transport/requests">
                  <Icon data-icon="inline-start" /> {actionLabel}
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-px bg-border/50 sm:grid-cols-4">
            <div className="flex items-center gap-3 bg-background/90 p-5">
              <div className={`flex size-9 items-center justify-center rounded-xl ${accentBg} ${accentClass}`}>
                <Clock3 className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">{pendingLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-background/90 p-5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Inbox className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{totalCount}</p>
                <p className="text-xs text-muted-foreground">Total requests in the register</p>
              </div>
            </div>
            {isManagingDirector && (
              <>
                <div className="flex items-center gap-3 bg-background/90 p-5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Bus className="size-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{regionalPendingCount}</p>
                    <p className="text-xs text-muted-foreground">Regional requests</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-background/90 p-5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{nonRegionalPendingCount}</p>
                    <p className="text-xs text-muted-foreground">Head Office requests</p>
                  </div>
                </div>
              </>
            )}
            {!isManagingDirector && (
              <div className="flex items-center gap-3 bg-background/90 p-5 sm:col-span-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Approved by the Managing Director</p>
                  <p className="text-xs text-muted-foreground">MD-approved requests awaiting rejoinder signature</p>
                </div>
              </div>
            )}
          </div>
        </header>

        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/20">
            <div>
              <CardTitle>{isManagingDirector ? "Approval queue" : "Signing queue"}</CardTitle>
              <CardDescription>
                {isManagingDirector
                  ? "Regional and Head Office requests are clearly labelled before approval."
                  : "Preview every approved transport request and memo before signing."}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/transport/requests">
                View all
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {queueRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <div className={`flex size-10 items-center justify-center rounded-full ${accentBg} ${accentClass}`}>
                  <Icon className="size-5" />
                </div>
                <p className="text-sm font-medium">Nothing waiting on you right now</p>
                <p className="text-sm text-muted-foreground">New requests reaching your stage will appear here first.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {queueRows.map((row) => (
                  <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{row.purpose}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" /> {row.origin} to {row.destination}
                        </span>
                        {row.event_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3.5" /> {row.event_date}
                          </span>
                        )}
                        <Badge variant={row.request_type === "nonregional" ? "outline" : "secondary"}>
                          {row.request_type === "nonregional" ? "Head Office" : "Regional"}
                        </Badge>
                        {row.reference_number && <Badge variant="secondary">{row.reference_number}</Badge>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/transport/${row.request_type === "nonregional" ? "nonregional" : "requests"}`}>
                        <FileText data-icon="inline-start" /> Preview and review
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isHrExecutive && (
          <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white"><Route className="size-5" /></div>
                <div>
                  <p className="font-semibold">Request Head Office transport</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your departmental request goes directly to the Managing Director, then Transport Manager for vehicle and driver allocation. It does not enter the HR Executive signing queue.</p>
                </div>
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700" asChild><Link href="/dashboard/transport/nonregional/new"><Plus data-icon="inline-start" /> New request</Link></Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const operationalRole = isDepartmentHead
    ? "Department Head"
    : isRegionalManager
      ? "Regional Manager"
      : isChiefDriver
        ? "Chief Driver"
      : isRegionalHr
        ? "Regional HR"
        : isTransportManager
          ? "Transport Manager"
          : isDriver
            ? "Driver"
            : "Transport Operations"

  const operationalSubtitle = isDepartmentHead
    ? "Raise Head Office requests, track MD approval, and see the assigned driver."
    : isRegionalManager
      ? "Review and download only transport requests within your assigned region."
      : isChiefDriver
        ? "Run your location's vehicle desk: request local support, assign approved local trips, and keep fleet condition current."
      : isRegionalHr
        ? "Create regional transport requests for your office. They go to the Regional Manager for endorsement, then the Managing Director for approval."
        : isRegionalDriver
          ? "Your assigned regional trips only — routes, meeting times, and departure details for your region."
          : isNonRegionalDriver
            ? "Your assigned Head Office trips — including Stores and Archives."
  : isChiefDriver
  ? "Your regional dispatch desk for local transport assignments, driver compliance, and trips awaiting dispatch."
  : isTransportManager
  ? "Nationwide view of approved and pending transport work — assign drivers, track fulfilment, and keep the fleet moving."
  : "Monitor transport requests, approvals, assignments, and compliance from one control surface."

  const scopeNote = scopeLabel
    ? `Scope: ${scopeLabel}`
    : isTransportManager || canManage
      ? "Scope: Nationwide"
      : isDepartmentHead || isNonRegionalStaff
        ? `Scope: ${isRegionalStaff ? (scopeLabel || requesterLocation || "Assigned regional or district location") : "Your Head Office requests"}`
        : "Scope: Assigned region"

  const operationalMetrics = isManagingDirector
    ? [
        { label: "Needs your approval", value: pendingCount, note: "Regional and Head Office requests", icon: Clock3, tone: "amber" as const },
        { label: "Regional approvals", value: regionalPendingCount, note: "Regional requests awaiting MD decision", icon: Bus, tone: "primary" as const },
        { label: "Head Office approvals", value: nonRegionalPendingCount, note: "Awaiting MD decision", icon: Route, tone: "primary" as const },
        { label: "Fleet nationwide", value: "Open", note: "View and manage the national vehicle register", icon: Truck, tone: "emerald" as const },
      ]
    : isDepartmentHead
    ? [
        { label: "My requests", value: totalCount, note: "Requests you raised", icon: Users, tone: "primary" as const },
        { label: "Awaiting MD", value: pendingCount, note: "Pending Managing Director decision", icon: Clock3, tone: "amber" as const },
        { label: "Approved", value: approvedCount, note: "Cleared for transport fulfilment", icon: CheckCircle2, tone: "emerald" as const },
        { label: "Driver assigned", value: assignedCount, note: "Trips with vehicle and driver set", icon: Navigation, tone: "slate" as const },
      ]
  : isNonRegionalStaff
      ? [
          { label: "My requests", value: totalCount, note: "Regional or district requests you submitted", icon: Inbox, tone: "primary" as const },
          { label: "Awaiting endorsement", value: pendingCount, note: "With your linked reviewer", icon: Clock3, tone: "amber" as const },
          { label: "Approved", value: approvedCount, note: "Cleared for transport fulfilment", icon: CheckCircle2, tone: "emerald" as const },
          { label: "Transport assigned", value: assignedCount, note: "Vehicle and driver allocated", icon: Route, tone: "slate" as const },
        ]
      : isRegionalManager || isRegionalHr || isChiefDriver || isRegionalStaff
      ? [
          { label: isChiefDriver ? "Ready to dispatch" : "Regional queue", value: pendingCount, note: isChiefDriver ? "Regional Manager-approved local trips" : "Items needing attention in your region", icon: Clock3, tone: "amber" as const },
          { label: "Region register", value: totalCount, note: "Requests limited to your regional office", icon: Bus, tone: "primary" as const },
          { label: isChiefDriver ? "Trips assigned" : "Approved / referenced", value: isChiefDriver ? assignedCount : approvedCount, note: isChiefDriver ? "Vehicle and driver allocated locally" : "Downloadable approved regional requests", icon: CheckCircle2, tone: "emerald" as const },
          { label: "Coverage", value: scopeLabel || "Assigned", note: "Location, district, or region only", icon: MapPin, tone: "slate" as const },
        ]
      : isRegionalOnlyWorkspace
        ? [
            { label: isChiefDriver ? "Ready to dispatch" : "Regional queue", value: pendingCount, note: isChiefDriver ? "Regional Manager-approved local trips" : "Items needing attention in your region", icon: Clock3, tone: "amber" as const },
            { label: "Region register", value: totalCount, note: "Requests limited to your regional or district scope", icon: Bus, tone: "primary" as const },
            { label: isChiefDriver ? "Trips assigned" : "Approved / referenced", value: isChiefDriver ? assignedCount : approvedCount, note: isChiefDriver ? "Vehicle and driver allocated locally" : "Approved regional requests", icon: CheckCircle2, tone: "emerald" as const },
            { label: "Coverage", value: scopeLabel || "Assigned", note: "Location, district, or region only", icon: MapPin, tone: "slate" as const },
          ]
      : isTransportManager || canManage
        ? [
            { label: "Nationwide requests", value: totalCount, note: "All regional and Head Office requests", icon: Inbox, tone: "primary" as const },
            { label: "Pending", value: pendingCount, note: "Awaiting the next action nationwide", icon: Clock3, tone: "amber" as const },
            { label: "Approved", value: approvedCount, note: "Cleared for transport fulfilment nationwide", icon: CheckCircle2, tone: "emerald" as const },
            { label: "Assigned", value: assignedCount, note: "Vehicle and driver allocated nationwide", icon: Route, tone: "slate" as const },
          ]
      : [
          { label: "Requests", value: totalCount, note: "Transport requests in your workspace", icon: Inbox, tone: "primary" as const },
          { label: "Pending", value: pendingCount, note: "Requests awaiting the next action", icon: Clock3, tone: "amber" as const },
          { label: "Approved", value: approvedCount, note: "Requests cleared for fulfilment", icon: CheckCircle2, tone: "emerald" as const },
          { label: "Assigned", value: assignedCount, note: "Trips with transport allocated", icon: Route, tone: "slate" as const },
        ]

  const modules = isRegionalOnlyWorkspace
    ? [
        {
          title: "Regional transport request",
          description: "Create a complete regional or district transport request for location-based review and approval.",
          icon: Bus,
          href: "/dashboard/transport/requests",
          cta: "Create regional request",
          badge: "Regional / District",
          onClick: () => setRequestOpen(true),
        },
      ]
    : isActingHod
      ? [
          {
            title: "Head Office requests",
            description: "Submit Head Office trips and track driver assignment.",
            icon: Route,
            href: "/dashboard/transport/nonregional",
            cta: "Open my trips",
            badge: "HOD",
          },
        ]
      : isRegionalDriver
        ? [
            {
              title: "My regional trips",
              description: "View only the regional transport trips assigned to you.",
              icon: Bus,
              href: "/dashboard/transport/requests",
              cta: "Open my trips",
              badge: "Regional",
            },
          ]
        : isNonRegionalDriver
          ? [
              {
                title: "My Head Office trips",
                description: "Track your assigned Head Office trips.",
                icon: Route,
                href: "/dashboard/transport/nonregional",
                cta: "Open my trips",
                badge: "Driver",
              },
            ]
          : isNonRegionalLocation
            ? [
                {
                  title: "Head Office request register",
                  description: "View and track transport requests for your Head Office location.",
                  icon: Route,
                  href: "/dashboard/transport/nonregional",
                  cta: "Open Head Office register",
                  badge: "Head Office",
                },
              ]
            : isTransportManager || canManage
            ? [
                {
                  title: "Nationwide request board",
                  description: "See every regional and Head Office transport request, nationwide.",
                  icon: Bus,
                  href: "/dashboard/transport/requests",
                  cta: "Open national board",
                  badge: "National",
                },
                {
                  title: "Driver licenses",
                  description: "View and manage the full nationwide driver license register.",
                  icon: IdCard,
                  href: "/dashboard/transport/drivers",
                  cta: "Open driver register",
                  badge: "National",
                },
                {
                  title: "Fleet management",
                  description: "View and manage the full nationwide vehicle fleet.",
                  icon: Truck,
                  href: "/dashboard/transport/fleet",
                  cta: "Open fleet register",
                  badge: "National",
                },
                {
                  title: "Head Office requests",
                  description: "Review and track all Head Office transport requisitions.",
                  icon: Route,
                  href: "/dashboard/transport/nonregional",
                  cta: "Open Head Office requests",
                  badge: "National",
                },
              ]
            : [
                {
                  title: "Regional request register",
                  description: "View transport requests within your assigned regional or district scope.",
                  icon: Bus,
                  href: "/dashboard/transport/requests",
                  cta: "Open regional register",
                  badge: "Regional",
                },
              ]

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-card to-card shadow-sm">
        <div className="relative flex flex-col gap-5 border-b border-primary/15 p-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Truck className="size-7" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">QCC Transport Control</p>
                <Badge variant="secondary" className="font-medium">
                  {operationalRole}
                </Badge>
                <Badge variant="outline" className="border-primary/25 bg-background/70 text-xs font-normal">
                  {scopeNote}
                </Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">Transport Management Console</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">{operationalSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 [&_a]:shadow-sm">
            {!isDepartmentHead && (
              <Button variant="outline" className="bg-background/80" asChild>
                <Link href="/dashboard/transport/requests">
                  <Inbox data-icon="inline-start" /> View requests
                </Link>
              </Button>
            )}
            {(isActingHod || isTransportManager || canManage) && !isRegionalOnlyWorkspace && (
              <Button variant="outline" className="bg-background/80" asChild>
                <Link href="/dashboard/transport/nonregional">
                  <Route data-icon="inline-start" /> Head Office
                </Link>
              </Button>
            )}
            {(isTransportManager || canManage) && (
              <>
                <Button variant="outline" className="bg-background/80" asChild>
                  <Link href="/dashboard/transport/drivers">
                    <IdCard data-icon="inline-start" /> Drivers
                  </Link>
                </Button>
                <Button variant="outline" className="bg-background/80" asChild>
                  <Link href="/dashboard/transport/fleet">
                    <Truck data-icon="inline-start" /> Fleet
                  </Link>
                </Button>
              </>
            )}

          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${operationalRole} transport metrics`}>
        {operationalMetrics.map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
      </section>

      {isManagingDirector && (
        <nav className="grid gap-2 rounded-2xl border border-primary/20 bg-muted/30 p-2 sm:grid-cols-3" aria-label="Managing Director transport workspace">
          <Link href="/dashboard/transport/requests" className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5">
            <span>Regional approvals</span>
            <Badge variant="secondary">{regionalPendingCount}</Badge>
          </Link>
          <Link href="/dashboard/transport/nonregional" className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5">
            <span>Head Office approvals</span>
            <Badge variant="secondary">{nonRegionalPendingCount}</Badge>
          </Link>
          <Link href="/dashboard/transport/fleet" className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5">
            <span>Nationwide fleet</span>
            <Badge variant="secondary">View all</Badge>
          </Link>
        </nav>
      )}

      {isDepartmentHead && (
        <nav className="grid gap-2 rounded-2xl border border-primary/20 bg-muted/30 p-2 sm:grid-cols-2" aria-label="Department Head transport workspace">
          <Link href="/dashboard/transport/nonregional" className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5">
            <span>HOD authorization queue</span>
            <Badge variant="secondary">{pendingCount}</Badge>
          </Link>
          <Link href="/dashboard/transport/nonregional/new" className="flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5">
            <span>New Head Office request</span>
            <Plus className="size-4 text-muted-foreground" />
          </Link>
        </nav>
      )}

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Transport workspace">
        {modules.map((module) => (
          <ModuleCard key={module.title} {...module} />
        ))}
      </section>

      {(isRegionalHr || isRegionalManager) && (
        <Card className="border-amber-500/20 bg-amber-500/[0.04]">
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Activity className="size-5" />
              </div>
              <div>
                <p className="font-medium">Regional visibility lock</p>
                <p className="text-sm text-muted-foreground">
                  You only see transport requests for {scopeLabel || "your assigned region"}. Approved regional requests can be downloaded from the register; other regions stay hidden.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/transport/requests">Open scoped register</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isDepartmentHead && (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Navigation className="size-5" />
              </div>
              <div>
                <p className="font-medium">Driver assignment tracker</p>
                <p className="text-sm text-muted-foreground">
                  After MD approval, Transport Manager assigns a location driver. Open Head Office to see the driver, vehicle and meeting time.
                </p>
              </div>
            </div>
            <Button size="sm" asChild>
              <Link href="/dashboard/transport/nonregional">Track assignments</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={hodRequiredOpen} onOpenChange={setHodRequiredOpen}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Department Head linkage required</DialogTitle>
        <DialogDescription>
          You cannot submit a Head Office transport request yet because no Department Head is linked to your profile for endorsement.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-foreground">
        Please contact your Department Head or HR Records team and ask them to link you to the appropriate Department Head. Once the linkage is completed, you will be able to submit and track your transport request here.
      </div>
      <DialogFooter>
        <Button type="button" onClick={() => setHodRequiredOpen(false)}>Understood</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[min(1100px,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto p-4 sm:w-[calc(100vw-2rem)] sm:max-w-[min(1100px,calc(100vw-2rem))] sm:p-6">
          <DialogHeader>
            <DialogTitle>{isHeadOfficeRequester ? "New Head Office transport request" : "New regional transport request"}</DialogTitle>
            <DialogDescription>
              {isHeadOfficeRequester
                ? isDepartmentHead
                  ? "Complete the transport requisition. Your Department Head authorization is required before Managing Director review."
                  : "Complete the transport requisition. It will follow the Regional HR, District Officer, Regional Manager, and Managing Director workflow."
                : isRegionalHr
                ? "Complete the regional requisition and select whether the request is for transport within your region or support from Head Office."
                : isRegionalStaff
                ? "Complete the digital regional requisition. Regional HR will review the request and determine the appropriate transport route."
                : "Complete the digital regional requisition. The selected route determines the next approval desk after Regional Manager endorsement."}
            </DialogDescription>
          </DialogHeader>
          <form className="flex min-w-0 flex-col gap-4" onSubmit={handleRequestSubmit}>
            <div className={`grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4 ${isHeadOfficeRequester ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Requester</p>
                <p className="mt-1 font-medium">{requesterName || "Authenticated user"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Department</p>
                <p className="mt-1 font-medium">{requesterDepartment || "Department profile"}</p>
              </div>
              {isHeadOfficeRequester && isDepartmentHead && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Authorization</p>
                  <p className="mt-1 font-medium text-primary">Department Head signature required</p>
                </div>
              )}
            </div>
              {regionalRouteRequired && (
                <div className="grid gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
                  <Label htmlFor="regional-route">Request type</Label>
                  <select
                    id="regional-route"
                    name="regionalRoute"
                    required
                    defaultValue="local_regional"
                    className="h-10 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="local_regional">Within-region transport — Regional Manager then Regional Chief Driver</option>
                    <option value="head_office">Head Office transport support — Regional Manager then Managing Director</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Within-region requests go to the Regional Chief Driver after Regional Manager endorsement. Head Office support requests go to the Managing Director after endorsement.
                  </p>
                </div>
              )}
            <div className="grid gap-2">
              <Label htmlFor="transport-purpose">Purpose</Label>
              <Input id="transport-purpose" name="purpose" required placeholder="Staff bus, official travel, funeral, or programme" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="transport-origin">Origin</Label>
                <Input
                  id="transport-origin"
                  name="origin"
                  required
                  defaultValue={requesterLocation}
                  placeholder="Departure location"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transport-destination">Destination</Label>
                <Input id="transport-destination" name="destination" required placeholder="Destination" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="transport-date">Date and time required</Label>
                <Input id="transport-date" name="eventDate" required type="datetime-local" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transport-return">Date and time of return</Label>
                <Input id="transport-return" name="returnDate" type="datetime-local" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transport-passengers">Number of passengers</Label>
                <Input id="transport-passengers" name="passengerCount" required min="1" step="1" type="number" defaultValue="1" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transport-passenger-names">Names of people requiring transport</Label>
              <Textarea
                id="transport-passenger-names"
                name="personNames"
                required
                placeholder="Enter names separated by commas or new lines"
              />
              <p className="text-xs text-muted-foreground">Enter at least one name. The number of names must not exceed the passenger count.</p>
            </div>
            <div className="grid gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm font-semibold">Transport use only</p>
              <p className="text-xs text-muted-foreground">Recommended vehicle, driver, and final sign-off will be completed by Transport Management after MD approval.</p>
            </div>
            {(!isHeadOfficeRequester || !isDepartmentHead) && (
              <div className="grid gap-2">
                <Label htmlFor="transport-documents">Supporting documents</Label>
                <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <Input id="transport-documents" name="supportingDocuments" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="min-w-0 max-w-full cursor-pointer border-0 p-0 shadow-none" />
                </div>
                <p className="text-xs text-muted-foreground">Attach approval letters, programme schedules, quotations, or other evidence. PDF, JPG, and PNG up to 5 MB each.</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Submit request</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
