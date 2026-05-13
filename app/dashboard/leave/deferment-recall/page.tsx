"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Clock, FileText, RefreshCw, Calendar, ArrowRight, Info } from "lucide-react"

interface DefermentRequest {
  id: string
  user_id: string
  original_start_date: string
  original_end_date: string
  new_start_date: string
  new_end_date: string
  reason?: string
  status: string
  created_at: string
  original_working_days?: number
  new_working_days?: number
  working_days_change?: number
}

interface RecallRequest {
  id: string
  user_id: string
  leave_start_date: string
  leave_end_date: string
  recall_date: string
  reason?: string
  status: string
  created_at: string
  total_leave_days?: number
  days_already_spent?: number
  days_to_restore?: number
}

// Helper to format date for display
const formatDate = (dateStr: string) => {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-US", { 
    weekday: "short", 
    month: "short", 
    day: "numeric",
    year: "numeric"
  })
}

export default function DefermentRecallPage() {
  const [selectedTab, setSelectedTab] = useState("deferment")
  const [isLoading, setIsLoading] = useState(false)
  const [defermentRequests, setDefermentRequests] = useState<DefermentRequest[]>([])
  const [recallRequests, setRecallRequests] = useState<RecallRequest[]>([])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Form states
  const [defermentForm, setDefermentForm] = useState({
    originalStartDate: "",
    originalEndDate: "",
    newStartDate: "",
    newEndDate: "",
    reason: "",
  })

  const [recallForm, setRecallForm] = useState({
    leaveStartDate: "",
    leaveEndDate: "",
    recallDate: "",
    reason: "",
  })

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setIsLoading(true)
    try {
      const [defermentRes, recallRes] = await Promise.all([
        fetch("/api/leave/deferment/list"),
        fetch("/api/leave/recall/list"),
      ])

      if (defermentRes.ok) {
        const data = await defermentRes.json()
        setDefermentRequests(data)
      }

      if (recallRes.ok) {
        const data = await recallRes.json()
        setRecallRequests(data)
      }
    } catch (err) {
      console.error("[v0] Error loading requests:", err)
      setMessage({ type: "error", text: "Failed to load requests" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitDeferment = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch("/api/leave/deferment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defermentForm),
      })

      if (res.ok) {
        setMessage({ type: "success", text: "Deferment request submitted successfully. Awaiting HOD approval." })
        setDefermentForm({
          originalStartDate: "",
          originalEndDate: "",
          newStartDate: "",
          newEndDate: "",
          reason: "",
        })
        await loadRequests()
        setTimeout(() => setMessage(null), 5000)
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to submit deferment" })
      }
    } catch (err) {
      console.error("[v0] Error submitting deferment:", err)
      setMessage({ type: "error", text: "An error occurred. Please try again." })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitRecall = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch("/api/leave/recall/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recallForm),
      })

      if (res.ok) {
        setMessage({ type: "success", text: "Recall request submitted successfully. Awaiting HOD approval." })
        setRecallForm({
          leaveStartDate: "",
          leaveEndDate: "",
          recallDate: "",
          reason: "",
        })
        await loadRequests()
        setTimeout(() => setMessage(null), 5000)
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to submit recall" })
      }
    } catch (err) {
      console.error("[v0] Error submitting recall:", err)
      setMessage({ type: "error", text: "An error occurred. Please try again." })
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { bg: string; text: string; icon: JSX.Element }> = {
      pending_hod: { bg: "bg-yellow-100", text: "text-yellow-800", icon: <Clock className="w-4 h-4" /> },
      pending_hr_office: { bg: "bg-blue-100", text: "text-blue-800", icon: <Clock className="w-4 h-4" /> },
      pending_executive_hr: { bg: "bg-purple-100", text: "text-purple-800", icon: <Clock className="w-4 h-4" /> },
      approved: { bg: "bg-green-100", text: "text-green-800", icon: <CheckCircle2 className="w-4 h-4" /> },
      rejected: { bg: "bg-red-100", text: "text-red-800", icon: <AlertCircle className="w-4 h-4" /> },
    }

    const config = statusMap[status] || statusMap.pending_hod
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        {config.icon}
        <span>{status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Leave Deferment & Recall</h1>
              <p className="text-slate-600">Manage your approved leave dates</p>
            </div>
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : "bg-red-50 border border-red-200 text-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsContent value="deferment" className="space-y-6">
            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 mb-1">What is Leave Deferment?</p>
                  <p className="text-sm text-blue-800">
                    Defer your leave to a later date. Your total leave duration will remain the same. For example, if you have 10 working days approved, you&apos;ll still use 10 working days in the new period. Weekends and public holidays don&apos;t count as leave days.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Request Form */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-4">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                  Defer Your Leave
                </CardTitle>
                <CardDescription>Reschedule your approved leave to new dates</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmitDeferment} className="space-y-6">
                  {/* Original Dates Section */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide text-slate-600">Original Dates</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-700 font-medium">Start Date</Label>
                        <Input
                          type="date"
                          value={defermentForm.originalStartDate}
                          onChange={(e) =>
                            setDefermentForm({
                              ...defermentForm,
                              originalStartDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-slate-700 font-medium">End Date</Label>
                        <Input
                          type="date"
                          value={defermentForm.originalEndDate}
                          onChange={(e) =>
                            setDefermentForm({
                              ...defermentForm,
                              originalEndDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                    </div>
                    {defermentForm.originalStartDate && defermentForm.originalEndDate && (
                      <p className="text-sm text-slate-600 mt-2">
                        {formatDate(defermentForm.originalStartDate)} to {formatDate(defermentForm.originalEndDate)}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <div className="text-slate-400">
                      <ArrowRight className="w-5 h-5 rotate-90" />
                    </div>
                  </div>

                  {/* New Dates Section */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide text-slate-600">New Dates</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-700 font-medium">Start Date</Label>
                        <Input
                          type="date"
                          value={defermentForm.newStartDate}
                          onChange={(e) =>
                            setDefermentForm({
                              ...defermentForm,
                              newStartDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-slate-700 font-medium">End Date</Label>
                        <Input
                          type="date"
                          value={defermentForm.newEndDate}
                          onChange={(e) =>
                            setDefermentForm({
                              ...defermentForm,
                              newEndDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                    </div>
                    {defermentForm.newStartDate && defermentForm.newEndDate && (
                      <p className="text-sm text-slate-600 mt-2">
                        {formatDate(defermentForm.newStartDate)} to {formatDate(defermentForm.newEndDate)}
                      </p>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <Label className="text-slate-700 font-medium">Why are you deferring? (Optional)</Label>
                    <Textarea
                      value={defermentForm.reason}
                      onChange={(e) =>
                        setDefermentForm({ ...defermentForm, reason: e.target.value })
                      }
                      placeholder="E.g., Business requirements, Personal circumstances..."
                      className="mt-2"
                      rows={3}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {isLoading ? "Submitting..." : "Submit Deferment Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Previous Requests */}
            {defermentRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Deferment Requests</h3>
                <div className="space-y-3">
                  {defermentRequests.map((req) => (
                    <Card key={req.id} className="border-slate-200">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="text-left">
                              <p className="font-semibold text-slate-900 flex items-center gap-2">
                                {formatDate(req.original_start_date)}
                                <ArrowRight className="w-4 h-4 text-slate-400" />
                                {formatDate(req.new_start_date)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Requested {new Date(req.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        {req.reason && (
                          <p className="text-sm text-slate-700 border-l-2 border-slate-300 pl-3">
                            <span className="font-medium">Reason:</span> {req.reason}
                          </p>
                        )}
                        {req.working_days_change !== undefined && (
                          <p className="text-xs text-slate-600 mt-2">
                            Original: {req.original_working_days} working days | New: {req.new_working_days} working days
                            {req.working_days_change > 0 ? ` (+${req.working_days_change})` : ` (${req.working_days_change})`}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="recall" className="space-y-6">
            {/* Info Card */}
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 mb-1">What is Leave Recall?</p>
                  <p className="text-sm text-amber-800">
                    End your leave early and return to work on a specific date. Any unused leave days will be restored to your balance. Only working days (excluding weekends and holidays) are counted.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Recall Form */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-4">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600" />
                  Recall Your Leave
                </CardTitle>
                <CardDescription>End your leave early and return to work</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmitRecall} className="space-y-6">
                  {/* Leave Dates Section */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide text-slate-600">Your Approved Leave</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-700 font-medium">Start Date</Label>
                        <Input
                          type="date"
                          value={recallForm.leaveStartDate}
                          onChange={(e) =>
                            setRecallForm({
                              ...recallForm,
                              leaveStartDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-slate-700 font-medium">End Date</Label>
                        <Input
                          type="date"
                          value={recallForm.leaveEndDate}
                          onChange={(e) =>
                            setRecallForm({
                              ...recallForm,
                              leaveEndDate: e.target.value,
                            })
                          }
                          className="mt-2"
                          required
                        />
                      </div>
                    </div>
                    {recallForm.leaveStartDate && recallForm.leaveEndDate && (
                      <p className="text-sm text-slate-600 mt-2">
                        {formatDate(recallForm.leaveStartDate)} to {formatDate(recallForm.leaveEndDate)}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <div className="text-slate-400">
                      <ArrowRight className="w-5 h-5 rotate-90" />
                    </div>
                  </div>

                  {/* Recall Date Section */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide text-slate-600">Recall Date</h3>
                    <div>
                      <Label className="text-slate-700 font-medium">Return to Work On</Label>
                      <Input
                        type="date"
                        value={recallForm.recallDate}
                        onChange={(e) =>
                          setRecallForm({
                            ...recallForm,
                            recallDate: e.target.value,
                          })
                        }
                        className="mt-2"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        You will return to work on {recallForm.recallDate ? formatDate(recallForm.recallDate) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <Label className="text-slate-700 font-medium">Why are you recalling? (Optional)</Label>
                    <Textarea
                      value={recallForm.reason}
                      onChange={(e) =>
                        setRecallForm({ ...recallForm, reason: e.target.value })
                      }
                      placeholder="E.g., Emergency business requirement, Personal circumstances..."
                      className="mt-2"
                      rows={3}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  >
                    {isLoading ? "Submitting..." : "Submit Recall Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Previous Requests */}
            {recallRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Recall Requests</h3>
                <div className="space-y-3">
                  {recallRequests.map((req) => (
                    <Card key={req.id} className="border-slate-200">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-left">
                            <p className="font-semibold text-slate-900">
                              Leave: {formatDate(req.leave_start_date)} to {formatDate(req.leave_end_date)}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                              Return to work: <span className="font-medium">{formatDate(req.recall_date)}</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Requested {new Date(req.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        {req.reason && (
                          <p className="text-sm text-slate-700 border-l-2 border-slate-300 pl-3">
                            <span className="font-medium">Reason:</span> {req.reason}
                          </p>
                        )}
                        {req.days_to_restore !== undefined && (
                          <p className="text-xs text-slate-600 mt-2">
                            Total leave: {req.total_leave_days} days | Already spent: {req.days_already_spent} days | To restore: {req.days_to_restore} days
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
