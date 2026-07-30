"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Download, X } from "lucide-react"

interface ResumptionMemoData {
  id: string
  staff_name: string
  staff_position: string
  employee_id: string
  department_name: string
  department_code: string
  leave_end_date: string
  leave_type: string
  resumption_date: string
  hod_name: string
  hod_position: string
  company_name: string
  created_at: string
}

interface ResumptionMemoProps {
  memoId: string
  onClose?: () => void
  showPrintButton?: boolean
}

export function ResumptionMemo({ memoId, onClose, showPrintButton = true }: ResumptionMemoProps) {
  const [memo, setMemo] = useState<ResumptionMemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMemo = async () => {
      try {
        const response = await fetch(`/api/leave/resumption-memo?id=${memoId}`)
        if (!response.ok) throw new Error("Failed to fetch memo")
        const data = await response.json()
        setMemo(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchMemo()
  }, [memoId])

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    // This would integrate with a PDF generation service or library
    // For now, trigger browser print-to-PDF
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  if (error || !memo) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-800">{error || "Memo not found"}</p>
        </CardContent>
      </Card>
    )
  }

  const formattedLeaveEnd = new Date(memo.leave_end_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const formattedResumption = new Date(memo.resumption_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 print:space-y-0">
      {/* Header Controls */}
      {showPrintButton && (
        <div className="flex items-center justify-between gap-2 print:hidden">
          <h3 className="text-lg font-semibold text-slate-800">Return to Work Resumption Memo</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadPDF}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="gap-1"
            >
              Print
            </Button>
            {onClose && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Memo Document */}
      <Card className="border print:border-0 print:shadow-none">
        <CardContent className="p-8 print:p-0">
          {/* Letterhead */}
          <div className="text-center mb-8 pb-6 border-b-2 border-emerald-600">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{memo.company_name}</h1>
            <p className="text-sm text-slate-600">Staff Resumption Notice</p>
          </div>

          {/* Date and Reference */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide">Date</p>
              <p className="font-semibold text-slate-900">{formattedResumption}</p>
            </div>
            <div>
              <p className="text-xs text-slate-600 uppercase tracking-wide">Reference No</p>
              <p className="font-semibold text-slate-900">{memo.id}</p>
            </div>
          </div>

          {/* TO Section */}
          <div className="mb-8">
            <p className="text-xs text-slate-600 uppercase tracking-wide mb-2">To</p>
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">Head of Department / Regional Manager</p>
              <p className="text-sm text-slate-700">{memo.hod_name}</p>
              <p className="text-sm text-slate-700">{memo.hod_position}</p>
              <p className="text-sm text-slate-700">{memo.department_name} - {memo.department_code}</p>
            </div>
          </div>

          {/* Subject */}
          <div className="mb-8">
            <p className="text-xs text-slate-600 uppercase tracking-wide">Subject</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">Return to Work Notice — {memo.staff_name}</p>
          </div>

          {/* Body */}
          <div className="space-y-6 mb-8 text-slate-800 leading-relaxed">
            <p>
              We hereby notify you that <span className="font-semibold">{memo.staff_name}</span> (Employee ID:{" "}
              <span className="font-semibold">{memo.employee_id}</span>), {memo.staff_position}, Department of{" "}
              <span className="font-semibold">{memo.department_name}</span>, has resumed duty with effect from{" "}
              <span className="font-semibold">{formattedResumption}</span>.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-emerald-900 mb-3">Leave Details:</p>
              <ul className="space-y-2 text-sm text-emerald-800">
                <li>
                  <span className="font-semibold">Leave Type:</span> {memo.leave_type}
                </li>
                <li>
                  <span className="font-semibold">Leave End Date:</span> {formattedLeaveEnd}
                </li>
                <li>
                  <span className="font-semibold">Date of Resumption:</span> {formattedResumption}
                </li>
              </ul>
            </div>

            <p>
              The employee has notified their return to work via the Attendance & Leave Management system. This memo serves
              as official notification of their resumption and should be filed for records purposes. Please ensure that all
              attendance records are updated accordingly.
            </p>

            <p>
              Should there be any discrepancies or concerns regarding this resumption, please contact the HR Leave Office
              immediately.
            </p>
          </div>

          {/* Signature Block */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="grid grid-cols-3 gap-8 text-center text-sm">
              <div>
                <p className="font-semibold text-slate-900 mb-2">{memo.staff_name}</p>
                <p className="text-xs text-slate-600">Employee / Resuming Staff</p>
              </div>
              <div>
                <p className="h-12 border-b border-slate-400 mb-1"></p>
                <p className="text-xs text-slate-600">HOD / Regional Manager Acknowledgement</p>
              </div>
              <div>
                <p className="h-12 border-b border-slate-400 mb-1"></p>
                <p className="text-xs text-slate-600">HR Executive Approval</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
            <p>This document was automatically generated by the Leave Management System</p>
            <p>Generated on {new Date(memo.created_at).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
