"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, BookOpen, Clock, CheckCircle2, Users, Calendar, FileText, Download, Loader2, CheckCircle } from "lucide-react"
import { ReturnToWorkReminder } from "@/components/leave/return-to-work-reminder"

interface LeaveCenterInfoProps {
  userRole?: string | null
  userDepartmentName?: string | null
}

interface StaffMemo {
  id: string
  staff_name: string
  staff_category: string
  memo_subject?: string
  leave_period_start?: string
  approved_days?: number
  signer_name?: string
  status: string
  created_at: string
  updated_at: string
  memo_body?: any
}

function MyApprovedMemos() {
  const [memos, setMemos] = useState<StaffMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/leave/payment-advice/staff-memos")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMemos(d.memos || []) })
      .finally(() => setLoading(false))
  }, [])

  const handleDownload = async (memoId: string) => {
    setDownloading(memoId)
    try {
      const res = await fetch(`/api/leave/payment-advice/download?memoId=${memoId}`)
      if (!res.ok) return
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `payment-advice-${memoId}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your approved memos...
      </div>
    )
  }

  if (memos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No approved payment advice memos found for your account.
      </p>
    )
  }

  return (
    <div className="divide-y divide-border">
      {memos.map((memo) => {
        let approvedAt = ""
        try {
          const body = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
          approvedAt = body.approver?.approved_at || memo.updated_at || ""
        } catch { approvedAt = memo.updated_at || "" }

        const approverName = (() => {
          try {
            const body = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : (memo.memo_body || {})
            return body.approver?.name || memo.signer_name || ""
          } catch { return memo.signer_name || "" }
        })()

        return (
          <div key={memo.id} className="flex items-center justify-between py-3 gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-green-50 border border-green-200 shrink-0">
                <FileText className="h-4 w-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {memo.staff_category ? `${memo.staff_category} Staff` : "Leave Allowance"} Memo
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {memo.leave_period_start
                    ? `Leave from ${new Date(memo.leave_period_start).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                    : "Leave period not set"}
                  {memo.approved_days ? ` · ${memo.approved_days} days` : ""}
                </p>
                {approverName && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Signed by: <span className="font-medium text-green-700">{approverName.toUpperCase()}</span>
                  </p>
                )}
                {approvedAt && (
                  <p className="text-xs text-muted-foreground">
                    Approved {new Date(approvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 text-xs"
              disabled={downloading === memo.id}
              onClick={() => handleDownload(memo.id)}
            >
              {downloading === memo.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />
              }
              Download
            </Button>
          </div>
        )
      })}
    </div>
  )
}

export function LeaveCenterInfo({ userRole, userDepartmentName }: LeaveCenterInfoProps) {
  const isRegionalHR = userRole?.toLowerCase().includes("regional_hr")
  const isHrLeaveOffice = userRole?.toLowerCase().includes("hr_leave_office") || userRole?.toLowerCase().includes("hr_office")
  const isHrApprover = ["admin", "director_hr", "manager_hr", "hr_director", "hr_officer", "hr"].includes(userRole?.toLowerCase() || "")
  const isDepartmentHead = userRole?.toLowerCase().includes("department_head")
  const isRegionalManager = userRole?.toLowerCase().includes("regional_manager")
  const isStaff = userRole?.toLowerCase().includes("staff")

  return (
    <div className="space-y-6 w-full">
      {/* Return to Work Reminder — for staff returning within 5 days */}
      {isStaff && <ReturnToWorkReminder />}

      {/* Welcome Banner */}
      <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 border-0 text-white">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="bg-white/20 p-3 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Welcome to Leave Center</h2>
              <p className="text-white/90 mt-1">
                {isRegionalHR && "Manage and review leave requests for your assigned region"}
                {isHrLeaveOffice && "Process and forward approved leave requests to HR for final approval"}
                {isHrApprover && "Issue final approvals and generate leave memos"}
                {isDepartmentHead && "Review and approve leave requests from your department"}
                {isRegionalManager && "Review and approve leave requests from your regional teams"}
                {isStaff && "Submit, track, and manage your leave requests"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* For All Users */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Leave Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700 space-y-2">
            <p>• Submit leave requests in advance whenever possible</p>
            <p>• Check your leave balance before submitting</p>
            <p>• Provide clear reasons for your leave request</p>
            <p>• Keep documentation ready for verification if requested</p>
          </CardContent>
        </Card>

        {/* For Regional HR Officers */}
        {isRegionalHR && (
          <Card className="border-purple-200 bg-purple-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-purple-900">
                <Users className="w-5 h-5 text-purple-600" />
                Your Regional Role
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p>• View-only access to leave requests from your region</p>
              <p>• Monitor regional leave trends and compliance</p>
              <p>• Support coordination between departments</p>
              <p>• Report regional leave statistics to HR</p>
            </CardContent>
          </Card>
        )}

        {/* For HR Leave Office */}
        {isHrLeaveOffice && (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-orange-900">
                <Clock className="w-5 h-5 text-orange-600" />
                Processing Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p>• Review HOD-approved leave requests</p>
              <p>• Adjust dates/days if required</p>
              <p>• Add staff leave history context</p>
              <p>• Forward to HR Approver for final decision</p>
            </CardContent>
          </Card>
        )}

        {/* For HR Approvers */}
        {isHrApprover && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-green-900">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Final Approval Process
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p>• Review leave requests forwarded by HR Office</p>
              <p>• Approve or reject based on policy</p>
              <p>• Generate and send approval memos</p>
              <p>• Maintain compliance records</p>
            </CardContent>
          </Card>
        )}

        {/* For Department Heads */}
        {isDepartmentHead && (
          <Card className="border-cyan-200 bg-cyan-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-cyan-900">
                <Users className="w-5 h-5 text-cyan-600" />
                Department Management
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p>• Review leave requests from your team</p>
              <p>• Check departmental coverage</p>
              <p>• Provide recommendations or request changes</p>
              <p>• Forward to HR for processing</p>
            </CardContent>
          </Card>
        )}

        {/* For Regional Managers */}
        {isRegionalManager && (
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-indigo-900">
                <Users className="w-5 h-5 text-indigo-600" />
                Regional Oversight
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700 space-y-2">
              <p>• Review regional team leave requests</p>
              <p>• Ensure operational continuity</p>
              <p>• Provide recommendations to HR</p>
              <p>• Monitor compliance and trends</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Important Information */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Important Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">Leave Policy</h4>
            <p>All leave requests must comply with the company leave policy. For detailed policy information, contact the HR Leave Office.</p>
          </div>
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">Escalation</h4>
            <p>If you have concerns about your leave request or need assistance, please contact your department head or the HR Leave Office.</p>
          </div>
          <div>
            <h4 className="font-semibold text-amber-900 mb-1">Support</h4>
            <p>For technical issues or questions about this system, reach out to the IT Help Center or contact the HR Leave Office directly.</p>
          </div>
        </CardContent>
      </Card>

      {/* My Approved Payment Advice Memos — visible to all staff */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <CardTitle className="text-base">My Approved Payment Advice Memos</CardTitle>
          </div>
          <CardDescription>
            Approved payment advice memos issued in your name. Download for your personal records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyApprovedMemos />
        </CardContent>
      </Card>
    </div>
  )
}
