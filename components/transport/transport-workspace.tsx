"use client"

import { Bus, FileText, IdCard, Inbox, LockKeyhole, Plus, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const modules = [
  { title: "Transport requests", description: "Create and track staff bus, official travel, funeral, and programme requests.", icon: Bus, href: "/dashboard/transport" },
  { title: "Approval queues", description: "Review requests routed to Regional HR, Regional Managers, HR Records, and management.", icon: Inbox, href: "/dashboard/transport/approvals" },
  { title: "Driver licenses", description: "Monitor expiry dates and keep expired or suspended drivers out of assignments.", icon: IdCard, href: "/dashboard/transport/drivers" },
  { title: "Memo templates", description: "Prepare QCC/COCOBOD request, approval, rejection, and response memo formats.", icon: FileText, href: "/dashboard/transport/templates" },
]

export function TransportWorkspace() {
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
        <Button disabled title="Available after the transport database migration is approved">
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
        {modules.map(({ title, description, icon: Icon, href }) => (
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
              <Button variant="outline" disabled title="Available after the transport database migration is approved">Open workspace</Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
