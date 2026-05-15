"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, CheckCircle2, Clock, RefreshCw } from "lucide-react"

interface LeaveDefermentRecallClientProps {
  profile: any
  user: any
}

export default function LeaveDefermentRecallClient({ profile, user }: LeaveDefermentRecallClientProps) {
  const [activeTab, setActiveTab] = useState<"deferral" | "recall" | "submit">("deferral")

  const { data: defermentData, isLoading, error } = useSWR(
    `/api/leave/deferment-recall/all?user_id=${user.id}&user_role=${profile.role}&user_department=${profile.department_id || ""}`,
    async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error("Failed to fetch deferment data")
      return res.json()
    }
  )

  const deferments = useMemo(() => defermentData?.deferments || [], [defermentData])
  const recalls = useMemo(() => defermentData?.recalls || [], [defermentData])

  const pendingDeferments = useMemo(() => deferments.filter((d: any) => d.status === "pending_hod_review" || d.status === "pending"), [deferments])
  const approvedDeferments = useMemo(() => deferments.filter((d: any) => d.status === "approved"), [deferments])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
      case "pending_hod_review":
      case "pending_hr_office":
        return <Badge className="bg-yellow-500">Pending</Badge>
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>
      case "rejected":
        return <Badge className="bg-red-500">Rejected</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">Failed to load deferment data. Please try again.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Leave Deferral & Recall</h1>
        <p className="text-gray-500">Manage your leave deferrals and recalls</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deferral" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Deferrals ({deferments.length})
          </TabsTrigger>
          <TabsTrigger value="recall" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recalls ({recalls.length})
          </TabsTrigger>
          <TabsTrigger value="submit" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Submit New
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deferral" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Deferrals</CardTitle>
                <CardDescription>Awaiting approval</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingDeferments.length === 0 ? (
                    <p className="text-sm text-gray-500">No pending deferrals</p>
                  ) : (
                    pendingDeferments.map((deferment: any) => (
                      <div key={deferment.id} className="flex items-start justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{deferment.leave_plan_requests?.leave_type_key}</p>
                          <p className="text-xs text-gray-500">
                            {deferment.deferment_start_date || deferment.deferment_year}
                          </p>
                        </div>
                        {getStatusBadge(deferment.status)}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Approved Deferrals</CardTitle>
                <CardDescription>Successfully deferred</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {approvedDeferments.length === 0 ? (
                    <p className="text-sm text-gray-500">No approved deferrals</p>
                  ) : (
                    approvedDeferments.map((deferment: any) => (
                      <div key={deferment.id} className="flex items-start justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{deferment.leave_plan_requests?.leave_type_key}</p>
                          <p className="text-xs text-gray-500">
                            {deferment.deferment_start_date || deferment.deferment_year}
                          </p>
                        </div>
                        {getStatusBadge(deferment.status)}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recall" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Recalls</CardTitle>
              <CardDescription>Leave recalls requested or in process</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recalls.length === 0 ? (
                  <p className="text-sm text-gray-500">No recalls</p>
                ) : (
                  recalls.map((recall: any) => (
                    <div key={recall.id} className="flex items-start justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{recall.leave_plan_requests?.leave_type_key}</p>
                        <p className="text-xs text-gray-500">
                          Recalled: {new Date(recall.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {getStatusBadge(recall.status)}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Submit Deferral Request</CardTitle>
              <CardDescription>Defer or reschedule your approved leave</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  Leave deferral functionality will be implemented soon. You'll be able to defer your leave to a future date or reschedule it.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
