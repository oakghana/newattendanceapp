"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Upload,
  FileText,
  X,
  ChevronRight,
  Sun,
  Stethoscope,
  User,
  MoreHorizontal,
  Umbrella,
  Baby,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

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
  isHalfDay?: boolean
  halfDayPeriod?: "morning" | "afternoon"
}

const LEAVE_ICONS: Record<string, React.ReactNode> = {
  sick: <Stethoscope className="h-5 w-5" />,
  vacation: <Sun className="h-5 w-5" />,
  annual: <Sun className="h-5 w-5" />,
  personal: <User className="h-5 w-5" />,
  maternity: <Baby className="h-5 w-5" />,
  paternity: <Baby className="h-5 w-5" />,
  study: <FileText className="h-5 w-5" />,
  emergency: <AlertCircle className="h-5 w-5" />,
  other: <MoreHorizontal className="h-5 w-5" />,
}

const LEAVE_COLORS: Record<string, string> = {
  sick: "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300",
  vacation: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-700 dark:text-sky-300",
  annual: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-700 dark:text-sky-300",
  personal: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-700 dark:text-violet-300",
  maternity: "bg-pink-50 border-pink-200 text-pink-700 dark:bg-pink-900/20 dark:border-pink-700 dark:text-pink-300",
  paternity: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300",
  emergency: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300",
  other: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300",
}

const DEFAULT_LEAVE_TYPES = [
  { value: "sick", label: "Sick Leave" },
  { value: "vacation", label: "Vacation / Annual Leave" },
  { value: "personal", label: "Personal Leave" },
  { value: "emergency", label: "Emergency Leave" },
  { value: "other", label: "Other" },
]

type Step = "type" | "dates" | "reason" | "document" | "confirm"
const STEPS: Step[] = ["type", "dates", "reason", "document", "confirm"]
const STEPS_NO_DOC: Step[] = ["type", "dates", "reason", "confirm"]

function stepIndex(step: Step, hasDoc: boolean) {
  return (hasDoc ? STEPS : STEPS_NO_DOC).indexOf(step)
}

export function LeaveRequestDialog({ open, onOpenChange, staffName, hasApprovedLeave, onSubmit }: LeaveRequestDialogProps) {
  const [step, setStep] = useState<Step>("type")
  const [loading, setLoading] = useState(false)
  const [leaveTypeOptions, setLeaveTypeOptions] = useState(DEFAULT_LEAVE_TYPES)
  const [activePeriod, setActivePeriod] = useState("2026/2027")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState<"morning" | "afternoon">("morning")
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
          label: t.leaveTypeLabel,
        }))
        if (opts.length > 0) {
          setLeaveTypeOptions(opts)
          setFormData((prev) => ({ ...prev, leaveType: opts[0].value, leaveYearPeriod: result.activePeriod }))
        }
      } catch {
        // Keep defaults
      }
    }
    if (open) {
      setStep("type")
      setIsHalfDay(false)
      void loadPolicy()
    }
  }, [open])

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await onSubmit({
        ...formData,
        documentFile: uploadedFile || undefined,
        isHalfDay,
        halfDayPeriod: isHalfDay ? halfDayPeriod : undefined,
      })
      resetForm()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep("type")
    setUploadedFile(null)
    setIsHalfDay(false)
    setFormData({
      startDate: new Date(),
      endDate: new Date(),
      reason: "",
      leaveType: leaveTypeOptions[0]?.value || "annual",
      leaveYearPeriod: activePeriod,
      isDirectSubmit: hasApprovedLeave,
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.size <= 5 * 1024 * 1024) setUploadedFile(file)
  }

  const steps = hasApprovedLeave ? STEPS : STEPS_NO_DOC
  const currentIdx = stepIndex(step, !!hasApprovedLeave)
  const totalSteps = steps.length

  const daysDifference = isHalfDay
    ? 0.5
    : Math.max(1, Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)

  const selectedType = leaveTypeOptions.find((t) => t.value === formData.leaveType)
  const typeColor = LEAVE_COLORS[formData.leaveType] || LEAVE_COLORS.other
  const typeIcon = LEAVE_ICONS[formData.leaveType] || LEAVE_ICONS.other

  const goNext = () => {
    const next = steps[currentIdx + 1]
    if (next) setStep(next)
  }
  const goBack = () => {
    if (currentIdx === 0) { onOpenChange(false); return }
    const prev = steps[currentIdx - 1]
    if (prev) setStep(prev)
  }

  const canProceed =
    step === "type" ? !!formData.leaveType :
    step === "dates" ? formData.endDate >= formData.startDate :
    step === "reason" ? formData.reason.trim().length >= 3 :
    step === "document" ? !!uploadedFile :
    true

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl gap-0 [&>button]:hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 px-6 pt-5 pb-5 text-white">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-xl bg-white/10 p-2.5">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-base leading-tight">
                {hasApprovedLeave ? "Activate Approved Leave" : "New Leave Request"}
              </h2>
              <p className="text-xs text-white/60">{staffName} · {activePeriod}</p>
            </div>
          </div>
          {/* Step progress */}
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i < currentIdx ? "bg-emerald-400 flex-1" :
                  i === currentIdx ? "bg-white flex-[2]" :
                  "bg-white/25 flex-1"
                )} />
              </React.Fragment>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-white/50">Step {currentIdx + 1} of {totalSteps}</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[62vh] overflow-y-auto">
          {hasApprovedLeave && (
            <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Your leave is approved — upload your document to activate it.
            </div>
          )}

          {/* Step: Type */}
          {step === "type" && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Select Leave Type</p>
              <div className="grid grid-cols-1 gap-2">
                {leaveTypeOptions.map((type) => {
                  const isSelected = formData.leaveType === type.value
                  const color = LEAVE_COLORS[type.value] || LEAVE_COLORS.other
                  const icon = LEAVE_ICONS[type.value] || LEAVE_ICONS.other
                  return (
                    <button
                      key={type.value}
                      onClick={() => {
                        setFormData((p) => ({ ...p, leaveType: type.value }))
                        setStep("dates")
                      }}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]",
                        isSelected ? color + " ring-2 ring-offset-1 ring-current" : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      <span className={cn("rounded-lg p-2", isSelected ? "bg-current/10" : "bg-muted")}>
                        {icon}
                      </span>
                      <span className="font-medium text-sm flex-1">{type.label}</span>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step: Dates */}
          {step === "dates" && (
            <div className="space-y-4">
              {/* Half-day toggle */}
              <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Half-day leave</p>
                  <p className="text-xs text-muted-foreground">Take morning or afternoon off</p>
                </div>
                <button
                  onClick={() => setIsHalfDay(!isHalfDay)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors",
                    isHalfDay ? "bg-blue-600" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all",
                    isHalfDay ? "left-6" : "left-1"
                  )} />
                </button>
              </div>

              {isHalfDay && (
                <div className="grid grid-cols-2 gap-2">
                  {(["morning", "afternoon"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setHalfDayPeriod(p)}
                      className={cn(
                        "py-2.5 rounded-xl border-2 text-sm font-medium capitalize transition-all",
                        halfDayPeriod === p
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {p === "morning" ? "🌅 Morning" : "🌇 Afternoon"}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate.toISOString().split("T")[0]}
                    onChange={(e) => {
                      const d = new Date(e.target.value)
                      setFormData((p) => ({ ...p, startDate: d, endDate: isHalfDay ? d : p.endDate < d ? d : p.endDate }))
                    }}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2.5 border rounded-xl bg-background text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                {!isHalfDay && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={formData.endDate.toISOString().split("T")[0]}
                      onChange={(e) => setFormData((p) => ({ ...p, endDate: new Date(e.target.value) }))}
                      min={formData.startDate.toISOString().split("T")[0]}
                      className="w-full px-3 py-2.5 border rounded-xl bg-background text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Summary chip */}
              <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", typeColor)}>
                {typeIcon}
                <div>
                  <p className="font-semibold text-sm">{daysDifference} day{daysDifference !== 1 ? "s" : ""}</p>
                  <p className="text-xs opacity-80">
                    {isHalfDay
                      ? `${halfDayPeriod} half-day on ${formData.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : `${formData.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${formData.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Reason */}
          {step === "reason" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Reason for Leave</p>
              <p className="text-xs text-muted-foreground">
                Your HOD and HR will review this reason. Be clear and concise.
              </p>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))}
                placeholder="e.g., Annual family trip, medical procedure, personal matter…"
                className="w-full px-3 py-3 border rounded-xl bg-background text-sm resize-none h-28 focus:ring-2 focus:ring-blue-500 outline-none"
                maxLength={500}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-right">{formData.reason.length}/500</p>
            </div>
          )}

          {/* Step: Document */}
          {step === "document" && hasApprovedLeave && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Supporting Document</p>
              <p className="text-xs text-muted-foreground">Approval letter, medical cert, or relevant document (PDF/JPG/PNG · max 5 MB)</p>
              <label
                htmlFor="document-upload"
                className={cn(
                  "flex flex-col items-center justify-center w-full border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all",
                  uploadedFile
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-border hover:border-blue-400 hover:bg-muted/40"
                )}
              >
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="hidden" id="document-upload" />
                {uploadedFile ? (
                  <>
                    <FileText className="h-10 w-10 text-emerald-500 mb-2" />
                    <p className="font-medium text-sm text-emerald-700 dark:text-emerald-300">{uploadedFile.name}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{(uploadedFile.size / 1024).toFixed(0)} KB · Click to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="font-medium text-sm">Click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
                  </>
                )}
              </label>
            </div>
          )}

          {/* Step: Confirm */}
          {step === "confirm" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Review Your Request</p>
              <div className="rounded-2xl border divide-y overflow-hidden">
                {[
                  { label: "Leave Type", value: selectedType?.label ?? formData.leaveType },
                  { label: "Duration", value: `${daysDifference} day${daysDifference !== 1 ? "s" : ""}${isHalfDay ? ` (${halfDayPeriod})` : ""}` },
                  { label: "Start Date", value: formData.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
                  ...(!isHalfDay ? [{ label: "End Date", value: formData.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) }] : []),
                  { label: "Reason", value: formData.reason },
                  ...(uploadedFile ? [{ label: "Document", value: uploadedFile.name }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="text-xs text-muted-foreground font-medium w-24 shrink-0 pt-0.5">{label}</span>
                    <span className="text-sm text-right text-foreground font-medium break-words max-w-[200px]">{value}</span>
                  </div>
                ))}
              </div>
              {hasApprovedLeave && !uploadedFile && (
                <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
                    A supporting document is required to activate approved leave.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "type" && (
          <div className="border-t px-6 py-4 flex gap-2 bg-background">
            <Button variant="outline" onClick={goBack} className="flex-1" disabled={loading}>
              Back
            </Button>
            {step !== "confirm" ? (
              <Button
                onClick={goNext}
                className="flex-1"
                disabled={!canProceed}
              >
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={loading || (hasApprovedLeave && !uploadedFile)}
              >
                {loading ? (
                  <><span className="animate-spin mr-2">⟳</span>Submitting…</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" />Submit Request</>
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


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
