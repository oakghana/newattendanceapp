"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { processSignatureDataUrl } from "@/lib/process-signature-image"

const locations = ["QCC Head Office", "HEAD OFFICE SWANZY ARCADE", "Awutu Stores", "Nsawam Archives"]

type SignatureProfile = {
  signature_data_url?: string | null
  signer_name?: string | null
  signer_position?: string | null
  signer_department?: string | null
}

const SELF_AUTHORIZING_ROLES = new Set([
  "department_head",
  "hr_executive",
  "hr_executive_officer",
  "manager_hr",
  "director_hr",
])

export function NonRegionalRequisitionForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [authorizing, setAuthorizing] = useState(true)
  const [canSelfAuthorize, setCanSelfAuthorize] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [department, setDepartment] = useState("")
  const [location, setLocation] = useState("")
  const [origin, setOrigin] = useState("")
  const [hodAuthorization, setHodAuthorization] = useState("")
  const [hodSignatureDataUrl, setHodSignatureDataUrl] = useState("")
  const [requesterSignatureDataUrl, setRequesterSignatureDataUrl] = useState("")
  const [cleanHodSignatureDataUrl, setCleanHodSignatureDataUrl] = useState("")
  const [hodLinked, setHodLinked] = useState(false)

  const [peopleCount, setPeopleCount] = useState(1)

  useEffect(() => {
    let cancelled = false
    if (!hodSignatureDataUrl) {
      setCleanHodSignatureDataUrl("")
      return
    }
    processSignatureDataUrl(hodSignatureDataUrl)
      .then((processed) => {
        if (!cancelled) setCleanHodSignatureDataUrl(processed)
      })
      .catch(() => {
        if (!cancelled) setCleanHodSignatureDataUrl("")
      })
    return () => {
      cancelled = true
    }
  }, [hodSignatureDataUrl])

  async function populateAuthorization() {
    setAuthorizing(true)
    try {
      // Always load the signed-in user only — never inherit HOD signature for staff requesters.
      const response = await fetch("/api/user/signature-auto-populate?scope=transport")
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? "Unable to load your profile.")

      const signature = (body.signature ?? {}) as SignatureProfile
          // HR Executives are departmental heads for their own non-regional trips.
      // Their requisitions go straight to MD approval, never to HR Executive approval.
      const selfAuth = SELF_AUTHORIZING_ROLES.has(String(body.role || ""))
      setCanSelfAuthorize(selfAuth)
      setHodLinked(Boolean(body.hodId))
      setDepartment((current) => current || signature.signer_department || "")
      // Default the requisition location to the user's assigned location; it stays editable.
      const assignedLocation = String(body.assignedLocation ?? "").trim()
      if (assignedLocation && locations.includes(assignedLocation)) {
        setLocation((current) => current || assignedLocation)
      }
      setOrigin((current) => current || assignedLocation)
      setRequesterSignatureDataUrl(signature.signature_data_url ?? "")

      if (!selfAuth) {
        const linkedSignature = body.hasSignature && body.hodId ? signature : null
        const authorizationText = linkedSignature?.signer_name
          ? `${linkedSignature.signer_name}${linkedSignature.signer_position ? ` — ${linkedSignature.signer_position}` : ""}`
          : ""
        setHodAuthorization(authorizationText.toUpperCase())
        setHodSignatureDataUrl(linkedSignature?.signature_data_url ?? "")
        setAuthorized(Boolean(body.hodId))
        return
      }

      const authorizationText = signature.signer_name
        ? `${signature.signer_name}${signature.signer_position ? ` — ${signature.signer_position}` : ""}`
        : ""
      setHodAuthorization(authorizationText.toUpperCase())
      setHodSignatureDataUrl(signature.signature_data_url ?? "")
      if (!body.hasSignature) throw new Error("Authorization details are unavailable. Please try again.")
      setAuthorized(true)
  } catch {
  setAuthorized(false)
      toast({
        title: "Authorization unavailable",
        description: "We could not prepare the authorization details. Please try again.",
        variant: "destructive",
      })
    } finally {
      setAuthorizing(false)
    }
  }

  useEffect(() => {
    populateAuthorization()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSelfAuthorize && (!hodSignatureDataUrl || !hodAuthorization)) {
      toast({
        title: "Authorization required",
        description: "Authorization details are not ready. Please try again.",
        variant: "destructive",
      })
      return
    }
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload = {
      ...Object.fromEntries(form.entries()),
      department,
      personsCount: peopleCount,
      hodAuthorization: canSelfAuthorize ? hodAuthorization : "",
      hodSignatureDataUrl: canSelfAuthorize ? hodSignatureDataUrl : "",
      requesterSignatureDataUrl,
    }
    const response = await fetch("/api/transport/nonregional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    setBusy(false)
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast({ title: "Unable to submit requisition", description: body?.error ?? "Please review the form.", variant: "destructive" })
      return
    }
    const body = await response.json().catch(() => null)
    const next = body?.next ?? (canSelfAuthorize ? "awaiting_md_approval" : "awaiting_hod_approval")
    toast({
      title: "Requisition submitted",
      description:
        next === "awaiting_hod_approval"
          ? "Sent to your Head of Department for authorization. Managing Director review follows after HOD approval."
          : "The requisition is now awaiting Managing Director approval.",
    })
    router.push("/dashboard/transport")
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Quality Control Company Limited — Requisition for Transport</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/dashboard/transport")}>
            <ArrowLeft data-icon="inline-start" /> Transport
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span>Date</span>
              <Input name="requisitionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Requester&apos;s Department</span>
              <Input
                name="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder={authorizing ? "Picking up your department…" : undefined}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Location</span>
              <select
                name="location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
                required
              >
                <option value="">Select location</option>
                {locations.map((locationOption) => (
                  <option key={locationOption}>{locationOption}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Defaults to your assigned location — change it if this trip is for another office.
              </span>
            </label>
            <label className="grid gap-2 text-sm">
              <span>From (location)</span>
              <Input
                name="origin"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder={authorizing ? "Picking up your assigned location..." : "Departure location"}
                required
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>To (destination)</span>
              <Input name="destination" required />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Date and time required</span>
              <Input name="requiredAt" type="datetime-local" required />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Date and time of return</span>
              <Input name="returnAt" type="datetime-local" />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Number of people requiring transport</span>
              <Input
                name="personsCount"
                type="number"
                min="1"
                step="1"
                value={peopleCount}
                onChange={(event) => setPeopleCount(Math.max(1, Number(event.target.value) || 1))}
                required
              />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span>Names of people requiring transport</span>
              <Textarea
                name="personNames"
                placeholder="Enter at least one name; separate multiple names with commas or new lines"
                required
              />
              <span className="text-xs text-muted-foreground">
                At least one person&apos;s name is required. Names should match the number of people entered above.
              </span>
            </label>
          </div>
          <label className="grid gap-2 text-sm">
            <span>Purpose</span>
            <Textarea name="purpose" required />
          </label>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Departmental authorization</p>
  <p className="text-sm text-muted-foreground">
  {canSelfAuthorize
    ? "Your request will be routed to the appropriate approving office."
    : "Your request will be routed through the required approval process."}
  </p>

              </div>
              {canSelfAuthorize ? (
                <Button type="button" variant="outline" onClick={populateAuthorization} disabled={authorizing}>
                  {authorizing ? "Loading authorization…" : authorized ? "Refresh authorization" : "Retry authorization"}
                </Button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Authorization</span>
                <Textarea
                  name="hodAuthorization"
                  value={hodAuthorization}
                  readOnly
                  placeholder={
                    canSelfAuthorize
                      ? "Picked up automatically from your profile"
                      : "Blank — Head of Department will authorize after submission"
                  }
                  required={canSelfAuthorize}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Name and signature</span>
                <input type="hidden" name="hodSignatureDataUrl" value={hodSignatureDataUrl} />
                <div className="flex min-h-28 items-center rounded-md border bg-background p-3">
  {cleanHodSignatureDataUrl ? (
  <img src={cleanHodSignatureDataUrl} alt="Head of Department signature" className="max-h-20 max-w-full object-contain" />
  ) : hodSignatureDataUrl ? (
  <span className="text-muted-foreground">Preparing verified signature…</span>
  ) : (
                    <span className="text-muted-foreground">
                      {canSelfAuthorize ? "Authorization will be completed here" : "Completed by the approving officer"}
                    </span>
                  )}
                </div>
              </label>
            </div>
            {canSelfAuthorize && authorized ? (
              <p className="mt-3 text-sm font-medium text-primary">
                Authorization ready. The completed requisition will proceed to Managing Director approval.
              </p>
            ) : !canSelfAuthorize && authorized ? (
              <p className="mt-3 text-sm font-medium text-primary">
                Ready to submit. Workflow: you → Head of Department → Managing Director → Transport Manager.
                {!hodLinked ? " (Ensure HR has linked a Head of Department on your profile.)" : ""}
              </p>
            ) : !authorizing && canSelfAuthorize ? (
              <p className="mt-3 text-sm font-medium text-destructive">
                Authorization details are unavailable. Use Retry authorization or try again later.
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-semibold">Transport Use Only</p>
            <p className="mt-1 text-sm text-muted-foreground">Completed later by the Transport Manager after Managing Director approval.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input name="recommendedVehicle" placeholder="Recommended vehicle" disabled />
              <Input name="recommendedDriver" placeholder="Recommended driver" disabled />
            </div>
          </div>
          <Button type="submit" disabled={busy || authorizing || !authorized}>
            {busy ? "Submitting…" : "Submit requisition"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
