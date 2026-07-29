"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, FileText, Loader2, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DisbursedLoan {
  id: string
  request_number: string
  staff_full_name: string
  staff_number: string
  staff_department: string
  loan_type_label: string
  fixed_amount: number
  status: string
  md_approved_at: string | null
  staff_receiving_funds_confirmed_at: string | null
  staff_receiving_funds_confirmed_by: string | null
  created_at: string
}

interface DisbursementConfirmationClientProps {
  loans: DisbursedLoan[]
}

export function DisbursementConfirmationClient({ loans: initialLoans }: DisbursementConfirmationClientProps) {
  const [loans, setLoans] = useState(initialLoans)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const supabase = createClient()
  const { toast } = useToast()

  const handleConfirmDisbursement = async (loanId: string) => {
    setConfirmingId(loanId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Get current user's name for confirmation tracking
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle()

      const confirmedByName = profile 
        ? `${profile.first_name} ${profile.last_name}`
        : "Unknown User"

      // Update loan status to mark funds as received
      const { error: updateError } = await supabase
        .from("loan_requests")
        .update({
          status: "partially_recovered",
          staff_receiving_funds_confirmed_at: new Date().toISOString(),
          staff_receiving_funds_confirmed_by: confirmedByName,
        })
        .eq("id", loanId)

      if (updateError) throw updateError

      // Update local state
      setLoans((prev) =>
        prev.map((loan) =>
          loan.id === loanId
            ? {
                ...loan,
                status: "partially_recovered",
                staff_receiving_funds_confirmed_at: new Date().toISOString(),
                staff_receiving_funds_confirmed_by: confirmedByName,
              }
            : loan
        )
      )

      toast({
        title: "Disbursement Confirmed",
        description: `Loan ${loans.find((l) => l.id === loanId)?.request_number} marked as received.`,
      })
    } catch (error) {
      toast({
        title: "Error confirming disbursement",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setConfirmingId(null)
    }
  }

  const pendingDisbursements = loans.filter((l) => !l.staff_receiving_funds_confirmed_at)
  const confirmedDisbursements = loans.filter((l) => l.staff_receiving_funds_confirmed_at)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Disbursement Confirmation</h1>
          <p className="text-slate-500 mt-2">Confirm staff have received their loan disbursements</p>
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

        {/* Pending Section */}
        {pendingDisbursements.length > 0 && (
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
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                          {String(loan.staff_full_name || "?").split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{loan.staff_full_name || "Unknown"}</h3>
                          <p className="text-xs text-slate-500">{loan.staff_number} • {loan.staff_department}</p>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmed Section */}
        {confirmedDisbursements.length > 0 && (
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
                  <a
                    href={`/api/loan/memo/${loan.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white hover:bg-slate-50 border border-slate-200 rounded text-slate-700 font-medium transition-colors flex-shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Memo
                  </a>
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
