"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { useState as useStateCallback } from "react"

interface DefermentRequest {
  id: string
  user_id: string
  original_start_date: string
  original_end_date: string
  new_start_date: string
  new_end_date: string
  reason?: string
  status: string
  requested_by: string
  hod_decision?: string
  hr_office_decision?: string
  executive_hr_decision?: string
  created_at: string
}

export default function ApprovalDashboard() {
  const [userRole, setUserRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState<DefermentRequest[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    checkUserRoleAndLoadRequests()
  }, [])

  const checkUserRoleAndLoadRequests = async () => {
    try {
      const profileRes = await fetch("/api/profile")
      if (!profileRes.ok) {
        setUserRole(null)
        return
      }

      const profile = await profileRes.json()
      setUserRole(profile.role)

      // Load pending requests based on role
      await loadPendingRequests(profile.role)
    } catch (err) {
      console.error("[v0] Error checking role:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadPendingRequests = async (role: string) => {
    try {
      let endpoint = "/api/leave/deferment/pending"
      if (role === "leave_admin" || role === "hr_office") {
        endpoint = "/api/leave/deferment/pending/hr-office"
      } else if (role === "executive_hr") {
        endpoint = "/api/leave/deferment/pending/executive-hr"
      }

      const res = await fetch(endpoint)
      if (res.ok) {
        const data = await res.json()
        setPendingRequests(data)
      }
    } catch (err) {
      console.error("[v0] Error loading requests:", err)
    }
  }

  const handleApprove = async (requestId: string) => {
    setIsLoading(true)
    try {
      const endpoint = userRole === "executive_hr"
        ? `/api/leave/deferment/executive-hr-approve`
        : userRole === "leave_admin" || userRole === "hr_office"
        ? `/api/leave/deferment/hr-office-review`
        : `/api/leave/deferment/hod-review`

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defermentId: requestId,
          decision: "approve",
          comments: reviewComments[requestId] || "",
        }),
      })

      if (res.ok) {
        setMessage({ type: "success", text: "Request approved successfully" })
        await loadPendingRequests(userRole || "")
        setReviewComments((prev) => ({ ...prev, [requestId]: "" }))
        setExpandedId(null)
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to approve" })
      }
    } catch (err) {
      console.error("[v0] Error approving:", err)
      setMessage({ type: "error", text: "An error occurred" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReject = async (requestId: string) => {
    setIsLoading(true)
    try {
      const endpoint = userRole === "executive_hr"
        ? `/api/leave/deferment/executive-hr-approve`
        : userRole === "leave_admin" || userRole === "hr_office"
        ? `/api/leave/deferment/hr-office-review`
        : `/api/leave/deferment/hod-review`

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defermentId: requestId,
          decision: "reject",
          comments: reviewComments[requestId] || "",
        }),
      })

      if (res.ok) {
        setMessage({ type: "success", text: "Request rejected" })
        await loadPendingRequests(userRole || "")
        setReviewComments((prev) => ({ ...prev, [requestId]: "" }))
        setExpandedId(null)
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to reject" })
      }
    } catch (err) {
      console.error("[v0] Error rejecting:", err)
      setMessage({ type: "error", text: "An error occurred" })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!userRole || !["admin", "hod", "director", "leave_admin", "hr_office", "executive_hr"].includes(userRole)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border-0 bg-red-900/20">
            <CardContent className="p-6 text-center text-red-200">
              You do not have permission to access this page
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Leave Request Approvals</h1>
          <p className="text-slate-400">Review and approve pending deferment and recall requests</p>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-900/20 border border-green-500/30 text-green-200"
                : "bg-red-900/20 border border-red-500/30 text-red-200"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Pending Requests */}
        <div className="space-y-3">
          {pendingRequests.length === 0 ? (
            <Card className="border-0 bg-slate-800/50">
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400">No pending requests at this time</p>
              </CardContent>
            </Card>
          ) : (
            pendingRequests.map((req) => (
              <Card key={req.id} className="border-0 bg-slate-800/50 hover:bg-slate-800/70 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                      <p className="text-white font-semibold mb-1">Leave Deferment Request</p>
                      <p className="text-sm text-slate-400">
                        {new Date(req.original_start_date).toLocaleDateString()} → {new Date(req.new_start_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Your Review
                    </Badge>
                  </div>

                  {req.reason && (
                    <div className="mb-4 p-3 bg-slate-700/50 rounded border border-slate-600/50">
                      <p className="text-xs text-slate-400 font-semibold mb-1">REASON</p>
                      <p className="text-sm text-slate-300">{req.reason}</p>
                    </div>
                  )}

                  {/* Expandable Review Section */}
                  <button
                    onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                    className="w-full flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700/70 rounded border border-slate-600/50 transition-colors mb-4"
                  >
                    <span className="text-sm font-semibold text-slate-300">Review & Decide</span>
                    {expandedId === req.id ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {expandedId === req.id && (
                    <div className="space-y-4 p-4 bg-slate-700/30 rounded border border-slate-600/30">
                      <div>
                        <label className="text-sm text-slate-300 font-semibold block mb-2">Your Comments</label>
                        <Textarea
                          value={reviewComments[req.id] || ""}
                          onChange={(e) =>
                            setReviewComments((prev) => ({
                              ...prev,
                              [req.id]: e.target.value,
                            }))
                          }
                          placeholder="Enter your review comments (optional)"
                          className="bg-slate-700 border-slate-600 text-white text-sm"
                          rows={3}
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={() => handleApprove(req.id)}
                          disabled={isLoading}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          {isLoading ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          onClick={() => handleReject(req.id)}
                          disabled={isLoading}
                          variant="outline"
                          className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          {isLoading ? "Processing..." : "Reject"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
