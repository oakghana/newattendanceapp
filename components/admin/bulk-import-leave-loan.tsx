"use client"

import type React from "react"
import { useState } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, Download, FileText, CalendarDays, Banknote, CheckCircle2, XCircle } from "lucide-react"
import { LiveRegion } from "@/components/ui/accessibility-helpers"

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ row: number; error: string; field?: string }>
}

const LEAVE_TEMPLATE_HEADERS = [
  "employee_id",
  "email",
  "leave_type",
  "start_date",
  "end_date",
  "reason",
  "leave_year_period",
]

const LEAVE_TEMPLATE_SAMPLE = [
  {
    employee_id: "EMP001",
    email: "john.doe@qccgh.com",
    leave_type: "annual",
    start_date: "2026-06-01",
    end_date: "2026-06-10",
    reason: "Annual family vacation",
    leave_year_period: "2026/2027",
  },
  {
    employee_id: "EMP002",
    email: "jane.smith@qccgh.com",
    leave_type: "sick",
    start_date: "2026-06-05",
    end_date: "2026-06-07",
    reason: "Medical appointment and recovery",
    leave_year_period: "2026/2027",
  },
]

const LOAN_TEMPLATE_HEADERS = [
  "employee_id",
  "email",
  "loan_type_key",
  "requested_amount",
  "reason",
  "recovery_months",
  "disbursement_date",
]

const LOAN_TEMPLATE_SAMPLE = [
  {
    employee_id: "EMP001",
    email: "john.doe@qccgh.com",
    loan_type_key: "welfare_junior",
    requested_amount: "",
    reason: "Home renovation and emergency expenses",
    recovery_months: 12,
    disbursement_date: "2026-06-15",
  },
  {
    employee_id: "EMP002",
    email: "jane.smith@qccgh.com",
    loan_type_key: "welfare_senior",
    requested_amount: 5000,
    reason: "School fees payment for dependents",
    recovery_months: 24,
    disbursement_date: "",
  },
]

const LEAVE_TYPES = [
  "annual",
  "sick",
  "maternity",
  "paternity",
  "study_with_pay",
  "study_without_pay",
  "casual",
  "compassionate",
  "special_unpaid",
  "other",
]

function downloadExcelTemplate(headers: string[], sampleRows: object[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Import Template")
  XLSX.writeFile(wb, filename)
}

function parseExcelForPreview(file: File): Promise<{ headers: string[]; rows: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array", cellDates: false })
        const sheetName = workbook.SheetNames[0]
        const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" })
        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        resolve({ headers, rows: rows.slice(0, 5) })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

type ImportType = "leave" | "loan"

function ImportTab({ type }: { type: ImportType }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [announceMessage, setAnnounceMessage] = useState("")

  const isLeave = type === "leave"
  const endpoint = isLeave ? "/api/admin/bulk-import/leave" : "/api/admin/bulk-import/loan"
  const templateHeaders = isLeave ? LEAVE_TEMPLATE_HEADERS : LOAN_TEMPLATE_HEADERS
  const templateSample = isLeave ? LEAVE_TEMPLATE_SAMPLE : LOAN_TEMPLATE_SAMPLE
  const templateFilename = isLeave ? "leave-import-template.xlsx" : "loan-import-template.xlsx"

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setResult(null)
    setPreviewHeaders([])
    setPreviewRows([])
    setAnnounceMessage(`Selected: ${file.name}`)
    try {
      const { headers, rows } = await parseExcelForPreview(file)
      setPreviewHeaders(headers)
      setPreviewRows(rows)
      setAnnounceMessage(`File parsed. Preview shows ${rows.length} rows.`)
    } catch {
      setAnnounceMessage("Could not parse file for preview.")
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setProgress(10)
    setResult(null)
    setAnnounceMessage("Uploading…")

    const formData = new FormData()
    formData.append("file", selectedFile)

    try {
      setProgress(40)
      const response = await fetch(endpoint, { method: "POST", body: formData })
      setProgress(80)
      const data = await response.json()
      if (!response.ok) {
        setAnnounceMessage(`Upload failed: ${data.error || "Unknown error"}`)
        setResult({ success: 0, failed: 0, errors: [{ row: 0, error: data.error || "Upload failed" }] })
      } else {
        setResult(data)
        setProgress(100)
        setAnnounceMessage(`Done: ${data.success} imported, ${data.failed} failed`)
      }
    } catch (err: any) {
      setAnnounceMessage("Upload failed. Please try again.")
      setResult({ success: 0, failed: 0, errors: [{ row: 0, error: err?.message || "Network error" }] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <LiveRegion message={announceMessage} priority="polite" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            Bulk Import {isLeave ? "Leave Requests" : "Loan Applications"}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload an Excel file (.xlsx / .xls) to create multiple{" "}
            {isLeave ? "leave requests" : "loan applications"} in bulk.
            {isLeave
              ? " Each imported leave will enter the standard approval workflow starting at Pending."
              : " Each imported loan will enter the workflow at Pending HOD Review."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadExcelTemplate(templateHeaders, templateSample, templateFilename)}
          className="flex items-center gap-2 shrink-0"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download Template
        </Button>
      </div>

      {/* Field reference */}
      <div className="p-3 bg-muted/50 border rounded-lg text-sm space-y-1">
        <p className="font-medium">Required columns:</p>
        {isLeave ? (
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            <li><strong>employee_id</strong> or <strong>email</strong> — identifies the staff member</li>
            <li><strong>leave_type</strong> — one of: {LEAVE_TYPES.join(", ")}</li>
            <li><strong>start_date</strong> — format YYYY-MM-DD</li>
            <li><strong>end_date</strong> — format YYYY-MM-DD</li>
            <li><strong>reason</strong> — description (min 5 chars)</li>
            <li><strong>leave_year_period</strong> (optional) — e.g. 2026/2027</li>
          </ul>
        ) : (
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            <li><strong>employee_id</strong> or <strong>email</strong> — identifies the staff member</li>
            <li><strong>loan_type_key</strong> — must match a configured loan type (e.g. welfare_junior)</li>
            <li><strong>reason</strong> — description (min 5 chars)</li>
            <li><strong>requested_amount</strong> (optional) — leave blank for fixed-amount loan types</li>
            <li><strong>recovery_months</strong> (optional) — repayment period in months</li>
            <li><strong>disbursement_date</strong> (optional) — YYYY-MM-DD</li>
          </ul>
        )}
      </div>

      {/* File picker */}
      <div className="space-y-1">
        <Label htmlFor={`file-${type}`}>Select Excel File</Label>
        <Input
          id={`file-${type}`}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          aria-describedby={`file-${type}-help`}
        />
        <p id={`file-${type}-help`} className="text-xs text-muted-foreground">
          Accepted: .xlsx, .xls
        </p>
      </div>

      {selectedFile && (
        <Alert role="status">
          <FileText className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {selectedFile.name} — {(selectedFile.size / 1024).toFixed(1)} KB
          </AlertDescription>
        </Alert>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Preview (first {previewRows.length} rows)</p>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {previewHeaders.map((h) => (
                    <TableHead key={h} className="whitespace-nowrap text-xs">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, idx) => (
                  <TableRow key={idx}>
                    {previewHeaders.map((h) => (
                      <TableCell key={h} className="text-xs whitespace-nowrap max-w-[160px] truncate">
                        {String(row[h] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span>Importing…</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} aria-label={`Import progress ${progress}%`} />
        </div>
      )}

      {/* Results */}
      {result && (
        <Alert role="status">
          <AlertDescription>
            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                {result.success > 0 && (
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {result.success} imported
                  </Badge>
                )}
                {result.failed > 0 && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {result.failed} failed
                  </Badge>
                )}
              </div>

              {result.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Errors:</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto text-sm" role="list">
                    {result.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="p-2 bg-red-50 border border-red-200 rounded" role="listitem">
                        {err.row > 0 && <span className="font-medium text-red-800">Row {err.row}: </span>}
                        <span className="text-red-700">{err.error}</span>
                        {err.field && (
                          <span className="text-xs text-red-500 ml-1">[{err.field}]</span>
                        )}
                      </div>
                    ))}
                    {result.errors.length > 20 && (
                      <p className="text-center text-xs text-muted-foreground">
                        … and {result.errors.length - 20} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        className="w-full"
        aria-busy={uploading}
      >
        <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
        {uploading ? "Importing…" : `Import ${isLeave ? "Leave Requests" : "Loan Applications"}`}
      </Button>
    </div>
  )
}

export function BulkImportLeaveLoan() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk Import — Leave &amp; Loans
        </CardTitle>
        <CardDescription>
          Import leave requests and loan applications from Excel. Records will enter the standard
          approval workflow automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="leave">
          <TabsList className="grid w-full grid-cols-2" role="tablist">
            <TabsTrigger value="leave" className="flex items-center gap-2" role="tab">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Leave Requests
            </TabsTrigger>
            <TabsTrigger value="loan" className="flex items-center gap-2" role="tab">
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Loan Applications
            </TabsTrigger>
          </TabsList>
          <TabsContent value="leave" className="mt-4">
            <ImportTab type="leave" />
          </TabsContent>
          <TabsContent value="loan" className="mt-4">
            <ImportTab type="loan" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
