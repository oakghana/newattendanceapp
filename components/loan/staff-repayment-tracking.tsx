"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, CircleDollarSign, Info, WalletCards } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Loan = {
  id: string
  request_number?: string | null
  loan_type_label?: string | null
  fixed_amount?: number | null
  requested_amount?: number | null
  status?: string | null
  repayment_plan_generated_at?: string | null
  md_approved_at?: string | null
}

type ScheduleRow = {
  loan_request_id: string
  installment_number: number
  due_date: string
  monthly_amount: number
  paid_amount?: number | null
  status: string
}

function money(value: number) {
  return `GHc ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

export function StaffRepaymentTracking({ loans }: { loans: Loan[] }) {
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const active = loans.filter((loan) => Boolean(loan.md_approved_at) && ["approved_director", "md_final_approved", "approved", "active", "partially_recovered", "disbursed", "staff_receiving_funds"].includes(String(loan.status)))
        const responses = await Promise.all(active.map((loan) => fetch(`/api/loan/repayment?loanRequestId=${encodeURIComponent(loan.id)}`).then((res) => res.json())))
        if (!cancelled) setRows(responses.flatMap((response) => response.success ? response.data || [] : []))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loans])

  const approvedLoans = useMemo(() => loans.filter((loan) => Boolean(loan.md_approved_at) && ["approved_director", "md_final_approved", "approved", "active", "partially_recovered", "disbursed", "staff_receiving_funds"].includes(String(loan.status))), [loans])

  const summaries = useMemo(() => approvedLoans.map((loan) => {
    const schedule = rows.filter((row) => row.loan_request_id === loan.id).sort((a, b) => a.installment_number - b.installment_number)
    const unpaid = schedule.filter((row) => !["paid", "waived"].includes(row.status))
    const paid = schedule.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0)
    const total = Number(loan.fixed_amount ?? loan.requested_amount ?? 0)
    return { loan, schedule, unpaid, paid, outstanding: Math.max(0, total - paid), next: unpaid[0], completion: schedule.at(-1)?.due_date }
  }).filter((item) => item.schedule.length > 0), [approvedLoans, rows])

  if (approvedLoans.length === 0) return null

  return (
    <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-600 p-2 text-white"><WalletCards className="h-5 w-5" /></div>
          <div>
            <CardTitle className="text-lg text-emerald-950">Your repayment tracking</CardTitle>
            <p className="mt-1 text-sm leading-6 text-emerald-900/75">Your loan has received final approval. Repayment details are shown below.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading your repayment schedule…</p> : summaries.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-white/70 p-4 text-sm text-emerald-900"><Info className="h-4 w-4" /> Repayment details will appear after Accounts initiates deductions.</div>
        ) : <div className="space-y-4">{summaries.map(({ loan, unpaid, outstanding, next, completion, paid }) => (
          <div key={loan.id} className="rounded-xl border border-emerald-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{loan.loan_type_label || "Loan"}</p><p className="text-xs text-muted-foreground">{loan.request_number || "Loan account"}</p></div><Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Deductions active</Badge></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Current balance</p><p className="mt-1 font-bold text-slate-900">{money(outstanding)}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Next deduction</p><p className="mt-1 font-bold text-slate-900">{next ? money(Number(next.monthly_amount)) : "Completed"}</p><p className="text-xs text-muted-foreground">{next ? date(next.due_date) : "No balance remaining"}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Expected completion</p><p className="mt-1 font-bold text-slate-900">{date(completion)}</p><p className="text-xs text-muted-foreground">{unpaid.length} installment{unpaid.length === 1 ? "" : "s"} remaining</p></div></div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="h-3.5 w-3.5" /> Paid to date: {money(paid)} <CalendarClock className="ml-2 h-3.5 w-3.5" /> Schedule is maintained by Accounts.</p>
          </div>
        ))}</div>}
      </CardContent>
    </Card>
  )
}
