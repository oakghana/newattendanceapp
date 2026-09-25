"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import * as XLSX from "xlsx"
import { FileSpreadsheet, FileText, Pencil, RefreshCw, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const fetcher = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: "application/json" } })
  const contentType = response.headers.get("content-type") || ""
  const body = contentType.includes("application/json") ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof body === "object" && body?.error ? body.error : `Running Loans request failed (${response.status})`
    throw new Error(message)
  }
  if (typeof body === "string") throw new Error("Running Loans returned an invalid server response")
  return body
}

const money = (value: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(value)
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—"

type LoanRow = {
  id: string
  request_number?: string
  loan_type_label?: string
  total_amount: number
  paid_to_date: number
  outstanding_balance: number
  next_payment_due: string | null
  next_payment_amount: number
  expected_completion_date: string | null
  completed_payment_date?: string | null
  reapplication_eligible?: boolean
  repayment_status: string
  is_imported?: boolean | null
  hod_review_note?: string | null
  staff?: { full_name?: string; first_name?: string; last_name?: string; employee_id?: string; staff_number?: string; department?: string; department_id?: string; location_name?: string } | null
}

export function RunningLoansReport() {
  const { data, error, isLoading, mutate } = useSWR<{ data: LoanRow[]; generated_at: string }>("/api/loan/running-loans", fetcher)
  const [search, setSearch] = useState("")
  const [editingLoan, setEditingLoan] = useState<LoanRow | null>(null)
  const [paidToDate, setPaidToDate] = useState("")
  const [outstanding, setOutstanding] = useState("")
  const [nextPaymentDue, setNextPaymentDue] = useState("")
  const [nextPaymentAmount, setNextPaymentAmount] = useState("")
  const [completionDate, setCompletionDate] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [approvalTab, setApprovalTab] = useState<"current" | "legacy">("current")
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const rows = data?.data || []
  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = [row.staff?.full_name, row.staff?.staff_number, row.staff?.department, row.request_number, row.loan_type_label].join(" ").toLowerCase()
    return haystack.includes(search.toLowerCase())
  }), [rows, search])
  const currentAppLoans = useMemo(() => filtered.filter((row) => !row.is_imported && !String(row.hod_review_note || "").toLowerCase().startsWith("bulk imported by administrator")), [filtered])
  const legacyAppLoans = useMemo(() => filtered.filter((row) => Boolean(row.is_imported) || String(row.hod_review_note || "").toLowerCase().startsWith("bulk imported by administrator")), [filtered])
  const visibleLoans = approvalTab === "current" ? currentAppLoans : legacyAppLoans
  const pageCount = Math.max(1, Math.ceil(visibleLoans.length / pageSize))
  const paginatedLoans = useMemo(() => visibleLoans.slice((page - 1) * pageSize, page * pageSize), [visibleLoans, page, pageSize])
  const totals = useMemo(() => filtered.reduce((sum, row) => ({ total: sum.total + row.total_amount, paid: sum.paid + row.paid_to_date, outstanding: sum.outstanding + row.outstanding_balance }), { total: 0, paid: 0, outstanding: 0 }), [filtered])

  const exportExcel = () => {
    const exportRows = filtered.map((row) => ({ Staff: row.staff?.full_name || "", "Staff Number": row.staff?.staff_number || "", Department: row.staff?.department || "", Location: row.staff?.location_name || "Unknown location", "Loan Type": row.loan_type_label || "", "Loan Amount": row.total_amount, "Paid To Date": row.paid_to_date, Outstanding: row.outstanding_balance, "Next Payment Due": row.next_payment_due || "", "Completion Date": row.expected_completion_date || "", Status: row.repayment_status }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "Running Loans")
    XLSX.writeFile(workbook, `running-loans-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const exportPdf = () => window.print()
  const openEdit = (row: LoanRow) => {
    setEditingLoan(row); setPaidToDate(String(row.paid_to_date)); setOutstanding(String(row.outstanding_balance)); setNextPaymentDue(row.next_payment_due || ""); setNextPaymentAmount(String(row.next_payment_amount)); setCompletionDate(row.expected_completion_date || ""); setReason(""); setEditError(null)
  }
  const saveEdit = async () => {
    if (!editingLoan) return
    setSaving(true); setEditError(null)
    try {
      const response = await fetch("/api/loan/running-loans/edit", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanRequestId: editingLoan.id, paidToDate, outstandingBalance: outstanding, nextPaymentDue, nextPaymentAmount, expectedCompletionDate: completionDate, reason }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not save correction")
      setEditingLoan(null); await mutate()
    } catch (error) { setEditError(error instanceof Error ? error.message : "Could not save correction") }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4 print:text-foreground">
      <div className="grid gap-3 md:grid-cols-3">
        {[{ label: "Loan principal", value: totals.total }, { label: "Paid as of today", value: totals.paid }, { label: "Outstanding balance", value: totals.outstanding }].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2"><CardDescription>{item.label}</CardDescription><CardTitle className="text-xl">{money(item.value)}</CardTitle></CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><CardTitle>Running loans</CardTitle><CardDescription>Approved loans with balances outstanding. Paid amounts include approved payments recorded as of today.</CardDescription></div>
          <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw data-icon="inline-start" />Refresh</Button><Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet data-icon="inline-start" />Excel</Button><Button variant="outline" size="sm" onClick={exportPdf}><FileText data-icon="inline-start" />PDF</Button></div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative max-w-md print:hidden"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff, department, or loan" /></div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading running loans…</p>}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {!isLoading && !error && <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-2 print:hidden">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Loan approval source">
                <Button type="button" variant={approvalTab === "current" ? "default" : "ghost"} onClick={() => { setApprovalTab("current"); setPage(1) }}>Approved in this app <span className="ml-1 opacity-70">{currentAppLoans.length}</span></Button>
                <Button type="button" variant={approvalTab === "legacy" ? "default" : "ghost"} onClick={() => { setApprovalTab("legacy"); setPage(1) }}>Legacy app approved <span className="ml-1 opacity-70">{legacyAppLoans.length}</span></Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">Rows per page<select className="rounded-md border bg-background px-2 py-1.5 text-foreground" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10</option><option value="50">50</option><option value="100">100</option></select></label>
            </div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Location</TableHead><TableHead>Loan</TableHead><TableHead>Total</TableHead><TableHead>Paid to date</TableHead><TableHead>Outstanding</TableHead><TableHead>Full payment</TableHead><TableHead>Reapply</TableHead><TableHead>Status</TableHead><TableHead className="print:hidden">Actions</TableHead></TableRow></TableHeader><TableBody>{paginatedLoans.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.staff?.full_name || "Unknown staff"}</div><div className="text-xs text-muted-foreground">{row.staff?.staff_number || "—"} · {row.staff?.department || "—"}</div></TableCell><TableCell>{row.staff?.location_name || "Unknown location"}</TableCell><TableCell>{row.loan_type_label || row.request_number || "Loan"}</TableCell><TableCell>{money(row.total_amount)}</TableCell><TableCell>{money(row.paid_to_date)}</TableCell><TableCell className="font-medium">{money(row.outstanding_balance)}</TableCell><TableCell>{row.completed_payment_date ? <><div>{date(row.completed_payment_date)}</div><div className="text-xs text-muted-foreground">Accounts approved</div></> : "—"}</TableCell><TableCell>{row.reapplication_eligible ? <Badge variant="secondary">Eligible to reapply</Badge> : "—"}</TableCell><TableCell><Badge variant={row.repayment_status === "overdue" ? "destructive" : row.repayment_status === "completed" ? "secondary" : "secondary"}>{row.repayment_status === "overdue" ? "Overdue" : row.repayment_status === "completed" ? "Completed" : "On track"}</Badge></TableCell><TableCell className="print:hidden"><Button variant="outline" size="sm" onClick={() => openEdit(row)}><Pencil data-icon="inline-start" />Edit</Button></TableCell></TableRow>)}</TableBody></Table>{visibleLoans.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No loans found in this approval source.</p>}</div>
            {visibleLoans.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground print:hidden"><span>Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, visibleLoans.length)} of {visibleLoans.length}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button><span>Page {page} of {pageCount}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next</Button></div></div>}
          </>}
        </CardContent>
      </Card>
      <Dialog open={Boolean(editingLoan)} onOpenChange={(open) => !open && setEditingLoan(null)}><DialogContent><DialogHeader><DialogTitle>Edit running-loan operations</DialogTitle><DialogDescription>Only payment tracking fields can be changed. Principal, recovery period, and loan term are locked.</DialogDescription></DialogHeader>{editingLoan && <div className="grid gap-3"><p className="text-sm text-muted-foreground">{editingLoan.staff?.full_name || "Unknown staff"} · {editingLoan.loan_type_label || "Loan"}</p><div className="grid gap-1"><Label htmlFor="paid-to-date">Paid to date</Label><Input id="paid-to-date" type="number" min="0" step="0.01" value={paidToDate} onChange={(e) => setPaidToDate(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="outstanding">Outstanding</Label><Input id="outstanding" type="number" min="0" step="0.01" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="next-payment-due">Next payment date</Label><Input id="next-payment-due" type="date" value={nextPaymentDue} onChange={(e) => setNextPaymentDue(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="next-payment-amount">Next payment amount</Label><Input id="next-payment-amount" type="number" min="0" step="0.01" value={nextPaymentAmount} onChange={(e) => setNextPaymentAmount(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="completion-date">Finishes</Label><Input id="completion-date" type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} /></div><div className="grid gap-1"><Label htmlFor="correction-reason">Reason for correction</Label><Input id="correction-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the correction" /></div>{editError && <p className="text-sm text-destructive">{editError}</p>}</div>}<DialogFooter><Button variant="outline" onClick={() => setEditingLoan(null)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={saving}>{saving ? "Saving…" : "Save correction"}</Button></DialogFooter></DialogContent></Dialog>
      <div className="hidden print:block text-xs text-muted-foreground">Generated {date(data?.generated_at || null)} · QCC Attendance Electronic System</div>
    </div>
  )
}
