"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download, Calendar, AlertCircle, Loader2 } from "lucide-react"

interface ApprovedDeferment {
  id: string
  staff_id: string
  requested_deferment_year: number | null
  requested_deferment_period: string | null
  deferment_start_date: string | null
  deferment_end_date: string | null
  rescheduled_start_date: string | null
  rescheduled_end_date: string | null
  reason: string | null
  hr_office_decision: string
  hr_office_reviewed_at: string | null
  created_at: string
  updated_at: string | null
}

export function StaffApprovedDeferments() {
  const [deferments, setDeferments] = useState<ApprovedDeferment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    fetchApprovedDeferments()
  }, [])

  const fetchApprovedDeferments = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch("/api/leave/deferment-memos/my-memos")
      const data = await res.json()
      
      if (!res.ok) {
        console.error("[v0] Deferment API error:", res.status, data)
        throw new Error(data?.error || "Failed to fetch deferments")
      }
      
      // Filter for deferment type only
      const defermentMemos = data.memos?.filter((m: any) => m.type === "deferment") || []
      setDeferments(defermentMemos)
    } catch (err) {
      console.error("[v0] Error fetching deferments:", err)
      setError(err instanceof Error ? err.message : "Failed to load approved deferments")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (memoId: string) => {
    try {
      setDownloadingId(memoId)
      const res = await fetch(`/api/leave/deferment-recall/download-approved?memo_id=${memoId}`)
      if (!res.ok) throw new Error("Failed to download memo")

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `deferment-approval-${memoId.substring(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error("[v0] Download error:", err)
      alert("Failed to download deferment memo")
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading) {
    return (
      <Card className="border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-teal-800">
            <Calendar className="h-5 w-5" />
            My Approved Deferments
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5" />
            Error Loading Deferments
          </CardTitle>
        </CardHeader>
        <CardContent className="text-red-700">{error}</CardContent>
      </Card>
    )
  }

  if (deferments.length === 0) {
    return (
      <Card className="border border-slate-200 bg-slate-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Calendar className="h-5 w-5" />
            My Approved Deferments
          </CardTitle>
          <p className="text-sm text-slate-600 mt-2">Your approved leave deferment memos — available for download</p>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No approved deferments yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50/50">
      <CardHeader className="border-b border-teal-200">
        <CardTitle className="flex items-center gap-2 text-teal-800">
          <FileText className="h-5 w-5" />
          My Approved Deferments
        </CardTitle>
        <p className="text-sm text-teal-700 mt-2">Your approved leave deferment memos — available for download and printing</p>
      </CardHeader>
      <CardContent className="py-4">
        <div className="grid gap-3">
          {deferments.map((deferment) => {
            const fmtD = (d: string | null) =>
              d ? new Date(d).toLocaleDateString("en-GB") : "N/A"
            const deferStart = fmtD(deferment.deferment_start_date)
            const deferEnd   = fmtD(deferment.deferment_end_date)
            const reschedStart = fmtD(deferment.rescheduled_start_date)
            const reschedEnd   = fmtD(deferment.rescheduled_end_date)
            const approvedDate = fmtD(deferment.hr_office_reviewed_at)

            return (
              <div key={deferment.id} className="border border-teal-200 rounded-lg p-4 bg-white flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-semibold text-slate-900">Leave Deferment Approved</p>
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-800 text-xs font-semibold rounded">Approved</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                    <div>
                      <p className="text-xs text-slate-500">Deferment Period</p>
                      <p className="font-medium text-slate-800">{deferStart} to {deferEnd}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Rescheduled To</p>
                      <p className="font-medium text-slate-800">
                        {deferment.rescheduled_start_date
                          ? `${reschedStart} to ${reschedEnd}`
                          : deferment.requested_deferment_period || `Year ${deferment.requested_deferment_year}` || "N/A"}
                      </p>
                    </div>
                    {deferment.reason && (
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500">Reason</p>
                        <p className="font-medium text-slate-800 line-clamp-2">{deferment.reason}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-500">Approved On</p>
                      <p className="font-medium text-slate-800">{approvedDate}</p>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => handleDownload(deferment.id)}
                  disabled={downloadingId === deferment.id}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors shrink-0 disabled:opacity-50"
                >
                  {downloadingId === deferment.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
