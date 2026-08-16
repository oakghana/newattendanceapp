"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useNotification } from "@/components/ui/notification-system"
import { CheckCircle, XCircle, Clock, User, Mail, Phone, Building } from "lucide-react"

interface PendingStaff {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  employee_id?: string
  position?: string
  department_name?: string
  created_at: string
  is_active: boolean
}

export default function StaffActivation() {
  const [pendingStaff, setPendingStaff] = useState<PendingStaff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { addNotification } = useNotification()

  const fetchPendingStaff = async () => {
    try {
      const response = await fetch("/api/admin/staff-activation")
      if (response.ok) {
        const data = await response.json()
        setPendingStaff(data.staff || [])
      }
    } catch (error) {
      addNotification({ type: "error", title: "Load failed", message: "Failed to load pending staff requests" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingStaff()
  }, [])

  const handleActivation = async (userId: string, activate: boolean) => {
    try {
      const response = await fetch("/api/admin/staff-activation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, activate }),
      })

      if (response.ok) {
        addNotification({
          type: "success",
          title: "Staff status updated",
          message: `Staff ${activate ? "activated" : "deactivated"} successfully`,
        })
        fetchPendingStaff()
      } else {
        const errorData = await response.json()
        addNotification({
          type: "error",
          title: "Staff update failed",
          message: `Failed to update staff: ${errorData.error}`,
        })
      }
    } catch (error) {
      addNotification({
        type: "error",
        title: "Staff update failed",
        message: "An error occurred while updating staff",
      })
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff Activation</CardTitle>
          <CardDescription>Loading pending staff requests...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Staff Activation Requests
        </CardTitle>
        <CardDescription>Review and activate pending staff registration requests</CardDescription>
      </CardHeader>
      <CardContent>
        {pendingStaff.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No pending staff requests</div>
        ) : (
          <div className="space-y-4">
            {pendingStaff.map((staff) => (
              <div key={staff.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-gray-500" />
                    <div>
                      <h3 className="font-medium">
                        {staff.first_name} {staff.last_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Requested: {new Date(staff.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant={staff.is_active ? "default" : "secondary"}>
                    {staff.is_active ? "Active" : "Pending"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{staff.email}</span>
                  </div>
                  {staff.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{staff.phone}</span>
                    </div>
                  )}
                  {staff.employee_id && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">ID:</span>
                      <span>{staff.employee_id}</span>
                    </div>
                  )}
                  {staff.position && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-gray-400" />
                      <span>{staff.position}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  {!staff.is_active ? (
                    <Button
                      size="sm"
                      onClick={() => handleActivation(staff.id, true)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Activate
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => handleActivation(staff.id, false)}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
