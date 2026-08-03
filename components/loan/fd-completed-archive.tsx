'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle, XCircle, FileText, RefreshCw, Loader2, Edit2, Save, X } from 'lucide-react'
import { GOOD_FD_THRESHOLD, isPoorFdScore } from '@/lib/loan-workflow'
import { useToast } from '@/hooks/use-toast'
import { FdCalculationSummary } from './fd-calculation-summary'

type CompletedFdReview = {
  id: string
  request_number?: string
  staff_name?: string
  staff_number?: string
  loan_type?: string
  requested_amount?: number
  repayment_months?: number
  fd_score?: number | null
  fd_good?: boolean | null
  fd_note?: string | null
  submission_memo?: string | null
  submission_date?: string
  status?: string
  review_status?: string
  user_role?: string
}

export function FdCompletedArchive({ userRole }: { userRole?: string }) {
  const [rows, setRows] = useState<CompletedFdReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingFd, setEditingFd] = useState<number | null>(null)
  const [editingReason, setEditingReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const isLoanOffice = userRole === 'loan_office'

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // Pull approved (incl. forwarded to HR loan office) and rejected FD decisions
      const [approvedRes, rejectedRes] = await Promise.all([
        fetch('/api/loan/fd-review?status=approved', { cache: 'no-store' }),
        fetch('/api/loan/fd-review?status=rejected', { cache: 'no-store' }),
      ])
      const approvedJson = approvedRes.ok ? await approvedRes.json() : { reviews: [] }
      const rejectedJson = rejectedRes.ok ? await rejectedRes.json() : { reviews: [] }

      const mapRow = (r: any, fallback: 'approved' | 'rejected'): CompletedFdReview => ({
        id: r.id,
        request_number: r.request_number,
        staff_name: r.staff_name,
        staff_number: r.staff_number,
        loan_type: r.loan_type,
        requested_amount: r.requested_amount,
        repayment_months: r.repayment_months,
        fd_score: r.fd_score,
        fd_good: r.fd_good,
        fd_note: r.fd_note,
        submission_memo: r.submission_memo,
        submission_date: r.submission_date,
        status: r.status,
        review_status: r.review_status || fallback,
      })

      const merged = [
        ...(approvedJson.reviews || []).map((r: any) => mapRow(r, 'approved')),
        ...(rejectedJson.reviews || []).map((r: any) => mapRow(r, 'rejected')),
      ]
      // Dedupe by id (prefer approved listing)
      const byId = new Map<string, CompletedFdReview>()
      for (const row of merged) {
        if (!byId.has(row.id)) byId.set(row.id, row)
      }
      setRows(Array.from(byId.values()).sort((a, b) =>
        String(b.submission_date || '').localeCompare(String(a.submission_date || '')),
      ))
    } catch (e: any) {
      console.error('[v0] FD completed archive load error:', e)
      setError(e?.message || 'Failed to load completed FD records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleEditFd = async (rowId: string) => {
    if (!editingFd || !editingReason.trim() || editingFd < 0 || editingFd > 100) {
      toast({ title: 'Error', description: 'Please enter a valid FD value (0-100) and reason', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/loan/fd-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rowId,
          fd_score: editingFd,
          reason: editingReason,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update FD')
      }
      toast({ title: 'Success', description: 'FD value updated. Pending accounts executive approval.' })
      setEditingId(null)
      setEditingFd(null)
      setEditingReason('')
      await load()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update FD', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const approved =
        row.review_status === 'approved' ||
        ['pending_hr_loan_office', 'fd_approved', 'awaiting_hr_terms', 'awaiting_director_hr', 'approved_director', 'md_final_approved'].includes(
          String(row.status || ''),
        )
      const rejected =
        row.review_status === 'rejected' ||
        ['fd_rejected', 'rejected_fd'].includes(String(row.status || ''))

      if (filter === 'approved' && !approved) return false
      if (filter === 'rejected' && !rejected) return false
      if (!q) return true
      const hay = [row.staff_name, row.staff_number, row.request_number, row.loan_type, row.fd_note]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search, filter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">FD Completed &amp; Archived Records</h2>
            <p className="text-sm text-slate-600">
              {isLoanOffice
                ? 'Edit FD values before accounts executive approval'
                : 'All FD decisions from Accounts Executive — with full calculation details'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff name, ID, loan type..."
          className="max-w-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
        >
          <option value="all">All records</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2 ml-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
        <span className="text-xs text-slate-500 px-3 py-2 rounded-lg bg-slate-50">{filtered.length} record(s)</span>
      </div>

      {loading && (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-600">Loading FD records...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <div className="text-red-600 font-bold text-lg">⚠</div>
          <div>
            <p className="font-semibold text-red-900">Error Loading Records</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-slate-600 font-medium">No records found</p>
          <p className="text-sm text-slate-500 mt-1">No completed FD records match your search.</p>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
        {filtered.map((row) => {
          const poor = isPoorFdScore(row.fd_score, row.fd_good)
          const isRejected = ['fd_rejected', 'rejected_fd'].includes(String(row.status || '')) || row.review_status === 'rejected'
          const isEditing = editingId === row.id
          const canEdit = isLoanOffice && !isRejected && row.review_status === 'approved'

          return (
            <div
              key={row.id}
              className={`rounded-2xl border-2 p-6 transition-all hover:shadow-lg ${
                isRejected ? 'border-red-200 bg-red-50/50' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
              }`}
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900">
                      {row.staff_name || 'Staff'}
                      {row.staff_number ? <span className="ml-2 text-sm font-normal text-slate-500">#{row.staff_number}</span> : null}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      <span className="font-medium">{row.loan_type || 'Loan'}</span> • Ref: <span className="font-mono text-xs">{row.request_number || row.id.slice(0, 8)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {isRejected ? (
                      <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Rejected
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Approved
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white/60 p-3 border border-slate-100">
                    <p className="text-xs text-slate-600 font-semibold uppercase">Amount</p>
                    <p className="text-lg font-bold text-slate-900">₵{Number(row.requested_amount || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-white/60 p-3 border border-slate-100">
                    <p className="text-xs text-slate-600 font-semibold uppercase">Term</p>
                    <p className="text-lg font-bold text-slate-900">{row.repayment_months || '—'} mo</p>
                  </div>
                  <div
                    className={`rounded-lg p-3 border-2 font-bold text-lg ${
                      poor ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-green-100 border-green-300 text-green-900'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase text-current/70">FD Score</p>
                    <p className="text-xl">{isEditing ? editingFd : row.fd_score ?? 'N/A'}%</p>
                  </div>
                </div>

                {/* FD Calculation Summary */}
                {!isEditing && (row.fd_note || row.submission_memo) && (
                  <FdCalculationSummary data={row.fd_note || row.submission_memo} />
                )}

                {/* Edit Mode */}
                {isEditing && (
                  <div className="space-y-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 uppercase">New FD Value (0-100)</label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editingFd ?? ''}
                        onChange={(e) => setEditingFd(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="mt-1"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 uppercase">Reason for Change</label>
                      <Textarea
                        value={editingReason}
                        onChange={(e) => setEditingReason(e.target.value)}
                        placeholder="Explain why the FD value is being changed..."
                        className="mt-1 resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                {canEdit && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                    {!isEditing ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(row.id)
                          setEditingFd(row.fd_score ?? 0)
                          setEditingReason('')
                        }}
                        className="gap-2"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit FD Value
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          disabled={submitting}
                          className="gap-2"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleEditFd(row.id)}
                          disabled={submitting}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save Changes
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
