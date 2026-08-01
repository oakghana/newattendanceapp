'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, XCircle, FileText, RefreshCw, Loader2 } from 'lucide-react'
import { GOOD_FD_THRESHOLD, isPoorFdScore } from '@/lib/loan-workflow'

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
}

function NoteBlock({ title, text }: { title: string; text?: string | null }) {
  if (!text?.trim()) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold text-slate-600">{title}</p>
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">{text}</pre>
    </div>
  )
}

export function FdCompletedArchive() {
  const [rows, setRows] = useState<CompletedFdReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')

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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" />
              FD Completed &amp; Archived Records
            </CardTitle>
            <CardDescription>
              All FD decisions from Accounts Executive — including loans already forwarded to HR Loan Office — with full calculation details.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff, request no, loan type..."
            className="max-w-sm"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All decisions</option>
            <option value="approved">Approved / sent to HR Loan Office</option>
            <option value="rejected">Rejected</option>
          </select>
          <span className="ml-auto self-center text-xs text-slate-500">{filtered.length} record(s)</span>
        </div>

        {loading && (
          <div className="py-10 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-slate-400" />
            Loading completed FD records...
          </div>
        )}
        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No completed FD records yet. After Accounts Executive approves an FD, it appears here automatically.
          </div>
        )}

        <div className="grid gap-3">
          {filtered.map((row) => {
            const poor = isPoorFdScore(row.fd_score, row.fd_good)
            const isRejected = ['fd_rejected', 'rejected_fd'].includes(String(row.status || '')) || row.review_status === 'rejected'
            return (
              <div key={row.id} className={`rounded-xl border p-4 ${isRejected ? 'border-red-200 bg-red-50/30' : 'border-emerald-200 bg-emerald-50/20'}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {row.staff_name || 'Staff'}
                      {row.staff_number ? <span className="ml-1 font-normal text-slate-500">#{row.staff_number}</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.loan_type || 'Loan'} · Ref: {row.request_number || row.id.slice(0, 8)}
                      {row.requested_amount != null ? ` · ₵${Number(row.requested_amount).toLocaleString()}` : ''}
                      {row.repayment_months ? ` · ${row.repayment_months} mo` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={poor ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>
                      FD {row.fd_score ?? 'N/A'}% {poor ? `(below ${GOOD_FD_THRESHOLD})` : `(≥ ${GOOD_FD_THRESHOLD})`}
                    </Badge>
                    <Badge className={isRejected ? 'bg-red-100 text-red-800' : 'bg-emerald-600 text-white'}>
                      {isRejected ? (
                        <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3" /> Rejected</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Approved → HR Loan Office</span>
                      )}
                    </Badge>
                    {row.status ? <Badge variant="outline" className="text-xs">{row.status}</Badge> : null}
                  </div>
                </div>
                <NoteBlock title="FD calculation / Loan Office notes" text={row.fd_note || row.submission_memo} />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
