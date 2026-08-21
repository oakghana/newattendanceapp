"use client"

import { Bus, FileText, IdCard, Inbox, LockKeyhole, Plus, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const modules = [
  { title: "Transport requests", description: "Create and track staff bus, official travel, funeral, and programme requests.", icon: Bus, href: "/dashboard/transport" },
  { title: "Approval queues", description: "Review requests routed to Regional HR, Regional Managers, HR Records, and management.", icon: Inbox, href: "/dashboard/transport/approvals" },
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
  const canManage = ["admin", "administrator", "it_admin", "it_admin_role"].includes(normalizedRole)
  const canCreateRequest = isRegionalHr
  const canEditDriverLicense = isDriver
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bus /></div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-balance">Transport Management</h1>
              <p className="text-muted-foreground leading-6">Manage regional transport requests, approvals, memos, and driver compliance.</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit">Migration pending approval</Badge>
        </div>
        <Button disabled={!canCreateRequest} title={canCreateRequest ? "Create a regional transport request" : "Only Regional HR can create transport requests"}>
          <Plus data-icon="inline-start" /> New transport request
        </Button>
      </header>

      <Card className="border-amber-300/60 bg-amber-50/50">
        <CardContent className="flex items-start gap-3 p-5 text-amber-950">
          <LockKeyhole className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">Safe rollout in progress</p>
            <p className="text-sm leading-6">The transport screens are prepared without changing your existing database or current workflows. Requests and live queues will activate only after you review and approve the additive migration.</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Transport modules">
        {modules.map(({ title, description, icon: Icon, href, editableFor }) => {
          const workspaceCanWrite = editableFor === "driver" ? canEditDriverLicense : title === "Transport requests" ? canCreateRequest : canManage
          return (
          <Card key={title} className="transition-colors hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <Icon className="text-primary" />
                <ShieldCheck className="text-muted-foreground" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="leading-6">{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" disabled={!workspaceCanWrite} title={workspaceCanWrite ? "Open transport workspace" : "Read-only access"}>Open workspace</Button>
            </CardContent>
          </Card>
          )
        })}
      </section>
    </div>
  )
}
