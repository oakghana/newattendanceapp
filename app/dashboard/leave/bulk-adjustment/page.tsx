"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, CheckCircle, Calendar } from "lucide-react"
import Link from "next/link"

interface LeaveRequest {
  id: string
  user_id: string
  staff_full_name: string
  staff_number: string
  leave_type: string
  start_date: string
  end_date: string
  requested_days: number
  status: string
}

export default function BulkLeaveAdjustmentPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([])
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [dayShift, setDayShift] = useState(0)

  useEffect(() => {
    const loadPendingRequests = async () => {
      try {
        const response = await fetch("/api/leave/planning/bulk-pending")
        if (!response.ok) throw new Error("Failed to load pending requests")
        const data = await response.json()
        setPendingRequests(data.requests || [])
      } catch (err) {
        console.error("[v0] Error loading pending requests:", err)
        setMessage({ type: "error", text: "Failed to load pending requests" })
      } finally {
        setIsLoading(false)
      }
    }

    loadPendingRequests()
  }, [])

  const toggleSelectRequest = (id: string) => {
    const newSelected = new Set(selectedRequests)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedRequests(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedRequests.size === pendingRequests.length) {
      setSelectedRequests(new Set())
    } else {
      setSelectedRequests(new Set(pendingRequests.map(r => r.id)))
    }
  }

  const applyBulkAdjustment = async () => {
    if (selectedRequests.size === 0) {
      setMessage({ type: "error", text: "Please select at least one request" })
      return
    }

    setIsApplying(true)
    try {
      const response = await fetch("/api/leave/planning/bulk-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_ids: Array.from(selectedRequests),
          day_shift: dayShift,
        }),
      })

      if (!response.ok) throw new Error("Failed to apply bulk adjustment")
      
      setMessage({ type: "success", text: `Bulk adjustment applied to ${selectedRequests.size} requests` })
      setSelectedRequests(new Set())
      setDayShift(0)
      
      // Reload requests
      const reloadResponse = await fetch("/api/leave/planning/bulk-pending")
      if (reloadResponse.ok) {
        const data = await reloadResponse.json()
        setPendingRequests(data.requests || [])
      }
    } catch (err) {
      console.error("[v0] Error applying bulk adjustment:", err)
      setMessage({ type: "error", text: "Failed to apply bulk adjustment" })
    } finally {
      setIsApplying(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="text-center">
          <p className="text-gray-600">Loading pending requests...</p>
        </div>
      </div>
    )
  }

  const hasBulkRequests = pendingRequests.length >= 5

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bulk Leave Adjustment</h1>
          <p className="text-gray-600 mt-2">Manage multiple leave requests at once</p>
        </div>

        {message && (
          <Card className={message.type === "error" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
            <CardContent className="pt-6 flex items-start gap-3">
              {message.type === "error" ? (
                <AlertCircle className="text-red-600 mt-1 flex-shrink-0" size={20} />
              ) : (
                <CheckCircle className="text-green-600 mt-1 flex-shrink-0" size={20} />
              )}
              <p className={message.type === "error" ? "text-red-800" : "text-green-800"}>
                {message.text}
              </p>
            </CardContent>
          </Card>
        )}

        {!hasBulkRequests && pendingRequests.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <p className="text-amber-900">
                Only {pendingRequests.length} pending request(s) found. Bulk adjustment is available when 5 or more requests are pending.
              </p>
            </CardContent>
          </Card>
        )}

        {pendingRequests.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-gray-600 mb-4">No pending leave requests available for bulk adjustment</p>
              <Link href="/dashboard/leave-management">
                <Button variant="outline">View Leave Management</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Adjustment Settings</CardTitle>
                <CardDescription>Configure bulk adjustment parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="day-shift">Shift Days (positive or negative)</Label>
                  <Input
                    id="day-shift"
                    type="number"
                    value={dayShift}
                    onChange={(e) => setDayShift(parseInt(e.target.value) || 0)}
                    placeholder="e.g., 2 or -3"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Positive values move dates forward, negative values move dates backward
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Pending Requests ({pendingRequests.length})</CardTitle>
                    <CardDescription>Select requests to adjust</CardDescription>
                  </div>
                  {hasBulkRequests && (
                    <Button
                      onClick={toggleSelectAll}
                      variant="outline"
                      size="sm"
                    >
                      {selectedRequests.size === pendingRequests.length ? "Deselect All" : "Select All"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                      <Checkbox
                        checked={selectedRequests.has(request.id)}
                        onCheckedChange={() => toggleSelectRequest(request.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{request.staff_full_name}</p>
                        <div className="grid grid-cols-3 gap-2 mt-1 text-xs text-gray-600">
                          <div>
                            <span className="font-medium">Type:</span> {request.leave_type}
                          </div>
                          <div>
                            <span className="font-medium">Days:</span> {request.requested_days}
                          </div>
                          <div>
                            <span className="font-medium">Status:</span> {request.status}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                          <Calendar size={14} />
                          {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {hasBulkRequests && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      {selectedRequests.size} of {pendingRequests.length} requests selected
                    </p>
                    <Button
                      onClick={applyBulkAdjustment}
                      disabled={selectedRequests.size === 0 || isApplying}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isApplying ? "Applying..." : "Apply Adjustment"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
