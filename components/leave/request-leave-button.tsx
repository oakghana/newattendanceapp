"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Calendar, Loader2, Info } from "lucide-react"
import { useEffect } from "react"
import { computeLeaveDays, computeReturnToWorkDate, getMaternityEntitlementDays } from "@/lib/leave-policy"

interface AnnualEntitlementInfo {
  annualLeaveDays: number
  travelDays: number
  totalEntitlement: number
  tierLabel: string
  yearsOfService: number
}

interface LeaveTypeOption {
  leaveTypeKey: string
  leaveTypeLabel: string
  entitlementDays: number
  leaveYearPeriod: string
}

export function RequestLeaveButton() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({ start_date: "", end_date: "", leave_type: "annual", reason: "", maternity_delivery_type: "normal", delivery_date: "", requested_days: "" })
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [activePeriod, setActivePeriod] = useState("2026/2027")
  const [annualEntitlement, setAnnualEntitlement] = useState<AnnualEntitlementInfo | null>(null)

  // Fetch annual leave entitlement for this user when the dialog opens
  useEffect(() => {
    if (!open) return
    const loadEntitlement = async () => {
      try {
        const res = await fetch("/api/leave/annual-entitlement", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        if (data?.entitlement) setAnnualEntitlement(data.entitlement)
      } catch {
        // non-fatal
      }
    }
    void loadEntitlement()
  }, [open])

  useEffect(() => {
    const loadLeavePolicy = async () => {
      try {
        const response = await fetch("/api/leave/policy", { cache: "no-store" })
        const result = await response.json()
        if (!response.ok) return

        setActivePeriod(result.activePeriod || "2026/2027")
        const options = (result.leaveTypes || []) as LeaveTypeOption[]
        const hasPartLeave = options.some((opt) => opt.leaveTypeKey === "part_leave")
        const normalizedOptions = hasPartLeave
          ? options
          : [
              ...options,
              {
                leaveTypeKey: "part_leave",
                leaveTypeLabel: "Part Leave",
                entitlementDays: 15,
                leaveYearPeriod: result.activePeriod || "2026/2027",
              },
            ]
        setLeaveTypes(normalizedOptions)
        if (normalizedOptions.length > 0 && !normalizedOptions.some((opt) => opt.leaveTypeKey === formData.leave_type)) {
          setFormData((prev) => ({ ...prev, leave_type: normalizedOptions[0].leaveTypeKey }))
        }
      } catch {
        // Keep fallback defaults when policy endpoint is unavailable.
      }
    }

    void loadLeavePolicy()
  }, [])

  const submit = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason) {
      alert("Please fill in all required fields")
      return
    }
    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
      alert("End date must be after start date")
      return
    }

    const selectedType = leaveTypes.find((type) => type.leaveTypeKey === formData.leave_type)
    const annualZeroEntitlement = formData.leave_type === "annual" && annualEntitlement?.totalEntitlement === 0
    const zeroEntitlement = annualZeroEntitlement || selectedType?.entitlementDays === 0
    const requestedDays = zeroEntitlement ? Number(formData.requested_days) : computeLeaveDays(formData.start_date, formData.end_date)
    if (zeroEntitlement && (!Number.isInteger(requestedDays) || requestedDays <= 0)) {
      alert("Enter the positive number of days you are requesting. The next approver will decide whether to grant it.")
      return
    }
    const maternity = formData.leave_type === "maternity"
    const paternity = formData.leave_type === "paternity"
    const maternityDays = getMaternityEntitlementDays(formData.maternity_delivery_type)
    if (paternity && !uploadedFile) {
      alert("Spouse delivery proof is required for paternity leave.")
      return
    }
    if (maternity && (!formData.delivery_date || requestedDays !== maternityDays)) {
      alert(`Maternity leave must be ${maternityDays} days for the selected delivery type, with the delivery date provided.`)
      return
    }
    if (!maternity && !zeroEntitlement && selectedType && requestedDays > selectedType.entitlementDays) {
      alert(
        `Requested ${requestedDays} day(s) exceeds ${selectedType.entitlementDays} day entitlement for ${selectedType.leaveTypeLabel}.`,
      )
      return
    }

    setSubmitting(true)
    try {
      const m = new FormData()
      m.append("start_date", formData.start_date)
      m.append("end_date", formData.end_date)
      m.append("reason", formData.reason)
      m.append("leave_type", formData.leave_type)
      m.append("leave_year_period", activePeriod)
      if (zeroEntitlement) m.append("requested_days", String(requestedDays))
      if (formData.leave_type === "maternity") {
        m.append("maternity_delivery_type", formData.maternity_delivery_type)
        m.append("delivery_date", formData.delivery_date)
      }
      if (uploadedFile) m.append("document", uploadedFile)

      const resp = await fetch("/api/leave/request-leave", { method: "POST", body: m })
      if (resp.ok) {
        const data = await resp.json()
        const returnToWork = data?.returnToWorkDate || computeReturnToWorkDate(formData.end_date)
        setFormData({ start_date: "", end_date: "", leave_type: "annual", reason: "", maternity_delivery_type: "normal", delivery_date: "", requested_days: "" })
        setUploadedFile(null)
        setOpen(false)
        alert(`Leave request submitted. Expected return-to-work date: ${returnToWork}`)
        // optional: trigger refresh if needed
        // location.reload()
      } else {
        const err = await resp.json()
        alert(err.error || "Failed to submit leave request")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to submit leave request")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Calendar className="h-4 w-4" />
          Request Leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Leave</DialogTitle>
          <DialogDescription>Submit a new leave request for approval by your manager</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="leave_type">Leave Type</Label>
            <SearchableSelect
              value={formData.leave_type}
              onChange={(value) => setFormData({ ...formData, leave_type: value })}
              placeholder="Select leave type"
              searchPlaceholder="Search leave type..."
              options={
                leaveTypes.length === 0
                  ? [{ value: "annual", label: "Annual Leave (30 days)" }]
                  : leaveTypes.map((type) => ({
                      value: type.leaveTypeKey,
                      label: `${type.leaveTypeLabel} (${type.entitlementDays} days)`,
                    }))
              }
            />
            <p className="text-xs text-muted-foreground mt-1">Active Leave Period: {activePeriod}</p>
          </div>

          {/* Annual leave entitlement summary — only shown when annual leave is selected */}
          {formData.leave_type === "annual" && annualEntitlement && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-xs font-semibold text-blue-800">Your Annual Leave Entitlement</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-900">
                <div><span className="text-blue-600">Category:</span> {annualEntitlement.tierLabel}</div>
                <div><span className="text-blue-600">Service:</span> {annualEntitlement.yearsOfService} year{annualEntitlement.yearsOfService !== 1 ? "s" : ""}</div>
                <div><span className="text-blue-600">Leave days:</span> {annualEntitlement.annualLeaveDays} days</div>
                <div><span className="text-blue-600">Travel days:</span> {annualEntitlement.travelDays} days</div>
              </div>
              <div className="pt-1 border-t border-blue-200 flex items-center justify-between">
                <span className="text-xs text-blue-700 font-medium">Total entitlement</span>
                <span className="text-sm font-bold text-blue-900">{annualEntitlement.totalEntitlement} days</span>
              </div>
              {formData.start_date && formData.end_date && (() => {
                const requested = computeLeaveDays(formData.start_date, formData.end_date)
                const exceeds = requested > annualEntitlement.totalEntitlement
                const remaining = annualEntitlement.totalEntitlement - requested
                return (
                  <div className={`text-xs px-2 py-1.5 rounded ${exceeds ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                    {exceeds
                      ? `Request of ${requested} days exceeds your entitlement of ${annualEntitlement.totalEntitlement} days by ${requested - annualEntitlement.totalEntitlement} day(s). HR will review.`
                      : `${requested} days requested — ${remaining} day(s) remaining within entitlement.`
                    }
                  </div>
                )
              })()}
            </div>
          )}

          {formData.leave_type === "maternity" && (
            <div className="space-y-3 rounded-lg border border-pink-200 bg-pink-50 p-3">
              <div>
                <Label htmlFor="delivery_date">Date of Delivery</Label>
                <Input id="delivery_date" type="date" value={formData.delivery_date} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="maternity_delivery_type">Delivery Type</Label>
                <select id="maternity_delivery_type" value={formData.maternity_delivery_type} onChange={(e) => setFormData({ ...formData, maternity_delivery_type: e.target.value })} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="normal">Normal delivery — 84 days</option>
                  <option value="cs">Caesarean section — 98 days</option>
                  <option value="twins">Twins delivery — 98 days</option>
                </select>
              </div>
              <p className="text-xs text-pink-800">Entitlement is calculated from the delivery type; the old fixed 90-day entitlement is no longer used.</p>
            </div>
          )}

          <div>
            <Label htmlFor="start_date">Start Date</Label>
            <Input id="start_date" type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
          </div>

          <div>
            <Label htmlFor="end_date">End Date</Label>
            <Input id="end_date" type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
          </div>

          {(formData.leave_type === "annual" && annualEntitlement?.totalEntitlement === 0) || leaveTypes.find((type) => type.leaveTypeKey === formData.leave_type)?.entitlementDays === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <Label htmlFor="requested_days">Requested days</Label>
              <Input id="requested_days" type="number" min="1" step="1" value={formData.requested_days} onChange={(e) => setFormData({ ...formData, requested_days: e.target.value })} />
              <p className="text-xs text-amber-800">Your entitlement is currently zero or unavailable. Enter the days you are requesting; the next approver will make the decision.</p>
            </div>
          ) : null}

          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" placeholder="Provide a reason for your leave request..." value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={4} />
          </div>

          <div>
            <Label htmlFor="document">{formData.leave_type === "paternity" ? "Spouse delivery proof (Required)" : formData.leave_type === "maternity" ? "Delivery evidence (Required)" : "Attachment (Optional)"}</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input id="document" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                      alert("File size must be less than 5MB")
                      return
                    }
                    setUploadedFile(file)
                  }
                }} className="hidden" />
                <Button type="button" variant="outline" onClick={() => document.getElementById("document")?.click()} className="w-full gap-2">Upload Document</Button>
              </div>
              {uploadedFile && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <span className="text-sm text-muted-foreground flex-1 truncate">{uploadedFile.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedFile(null)} className="h-6 w-6 p-0">X</Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Upload supporting documents (Max 5MB)</p>
            </div>
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full gap-2">
            {submitting ? (<Loader2 className="h-4 w-4 animate-spin" />) : 'Submit Request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
