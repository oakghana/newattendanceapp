"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Clock, FileText, RefreshCw } from "lucide-react"

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
        setMessage({ type: "success", text: "Deferment request submitted successfully" })
        setDefermentForm({
          originalStartDate: "",
          originalEndDate: "",
          newStartDate: "",
          newEndDate: "",
          reason: "",
        })
        await loadRequests()
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to submit deferment" })
      }
    } catch (err) {
      console.error("[v0] Error submitting deferment:", err)
      setMessage({ type: "error", text: "An error occurred" })
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
        setMessage({ type: "success", text: "Recall request submitted successfully" })
        setRecallForm({
          leaveStartDate: "",
          leaveEndDate: "",
          recallDate: "",
          reason: "",
        })
        await loadRequests()
      } else {
        const error = await res.json()
        setMessage({ type: "error", text: error.error || "Failed to submit recall" })
      }
    } catch (err) {
      console.error("[v0] Error submitting recall:", err)
      setMessage({ type: "error", text: "An error occurred" })
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
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bg}`}>
        {config.icon}
        <span className={`text-sm font-medium ${config.text}`}>{status.replace(/_/g, " ")}</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Leave Deferment & Recall</h1>
          <p className="text-slate-400">Request to defer or recall your approved leave</p>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-gap-3 ${
              message.type === "success"
                ? "bg-green-900/20 border border-green-500/30 text-green-200"
                : "bg-red-900/20 border border-red-500/30 text-red-200"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsContent value="deferment" className="space-y-6">
            {/* Request Form */}
            <Card className="border-0 bg-slate-800/50 backdrop-blur">
              <CardHeader className="border-b border-slate-700/50">
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  Request Leave Deferment
                </CardTitle>
                <CardDescription>Postpone your approved leave to later dates</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmitDeferment} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300">Original Start Date</Label>
                      <Input
                        type="date"
                        value={defermentForm.originalStartDate}
                        onChange={(e) =>
                          setDefermentForm({
                            ...defermentForm,
                            originalStartDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Original End Date</Label>
                      <Input
                        type="date"
                        value={defermentForm.originalEndDate}
                        onChange={(e) =>
                          setDefermentForm({
                            ...defermentForm,
                            originalEndDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">New Start Date</Label>
                      <Input
                        type="date"
                        value={defermentForm.newStartDate}
                        onChange={(e) =>
                          setDefermentForm({
                            ...defermentForm,
                            newStartDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">New End Date</Label>
                      <Input
                        type="date"
                        value={defermentForm.newEndDate}
                        onChange={(e) =>
                          setDefermentForm({
                            ...defermentForm,
                            newEndDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300">Reason</Label>
                    <Textarea
                      value={defermentForm.reason}
                      onChange={(e) =>
                        setDefermentForm({ ...defermentForm, reason: e.target.value })
                      }
                      placeholder="Explain why you are deferring your leave"
                      className="mt-2 bg-slate-700 border-slate-600 text-white"
                      rows={3}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isLoading ? "Submitting..." : "Submit Deferment Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Previous Requests */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Your Deferment Requests</h3>
              <div className="space-y-3">
                {defermentRequests.length === 0 ? (
                  <Card className="border-0 bg-slate-800/50">
                    <CardContent className="p-6 text-center text-slate-400">
                      No deferment requests yet
                    </CardContent>
                  </Card>
                ) : (
                  defermentRequests.map((req) => (
                    <Card key={req.id} className="border-0 bg-slate-800/50">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-white font-semibold">
                              {new Date(req.original_start_date).toLocaleDateString()} →{" "}
                              {new Date(req.new_start_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-slate-400">
                              Requested on {new Date(req.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        {req.reason && (
                          <p className="text-sm text-slate-300">
                            <strong>Reason:</strong> {req.reason}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recall" className="space-y-6">
            {/* Recall Form */}
            <Card className="border-0 bg-slate-800/50 backdrop-blur">
              <CardHeader className="border-b border-slate-700/50">
                <CardTitle className="text-white flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Request Leave Recall
                </CardTitle>
                <CardDescription>End your leave early and return to work</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmitRecall} className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-slate-300">Leave Start Date</Label>
                      <Input
                        type="date"
                        value={recallForm.leaveStartDate}
                        onChange={(e) =>
                          setRecallForm({
                            ...recallForm,
                            leaveStartDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Leave End Date</Label>
                      <Input
                        type="date"
                        value={recallForm.leaveEndDate}
                        onChange={(e) =>
                          setRecallForm({
                            ...recallForm,
                            leaveEndDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Recall Date</Label>
                      <Input
                        type="date"
                        value={recallForm.recallDate}
                        onChange={(e) =>
                          setRecallForm({
                            ...recallForm,
                            recallDate: e.target.value,
                          })
                        }
                        className="mt-2 bg-slate-700 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-300">Reason</Label>
                    <Textarea
                      value={recallForm.reason}
                      onChange={(e) =>
                        setRecallForm({ ...recallForm, reason: e.target.value })
                      }
                      placeholder="Explain why you are recalling your leave"
                      className="mt-2 bg-slate-700 border-slate-600 text-white"
                      rows={3}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isLoading ? "Submitting..." : "Submit Recall Request"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Previous Requests */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Your Recall Requests</h3>
              <div className="space-y-3">
                {recallRequests.length === 0 ? (
                  <Card className="border-0 bg-slate-800/50">
                    <CardContent className="p-6 text-center text-slate-400">
                      No recall requests yet
                    </CardContent>
                  </Card>
                ) : (
                  recallRequests.map((req) => (
                    <Card key={req.id} className="border-0 bg-slate-800/50">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-white font-semibold">
                              Recall on {new Date(req.recall_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-slate-400">
                              Leave: {new Date(req.leave_start_date).toLocaleDateString()} -{" "}
                              {new Date(req.leave_end_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-slate-400">
                              Requested on {new Date(req.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {getStatusBadge(req.status)}
                        </div>
                        {req.reason && (
                          <p className="text-sm text-slate-300">
                            <strong>Reason:</strong> {req.reason}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
