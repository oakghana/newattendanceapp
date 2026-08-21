"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Bus, FileText, IdCard, Inbox, Paperclip, Plus, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { isRegionalManagerRole } from "@/lib/role-capabilities"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const modules = [
  { title: "Transport requests", description: "Create and track staff bus, official travel, funeral, and programme requests.", icon: Bus, href: "/dashboard/transport" },
  { title: "Approval queues", description: "Review requests routed to Regional HR, Regional Managers, HR Records, and management.", icon: Inbox, href: "/dashboard/transport/requests" },
  { title: "Driver licenses", description: "Monitor expiry dates and keep expired or suspended drivers out of assignments.", icon: IdCard, href: "/dashboard/transport/drivers", editableFor: "driver" },
  { title: "Memo templates", description: "Prepare QCC/COCOBOD request, approval, rejection, and response memo formats.", icon: FileText, href: "/dashboard/transport/templates" },
]

type TransportWorkspaceProps = {
  role: string
}

export function TransportWorkspace({ role }: TransportWorkspaceProps) {
  const normalizedRole = role.toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isRegionalHr = ["regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office"].includes(normalizedRole)
  const isDriver = ["driver", "drivers"].includes(normalizedRole)
  const canManage = ["admin", "administrator", "it_admin", "it_admin_role", "regional_manager"].includes(normalizedRole)
  const isDepartmentHead = normalizedRole === "department_head"
  const isTransportManager = normalizedRole === "transport_manager"
  const canCreateRequest = isRegionalHr
  const isRegionalManager = isRegionalManagerRole(normalizedRole)
  const canEditDriverLicense = isRegionalHr
  const canViewDriverLicense = isRegionalHr || isRegionalManager || isDriver || canManage
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
    const response = await fetch("/api/transport/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: form.get("purpose"), origin: form.get("origin"), destination: form.get("destination"), eventDate: form.get("eventDate"), passengerCount: form.get("passengerCount"), supportingDocuments: documents }) })
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null)
      toast({ title: "Unable to submit request", description: errorBody?.error ?? "The request could not be saved. Please try again.", variant: "destructive" })
      return
    }
    setRequestOpen(false)
    toast({ title: "Transport request submitted", description: "Your request has been added to the request register for Regional HR review." })
    router.push("/dashboard/transport/requests")
    router.refresh()
  }
  function openRequestForm() {
    setRequestOpen(true)
  }


  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bus /></div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">Transport Management</h1>
              <p className="text-muted-foreground leading-6">Manage regional transport requests, approvals, memos, and driver compliance.</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">Transport operations</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/dashboard/transport/requests"><Inbox data-icon="inline-start" /> View requests</Link></Button>{(normalizedRole === "managing_director" || normalizedRole === "hr_executive" || normalizedRole === "hr_executive_officer") && <Button asChild><Link href="/dashboard/transport/requests"><ShieldCheck data-icon="inline-start" /> Approval desk</Link></Button>}{(isDepartmentHead || isTransportManager) && <Button variant="outline" asChild><Link href="/dashboard/transport/nonregional"><Inbox data-icon="inline-start" /> Non-regional requisitions</Link></Button>}
          {canCreateRequest && <Button onClick={openRequestForm} title="Create a regional transport request">
            <Plus data-icon="inline-start" /> New transport request
          </Button>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">Request workflow</p><p className="mt-1 text-sm font-semibold">Regional HR led</p></div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">Approval chain</p><p className="mt-1 text-sm font-semibold">Regional to management</p></div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-medium text-muted-foreground">Compliance</p><p className="mt-1 text-sm font-semibold">License monitoring</p></div>
      </div>

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New transport request</DialogTitle>
            <DialogDescription>Capture the regional transport details for review and routing.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleRequestSubmit}>
              <div className="grid gap-2"><Label htmlFor="transport-purpose">Purpose</Label><Input id="transport-purpose" name="purpose" required placeholder="Staff bus, official travel, funeral, or programme" /></div>
              <div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="transport-origin">Origin</Label><Input id="transport-origin" name="origin" required placeholder="Departure location" /></div><div className="grid gap-2"><Label htmlFor="transport-destination">Destination</Label><Input id="transport-destination" name="destination" required placeholder="Destination" /></div></div>
              <div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="transport-date">Event date</Label><Input id="transport-date" name="eventDate" required type="date" /></div><div className="grid gap-2"><Label htmlFor="transport-passengers">Passengers</Label><Input id="transport-passengers" name="passengerCount" required min="1" type="number" /></div></div>
              <div className="grid gap-2"><Label htmlFor="transport-documents">Supporting documents</Label><div className="flex items-center gap-2 rounded-md border border-dashed p-3"><Paperclip className="size-4 text-muted-foreground" /><Input id="transport-documents" name="supportingDocuments" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="cursor-pointer border-0 p-0 shadow-none" /></div><p className="text-xs text-muted-foreground">Attach approval letters, programme schedules, quotations, or other evidence. PDF, JPG, and PNG up to 5 MB each.</p></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button><Button type="submit">Submit request</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
