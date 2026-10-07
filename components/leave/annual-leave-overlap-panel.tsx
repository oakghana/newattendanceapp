"use client"

import Link from "next/link"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface AnnualLeaveOverlapGroup {
  department: string
  location: string
  month: string
  requests: Array<{
    id: string
    staffName: string
    startDate: string
    endDate: string
  }>
}

interface AnnualLeaveOverlapPanelProps {
  groups: AnnualLeaveOverlapGroup[]
}

export function AnnualLeaveOverlapPanel({ groups }: AnnualLeaveOverlapPanelProps) {
  if (groups.length === 0) return null

  const requestCount = groups.reduce((total, group) => total + group.requests.length, 0)

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/70 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700" aria-hidden="true">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base text-slate-900">Annual leave overlap notice</CardTitle>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {requestCount} staff leave request{requestCount === 1 ? "" : "s"} overlap within your assigned teams. Review the dates before approving or requesting an adjustment.
            </p>
          </div>
        </div>
        <Badge className="shrink-0 border-amber-200 bg-amber-100 text-amber-800">{groups.length} group{groups.length === 1 ? "" : "s"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.slice(0, 6).map((group) => (
          <div key={`${group.department}-${group.location}-${group.month}`} className="rounded-lg border border-amber-200 bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{group.department}</p>
                <p className="text-xs text-slate-600">{group.location} · {group.month}</p>
              </div>
              <Badge variant="outline" className="border-amber-300 text-amber-800">{group.requests.length} staff</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {group.requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{request.staffName}</span>
                  <span className="shrink-0 text-xs text-slate-500">{request.startDate}–{request.endDate}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length > 6 ? <p className="text-xs text-slate-600">Showing the first 6 overlap groups. Review the leave queue for the remaining groups.</p> : null}
        <Link href="/dashboard/leave-management" className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 underline-offset-4 hover:underline">
          Review leave requests <ChevronRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  )
}

