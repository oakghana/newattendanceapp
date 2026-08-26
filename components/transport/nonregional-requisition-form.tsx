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
  const [authorizing, setAuthorizing] = useState(false)
  const [authorized, setAuthorized] = useState(false)

  async function populateAuthorization(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    setAuthorizing(true)
    try {
      const response = await fetch("/api/user/signature-auto-populate")
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? "Unable to load your saved signature.")
      const form = event.currentTarget.form
      if (!form) throw new Error("Form unavailable.")
      const authorization = form.elements.namedItem("hodAuthorization") as HTMLTextAreaElement
      const signature = form.elements.namedItem("hodSignatureDataUrl") as HTMLTextAreaElement
      authorization.value = body.signature?.signer_name ? `${body.signature.signer_name}${body.signature.signer_position ? ` — ${body.signature.signer_position}` : ""}` : ""
      signature.value = body.signature?.signature_data_url ?? ""
      if (!body.hasSignature) throw new Error("No saved signature found in your profile. Add one in Profile first.")
      setAuthorized(true)
      toast({ title: "Authorization populated", description: "Your name, position, and saved signature are ready for submission." })
    } catch (error) {
      setAuthorized(false)
      toast({ title: "Authorization unavailable", description: error instanceof Error ? error.message : "Please save your signature in Profile first.", variant: "destructive" })
    } finally {
      setAuthorizing(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/transport/nonregional", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) })
    setBusy(false)
    if (!response.ok) { const body = await response.json().catch(() => null); toast({ title: "Unable to submit requisition", description: body?.error ?? "Please review the form.", variant: "destructive" }); return }
    toast({ title: "Requisition submitted", description: "The requisition is now awaiting Managing Director approval." }); router.push("/dashboard/transport/nonregional")
  }
  return <Card><CardHeader><CardTitle>Quality Control Company Limited — Requisition for Transport</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>Date</span><Input name="requisitionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="grid gap-2 text-sm"><span>Requester&apos;s Department</span><Input name="department" required /></label><label className="grid gap-2 text-sm"><span>Location</span><select name="location" className="h-10 rounded-md border bg-background px-3" required><option value="">Select location</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label><label className="grid gap-2 text-sm"><span>From (location)</span><Input name="origin" required /></label><label className="grid gap-2 text-sm"><span>To (destination)</span><Input name="destination" required /></label><label className="grid gap-2 text-sm"><span>Date and time required</span><Input name="requiredAt" type="datetime-local" required /></label><label className="grid gap-2 text-sm"><span>Date and time of return</span><Input name="returnAt" type="datetime-local" /></label><label className="grid gap-2 text-sm"><span>Person(s) requiring transport</span><Input name="personsRequiringTransport" required /></label></div><label className="grid gap-2 text-sm"><span>Purpose</span><Textarea name="purpose" required /></label><div className="rounded-lg border border-primary/30 bg-primary/5 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Head of Department authorization</p><p className="text-sm text-muted-foreground">Populate your name, position, and saved signature before sending this requisition to the Managing Director.</p></div><Button type="button" variant="outline" onClick={populateAuthorization} disabled={authorizing}>{authorizing ? "Loading authorization…" : authorized ? "Authorization populated" : "Populate my authorization"}</Button></div><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm"><span>Head of Department authorization</span><Textarea name="hodAuthorization" placeholder="Click Populate my authorization" required readOnly={authorized} /></label><label className="grid gap-2 text-sm"><span>Name and signature</span><Textarea name="hodSignatureDataUrl" placeholder="Saved signature will appear here" required readOnly={authorized} /></label></div>{authorized && <p className="mt-3 text-sm font-medium text-primary">Authorization ready. The completed requisition will proceed to Managing Director approval.</p>}</div><div className="rounded-lg border bg-muted/30 p-4"><p className="font-semibold">Transport Use Only</p><p className="mt-1 text-sm text-muted-foreground">Completed later by the Transport Manager after Managing Director approval.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Input name="recommendedVehicle" placeholder="Recommended vehicle" disabled /><Input name="recommendedDriver" placeholder="Recommended driver" disabled /></div></div><Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit requisition"}</Button></form></CardContent></Card>
}
