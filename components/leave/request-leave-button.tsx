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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar, Loader2 } from "lucide-react"
import { useEffect } from "react"
import { computeLeaveDays, computeReturnToWorkDate } from "@/lib/leave-policy"

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
  const [formData, setFormData] = useState({ start_date: "", end_date: "", leave_type: "annual", reason: "" })
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [activePeriod, setActivePeriod] = useState("2026/2027")

  useEffect(() => {
    const loadLeavePolicy = async () => {
      try {
        const response = await fetch("/api/leave/policy", { cache: "no-store" })
        const result = await response.json()
        if (!response.ok) return

        setActivePeriod(result.activePeriod || "2026/2027")
        const options = (result.leaveTypes || []) as LeaveTypeOption[]
        setLeaveTypes(options)
        if (options.length > 0 && !options.some((opt) => opt.leaveTypeKey === formData.leave_type)) {
          setFormData((prev) => ({ ...prev, leave_type: options[0].leaveTypeKey }))
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

    const requestedDays = computeLeaveDays(formData.start_date, formData.end_date)
    const selectedType = leaveTypes.find((type) => type.leaveTypeKey === formData.leave_type)
    if (selectedType && requestedDays > selectedType.entitlementDays) {
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
      if (uploadedFile) m.append("document", uploadedFile)

      const resp = await fetch("/api/leave/request-leave", { method: "POST", body: m })
      if (resp.ok) {
        const data = await resp.json()
        const returnToWork = data?.returnToWorkDate || computeReturnToWorkDate(formData.end_date)
        setFormData({ start_date: "", end_date: "", leave_type: "annual", reason: "" })
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
            <Select value={formData.leave_type} onValueChange={(value) => setFormData({ ...formData, leave_type: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.length === 0 && <SelectItem value="annual">Annual Leave (30 days)</SelectItem>}
                {leaveTypes.map((type) => (
                  <SelectItem key={type.leaveTypeKey} value={type.leaveTypeKey}>
                    {type.leaveTypeLabel} ({type.entitlementDays} days)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Active Leave Period: {activePeriod}</p>
          </div>

          <div>
            <Label htmlFor="start_date">Start Date</Label>
            <Input id="start_date" type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
          </div>

          <div>
            <Label htmlFor="end_date">End Date</Label>
            <Input id="end_date" type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
          </div>

          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" placeholder="Provide a reason for your leave request..." value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={4} />
          </div>

          <div>
            <Label htmlFor="document">Attachment (Optional)</Label>
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
