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
}: {
  title: string
  description: string
  href: string
  icon: typeof Bus
  cta: string
  badge?: string
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
          <Link href={href}>
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
}: TransportWorkspaceProps) {
  const normalizedRole = role.toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isManagingDirector = ["managing_director", "director"].includes(normalizedRole)
  const isHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const isRegionalHr = ["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)
  const isDriver = ["driver", "drivers"].includes(normalizedRole)
  const canManage = ["admin", "administrator", "it_admin", "it_admin_role"].includes(normalizedRole)
  const isDepartmentHead = normalizedRole === "department_head"
  const isTransportManager = normalizedRole === "transport_manager"
  const isChiefDriver = isChiefDriverRole(normalizedRole)
  const isRegionalManager = isRegionalManagerRole(normalizedRole)
  const canCreateRequest = isChiefDriver || isRegionalHr || isDepartmentHead
  const canViewDriverLicense = isChiefDriver || isRegionalHr || isRegionalManager || isDriver || isTransportManager || canManage
  const canManageFleet = isManagingDirector || isChiefDriver || isRegionalHr || isRegionalManager || isTransportManager || canManage
  const [requestOpen, setRequestOpen] = useState(false)
  const router = useRouter()

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
    const isNonRegionalRequester = isDepartmentHead
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
              personsRequiringTransport: form.get("passengerCount"),
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
      description: isDepartmentHead
        ? "Your non-regional requisition is awaiting Managing Director approval."
        : "Your regional request was sent to the Regional Manager for endorsement, then the Managing Director for approval.",
    })
    router.push(isDepartmentHead ? "/dashboard/transport/nonregional" : "/dashboard/transport/requests")
    router.refresh()
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
      ? "Regional and non-regional transport requests are separated below. Preview the correct request before approving it."
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
                  <Route data-icon="inline-start" /> New non-regional trip
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
                    <p className="text-xs text-muted-foreground">Non-regional requests</p>
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
                  ? "Regional and non-regional requests are clearly labeled before you approve."
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
                          {row.request_type === "nonregional" ? "Non-regional" : "Regional"}
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
                  <p className="font-semibold">Request non-regional transport</p>
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
    ? "Raise non-regional requisitions, track MD approval, and see which driver has been assigned to each trip."
    : isRegionalManager
      ? "Review and download only transport requests within your assigned region."
      : isChiefDriver
        ? "Run your location's vehicle desk: request local support, assign approved local trips, and keep fleet condition current."
      : isRegionalHr
        ? "Create regional transport requests for your office. They go to the Regional Manager for endorsement, then the Managing Director for approval."
        : isTransportManager
          ? "Nationwide view of approved and pending transport work — assign drivers, track fulfilment, and keep the fleet moving."
          : "Monitor transport requests, approvals, assignments, and compliance from one control surface."

  const scopeNote = scopeLabel
    ? `Scope: ${scopeLabel}`
    : isTransportManager || canManage
      ? "Scope: Nationwide"
      : isDepartmentHead
        ? "Scope: Your non-regional requests"
        : "Scope: Assigned region"

  const operationalMetrics = isManagingDirector
    ? [
        { label: "Needs your approval", value: pendingCount, note: "Regional and HOD-cleared non-regional requests", icon: Clock3, tone: "amber" as const },
        { label: "Regional approvals", value: regionalPendingCount, note: "Regional requests awaiting MD decision", icon: Bus, tone: "primary" as const },
        { label: "Non-regional approvals", value: nonRegionalPendingCount, note: "HOD-cleared trips awaiting MD decision", icon: Route, tone: "primary" as const },
        { label: "Fleet nationwide", value: "Open", note: "View and manage the national vehicle register", icon: Truck, tone: "emerald" as const },
      ]
    : isDepartmentHead
    ? [
        { label: "My requests", value: totalCount, note: "Non-regional requisitions you raised", icon: Users, tone: "primary" as const },
        { label: "Awaiting MD", value: pendingCount, note: "Pending Managing Director decision", icon: Clock3, tone: "amber" as const },
        { label: "Approved", value: approvedCount, note: "Cleared for transport fulfilment", icon: CheckCircle2, tone: "emerald" as const },
        { label: "Driver assigned", value: assignedCount, note: "Trips with vehicle and driver set", icon: Navigation, tone: "slate" as const },
      ]
    : isRegionalManager || isRegionalHr || isChiefDriver
      ? [
          { label: isChiefDriver ? "Ready to dispatch" : "Regional queue", value: pendingCount, note: isChiefDriver ? "Regional Manager-approved local trips" : "Items needing attention in your region", icon: Clock3, tone: "amber" as const },
          { label: "Region register", value: totalCount, note: "Requests limited to your regional office", icon: Bus, tone: "primary" as const },
          { label: isChiefDriver ? "Trips assigned" : "Approved / referenced", value: isChiefDriver ? assignedCount : approvedCount, note: isChiefDriver ? "Vehicle and driver allocated locally" : "Downloadable approved regional requests", icon: CheckCircle2, tone: "emerald" as const },
          { label: "Coverage", value: scopeLabel || "Assigned", note: "Location, district, or region only", icon: MapPin, tone: "slate" as const },
        ]
      : isTransportManager
        ? [
            { label: "All requests", value: totalCount, note: "Approved and not-yet-approved nationwide", icon: Truck, tone: "primary" as const },
            { label: "Needs action", value: pendingCount, note: "Assignment or fulfilment backlog", icon: Clock3, tone: "amber" as const },
            { label: "Approved stream", value: approvedCount, note: "Ready or completed fulfilment", icon: CheckCircle2, tone: "emerald" as const },
            { label: "Control level", value: "National", note: "Full transport operations desk", icon: ShieldCheck, tone: "slate" as const },
          ]
        : [
            { label: "Open requests", value: totalCount, note: "Transport requests in register", icon: Bus, tone: "primary" as const },
            { label: "Needs attention", value: pendingCount, note: "Requests requiring action", icon: Clock3, tone: "amber" as const },
            { label: "Fleet readiness", value: "Active", note: "Driver and vehicle operations", icon: CheckCircle2, tone: "emerald" as const },
            { label: "Control level", value: "Operational", note: "Managed transport workspace", icon: ShieldCheck, tone: "slate" as const },
          ]

  const modules = [
    ...(isDepartmentHead
      ? [
          {
            title: "Non-regional requisitions",
            description: "Submit Head Office / Stores / Archives trips and track driver assignment live.",
            icon: Route,
            href: "/dashboard/transport/nonregional",
            cta: "Open my trips",
            badge: "HOD",
          },
        ]
      : [
          {
            title: isTransportManager ? "Nationwide request board" : isChiefDriver ? "Local dispatch register" : "Regional request register",
            description: isTransportManager
              ? "See every approved and pending transport request across regions and non-regional desks."
              : isChiefDriver
                ? "Submit local trips for Regional Manager approval and dispatch approved work to regional vehicles and drivers."
              : "View only your regional transport requests. Download approved regional memos from the register.",
            icon: Bus,
            href: "/dashboard/transport/requests",
            cta: isTransportManager ? "Open national board" : isChiefDriver ? "Open dispatch desk" : "Open regional register",
            badge: isTransportManager ? "National" : isChiefDriver ? "Local fleet" : "Regional",
          },
        ]),
    ...(isManagingDirector
      ? [
          {
            title: "Executive approval desk",
            description: `Handle ${regionalPendingCount} regional and ${nonRegionalPendingCount} HOD-cleared non-regional requests awaiting your decision.`,
            icon: ShieldCheck,
            href: "/dashboard/transport/requests",
            cta: "Open approval tabs",
            badge: `${pendingCount} pending`,
          },
        ]
      : []),
    {
    title: isDepartmentHead ? "New non-regional trip" : "Approval & fulfilment queues",
      description: isDepartmentHead
        ? "Create a digital requisition with HOD authorization for Managing Director review."
        : "Review work routed to Regional HR, Regional Managers, HR Records, MD, and Transport.",
      icon: Inbox,
      href: isDepartmentHead ? "/dashboard/transport/nonregional/new" : "/dashboard/transport/requests",
    cta: isDepartmentHead ? "Create requisition" : "Open queues",
    badge: isDepartmentHead ? "Create" : undefined,
    },
    ...(canViewDriverLicense
      ? [
          {
            title: "Driver licenses",
            description: "Monitor expiry dates and keep expired or suspended drivers out of assignments.",
            icon: IdCard,
            href: "/dashboard/transport/drivers",
            cta: "Open driver desk",
            badge: undefined as string | undefined,
          },
        ]
      : []),
    ...(canManageFleet
      ? [
          {
            title: isManagingDirector ? "Nationwide fleet inventory" : "Fleet inventory",
            description: isManagingDirector ? "View every vehicle nationwide, location, type, capacity, compliance, and reservations." : "Register vehicles, track capacity and compliance, and monitor active reservations.",
            icon: Truck,
            href: "/dashboard/transport/fleet",
            cta: "Open fleet desk",
            badge: "Operations",
          },
        ]
      : []),
    ...((isTransportManager || canManage || isHrExecutive) && !isDepartmentHead
      ? [
          {
            title: "Non-regional fulfilment",
            description: "Assign location drivers to MD-approved Head Office, Awutu, and Nsawam trips.",
            icon: Navigation,
            href: "/dashboard/transport/nonregional",
            cta: "Open non-regional",
            badge: "Fulfilment",
          },
        ]
      : []),
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
            {(isDepartmentHead || isTransportManager || canManage) && (
              <Button variant="outline" className="bg-background/80" asChild>
                <Link href="/dashboard/transport/nonregional">
                  <Route data-icon="inline-start" /> Non-regional
                </Link>
              </Button>
            )}
            {canCreateRequest && (
              <Button onClick={() => setRequestOpen(true)}>
                <Plus data-icon="inline-start" /> {isDepartmentHead ? "New non-regional trip" : "New regional request"}
              </Button>
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
            <span>Non-regional approvals</span>
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
            <span>New non-regional requisition</span>
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
                  After MD approval, Transport Manager assigns a location driver. Open Non-regional to see driver name, vehicle, and meet time on each trip card.
                </p>
              </div>
            </div>
            <Button size="sm" asChild>
              <Link href="/dashboard/transport/nonregional">Track assignments</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isDepartmentHead ? "New non-regional transport request" : "New regional transport request"}</DialogTitle>
            <DialogDescription>
              {isDepartmentHead
                ? "Complete the digital requisition. Your Department Head authorization is required before Managing Director review."
                : "Complete the digital requisition. Regional HR Office or Chief Driver submits to the Regional Manager for endorsement, then the Managing Director for approval."}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleRequestSubmit}>
            <div className={`grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4 ${isDepartmentHead ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Requester</p>
                <p className="mt-1 font-medium">{requesterName || "Authenticated user"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Department</p>
                <p className="mt-1 font-medium">{requesterDepartment || "Department profile"}</p>
              </div>
              {isDepartmentHead && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Authorization</p>
                  <p className="mt-1 font-medium text-primary">Department Head signature required</p>
                </div>
              )}
            </div>
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
                <Label htmlFor="transport-passengers">Passengers</Label>
                <Input id="transport-passengers" name="passengerCount" required min="1" type="number" />
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border border-dashed p-4">
              <p className="text-sm font-semibold">Transport use only</p>
              <p className="text-xs text-muted-foreground">Recommended vehicle, driver, and final sign-off will be completed by Transport Management after MD approval.</p>
            </div>
            {!isDepartmentHead && (
              <div className="grid gap-2">
                <Label htmlFor="transport-documents">Supporting documents</Label>
                <div className="flex items-center gap-2 rounded-md border border-dashed p-3">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <Input id="transport-documents" name="supportingDocuments" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="cursor-pointer border-0 p-0 shadow-none" />
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
