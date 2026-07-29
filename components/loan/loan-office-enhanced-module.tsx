"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import {
  AlertCircle,
  ArrowUpFromLine,
  BadgeCheck,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  TrendingUp,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImportedLoan {
  id: string
  request_number: string
  staff_number: string
  staff_full_name: string
  staff_location_name?: string
  loan_type_key: string
  loan_type_label: string
  fixed_amount: number | null
  requested_amount: number | null
  monthly_deduction: number | null
  disbursement_date: string | null
  recovery_start_date: string | null
  recovery_months: number | null
  expected_completion_date: string | null
  status: string
  imported_at: string
  notes: string | null
  departments?: { name: string } | null
}

interface ParsedRow {
  staff_number: string
  loan_type_key: string
  loan_type_label?: string
  amount: number
  monthly_deduction?: number
  disbursement_date?: string
  recovery_start_date?: string
  recovery_months?: number
  expected_completion_date?: string
  notes?: string
  // raw for display
  _raw: Record<string, unknown>
}

type SubTab = "import" | "tracker" | "eligibility" | "analytics"

type LoanStatus = "active" | "near_completion" | "completed" | "overdue" | "imported"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtGhc(n: number | null | undefined) {
  if (n == null) return "—"
  return `GHc ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function calcExpectedCompletion(
  recoveryStartDate: string | null | undefined,
  disbursementDate: string | null | undefined,
  recoveryMonths: number | null | undefined,
): string | null {
  const base = recoveryStartDate || disbursementDate
  if (!base || !recoveryMonths) return null
  const d = new Date(base)
  d.setMonth(d.getMonth() + Number(recoveryMonths))
  return d.toISOString().slice(0, 10)
}

function getLoanStatus(loan: ImportedLoan): LoanStatus {
  if (loan.status === "completed" || loan.status === "payment_completed") return "completed"
  const completion = loan.expected_completion_date || calcExpectedCompletion(loan.recovery_start_date, loan.disbursement_date, loan.recovery_months)
  if (!completion) return "active"
  const now = new Date()
  const end = new Date(completion)
  const diffMs = end.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 0) return "overdue"
  if (diffDays <= 60) return "near_completion"
  return "active"
}

function getLoanStatusLabel(s: LoanStatus) {
  return {
    active:          "Active",
    near_completion: "Near Completion",
    completed:       "Completed",
    overdue:         "Overdue",
    imported:        "Imported",
  }[s]
}

function getLoanStatusStyle(s: LoanStatus) {
  return {
    active:          "bg-blue-50 text-blue-700 border-blue-200",
    near_completion: "bg-amber-50 text-amber-700 border-amber-200",
    completed:       "bg-emerald-50 text-emerald-700 border-emerald-200",
    overdue:         "bg-rose-50 text-rose-700 border-rose-200",
    imported:        "bg-slate-50 text-slate-600 border-slate-200",
  }[s]
}

function getProgressPct(loan: ImportedLoan): number {
  const completion = loan.expected_completion_date || calcExpectedCompletion(loan.recovery_start_date, loan.disbursement_date, loan.recovery_months)
  const start = loan.recovery_start_date || loan.disbursement_date
  if (!start || !completion) return 0
  const s = new Date(start).getTime()
  const e = new Date(completion).getTime()
  const now = Date.now()
  if (now >= e) return 100
  if (now <= s) return 0
  return Math.round(((now - s) / (e - s)) * 100)
}

// Template headers for download
const TEMPLATE_HEADERS = [
  "staff_number",
  "loan_type_key",
  "loan_type_label",
  "amount",
  "monthly_deduction",
  "disbursement_date",
  "recovery_start_date",
  "recovery_months",
  "expected_completion_date",
  "notes",
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  canAct: boolean
}

export function LoanOfficeEnhancedModule({ canAct }: Props) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<SubTab>("import")

  // ── Imported loans data ──────────────────────────────────────────────────
  const [importedLoans, setImportedLoans] = useState<ImportedLoan[]>([])
  const [loadingLoans, setLoadingLoans] = useState(false)

  const fetchImportedLoans = useCallback(async () => {
    setLoadingLoans(true)
    try {
      const res = await fetch("/api/loan/import")
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load")
      const json = await res.json()
      setImportedLoans(json.loans || [])
    } catch (e: any) {
      toast({ title: "Error loading imported loans", description: e.message, variant: "destructive" })
    } finally {
      setLoadingLoans(false)
    }
  }, [toast])

  useEffect(() => {
    fetchImportedLoans()
  }, [fetchImportedLoans])

  // ── Analytics ────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const active = importedLoans.filter((l) => ["active", "imported"].includes(getLoanStatus(l)))
    const nearCompletion = importedLoans.filter((l) => getLoanStatus(l) === "near_completion")
    const overdue = importedLoans.filter((l) => getLoanStatus(l) === "overdue")
    const completed = importedLoans.filter((l) => getLoanStatus(l) === "completed")
    const totalOutstanding = importedLoans
      .filter((l) => getLoanStatus(l) !== "completed")
      .reduce((s, l) => s + (l.fixed_amount || l.requested_amount || 0), 0)
    const totalMonthly = importedLoans
      .filter((l) => getLoanStatus(l) !== "completed")
      .reduce((s, l) => s + (l.monthly_deduction || 0), 0)
    return { active, nearCompletion, overdue, completed, totalOutstanding, totalMonthly }
  }, [importedLoans])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* ── Module Header ── */}
      <div className="bg-slate-900 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-violet-400 mb-0.5">HR Loan Office</p>
            <h2 className="text-lg font-bold text-white leading-none">Loan Import & Tracking Centre</h2>
            <p className="text-slate-400 text-xs mt-1.5">Import existing staff loans, track repayments, manage eligibility</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 min-w-[80px]">
              <div className="text-xl font-black text-violet-300 tabular-nums">{importedLoans.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">Total Imported</div>
            </div>
            <div className="text-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 min-w-[80px]">
              <div className="text-xl font-black text-emerald-300 tabular-nums">{analytics.active.length + analytics.nearCompletion.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">Active</div>
            </div>
            <div className="text-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 min-w-[80px]">
              <div className="text-xl font-black text-rose-300 tabular-nums">{analytics.overdue.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">Overdue</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchImportedLoans}
              disabled={loadingLoans}
              className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl h-10 w-10"
            >
              <RefreshCw className={`h-4 w-4 ${loadingLoans ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Sub-tab bar ── */}
        <div className="flex items-center gap-1 mt-5 border-b border-white/10 pb-0">
          {([
            { id: "import" as SubTab,      icon: Upload,        label: "Import Loans" },
            { id: "tracker" as SubTab,     icon: CalendarCheck2,label: "Loan Tracker" },
            { id: "eligibility" as SubTab, icon: BadgeCheck,    label: "Eligibility" },
            { id: "analytics" as SubTab,   icon: BarChart3,     label: "Analytics" },
          ]).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
                activeTab === id
                  ? "border-violet-400 text-white bg-white/8"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-white/20"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────────── */}
      <div className="p-6">
        {activeTab === "import"      && <ImportWizardTab canAct={canAct} onImportSuccess={fetchImportedLoans} />}
        {activeTab === "tracker"     && <LoanTrackerTab loans={importedLoans} loading={loadingLoans} onRefresh={fetchImportedLoans} />}
        {activeTab === "eligibility" && <EligibilityTab loans={importedLoans} loading={loadingLoans} />}
        {activeTab === "analytics"   && <AnalyticsTab loans={importedLoans} analytics={analytics} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Import Wizard
// ─────────────────────────────────────────────────────────────────────────────

function ImportWizardTab({ canAct, onImportSuccess }: { canAct: boolean; onImportSuccess: () => void }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<null | {
    inserted: number; failedCount: number; duplicateCount: number
    failed: { row: ParsedRow; reason: string }[]
    duplicates: { row: ParsedRow; existing_request_number: string }[]
  }>(null)

  // ── Parse uploaded file ──────────────────────────────────────────────────
  function parseFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array", cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" })
        if (raw.length === 0) { toast({ title: "Empty file", description: "No rows found in uploaded file.", variant: "destructive" }); return }

        const rows: ParsedRow[] = raw.map((r) => {
          // Normalize header names (case-insensitive, with spaces/underscores)
          const get = (keys: string[]) => {
            for (const k of keys) {
              const found = Object.keys(r).find((rk) => rk.toLowerCase().replace(/[\s_-]/g, "") === k.toLowerCase().replace(/[\s_-]/g, ""))
              if (found && r[found] !== "" && r[found] != null) return String(r[found])
            }
            return ""
          }
          const numGet = (keys: string[]) => {
            const v = get(keys)
            const n = parseFloat(v.replace(/,/g, ""))
            return isNaN(n) ? undefined : n
          }
          const dateGet = (keys: string[]) => {
            const v = get(keys)
            if (!v) return undefined
            // Excel serial date → JS Date
            if (!isNaN(Number(v)) && Number(v) > 1000) {
              const d = XLSX.SSF.parse_date_code(Number(v))
              return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
            }
            // Attempt to parse as date string
            const parsed = new Date(v)
            if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
            return v // pass through
          }

          return {
            staff_number:              get(["staff_number", "staffnumber", "employeeid", "employee_id", "staffno"]),
            loan_type_key:             get(["loan_type_key", "loantypekey", "loantype", "loan_type"]),
            loan_type_label:           get(["loan_type_label", "loantypelabel", "loanlabel"]) || undefined,
            amount:                    numGet(["amount", "loan_amount", "loanamount"]) || 0,
            monthly_deduction:         numGet(["monthly_deduction", "monthlydeduction", "monthly_payment", "monthlypayment"]),
            disbursement_date:         dateGet(["disbursement_date", "disbursementdate", "disbursedate"]),
            recovery_start_date:       dateGet(["recovery_start_date", "recoverystartdate", "startdate"]),
            recovery_months:           numGet(["recovery_months", "recoverymonths", "months", "tenure"]),
            expected_completion_date:  dateGet(["expected_completion_date", "expectedcompletiondate", "completiondate", "enddate"]),
            notes:                     get(["notes", "note", "remarks", "comment"]) || undefined,
            _raw:                      r,
          }
        })
        setParsedRows(rows)
        setStep(2)
      } catch (err: any) {
        toast({ title: "Parse error", description: err.message || "Could not read file", variant: "destructive" })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  // ── Download template ────────────────────────────────────────────────────
  function downloadTemplate() {
    const sampleRows = [
      {
        staff_number: "EMP001",
        loan_type_key: "vehicle_loan",
        loan_type_label: "Vehicle Loan",
        amount: 15000,
        monthly_deduction: 500,
        disbursement_date: "2024-01-15",
        recovery_start_date: "2024-02-01",
        recovery_months: 36,
        expected_completion_date: "2027-02-01",
        notes: "Pre-existing vehicle loan",
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: TEMPLATE_HEADERS })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Loan Import Template")
    XLSX.writeFile(wb, "loan-import-template.xlsx")
  }

  // ── Submit import ────────────────────────────────────────────────────────
  async function submitImport() {
    if (!canAct) return
    setImporting(true)
    try {
      const res = await fetch("/api/loan/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Import failed")
      setImportResult(json)
      setStep(3)
      onImportSuccess()
      toast({
        title: `Import complete — ${json.inserted} inserted`,
        description: `${json.failedCount} failed, ${json.duplicateCount} duplicates skipped.`,
      })
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setParsedRows([])
    setFileName("")
    setStep(1)
    setImportResult(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {[
          { n: 1, label: "Upload File" },
          { n: 2, label: "Review Data" },
          { n: 3, label: "Results" },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                step > n ? "bg-emerald-600 border-emerald-600 text-white" :
                step === n ? "bg-violet-700 border-violet-700 text-white" :
                "border-slate-200 text-slate-400 bg-white"
              }`}>
                {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
              </div>
              <span className={`text-xs font-medium ${step === n ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
            </div>
            {i < 2 && <ChevronRight className="h-4 w-4 text-slate-300 mx-3" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/30 cursor-pointer transition-all p-10"
            >
              <div className="h-14 w-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-violet-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-800 text-sm">Drag & drop your file here</p>
                <p className="text-xs text-slate-500 mt-1">or click to browse — supports .xlsx and .csv</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]) }}
              />
            </div>

            {/* Template & instructions */}
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1.5">
                    <p className="font-semibold text-amber-900">Required columns</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li><span className="font-mono font-semibold">staff_number</span> — must match an existing employee</li>
                      <li><span className="font-mono font-semibold">loan_type_key</span> — e.g. vehicle_loan</li>
                      <li><span className="font-mono font-semibold">amount</span> — numeric loan amount</li>
                    </ul>
                    <p className="font-semibold text-amber-900 mt-2">Optional columns</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>monthly_deduction, recovery_months</li>
                      <li>disbursement_date, recovery_start_date</li>
                      <li>expected_completion_date, notes</li>
                    </ul>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2 border-slate-200"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4" />
                Download Import Template (.xlsx)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-slate-900">Preview — {fileName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""} parsed — review before importing</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 h-8 text-xs border-slate-200">
                <X className="h-3.5 w-3.5" /> Change file
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs bg-violet-700 hover:bg-violet-800 text-white"
                onClick={submitImport}
                disabled={importing || parsedRows.length === 0 || !canAct}
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                {importing ? "Importing…" : `Import ${parsedRows.length} Records`}
              </Button>
            </div>
          </div>

          {!canAct && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
              You have read-only access. Only Loan Office or HR Office staff can import loans.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["#", "Staff No.", "Loan Type", "Amount (GHc)", "Monthly Ded.", "Disbursement", "Recovery Start", "Months", "Exp. Completion"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((r, i) => (
                    <tr key={i} className={`hover:bg-slate-50 ${!r.staff_number || !r.loan_type_key || !r.amount ? "bg-rose-50" : ""}`}>
                      <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {r.staff_number || <span className="text-rose-500 font-normal">missing</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.loan_type_label || r.loan_type_key || <span className="text-rose-500">missing</span>}</td>
                      <td className="px-3 py-2 font-semibold tabular-nums whitespace-nowrap text-slate-800">{r.amount ? Number(r.amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : <span className="text-rose-500">missing</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">{r.monthly_deduction ? Number(r.monthly_deduction).toLocaleString("en-GH") : "—"}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.disbursement_date || "—"}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.recovery_start_date || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">{r.recovery_months || "—"}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.expected_completion_date || "auto"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && importResult && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Successfully Imported", value: importResult.inserted, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
              { label: "Duplicates Skipped", value: importResult.duplicateCount, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
              { label: "Failed Validation", value: importResult.failedCount, color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
              { label: "Total Processed", value: importResult.inserted + importResult.duplicateCount + importResult.failedCount, color: "text-slate-700", bg: "bg-slate-50 border-slate-200" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl border ${bg} p-4`}>
                <div className={`text-3xl font-black tabular-nums ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Failed detail */}
          {importResult.failed.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="font-semibold text-rose-900 text-sm mb-3 flex items-center gap-2"><XCircle className="h-4 w-4" /> Failed Records</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {importResult.failed.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono font-semibold text-rose-700 min-w-[80px]">{f.row.staff_number || "—"}</span>
                    <span className="text-rose-600">{f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duplicate detail */}
          {importResult.duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900 text-sm mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Duplicate Records Skipped</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {importResult.duplicates.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-mono font-semibold text-amber-700 min-w-[80px]">{d.row.staff_number || "—"}</span>
                    <span className="text-amber-600">Already has an active {d.row.loan_type_key} loan — {d.existing_request_number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={reset} variant="outline" className="gap-2 border-slate-200">
              <Upload className="h-4 w-4" /> Import Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Loan Tracker
// ─────────────────────────────────────────────────────────────────────────────

function LoanTrackerTab({ loans, loading, onRefresh }: { loans: ImportedLoan[]; loading: boolean; onRefresh: () => void }) {
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | LoanStatus>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return loans.filter((l) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || (l.staff_full_name?.toLowerCase().includes(q)) || (l.staff_number?.toLowerCase().includes(q)) || (l.request_number?.toLowerCase().includes(q)) || (l.loan_type_label?.toLowerCase().includes(q))
      const status = getLoanStatus(l)
      const matchesStatus = filterStatus === "all" || status === filterStatus
      return matchesSearch && matchesStatus
    })
  }, [loans, search, filterStatus])

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      <p className="text-sm text-slate-500">Loading loan tracker…</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, staff no., loan type…" className="pl-9 h-9 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "active", "near_completion", "overdue", "completed", "imported"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                filterStatus === s
                  ? "bg-violet-700 text-white border-violet-700"
                  : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700"
              }`}
            >
              {s === "all" ? "All" : getLoanStatusLabel(s as LoanStatus)}
              <span className={`ml-1.5 text-[10px] tabular-nums ${filterStatus === s ? "opacity-80" : "text-slate-400"}`}>
                {s === "all" ? loans.length : loans.filter((l) => getLoanStatus(l) === s).length}
              </span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <CalendarCheck2 className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-400">{loans.length === 0 ? "No imported loans yet — use the Import tab to add loans." : "No loans match your filters."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">Loan Type</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Monthly</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-left">Expected Completion</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((loan) => {
                const status = getLoanStatus(loan)
                const completion = loan.expected_completion_date || calcExpectedCompletion(loan.recovery_start_date, loan.disbursement_date, loan.recovery_months)
                const pct = getProgressPct(loan)
                const isExpanded = expandedId === loan.id
                return (
                  <>
                    <tr key={loan.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : loan.id)}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900 text-xs">{loan.staff_full_name || "—"}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{loan.staff_number}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700">{loan.loan_type_label || loan.loan_type_key}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">{fmtGhc(loan.fixed_amount || loan.requested_amount)}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">{fmtGhc(loan.monthly_deduction)}</td>
                      <td className="px-4 py-3.5 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${status === "overdue" ? "bg-rose-500" : status === "near_completion" ? "bg-amber-500" : status === "completed" ? "bg-emerald-500" : "bg-violet-500"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums w-7 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(completion)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getLoanStatusStyle(status)}`}>
                          {getLoanStatusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${loan.id}-detail`} className="bg-slate-50">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Request No.</p><p className="font-mono text-slate-700">{loan.request_number}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Disbursement</p><p className="text-slate-700">{fmtDate(loan.disbursement_date)}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Recovery Start</p><p className="text-slate-700">{fmtDate(loan.recovery_start_date)}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Recovery Months</p><p className="text-slate-700">{loan.recovery_months ?? "—"}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Department</p><p className="text-slate-700">{loan.departments?.name || "—"}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Location</p><p className="text-slate-700 flex items-center gap-1"><MapPin className="h-3 w-3" />{loan.staff_location_name || "—"}</p></div>
                            <div><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Imported</p><p className="text-slate-700">{fmtDate(loan.imported_at)}</p></div>
                            {loan.notes && <div className="col-span-2"><p className="text-slate-400 mb-0.5 uppercase tracking-wide text-[10px]">Notes</p><p className="text-slate-700">{loan.notes}</p></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Eligibility Manager
// ─────────────────────────────────────────────────────────────────────────────

type EligibilityStatus = "eligible" | "active_loan" | "awaiting_completion" | "eligible_from_date"

function getEligibilityStatus(loan: ImportedLoan): { status: EligibilityStatus; eligibleFrom: string | null } {
  const loanStatus = getLoanStatus(loan)
  if (loanStatus === "completed") return { status: "eligible", eligibleFrom: null }
  if (loanStatus === "overdue") return { status: "awaiting_completion", eligibleFrom: loan.expected_completion_date }
  if (loanStatus === "near_completion") {
    return { status: "eligible_from_date", eligibleFrom: loan.expected_completion_date }
  }
  return { status: "active_loan", eligibleFrom: loan.expected_completion_date }
}

function EligibilityTab({ loans, loading }: { loans: ImportedLoan[]; loading: boolean }) {
  const [search, setSearch] = useState("")

  // Group by staff
  const staffGroups = useMemo(() => {
    const map = new Map<string, { name: string; staffNo: string; loans: ImportedLoan[] }>()
    for (const l of loans) {
      const key = l.user_id || l.staff_number
      if (!map.has(key)) map.set(key, { name: l.staff_full_name || l.staff_number, staffNo: l.staff_number, loans: [] })
      map.get(key)!.loans.push(l)
    }
    return Array.from(map.values())
  }, [loans])

  const filtered = useMemo(() => {
    if (!search) return staffGroups
    const q = search.toLowerCase()
    return staffGroups.filter((g) => g.name.toLowerCase().includes(q) || g.staffNo.toLowerCase().includes(q))
  }, [staffGroups, search])

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      <p className="text-sm text-slate-500">Loading eligibility data…</p>
    </div>
  )

  const eligibilityStyle: Record<EligibilityStatus, string> = {
    eligible:           "bg-emerald-50 text-emerald-700 border-emerald-200",
    active_loan:        "bg-blue-50 text-blue-700 border-blue-200",
    awaiting_completion:"bg-rose-50 text-rose-700 border-rose-200",
    eligible_from_date: "bg-amber-50 text-amber-700 border-amber-200",
  }
  const eligibilityLabel: Record<EligibilityStatus, string> = {
    eligible:            "Eligible",
    active_loan:         "Active Loan Exists",
    awaiting_completion: "Awaiting Completion",
    eligible_from_date:  "Eligible From Date",
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or staff no." className="pl-9 h-9 text-xs" />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} staff member{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Users className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-400">{loans.length === 0 ? "No imported loans yet." : "No staff match your search."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">Loan Type</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Completion Date</th>
                <th className="px-4 py-3 text-left">Eligibility</th>
                <th className="px-4 py-3 text-left">Eligible Again</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.flatMap((g) => g.loans.map((l, li) => {
                const { status: elig, eligibleFrom } = getEligibilityStatus(l)
                return (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      {li === 0 && (
                        <>
                          <p className="font-semibold text-slate-900 text-xs">{g.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{g.staffNo}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700">{l.loan_type_label || l.loan_type_key}</td>
                    <td className="px-4 py-3.5 text-xs tabular-nums font-semibold text-slate-800">{fmtGhc(l.fixed_amount || l.requested_amount)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(l.expected_completion_date || calcExpectedCompletion(l.recovery_start_date, l.disbursement_date, l.recovery_months))}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${eligibilityStyle[elig]}`}>
                        {elig === "eligible" && <CheckCircle2 className="h-3 w-3" />}
                        {elig === "active_loan" && <Clock className="h-3 w-3" />}
                        {elig === "awaiting_completion" && <AlertCircle className="h-3 w-3" />}
                        {eligibilityLabel[elig]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                      {elig === "eligible" ? <span className="text-emerald-600 font-semibold">Now</span> : fmtDate(eligibleFrom)}
                    </td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel: Analytics
// ─────────────────────────────────────────────────────────────────────────────

function AnalyticsTab({ loans, analytics }: { loans: ImportedLoan[]; analytics: ReturnType<typeof import("react").useMemo<any, any>> }) {
  // By loan type
  const byType = useMemo(() => {
    const map = new Map<string, { label: string; count: number; total: number }>()
    for (const l of loans) {
      const key = l.loan_type_key
      if (!map.has(key)) map.set(key, { label: l.loan_type_label || l.loan_type_key, count: 0, total: 0 })
      const e = map.get(key)!
      e.count++
      e.total += l.fixed_amount || l.requested_amount || 0
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [loans])

  const maxTotal = Math.max(...byType.map((t) => t.total), 1)

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Loans", value: loans.length, sub: "all imported", color: "text-slate-800", icon: FileText },
          { label: "Active Loans", value: analytics.active.length + analytics.nearCompletion.length, sub: "currently serving", color: "text-blue-700", icon: TrendingUp },
          { label: "Near Completion", value: analytics.nearCompletion.length, sub: "within 60 days", color: "text-amber-700", icon: Clock },
          { label: "Overdue", value: analytics.overdue.length, sub: "past completion date", color: "text-rose-700", icon: AlertCircle },
          { label: "Completed", value: analytics.completed.length, sub: "fully paid off", color: "text-emerald-700", icon: CheckCircle2 },
        ].map(({ label, value, sub, color, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
                <div className="text-xs font-semibold text-slate-700 mt-1">{label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
              </div>
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-slate-50`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outstanding balance */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-900 text-sm mb-1">Outstanding Balance</p>
          <p className="text-xs text-slate-400 mb-4">Total remaining loan value across active loans</p>
          <div className="text-3xl font-black text-slate-800 tabular-nums">{fmtGhc(analytics.totalOutstanding)}</div>
          <div className="mt-2 text-xs text-slate-500">Monthly deductions: <span className="font-semibold text-slate-700">{fmtGhc(analytics.totalMonthly)}</span></div>
        </div>

        {/* By loan type */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-900 text-sm mb-1">Loans by Type</p>
          <p className="text-xs text-slate-400 mb-4">Distribution by loan category</p>
          {byType.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No data yet</p>
          ) : (
            <div className="space-y-3">
              {byType.map((t) => (
                <div key={t.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700">{t.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{t.count} loan{t.count !== 1 ? "s" : ""} · {fmtGhc(t.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-600 transition-all"
                      style={{ width: `${(t.total / maxTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Completion timeline */}
      {loans.filter((l) => l.expected_completion_date || calcExpectedCompletion(l.recovery_start_date, l.disbursement_date, l.recovery_months)).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="font-semibold text-slate-900 text-sm mb-1">Loan Completion Timeline</p>
          <p className="text-xs text-slate-400 mb-4">Upcoming and past completion dates</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {loans
              .filter((l) => {
                const c = l.expected_completion_date || calcExpectedCompletion(l.recovery_start_date, l.disbursement_date, l.recovery_months)
                return !!c
              })
              .sort((a, b) => {
                const ca = a.expected_completion_date || calcExpectedCompletion(a.recovery_start_date, a.disbursement_date, a.recovery_months) || ""
                const cb = b.expected_completion_date || calcExpectedCompletion(b.recovery_start_date, b.disbursement_date, b.recovery_months) || ""
                return ca.localeCompare(cb)
              })
              .slice(0, 20)
              .map((l) => {
                const completion = l.expected_completion_date || calcExpectedCompletion(l.recovery_start_date, l.disbursement_date, l.recovery_months)
                const status = getLoanStatus(l)
                return (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${status === "overdue" ? "bg-rose-500" : status === "near_completion" ? "bg-amber-500" : status === "completed" ? "bg-emerald-500" : "bg-violet-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{l.staff_full_name || l.staff_number}</p>
                      <p className="text-[11px] text-slate-400">{l.loan_type_label}</p>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-nowrap">{fmtDate(completion)}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getLoanStatusStyle(status)}`}>
                      {getLoanStatusLabel(status)}
                    </span>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
    </div>
  )
}
