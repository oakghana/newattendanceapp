"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Activity, ArrowRight, ArrowUpRight, Bus, CalendarDays, CheckCircle2, Clock3, FileSignature, FileText, IdCard, Inbox, MapPin, Paperclip, Plus, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { isRegionalManagerRole, NON_REGIONAL_TRANSPORT_LOCATIONS } from "@/lib/role-capabilities"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const modules = [
  { title: "Transport requests", description: "Create and track staff bus, official travel, funeral, and programme requests.", icon: Bus, href: "/dashboard/transport" },
  { title: "Approval queues", description: "Review requests routed to Regional HR, Regional Managers, HR Records, and management.", icon: Inbox, href: "/dashboard/transport/requests" },
  { title: "Driver licenses", description: "Monitor expiry dates and keep expired or suspended drivers out of assignments.", icon: IdCard, href: "/dashboard/transport/drivers", editableFor: "driver" },

]

type QueueRow = { id: string; purpose: string; origin: string; destination: string; event_date: string | null; reference_number: string | null; request_type?: "regional" | "nonregional" }

type TransportWorkspaceProps = {
  role: string
  pendingCount?: number
  totalCount?: number
  queueRows?: QueueRow[]
  regionalPendingCount?: number
  nonRegionalPendingCount?: number
  requesterName?: string
  requesterDepartment?: string
  requesterLocation?: string
}

export function TransportWorkspace({ role, pendingCount = 0, totalCount = 0, queueRows = [], regionalPendingCount = 0, nonRegionalPendingCount = 0, requesterName = "", requesterDepartment = "", requesterLocation = "" }: TransportWorkspaceProps) {
  const normalizedRole = role.toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isManagingDirector = ["managing_director", "director"].includes(normalizedRole)
  const isHrExecutive = ["hr", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(normalizedRole)
  const isRegionalHr = ["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)
  const isDriver = ["driver", "drivers"].includes(normalizedRole)
  const canManage = ["admin", "administrator", "it_admin", "it_admin_role", "regional_manager", "transport_manager"].includes(normalizedRole)
  const isDepartmentHead = normalizedRole === "department_head"
  const isTransportManager = normalizedRole === "transport_manager"
  const canCreateRequest = isRegionalHr || isDepartmentHead || isHrExecutive
  const isRegionalManager = isRegionalManagerRole(normalizedRole)
  const canEditDriverLicense = isRegionalHr || isTransportManager
  const canViewDriverLicense = isRegionalHr || isRegionalManager || isDriver || isTransportManager || canManage
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
    const approvedLocation = NON_REGIONAL_TRANSPORT_LOCATIONS.includes(submittedLocation as (typeof NON_REGIONAL_TRANSPORT_LOCATIONS)[number]) ? submittedLocation : NON_REGIONAL_TRANSPORT_LOCATIONS[0]
    const response = await fetch(isNonRegionalRequester ? "/api/transport/nonregional" : "/api/transport/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isNonRegionalRequester ? { requisitionDate: form.get("eventDate"), department: requesterDepartment, location: approvedLocation, origin: form.get("origin"), destination: form.get("destination"), requiredAt: form.get("eventDate"), returnAt: form.get("returnDate"), personsRequiringTransport: form.get("passengerCount"), purpose: form.get("purpose"), hodAuthorization: requesterName } : { purpose: form.get("purpose"), origin: form.get("origin"), destination: form.get("destination"), eventDate: form.get("eventDate"), passengerCount: form.get("passengerCount"), supportingDocuments: documents }) })
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      toast({ title: "Unable to submit request", description: errorBody?.error ?? "The request could not be saved. Please try again.", variant: "destructive", duration: 6000 })
      return
    }
    setRequestOpen(false)
    toast({ title: "Transport request submitted", description: isDepartmentHead || isHrExecutive ? "Your non-regional requisition is now awaiting Managing Director approval." : "Regional HR will route your request to the Regional Manager for endorsement." })
    router.push("/dashboard/transport/requests")
    router.refresh()
  }
  function openRequestForm() {
    setRequestOpen(true)
  }

  if (isManagingDirector || isHrExecutive) {
    const accentClass = isManagingDirector ? "text-primary" : "text-accent"
    const accentBg = isManagingDirector ? "bg-primary/10" : "bg-accent/10"
    const accentBorder = isManagingDirector ? "border-primary/20" : "border-accent/25"
    const accentTint = isManagingDirector ? "bg-primary/[0.03]" : "bg-accent/[0.04]"
    const Icon = isManagingDirector ? ShieldCheck : FileSignature
    const officeLabel = isManagingDirector ? "Office of the Managing Director" : "HR Executive Office"
    const deskTitle = isManagingDirector ? "Transport approval desk" : "Memo signing desk"
    const deskDescription = isManagingDirector ? "Regional and non-regional transport requests are separated below. Preview the correct request before approving it." : "Regional transport requests approved by the Managing Director are ready for your rejoinder memo and signature. Signed memos are released to the region and Transport Manager for vehicle assignment."
    const actionLabel = isManagingDirector ? "Open approval desk" : "Open signing desk"
    const pendingLabel = isManagingDirector ? "Awaiting your approval" : "Awaiting your signature"

    return (
      <div className="flex min-w-0 flex-col gap-6">
        <header className={`overflow-hidden rounded-xl border ${accentBorder} ${accentTint}`}>
          <div className="flex flex-col gap-5 border-b border-border/60 bg-background/70 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${accentBg} ${accentClass}`}><Icon className="size-6" /></div>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${accentClass}`}>{officeLabel}</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{deskTitle}</h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{deskDescription}</p>
              </div>
            </div>
            <Button size="lg" asChild><Link href="/dashboard/transport/requests"><Icon data-icon="inline-start" /> {actionLabel}</Link></Button>
          </div>
          <div className="grid gap-px bg-border/60 sm:grid-cols-4">
            <div className="flex items-center gap-3 bg-background p-5"><div className={`flex size-9 items-center justify-center rounded-lg ${accentBg} ${accentClass}`}><Clock3 className="size-4" /></div><div><p className="text-2xl font-semibold tracking-tight">{pendingCount}</p><p className="text-xs text-muted-foreground">{pendingLabel}</p></div></div>
            <div className="flex items-center gap-3 bg-background p-5"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Inbox className="size-4" /></div><div><p className="text-2xl font-semibold tracking-tight">{totalCount}</p><p className="text-xs text-muted-foreground">Total requests in the register</p></div></div>
            {isManagingDirector && <div className="flex items-center gap-3 bg-background p-5"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Bus className="size-4" /></div><div><p className="text-2xl font-semibold tracking-tight">{regionalPendingCount}</p><p className="text-xs text-muted-foreground">Regional requests</p></div></div>}{isManagingDirector && <div className="flex items-center gap-3 bg-background p-5"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4" /></div><div><p className="text-2xl font-semibold tracking-tight">{nonRegionalPendingCount}</p><p className="text-xs text-muted-foreground">Non-regional requests</p></div></div>}{!isManagingDirector && <div className="flex items-center gap-3 bg-background p-5"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ShieldCheck className="size-4" /></div><div><p className="text-sm font-semibold">Approved by the Managing Director</p><p className="text-xs text-muted-foreground">MD-approved requests awaiting rejoinder signature</p></div></div>}
          </div>
        </header>

        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b bg-muted/20">
            <div><CardTitle>{isManagingDirector ? "Approval queue" : "Signing queue"}</CardTitle><CardDescription>{isManagingDirector ? "Regional and non-regional requests are clearly labeled before you approve." : "Preview every approved transport request and memo before signing."}</CardDescription></div>
            <Button variant="outline" size="sm" asChild><Link href="/dashboard/transport/requests">View all<ArrowRight data-icon="inline-end" /></Link></Button>
          </CardHeader>
          <CardContent className="p-0">
            {queueRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center"><div className={`flex size-10 items-center justify-center rounded-full ${accentBg} ${accentClass}`}><Icon className="size-5" /></div><p className="text-sm font-medium">Nothing waiting on you right now</p><p className="text-sm text-muted-foreground">New requests reaching your stage will appear here first.</p></div>
            ) : (
              <ul className="divide-y">
                {queueRows.map((row) => (
                  <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{row.purpose}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {row.origin} to {row.destination}</span>
                        {row.event_date && <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> {row.event_date}</span>}
                        <Badge variant={row.request_type === "nonregional" ? "outline" : "secondary"}>{row.request_type === "nonregional" ? "Non-regional" : "Regional"}</Badge>{row.reference_number && <Badge variant="secondary">{row.reference_number}</Badge>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild><Link href={`/dashboard/transport/${row.request_type === "nonregional" ? "nonregional" : "requests"}`}><FileText data-icon="inline-start" /> Preview and review</Link></Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const operationalRole = isDepartmentHead ? "Department Head" : isRegionalManager ? "Regional Manager" : isTransportManager ? "Transport Manager" : "Transport Operations"
  const operationalSubtitle = isDepartmentHead ? "Monitor departmental transport requests and endorsements." : isRegionalManager ? "Review endorsed regional requests within your assigned scope." : isTransportManager ? "Coordinate transport fulfilment, fleet readiness, and request delivery." : "Monitor transport requests, approvals, and compliance."
  const operationalMetrics = isDepartmentHead ? [{ label: "Department requests", value: totalCount, note: "Requests raised by your department", icon: Users }, { label: "Awaiting endorsement", value: pendingCount, note: "Items requiring your review", icon: Clock3 }, { label: "Approved requests", value: Math.max(totalCount - pendingCount, 0), note: "Cleared for next workflow stage", icon: CheckCircle2 }, { label: "Workflow ownership", value: "HOD", note: "Departmental request gate", icon: ShieldCheck }] : isRegionalManager ? [{ label: "Regional queue", value: pendingCount, note: "Endorsed requests in your scope", icon: Clock3 }, { label: "Requests in register", value: totalCount, note: "Location-scoped transport records", icon: Bus }, { label: "Approval stage", value: "Regional", note: "Only regional manager actions", icon: ShieldCheck }, { label: "Scope control", value: "Assigned", note: "Location, district, or region", icon: Activity }] : [{ label: "Open requests", value: totalCount, note: "Transport requests in register", icon: Bus }, { label: "Needs attention", value: pendingCount, note: "Requests requiring action", icon: Clock3 }, { label: "Fleet readiness", value: "Active", note: "Driver and vehicle operations", icon: CheckCircle2 }, { label: "Control level", value: "Operational", note: "Managed transport workspace", icon: ShieldCheck }]

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bus /></div>
            <div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">QCC Transport Control</p><h1 className="text-3xl font-semibold tracking-tight text-balance">{operationalRole} portal</h1>
              <p className="text-muted-foreground leading-6">{operationalSubtitle}</p></div>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">Transport operations</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/dashboard/transport/requests"><Inbox data-icon="inline-start" /> View requests</Link></Button>{(isDepartmentHead || isHrExecutive || isTransportManager) && <Button variant="outline" asChild><Link href="/dashboard/transport/nonregional"><Inbox data-icon="inline-start" /> Non-regional requisitions</Link></Button>}
          {canCreateRequest && <Button onClick={openRequestForm} title="Create a regional transport request">
            <Plus data-icon="inline-start" /> New transport request
          </Button>}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${operationalRole} transport metrics`}>
        {operationalMetrics.map(({ label, value, note, icon: MetricIcon }) => <Card key={label} className="overflow-hidden"><CardContent className="flex items-start justify-between gap-3 p-4"><div className="flex flex-col gap-1"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="text-xs leading-5 text-muted-foreground">{note}</p></div><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MetricIcon /></div></CardContent></Card>)}
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Transport modules">
        {modules.map(({ title, description, icon: Icon, href, editableFor }) => {
          const workspaceCanWrite = editableFor === "driver" ? canViewDriverLicense : title === "Transport requests" ? (canCreateRequest || canManage) : canManage
          return (
          <Card key={title} className="transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm">
            <CardHeader className="gap-3 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon /></div>
                <ShieldCheck className="text-muted-foreground" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1"><CardTitle className="text-base">{title}</CardTitle><CardDescription className="text-sm leading-5">{description}</CardDescription></div>
                <ArrowUpRight className="mt-0.5 shrink-0 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {title === "Transport requests" ? <Button size="sm" variant="default" asChild><Link href="/dashboard/transport/requests">View all requests</Link></Button> : <Button size="sm" variant={workspaceCanWrite ? "default" : "outline"} disabled={!workspaceCanWrite} asChild={workspaceCanWrite} title={workspaceCanWrite ? "Open transport workspace" : "Read-only access"}>{workspaceCanWrite ? <Link href={href}>Open workspace</Link> : "Read-only access"}</Button>}
            </CardContent>
          </Card>
          )
        })}
      </section>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New transport request</DialogTitle>
            <DialogDescription>{isDepartmentHead ? "Complete the digital requisition. Your Department Head authorization is required before Managing Director review." : "Complete the digital requisition. Regional HR will route it to the Regional Manager for endorsement."}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleRequestSubmit}>
              <div className={`grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4 ${isDepartmentHead ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}><div><p className="text-xs font-medium text-muted-foreground">Requester</p><p className="mt-1 font-medium">{requesterName || "Authenticated user"}</p></div><div><p className="text-xs font-medium text-muted-foreground">Department</p><p className="mt-1 font-medium">{requesterDepartment || "Department profile"}</p></div>{isDepartmentHead && <div><p className="text-xs font-medium text-muted-foreground">Authorization</p><p className="mt-1 font-medium text-primary">Department Head signature required</p></div>}</div>
              <div className="grid gap-2"><Label htmlFor="transport-purpose">Purpose</Label><Input id="transport-purpose" name="purpose" required placeholder="Staff bus, official travel, funeral, or programme" /></div>
              <div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="transport-origin">Origin</Label><Input id="transport-origin" name="origin" required placeholder="Departure location" /></div><div className="grid gap-2"><Label htmlFor="transport-destination">Destination</Label><Input id="transport-destination" name="destination" required placeholder="Destination" /></div></div>
              <div className="grid gap-2 sm:grid-cols-3"><div className="grid gap-2"><Label htmlFor="transport-date">Date and time required</Label><Input id="transport-date" name="eventDate" required type="datetime-local" /></div><div className="grid gap-2"><Label htmlFor="transport-return">Date and time of return</Label><Input id="transport-return" name="returnDate" type="datetime-local" /></div><div className="grid gap-2"><Label htmlFor="transport-passengers">Passengers</Label><Input id="transport-passengers" name="passengerCount" required min="1" type="number" /></div></div>
              <div className="grid gap-2 rounded-lg border border-dashed p-4"><p className="text-sm font-semibold">Transport use only</p><p className="text-xs text-muted-foreground">Recommended vehicle, driver, and final sign-off will be completed by Transport Management after MD approval.</p></div><div className="grid gap-2"><Label htmlFor="transport-documents">Supporting documents</Label><div className="flex items-center gap-2 rounded-md border border-dashed p-3"><Paperclip className="size-4 text-muted-foreground" /><Input id="transport-documents" name="supportingDocuments" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="cursor-pointer border-0 p-0 shadow-none" /></div><p className="text-xs text-muted-foreground">Attach approval letters, programme schedules, quotations, or other evidence. PDF, JPG, and PNG up to 5 MB each.</p></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit">Submit request</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
