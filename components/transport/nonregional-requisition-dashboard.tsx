"use client"

import { useEffect, useState } from "react"
import { Download, Check, X, UserPlus, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"

export function NonRegionalRequisitionDashboard({ role }: { role: string }) {
  const [requests, setRequests] = useState<any[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [previewedIds, setPreviewedIds] = useState<Set<string>>(new Set())

  async function load() {
    const response = await fetch("/api/transport/nonregional")
    const body = await response.json()
    setRequests(body.requests ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  async function decide(id: string, decision: string, extra: Record<string, unknown> = {}) {
    setBusy(id)
    const response = await fetch("/api/transport/nonregional", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, ...extra }) })
    setBusy(null)
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast({ title: "Action failed", description: body?.error ?? "Please try again.", variant: "destructive" })
      return
    }
    toast({ title: decision === "approve" ? "Approval completed" : decision === "assign_driver" ? "Driver assignment completed" : "Requisition updated", description: "The transport workflow has been updated successfully." })
    load()
  }

  function openPreview(request: any) {
    setPreviewedIds((current) => new Set(current).add(request.id))
    setPreview(request)
  }

  function download(request: any) {
    const lines = [
      `QUALITY CONTROL COMPANY LIMITED`,
      `REQUISITION FOR TRANSPORT`,
      ``,
      `Date: ${request.requisition_date}`,
      `Requester's Department: ${request.department}`,
      `Location: ${request.location}`,
      `From: ${request.origin}`,
      `To: ${request.destination}`,
      `Purpose: ${request.purpose}`,
      `Date and Time Required: ${request.required_at}`,
      `Date and Time of Return: ${request.return_at ?? "—"}`,
      `Person(s) Requiring Transport: ${request.persons_requiring_transport}`,
      `Head of Department Authorization: ${request.hod_authorization}`,
      ``,
      `TRANSPORT USE ONLY`,
      `Recommended Vehicle: ${request.recommended_vehicle ?? "—"}`,
      `Recommended Driver: ${request.driver ? `${request.driver.first_name ?? ""} ${request.driver.last_name ?? ""}` : "—"}`,
      `Date: ${request.transport_use_date ?? "—"}`,
    ].join("\n")
    const url = URL.createObjectURL(new Blob([lines], { type: "text/plain" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `transport-requisition-${request.id}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="grid gap-6">
      <header className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-primary">Non-regional transport</p>
          <h1 className="text-3xl font-semibold tracking-tight">{role === "staff" || role === "department_head" || role === "hr_executive" || role === "hr_executive_officer" || role === "manager_hr" || role === "director_hr" ? "My transport requests" : "Transport requisitions"}</h1>
          <p className="mt-1 text-muted-foreground">{role === "staff" || role === "department_head" || role === "hr_executive" || role === "hr_executive_officer" || role === "manager_hr" || role === "director_hr" ? "Track approval, download your approved request, and follow the assigned transport plan." : "Head Office, Awutu Stores, and Nsawam Archives."}</p>
        </div>
      </header>

      {["department_head", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr"].includes(role) && (
        <a className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/dashboard/transport/nonregional/new">
          New requisition
        </a>
      )}

      <div className="grid gap-4">
        {requests.map((request) => {
          const isPreviewed = previewedIds.has(request.id)
          return (
            <Card key={request.id} className="border-accent/25 bg-accent/[0.03]">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-accent/40 bg-accent/15 text-accent-foreground">Non-Regional Requisition</Badge>
                    <CardTitle className="text-base">{request.department} — {request.location}</CardTitle>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{request.status}</span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <p><strong>From:</strong> {request.origin}</p>
                  <p><strong>To:</strong> {request.destination}</p>
                  <p><strong>Required:</strong> {request.required_at}</p>
                </div>
                <p className="text-sm leading-6">{request.purpose}</p>
                {request.md_decision === "approved" && (role === "staff" || role === "department_head" || role === "hr_executive" || role === "hr_executive_officer" || role === "manager_hr" || role === "director_hr") && (
                  <section className="grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Transport assignment details">
                    <div><p className="text-xs font-medium text-muted-foreground">Assigned driver</p><p className="mt-1 font-medium">{request.driver ? `${request.driver.first_name ?? ""} ${request.driver.last_name ?? ""}`.trim() : "Awaiting assignment"}</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Vehicle</p><p className="mt-1 font-medium">{request.recommended_vehicle || "Awaiting assignment"}</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Meet / leave</p><p className="mt-1 font-medium">{request.transport_use_date || request.required_at || "To be confirmed"}</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Assignment status</p><p className="mt-1 font-medium">{request.status === "assigned" ? "Driver assigned" : "Approved — awaiting assignment"}</p></div>
                  </section>
                )}
                <div className="flex flex-wrap gap-2">
                  {role === "managing_director" && request.md_decision === "pending" && (
                    <>
                      <Button variant="outline" onClick={() => openPreview(request)}>
                        <Eye data-icon="inline-start" /> Preview requisition
                      </Button>
                      <Button
                        onClick={() => decide(request.id, "approve")}
                        disabled={busy === request.id || !isPreviewed}
                        title={!isPreviewed ? "Preview the requisition before approving" : undefined}
                      >
                        <Check data-icon="inline-start" /> Approve
                      </Button>
                      <Button variant="destructive" onClick={() => decide(request.id, "reject")} disabled={busy === request.id}>
                        <X data-icon="inline-start" /> Reject
                      </Button>
                    </>
                  )}
                  {role === "transport_manager" && request.md_decision === "approved" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const driverId = window.prompt("Enter assigned driver user ID")
                        if (driverId) decide(request.id, "assign_driver", { driverId, recommendedVehicle: window.prompt("Recommended vehicle") ?? "", transportUseDate: new Date().toISOString().slice(0, 10) })
                      }}
                    >
                      <UserPlus data-icon="inline-start" /> Assign location driver
                    </Button>
                  )}
                  {request.md_decision === "approved" && (
                    <Button variant="outline" onClick={() => download(request)}>
                      <Download data-icon="inline-start" /> Download approved request
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {requests.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">No non-regional requisitions to show right now.</CardContent>
          </Card>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Non-regional transport requisition preview">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <Card className="overflow-hidden border-border bg-muted/30 shadow-2xl">
              <CardHeader className="border-b bg-background">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="border-accent/40 bg-accent/15 text-accent-foreground">Non-Regional Requisition</Badge>
                    </div>
                    <CardTitle>Requisition preview</CardTitle>
                    <p className="text-sm text-muted-foreground">Formal document as it will appear before your decision.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                    Close preview
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-3 sm:p-8">
                <article className="mx-auto w-full max-w-3xl bg-background px-6 py-8 text-foreground shadow-lg ring-1 ring-border sm:px-14 sm:py-12" aria-label="Formal non-regional transport requisition">
                  <header className="border-b-2 border-accent pb-5">
                    <div className="flex items-start gap-4">
                      <img src="/images/qcc-logo.png" alt="Quality Control Company logo" className="size-20 object-contain" />
                      <div className="flex-1 text-center">
                        <h2 className="font-serif text-xl font-bold tracking-wide sm:text-2xl">QUALITY CONTROL COMPANY LTD.</h2>
                        <p className="mt-1 text-sm font-medium tracking-[0.2em] text-muted-foreground">(COCOBOD)</p>
                        <p className="mt-2 text-xs text-muted-foreground">Requisition for Transport — Non-Regional</p>
                      </div>
                    </div>
                  </header>
                  <div className="flex flex-wrap justify-between gap-6 py-6 text-xs sm:text-sm">
                    <p><span className="font-semibold">Location:</span> {preview.location}</p>
                    <p><span className="font-semibold">Date:</span> {preview.requisition_date}</p>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="font-semibold">Department</dt><dd className="text-muted-foreground">{preview.department}</dd></div>
                    <div><dt className="font-semibold">Persons requiring transport</dt><dd className="text-muted-foreground">{preview.persons_requiring_transport}</dd></div>
                    <div><dt className="font-semibold">From</dt><dd className="text-muted-foreground">{preview.origin}</dd></div>
                    <div><dt className="font-semibold">To</dt><dd className="text-muted-foreground">{preview.destination}</dd></div>
                    <div><dt className="font-semibold">Date and time required</dt><dd className="text-muted-foreground">{preview.required_at}</dd></div>
                    <div><dt className="font-semibold">Date and time of return</dt><dd className="text-muted-foreground">{preview.return_at ?? "—"}</dd></div>
                  </dl>
                  <div className="mt-6">
                    <dt className="font-semibold">Purpose</dt>
                    <dd className="mt-1 text-sm leading-6 text-muted-foreground">{preview.purpose}</dd>
                  </div>
                  <div className="mt-6 border-t pt-4">
                    <dt className="font-semibold">Head of Department authorization</dt>
                    <dd className="mt-1 text-sm leading-6 text-muted-foreground">{preview.hod_authorization}</dd>
                    {preview.hod_signature_data_url && (
                      <img src={preview.hod_signature_data_url || "/placeholder.svg"} alt="Head of Department signature" className="mt-2 h-14 object-contain" />
                    )}
                  </div>
                </article>
              </CardContent>
            </Card>
            <div className="flex justify-end gap-2 pb-4">
              <Button
                onClick={() => {
                  setPreview(null)
                }}
              >
                Done reviewing
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
