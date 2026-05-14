"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus } from "lucide-react"

interface LeaveManagementClientProps {
  userId: string
  userRole: string
  userDepartment: string | null
  userFirstName: string | null
  userLastName: string | null
  hasHodLinkage: boolean
  inactivityDays: number
  initialStaffRequests?: any[]
  initialManagerNotifications?: any[]
  initialApprovedStaffRequests?: any[]
}

export function LeaveManagementClient({
  userId,
  userRole,
  userFirstName,
  userLastName,
}: LeaveManagementClientProps) {
  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Leave Requests</h2>
          <p className="text-muted-foreground mt-1">
            Manage your leave requests and approvals
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Request Leave
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Leave Requests</CardTitle>
          <CardDescription>View and manage your leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <p>No leave requests yet</p>
            <p className="text-sm">Click "Request Leave" to submit a new request</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
