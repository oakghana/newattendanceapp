"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, FileText, Loader2, Download, Eye } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { canConfirmDisbursement } from "@/lib/role-capabilities"

interface DisbursedLoan {
  id: string
  request_number: string
  staff_full_name: string
  staff_number: string
  staff_rank?: string
  corporate_email?: string
  loan_type_label: string
  fixed_amount: number
  status: string
  md_approved_at: string | null
  staff_receiving_funds_confirmed_at: string | null
  staff_receiving_funds_confirmed_by: string | null
  created_at: string
  department_name?: string
  recovery_start_date?: string | null
  recovery_months?: number | null
  repayment_duration_months?: number | null
  disbursement_date?: string | null
  disbursement_confirmed_at?: string | null
}

interface DisbursementConfirmationClientProps {
  loans: DisbursedLoan[]
  userProfile?: any
}

export function DisbursementConfirmationClient({ loans: initialLoans, userProfile }: DisbursementConfirmationClientProps) {
  const [loans, setLoans] = useState(initialLoans)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"pending" | "repayment" | "confirmed">("pending")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const { toast } = useToast()

  const canConfirm = canConfirmDisbursement(userProfile?.role)

  const handleConfirmDisbursement = async (loanId: string) => {
    if (!canConfirm) {
      toast({
        title: "Permission Denied",
        description: "Only the Accounts Office and Accounts Executive are authorized to initiate or confirm loan disbursements.",
        variant: "destructive",
      })
      return
    }

    setConfirmingId(loanId)
    try {
      const res = await fetch("/api/loan/disbursement-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loan_id: loanId }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to confirm disbursement")
      }

      const confirmedByName = data.confirmedByName || "Accounts Officer"
      const confirmedAt = data.confirmedAt || new Date().toISOString()

      // Update local state smoothly
      setLoans((prev) =>
        prev.map((loan) =>
          loan.id === loanId
            ? {
                ...loan,
                status: "partially_recovered",
                staff_receiving_funds_confirmed_at: confirmedAt,
                staff_receiving_funds_confirmed_by: confirmedByName,
              }
            : loan
        )
      )

      const targetLoan = loans.find((l) => l.id === loanId)
      toast({
        title: "Disbursement Confirmed",
        description: `Loan ${targetLoan?.request_number || loanId} for ${targetLoan?.staff_full_name || "Staff"} marked as received.`,
      })
    } catch (error: any) {
      console.error("[v0] Error confirming disbursement:", error)
      toast({
        title: "Error confirming disbursement",
        description: error?.message || "An unexpected error occurred while confirming disbursement.",
        variant: "destructive",
      })
    } finally {
      setConfirmingId(null)
    }
  }

  const pendingDisbursements = loans.filter((l) => !l.staff_receiving_funds_confirmed_at)
  // Repayment Tracking starts from every account-confirmed disbursement, regardless of
  // the repayment status label assigned by the imported or current workflow.
  const paymentStaging = loans.filter((l) => Boolean(l.staff_receiving_funds_confirmed_at))
  const confirmedDisbursements = loans.filter((l) => l.staff_receiving_funds_confirmed_at && !paymentStaging.some((staged) => staged.id === l.id))
  const tabLoans = activeTab === "pending" ? pendingDisbursements : activeTab === "repayment" ? paymentStaging : confirmedDisbursements
  const pageCount = Math.max(1, Math.ceil(tabLoans.length / pageSize))
  const visibleLoans = useMemo(() => tabLoans.slice((page - 1) * pageSize, page * pageSize), [tabLoans, page, pageSize])
  const changeTab = (tab: "pending" | "repayment" | "confirmed") => { setActiveTab(tab); setPage(1) }
  const changePageSize = (value: string) => { setPageSize(Number(value)); setPage(1) }
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const generateSchedule = async (loan: DisbursedLoan) => {
    setGeneratingId(loan.id)
    try {
      const duration = loan.recovery_months || loan.repayment_duration_months || 12
      const startDate = loan.recovery_start_date || loan.disbursement_date || loan.disbursement_confirmed_at || loan.staff_receiving_funds_confirmed_at || new Date().toISOString().slice(0, 10)
      const response = await fetch('/api/loan/repayment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loanRequestId: loan.id, startDate, durationMonths: duration }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to generate repayment schedule')
      toast({ title: 'Repayment schedule ready', description: `The schedule for ${loan.staff_full_name || loan.request_number} has been generated.` })
    } catch (error: any) {
      toast({ title: 'Schedule generation failed', description: error?.message || 'Unable to generate repayment schedule.', variant: 'destructive' })
    } finally { setGeneratingId(null) }
  }

  const renderLoanCard = (loan: DisbursedLoan) => {
    const pending = !loan.staff_receiving_funds_confirmed_at
    return <div key={loan.id} className={`rounded-xl border p-4 transition-all ${pending ? "border-amber-200 bg-gradient-to-r from-white to-amber-50 hover:border-amber-300" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1"><div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{loan.staff_full_name ? loan.staff_full_name.split(" ").filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 2) : "ST"}</div><div className="min-w-0"><p className="font-bold text-slate-900 truncate">{loan.request_number} · {loan.staff_full_name || "Staff Member"}</p><p className="text-xs text-slate-500 truncate">{loan.staff_number && `#${loan.staff_number} · `}{loan.department_name || ""}{loan.staff_rank && ` · ${loan.staff_rank}`}</p><div className="flex items-center gap-3 text-sm flex-wrap mt-1"><span className="font-semibold text-slate-700">GHc {Number(loan.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span><span className="text-xs text-slate-400">{loan.loan_type_label}</span>{!pending && <span className="text-xs text-slate-500">Confirmed by {loan.staff_receiving_funds_confirmed_by || "Accounts"} on {new Date(loan.staff_receiving_funds_confirmed_at!).toLocaleDateString("en-GB")}</span>}</div></div></div>
        {pending && canConfirm ? <Button onClick={() => handleConfirmDisbursement(loan.id)} disabled={confirmingId === loan.id} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">{confirmingId === loan.id ? <><Loader2 className="h-4 w-4 animate-spin" />Confirming...</> : <><CheckCircle2 className="h-4 w-4" />Confirm Received</>}</Button> : pending ? <Badge variant="outline" className="bg-slate-100 text-slate-600"><Eye className="h-3.5 w-3.5 mr-1" />View Only</Badge> : activeTab === "repayment" ? <Button variant="default" onClick={() => void generateSchedule(loan)} disabled={generatingId === loan.id}><FileText className="h-3.5 w-3.5" />{generatingId === loan.id ? "Generating..." : "Generate Schedule"}</Button> : <Button variant="outline" onClick={async () => { const res = await fetch("/api/loan/memo-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: loan.id }) }); const data = await res.json(); if (data.path) window.open(data.path, "_blank") }}><Download className="h-3.5 w-3.5" />Memo</Button>}
      </div>
    </div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Disbursement Confirmation</h1>
          <p className="text-slate-500 mt-2">Confirm staff have received approved MD loans. Confirmation activates the repayment schedule and makes the loan available for repayment tracking.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Pending Confirmations</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{pendingDisbursements.length}</p>
              </div>
              <Clock className="h-10 w-10 text-amber-500 opacity-20" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Confirmed</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{confirmedDisbursements.length}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-20" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Amount</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  GHc {loans.reduce((sum, l) => sum + (l.fixed_amount || 0), 0).toLocaleString()}
                </p>
              </div>
              <FileText className="h-10 w-10 text-slate-400 opacity-20" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Disbursement status">
              {[{ key: "pending" as const, label: "Pending Confirmation", count: pendingDisbursements.length }, { key: "repayment" as const, label: "Repayment Tracking", count: paymentStaging.length }, { key: "confirmed" as const, label: "Confirmed", count: confirmedDisbursements.length }].map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} onClick={() => changeTab(tab.key)} className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{tab.label} <span className="ml-1 text-xs text-slate-400">{tab.count}</span></button>)}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-500">Rows per page<select value={pageSize} onChange={(event) => changePageSize(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-slate-900"><option value="10">10</option><option value="50">50</option><option value="100">100</option></select></label>
          </div>
          <div className="space-y-3 p-4">{visibleLoans.length > 0 ? visibleLoans.map(renderLoanCard) : <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">No loans in this tab.</div>}</div>
          {tabLoans.length > 0 && <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500"><span>Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, tabLoans.length)} of {tabLoans.length}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button><span className="min-w-16 text-center">Page {page} of {pageCount}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next</Button></div></div>}
        </div>

        {/* Pending Section */}
        {false && pendingDisbursements.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pending Confirmations ({pendingDisbursements.length})
            </h2>
            <div className="space-y-3">
              {pendingDisbursements.map((loan) => (
                <div
                  key={loan.id}
                  className="rounded-xl border border-amber-200 bg-gradient-to-r from-white to-amber-50 p-4 hover:border-amber-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[250px]">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 font-bold text-sm flex-shrink-0 shadow-sm">
                          {loan.staff_full_name
                            ? loan.staff_full_name.split(" ").filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 2)
                            : (loan.staff_number ? String(loan.staff_number).slice(0, 2) : "ST")}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{loan.staff_full_name || (loan.staff_number ? `Staff #${loan.staff_number}` : "Staff Member")}</h3>
                          <p className="text-xs text-slate-500 font-medium">
                            {loan.staff_number && <span>#{loan.staff_number}</span>}
                            {loan.staff_rank && <span> • {loan.staff_rank}</span>}
                            {loan.department_name && <span> • {loan.department_name}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                        <span className="font-semibold text-slate-700">{loan.request_number}</span>
                        <span className="font-semibold text-amber-700">
                          GHc {Number(loan.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-slate-400">{loan.loan_type_label}</span>
                      </div>
                    </div>
                    {canConfirm ? (
                      <Button
                        onClick={() => handleConfirmDisbursement(loan.id)}
                        disabled={confirmingId === loan.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2 rounded-lg inline-flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {confirmingId === loan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Confirming...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Confirm Received
                          </>
                        )}
                      </Button>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-medium px-3 py-1.5 flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        View Only (Accounts Only)
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed Section */}
        {false && confirmedDisbursements.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Confirmed ({confirmedDisbursements.length})
            </h2>
            <div className="space-y-2">
              {confirmedDisbursements.map((loan) => (
                <div
                  key={loan.id}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{loan.request_number} • {loan.staff_full_name}</p>
                      <p className="text-xs text-slate-500">
                        Confirmed by {loan.staff_receiving_funds_confirmed_by} on{" "}
                        {loan.staff_receiving_funds_confirmed_at
                          ? new Date(loan.staff_receiving_funds_confirmed_at).toLocaleDateString("en-GB")
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/loan/memo-link", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: loan.id }),
                        })
                        const data = await res.json()
                        if (data.path) window.open(data.path, "_blank")
                        else alert(data.error || "Could not generate memo link")
                      } catch {
                        alert("Failed to open memo")
                      }
                    }}
                    className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white hover:bg-slate-50 border border-slate-200 rounded text-slate-700 font-medium transition-colors flex-shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Memo
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {loans.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No disbursements to confirm</h3>
            <p className="text-slate-500 mt-2">All loans have been processed.</p>
          </div>
        )}
      </div>
    </div>
  )
}
