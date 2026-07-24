"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Clock,
  PenLine,
  Send,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Building2,
} from "lucide-react"

interface StaffMemo {
  id: string
  staff_name: string
  staff_number: string | null
  staff_category: string | null
  memo_subject: string | null
  leave_period_start: string | null
  leave_period_end: string | null
  approved_days: number | null
  signer_name: string | null
  status: string
  created_at: string
  updated_at: string | null
}

// Status pipeline steps
const STEPS = [
  { key: "processing", label: "Processing", icon: Clock },
  { key: "signed_by_hr", label: "HR Signed", icon: PenLine },
  { key: "sent_to_finance", label: "Sent to Finance", icon: Send },
  { key: "acknowledged", label: "Acknowledged", icon: CheckCircle2 },
] as const

type StepKey = (typeof STEPS)[number]["key"]

function resolveStep(status: string): StepKey {
  const s = String(status || "").toLowerCase()
  if (s === "acknowledged_by_accounts") return "acknowledged"
  if (s === "forwarded_to_accounts") return "sent_to_finance"
  if (
    s === "signed_by_hr_executive" ||
    s === "reviewed_by_hr" ||
    s === "approved" ||
    s === "finalized"
  )
    return "signed_by_hr"
  return "processing"
}

function getStepIndex(key: StepKey): number {
  return STEPS.findIndex((s) => s.key === key)
}

function fmtPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "N/A"
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return fmt((start || end)!)
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function canDownload(status: string): boolean {
  const s = String(status || "").toLowerCase()
  return [
    "signed_by_hr_executive",
    "reviewed_by_hr",
    "forwarded_to_accounts",
    "acknowledged_by_accounts",
    "approved",
    "finalized",
  ].includes(s)
}

function StatusStepper({ currentStep }: { currentStep: StepKey }) {
  const activeIdx = getStepIndex(currentStep)

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCompleted = idx < activeIdx
        const isActive = idx === activeIdx
        const isFuture = idx > activeIdx

        return (
          <div key={step.key} className="flex items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                  isCompleted
                    ? "border-emerald-500 bg-emerald-500"
                    : isActive
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isCompleted
                      ? "text-white"
                      : isActive
                        ? "text-emerald-600"
                        : "text-slate-300"
                  }`}
                />
              </div>
              <span
                className={`text-[10px] font-medium leading-tight text-center max-w-[56px] ${
                  isCompleted || isActive ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {idx < STEPS.length - 1 && (
              <div
                className={`mx-1 h-0.5 w-8 shrink-0 rounded-full transition-all ${
                  idx < activeIdx ? "bg-emerald-500" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function StaffPaymentAdviceStatus() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [memos, setMemos] = useState<StaffMemo[]>([])

  useEffect(() => {
    const fetchMemos = async () => {
      try {
        const res = await fetch("/api/leave/payment-advice/staff-memos", { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to fetch payment advice")
        const data = await res.json()
        setMemos(data.memos || [])
      } catch (err: unknown) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load payment advice",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    void fetchMemos()
  }, [toast])

  const downloadMemo = (memoId: string) => {
    window.open(`/api/leave/payment-advice/download?memo_id=${memoId}`, "_blank")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (memos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <FileText className="h-6 w-6 text-slate-400" />
        </div>
        <p className="font-medium text-slate-600">No payment advice yet</p>
        <p className="mt-1 text-sm text-slate-400">
          Your payment advice will appear here once HR processes your leave
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {memos.map((memo) => {
        const currentStep = resolveStep(memo.status)
        const downloadable = canDownload(memo.status)

        return (
          <div
            key={memo.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Header row */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  {memo.memo_subject || "Leave Payment Advice"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {memo.staff_category ? `${memo.staff_category} Staff` : "Staff"}
                  {memo.approved_days != null && ` • ${memo.approved_days} days approved`}
                </p>
              </div>
              {downloadable && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 shrink-0"
                  onClick={() => downloadMemo(memo.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              )}
            </div>

            {/* Status stepper */}
            <div className="mb-5 overflow-x-auto">
              <StatusStepper currentStep={currentStep} />
            </div>

            {/* Details row */}
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-slate-500 mb-0.5">Leave Period</p>
                <p className="font-medium text-slate-700">
                  {fmtPeriod(memo.leave_period_start, memo.leave_period_end)}
                </p>
              </div>

              {memo.signer_name && (
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="text-emerald-600 mb-0.5">Signed by</p>
                  <p className="font-semibold text-emerald-700">{memo.signer_name}</p>
                </div>
              )}

              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-slate-500 mb-0.5">Date Processed</p>
                <p className="font-medium text-slate-700">{fmtDate(memo.created_at)}</p>
              </div>

              {currentStep === "sent_to_finance" || currentStep === "acknowledged" ? (
                <div className="rounded-lg bg-blue-50 p-2.5 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-blue-600 mb-0.5 text-[10px] font-medium">Destination</p>
                    <p className="font-semibold text-blue-700 text-xs">Finance Dept.</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Download prompt when signed but not yet downloadable */}
            {!downloadable && (
              <p className="mt-3 text-xs text-slate-400 italic">
                Download will be available once HR signs the memo
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
