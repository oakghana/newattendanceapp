"use client"

import { CardContent } from "@/components/ui/card"
import React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Calendar, AlertCircle, CheckCircle2, Clock, Upload, FileText } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useEffect } from "react"

interface LeaveRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffName: string
  hasApprovedLeave?: boolean
  onSubmit: (data: LeaveRequestData) => Promise<void>
}

export interface LeaveRequestData {
  startDate: Date
  endDate: Date
  reason: string
  leaveType: string
  leaveYearPeriod?: string
  documentFile?: File
  isDirectSubmit?: boolean
}

const DEFAULT_LEAVE_TYPES = [
  { value: "sick", label: "Sick Leave", color: "bg-red-50 border-red-200" },
  { value: "vacation", label: "Vacation/Annual Leave", color: "bg-blue-50 border-blue-200" },
  { value: "personal", label: "Personal Leave", color: "bg-purple-50 border-purple-200" },
  { value: "other", label: "Other", color: "bg-gray-50 border-gray-200" },
]

export function LeaveRequestDialog({ open, onOpenChange, staffName, hasApprovedLeave, onSubmit }: LeaveRequestDialogProps) {
  const [step, setStep] = useState<"type" | "dates" | "reason" | "document" | "confirm">(hasApprovedLeave ? "type" : "type")
  const [loading, setLoading] = useState(false)
  const [leaveTypeOptions, setLeaveTypeOptions] = useState(DEFAULT_LEAVE_TYPES)
  const [activePeriod, setActivePeriod] = useState("2026/2027")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<LeaveRequestData>({
    startDate: new Date(),
    endDate: new Date(),
    reason: "",
    leaveType: "annual",
    isDirectSubmit: hasApprovedLeave,
  })

  useEffect(() => {
    const loadPolicy = async () => {
      try {
        const response = await fetch("/api/leave/policy", { cache: "no-store" })
        const result = await response.json()
        if (!response.ok) return

        setActivePeriod(result.activePeriod || "2026/2027")
        const opts = (result.leaveTypes || []).map((t: any) => ({
          value: t.leaveTypeKey,
          label: `${t.leaveTypeLabel} (${t.entitlementDays} days)`,
          color: "bg-blue-50 border-blue-200",
        }))
        if (opts.length > 0) {
          setLeaveTypeOptions(opts)
          setFormData((prev) => ({ ...prev, leaveType: opts[0].value, leaveYearPeriod: result.activePeriod }))
        }
      } catch {
        // Keep default leave type options if policy endpoint fails.
      }
    }

    if (open) {
      void loadPolicy()
    }
  }, [open])

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const submitData = {
        ...formData,
        documentFile: uploadedFile || undefined,
      }
      await onSubmit(submitData)
      resetForm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(hasApprovedLeave ? "type" : "type")
    setFormData({
      startDate: new Date(),
      endDate: new Date(),
      reason: "",
      leaveType: leaveTypeOptions[0]?.value || "annual",
      leaveYearPeriod: activePeriod,
      isDirectSubmit: hasApprovedLeave,
    })
    setUploadedFile(null)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.size <= 5 * 1024 * 1024) {
      setUploadedFile(file)
    }
  }

  const daysDifference = Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{hasApprovedLeave ? "Submit Approved Leave" : "Request Leave"}</DialogTitle>
          <DialogDescription>
            {hasApprovedLeave
              ? "Submit your approved leave with supporting document"
              : `Submit your leave request for ${staffName}`}
          </DialogDescription>
        </DialogHeader>

        {hasApprovedLeave && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 font-medium">
              Your leave has been approved. Upload your document to activate the leave.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-4">
          {step === "type" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold">Leave Type</label>
              {leaveTypeOptions.map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    setFormData({ ...formData, leaveType: type.value as any })
                    setStep("dates")
                  }}
                  className={`w-full p-3 border-2 rounded-lg text-left font-medium transition-all ${
                    formData.leaveType === type.value ? `${type.color} border-current` : `${type.color} hover:border-current/50`
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          )}

          {step === "dates" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold block mb-2">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate.toISOString().split("T")[0]}
                  onChange={(e) => setFormData({ ...formData, startDate: new Date(e.target.value) })}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">End Date</label>
                <input
                  type="date"
                  value={formData.endDate.toISOString().split("T")[0]}
                  onChange={(e) => setFormData({ ...formData, endDate: new Date(e.target.value) })}
                  min={formData.startDate.toISOString().split("T")[0]}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-900">{daysDifference} day(s)</p>
                  <p className="text-sm text-blue-700">Total leave duration</p>
                </div>
              </div>
              <Button onClick={() => setStep("reason")} className="w-full">
                Continue
              </Button>
            </div>
          )}

          {step === "reason" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold">Reason for Leave</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Provide details about your leave request..."
                className="w-full p-3 border rounded-lg resize-none h-28"
              />
              <p className="text-xs text-muted-foreground">{formData.reason.length}/500 characters</p>
            </div>
          )}

          {step === "document" && hasApprovedLeave && (
            <div className="space-y-3">
              <label className="text-sm font-semibold">Upload Supporting Document</label>
              <p className="text-xs text-muted-foreground">
                Upload approval letter or medical certificate (PDF, JPG, PNG - max 5MB)
              </p>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="document-upload"
                />
                <label htmlFor="document-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium text-sm">Click to upload document</p>
                  {uploadedFile && (
                    <div className="mt-3 p-2 bg-green-50 rounded-lg flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">{uploadedFile.name}</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <Card className="bg-muted/50 border-0">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Leave Type:</span>
                    <span className="font-medium">{leaveTypeOptions.find((t) => t.value === formData.leaveType)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Duration:</span>
                    <span className="font-medium">{daysDifference} days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">From:</span>
                    <span className="font-medium">{formData.startDate.toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">To:</span>
                    <span className="font-medium">{formData.endDate.toLocaleDateString()}</span>
                  </div>
                  {uploadedFile && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Document:</span>
                      <span className="font-medium text-green-600">{uploadedFile.name}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
              {hasApprovedLeave && !uploadedFile && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    Document is required to activate approved leave.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                if (step === "type") onOpenChange(false)
                else setStep(step === "confirm" ? "document" : step === "document" ? "reason" : step === "reason" ? "dates" : "type")
              }}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => {
                if (step === "confirm") {
                  handleSubmit()
                } else if (step === "reason" && hasApprovedLeave) {
                  if (!formData.reason.trim()) return
                  setStep("document")
                } else if (step === "dates") {
                  setStep("reason")
                } else if (step === "reason") {
                  if (!formData.reason.trim()) return
                  setStep("confirm")
                } else if (step === "document") {
                  if (!uploadedFile) return
                  setStep("confirm")
                }
              }}
              disabled={
                loading ||
                (step === "reason" && !formData.reason.trim()) ||
                (step === "document" && !uploadedFile)
              }
              className="flex-1"
            >
              {step === "confirm" ? (loading ? "Submitting..." : "Submit Leave") : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
