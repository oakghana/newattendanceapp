"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { CheckCircle2, FileUp, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const fetcher = (url: string) => fetch(url).then(async (response) => {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || "Could not load running loans")
  return body
})

type RunningLoan = {
  id: string
  request_number?: string
  loan_type_label?: string
  outstanding_balance: number
  paid_to_date: number
  repayment_status: string
  staff?: { full_name?: string; staff_number?: string; department_id?: string }
}

const money = (value: number) => new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 2 }).format(value)

export function SettlementInitiationPanel() {
  const { data, error, isLoading, mutate } = useSWR<{ data: RunningLoan[] }>("/api/loan/running-loans", fetcher)
  const [selectedId, setSelectedId] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [referenceNumber, setReferenceNumber] = useState("")
  const [description, setDescription] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const loans = useMemo(() => (data?.data || []).filter((loan) => loan.outstanding_balance > 0 && loan.repayment_status !== "completed"), [data])
  const selectedLoan = loans.find((loan) => loan.id === selectedId)

  const uploadEvidence = async (file: File) => {
    setUploading(true); setFormError(null)
    try {
      const form = new FormData(); form.append("file", file); form.append("folder", "loan-payment-evidence")
      const response = await fetch("/api/upload", { method: "POST", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Evidence upload failed")
      setEvidenceUrl(body.url)
    } catch (uploadError) { setFormError(uploadError instanceof Error ? uploadError.message : "Evidence upload failed") }
    finally { setUploading(false) }
  }

  const submit = async () => {
    if (!selectedLoan) return setFormError("Select a running loan first.")
    const settlementAmount = Number(amount)
    if (!settlementAmount || settlementAmount <= 0) return setFormError("Enter the full outstanding settlement amount.")
    if (settlementAmount < selectedLoan.outstanding_balance) return setFormError(`Amount must cover the outstanding balance of ${money(selectedLoan.outstanding_balance)}.`)
    if (!evidenceUrl) return setFormError("Please upload the payment proof first.")
    setSubmitting(true); setFormError(null); setMessage(null)
    try {
      const response = await fetch("/api/loan/payment-evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loanRequestId: selectedLoan.id, paymentDate, paymentAmount: settlementAmount, paymentMethod: "full_settlement", referenceNumber, description, evidenceFileUrl: evidenceUrl, isFullSettlement: true }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Settlement submission failed")
      setMessage("Settlement evidence submitted. It is now awaiting Accounts Executive approval.")
      setSelectedId(""); setAmount(""); setReferenceNumber(""); setDescription(""); setEvidenceUrl(""); await mutate()
    } catch (submitError) { setFormError(submitError instanceof Error ? submitError.message : "Settlement submission failed") }
    finally { setSubmitting(false) }
  }

  return <Card>
    <CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><CardTitle>Full loan settlement</CardTitle><CardDescription>Select a staff loan, upload proof of payment, and send it to Accounts for approval.</CardDescription></div><Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw data-icon="inline-start" />Refresh loans</Button></div></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {isLoading && <p className="text-sm text-muted-foreground">Loading all active staff loans…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {!isLoading && !error && loans.length === 0 && <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No active loans are available for settlement.</p>}
      {loans.length > 0 && <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 md:col-span-2"><Label>Staff loan</Label><Select value={selectedId} onValueChange={(value) => { setSelectedId(value); const loan = loans.find((item) => item.id === value); setAmount(loan ? String(loan.outstanding_balance) : "") }}><SelectTrigger><SelectValue placeholder="Select staff loan" /></SelectTrigger><SelectContent>{loans.map((loan) => <SelectItem key={loan.id} value={loan.id}>{loan.staff?.full_name || "Unknown staff"} · {loan.staff?.staff_number || "No employee ID"} · {loan.request_number || loan.loan_type_label || "Loan"} · Outstanding {money(loan.outstanding_balance)}</SelectItem>)}</SelectContent></Select></div>
        {selectedLoan && <div className="rounded-md bg-muted p-3 text-sm md:col-span-2"><strong>{selectedLoan.staff?.full_name}</strong> · {selectedLoan.loan_type_label || selectedLoan.request_number} · Paid {money(selectedLoan.paid_to_date)} · Outstanding {money(selectedLoan.outstanding_balance)}</div>}
        <div className="flex flex-col gap-2"><Label htmlFor="settlement-amount">Amount paid</Label><Input id="settlement-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="settlement-date">Payment date</Label><Input id="settlement-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="settlement-reference">Payment reference</Label><Input id="settlement-reference" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Bank or receipt reference" /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="settlement-evidence">Payment evidence</Label><Input id="settlement-evidence" type="file" accept="image/*,.pdf" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(file) }} />{uploading && <span className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline size-3 animate-spin" />Uploading…</span>}{evidenceUrl && <span className="text-xs text-green-700"><CheckCircle2 className="mr-1 inline size-3" />Evidence uploaded</span>}</div>
        <div className="flex flex-col gap-2 md:col-span-2"><Label htmlFor="settlement-description">Audit note</Label><Textarea id="settlement-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short note, if needed" /></div>
        {formError && <p className="text-sm text-destructive md:col-span-2">{formError}</p>}{message && <p className="text-sm text-green-700 md:col-span-2">{message}</p>}
        <div className="md:col-span-2"><Button onClick={() => void submit()} disabled={submitting || uploading}>{submitting ? <Loader2 className="animate-spin" /> : <FileUp />}Send to Accounts for approval</Button></div>
      </div>}
    </CardContent>
  </Card>
}
