"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

const locations = ["QCC Head Office", "Awutu Stores", "Nsawam Archives"]

export function NonRegionalRequisitionForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/transport/nonregional", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) })
    setBusy(false)
    if (!response.ok) { const body = await response.json().catch(() => null); toast({ title: "Unable to submit requisition", description: body?.error ?? "Please review the form.", variant: "destructive" }); return }
    toast({ title: "Requisition submitted", description: "The requisition is now awaiting Managing Director approval." }); router.push("/dashboard/transport/nonregional")
  }
  return <Card><CardHeader><CardTitle>Quality Control Company Limited — Requisition for Transport</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>Date</span><Input name="requisitionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="grid gap-2 text-sm"><span>Requester&apos;s Department</span><Input name="department" required /></label><label className="grid gap-2 text-sm"><span>Location</span><select name="location" className="h-10 rounded-md border bg-background px-3" required><option value="">Select location</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label><label className="grid gap-2 text-sm"><span>From (location)</span><Input name="origin" required /></label><label className="grid gap-2 text-sm"><span>To (destination)</span><Input name="destination" required /></label><label className="grid gap-2 text-sm"><span>Date and time required</span><Input name="requiredAt" type="datetime-local" required /></label><label className="grid gap-2 text-sm"><span>Date and time of return</span><Input name="returnAt" type="datetime-local" /></label><label className="grid gap-2 text-sm"><span>Person(s) requiring transport</span><Input name="personsRequiringTransport" required /></label></div><label className="grid gap-2 text-sm"><span>Purpose</span><Textarea name="purpose" required /></label><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>Head of Department authorization</span><Textarea name="hodAuthorization" placeholder="Name, title, and authorization" required /></label><label className="grid gap-2 text-sm"><span>Name and signature</span><Textarea name="hodSignatureDataUrl" placeholder="Paste signature data or record the signed authorization" /></label></div><div className="rounded-lg border bg-muted/30 p-4"><p className="font-semibold">Transport Use Only</p><p className="mt-1 text-sm text-muted-foreground">Completed later by the Transport Manager after Managing Director approval.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Input name="recommendedVehicle" placeholder="Recommended vehicle" disabled /><Input name="recommendedDriver" placeholder="Recommended driver" disabled /></div></div><Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit requisition"}</Button></form></CardContent></Card>
}
