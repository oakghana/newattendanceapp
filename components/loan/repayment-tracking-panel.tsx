'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Wallet } from 'lucide-react'

type LoanLite = {
  id: string
  request_number?: string
  staff_full_name?: string | null
  staff_number?: string | null
  loan_type_label?: string
  fixed_amount?: number | null
  requested_amount?: number | null
  status?: string
  recovery_months?: number | null
  repayment_duration_months?: number | null
  recovery_start_date?: string | null
  disbursement_date?: string | null
  disbursement_confirmed_at?: string | null
  staff_receiving_funds_confirmed_at?: string | null
  md_approved_at?: string | null
  repayment_status?: string | null
}

type ScheduleRow = {
  id: string
  loan_request_id: string
  installment_number: number
  due_date: string
  monthly_amount: number
  paid_amount?: number | null
  paid_date?: string | null
  status?: string
}

const TRACKABLE = new Set(['partially_recovered', 'payment_completed'])

export function RepaymentTrackingPanel({ loans }: { loans: LoanLite[] }) {
  const [loading, setLoading] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    const unique = new Map<string, LoanLite>()
    for (const loan of loans || []) {
      if (!loan?.id || unique.has(loan.id)) continue
      const hasDisbursementEvidence = loan.disbursement_date || loan.staff_receiving_funds_confirmed_at || loan.disbursement_confirmed_at || loan.md_approved_at
      if (!TRACKABLE.has(String(loan.status || '')) || !loan.md_approved_at || !hasDisbursementEvidence) continue
      unique.set(loan.id, loan)
    }
    return Array.from(unique.values()).filter((l) => {
      if (!q) return true
      return [l.staff_full_name, l.staff_number, l.request_number, l.loan_type_label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [loans, search])

  useEffect(() => {
    if (!selectedId && candidates[0]?.id) setSelectedId(candidates[0].id)
  }, [candidates, selectedId])

  const loadSchedule = async (loanId: string) => {
    if (!loanId) {
      setSchedule([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/loan/repayment?loanRequestId=${encodeURIComponent(loanId)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to load repayment schedule')
        setSchedule([])
        return
      }
      setSchedule(json.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load repayment schedule')
      setSchedule([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedId) void loadSchedule(selectedId)
  }, [selectedId])

  const selected = candidates.find((c) => c.id === selectedId) || null

  const generateSchedule = async () => {
    if (!selected) return
    setGenerating(true)
    setError(null)
    try {
      const duration = selected.recovery_months || selected.repayment_duration_months || 12
      const startDate = selected.recovery_start_date || selected.disbursement_date || selected.disbursement_confirmed_at || selected.staff_receiving_funds_confirmed_at || new Date().toISOString().slice(0, 10)
      const res = await fetch('/api/loan/repayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanRequestId: selected.id,
          startDate,
          durationMonths: duration,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to generate schedule')
        return
      }
      await loadSchedule(selected.id)
    } catch (e: any) {
      setError(e?.message || 'Failed to generate schedule')
    } finally {
      setGenerating(false)
    }
  }

  const amount = (l: LoanLite) => Number(l.fixed_amount || l.requested_amount || 0)

  const confirmPayment = async (row: ScheduleRow, paymentStatus: 'paid' | 'not_paid') => {
    setConfirmingId(row.id)
    setError(null)
    try {
      const res = await fetch('/api/loan/repayment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm_payment', scheduleId: row.id, paymentStatus }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unable to save payment confirmation')
      await loadSchedule(selectedId)
    } catch (e: any) { setError(e?.message || 'Unable to save payment confirmation') } finally { setConfirmingId(null) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-violet-600" />
            Repayment Tracking
          </CardTitle>
          <CardDescription>
            Track every confirmed loan repayment from the schedule. Accounts or the HR Loan Office confirms payment status, while staff can view their due dates, paid amounts, balance, and expected completion date for planning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff or request number..."
              className="max-w-sm"
            />
            <Button variant="outline" size="sm" className="gap-1" onClick={() => selectedId && void loadSchedule(selectedId)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
              No loans currently in a repayable / post-approval stage. Approved loans will appear here automatically.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="max-h-[480px] space-y-2 overflow-y-auto lg:col-span-2">
                {candidates.map((loan) => (
                  <button
                    key={loan.id}
                    type="button"
                    data-loan-repayment-item
                    onClick={() => setSelectedId(loan.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                      selectedId === loan.id ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-slate-900">{loan.staff_full_name || 'Staff'}</div>
                    <div className="text-xs text-slate-600">
                      {loan.request_number} · {loan.loan_type_label || 'Loan'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline" className="border-slate-300 bg-white text-[10px] text-slate-700">{loan.status}</Badge>
                      <Badge variant="outline" className="border-slate-300 bg-white text-[10px] text-slate-700">
                        GHc {amount(loan).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-3 lg:col-span-3">
                {selected && (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{selected.staff_full_name}</p>
                        <p className="text-xs text-slate-500">
                          {selected.request_number} · {selected.staff_number || '—'} · {selected.loan_type_label}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => void generateSchedule()} disabled={generating}>
                        {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                        {schedule.length ? 'Regenerate Schedule' : 'Generate Schedule'}
                      </Button>
                    </div>
                    {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
                    {loading ? (
                      <p className="text-sm text-slate-500">Loading schedule...</p>
                    ) : schedule.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No installment rows yet. Click <strong>Generate Schedule</strong> to create monthly repayments.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50 text-left text-xs text-slate-600">
                              <th className="px-2 py-2">#</th>
                              <th className="px-2 py-2">Due</th>
                              <th className="px-2 py-2">Amount</th>
                              <th className="px-2 py-2">Paid</th>
                              <th className="px-2 py-2">Status</th>
                              <th className="px-2 py-2">Accounts confirmation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schedule.map((row) => (
                              <tr key={row.id} className="border-b border-slate-100">
                                <td className="px-2 py-2">{row.installment_number}</td>
                                <td className="px-2 py-2">{row.due_date ? new Date(row.due_date).toLocaleDateString('en-GB') : '—'}</td>
                                <td className="px-2 py-2">
                                  GHc {Number(row.monthly_amount || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-2">
                                  GHc {Number(row.paid_amount || 0).toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-2">
                                  <Badge variant="outline" className="text-[10px]">{row.status || 'pending'}</Badge>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="outline" disabled={confirmingId === row.id} onClick={() => void confirmPayment(row, 'paid')}>Paid</Button>
                                    <Button size="sm" variant="ghost" disabled={confirmingId === row.id} onClick={() => void confirmPayment(row, 'not_paid')}>Not paid</Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
