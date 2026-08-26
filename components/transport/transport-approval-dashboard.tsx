"use client"

import { CheckCircle2, FileSignature, ShieldCheck, Clock3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function TransportApprovalDashboard({ role, pendingCount, totalCount }: { role: "managing_director" | "hr_executive"; pendingCount: number; totalCount: number }) {
  const isMd = role === "managing_director"
  const title = isMd ? "Managing Director control desk" : "HR Executive signing desk"
  const description = isMd ? "Review endorsed regional transport requests, preview the formal memo, and approve the next handoff." : "Prepare the response memo, preview the final document, sign with your profile signature, and send it to HR Records."
  return <section aria-labelledby="approval-dashboard-title" className="grid gap-4 lg:grid-cols-[1fr_auto]">
    <Card className="overflow-hidden border-primary/20 bg-primary/[0.03]">
      <CardHeader className="border-b border-primary/10 bg-background/70">
        <div className="flex items-start gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{isMd ? <ShieldCheck /> : <FileSignature />}</div><div><Badge variant="secondary">Priority workspace</Badge><CardTitle id="approval-dashboard-title" className="mt-2 text-xl">{title}</CardTitle><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div></div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3 p-5 text-sm"><div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"><Clock3 className="text-primary" /> <span><strong>{pendingCount}</strong> waiting for your action</span></div><div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"><CheckCircle2 className="text-primary" /> <span><strong>{totalCount}</strong> requests in your workspace</span></div></CardContent>
    </Card>
    <Card className="lg:min-w-64"><CardHeader><CardTitle className="text-base">Required sequence</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 text-sm text-muted-foreground"><p><span className="font-medium text-foreground">1.</span> Open preview</p><p><span className="font-medium text-foreground">2.</span> Check memo details</p><p><span className="font-medium text-foreground">3.</span> {isMd ? "Approve or reject" : "Edit, save, then sign"}</p></CardContent></Card>
  </section>
}
