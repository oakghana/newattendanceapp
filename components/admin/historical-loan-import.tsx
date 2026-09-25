"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function HistoricalLoanImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedRows, setFailedRows] = useState<Array<{ row: number; error: string; field?: string }>>([])

  const downloadTemplate = async () => {
    setError(null)
    setFailedRows([])
    const response = await fetch("/api/admin/bulk-import/loan/template", { cache: "no-store" })
    if (!response.ok) {
      setError("Could not generate the historical loan template.")
      return
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "historical-loan-import-template.xlsx"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const importLoans = async () => {
    if (!selectedFile) {
      setError("Choose the completed historical loan Excel file first.")
      return
    }

    setImporting(true)
    setSummary(null)
    setError(null)
    setFailedRows([])
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      const response = await fetch("/api/admin/bulk-import/loan", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Historical loan import failed")

      setSummary(`${result.success || 0} imported, ${result.failed || 0} failed`)
      setFailedRows(Array.isArray(result.errors) ? result.errors : [])
      setSelectedFile(null)
    } catch (importError: unknown) {
      setError(importError instanceof Error ? importError.message : "Could not import the historical loans.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Historical Approved &amp; Disbursed Loans
        </CardTitle>
        <CardDescription>
          Import loans approved and disbursed in previous months. They will appear as live loan records and remain visible until repayment is cleared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Staff members will see imported loans immediately, and new applications for the same loan type remain blocked while repayment is outstanding.
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Historical Template
          </Button>
          <div className="min-w-[260px] flex-1 space-y-1">
            <Label htmlFor="historical-loan-file">Completed Excel file</Label>
            <Input
              id="historical-loan-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] || null)
                setSummary(null)
                setError(null)
              }}
            />
          </div>
          <Button type="button" onClick={importLoans} disabled={importing || !selectedFile}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? "Importing..." : "Import Historical Loans"}
          </Button>
        </div>
        {selectedFile && <p className="text-sm text-muted-foreground">Selected: {selectedFile.name}</p>}
        {summary && <p className="text-sm font-medium text-emerald-700">Import complete: {summary}</p>}
        {failedRows.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              Failed row details
            </p>
            <div className="overflow-hidden rounded-md border border-amber-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-100 text-amber-950">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {failedRows.map((item, index) => (
                    <tr key={`${item.row}-${index}`} className="border-t border-amber-100">
                      <td className="px-3 py-2 align-top">{item.row}</td>
                      <td className="px-3 py-2 align-top">{item.field || "-"}</td>
                      <td className="px-3 py-2 align-top">{item.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}