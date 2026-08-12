"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Mail,
  Phone,
  Plus,
} from "lucide-react"
import { format, parseISO } from "date-fns"

interface ResumptionCountdownData {
  id: string
  staff_name: string
  leave_type: string
  end_date: string
  resume_date: string
  days_left: number
  user_id?: string
  state?: 'upcoming' | 'due_today' | 'overdue'
  staff_checked_in?: boolean
  requires_confirmation?: boolean
}

interface StaffWarning {
  staff_id: string
  staff_name: string
  warning_type: "non_resumption" | "late_return" | "extension_required"
  date_issued: string
  status: "pending" | "acknowledged" | "resolved"
  details: string
}

export function HrLeaveOfficCountdownDashboard() {
  const [countdowns, setCountdowns] = useState<ResumptionCountdownData[]>([])
  const [warnings, setWarnings] = useState<StaffWarning[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFilter, setSelectedFilter] = useState<"all" | "critical" | "warning" | "normal">("all")

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 300000) // Refresh every 5 minutes
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [countdownsRes, warningsRes, noticesRes] = await Promise.all([
        fetch("/api/leave/reminders/resume-five-days-countdown", { cache: "no-store" }),
        fetch("/api/leave/warnings-and-queries", { cache: "no-store" }),
        fetch("/api/leave/resumption-notices", { cache: "no-store" }),
      ])

      if (noticesRes.ok) {
        const data = await noticesRes.json()
        const notices = Array.isArray(data.notices) ? data.notices : []
        setCountdowns(notices.map((notice: any) => ({
          id: notice.id,
          staff_name: notice.staff_name,
          leave_type: notice.leave_type,
          end_date: notice.resumption_date,
          resume_date: notice.resumption_date,
          days_left: Math.max(0, notice.days_until_resumption),
          user_id: notice.user_id,
          state: notice.state,
          staff_checked_in: notice.staff_checked_in,
          requires_confirmation: notice.requires_confirmation,
        })))
      } else if (countdownsRes.ok) {
        const data = await countdownsRes.json()
        setCountdowns(data.countdowns || [])
      }

      if (warningsRes.ok) {
        const data = await warningsRes.json()
        setWarnings(data.warnings || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching HR Leave Office data:", error)
    } finally {
      setLoading(false)
    }
  }

  const filterCountdowns = () => {
    switch (selectedFilter) {
      case "critical":
        return countdowns.filter(c => c.days_left <= 2)
      case "warning":
        return countdowns.filter(c => c.days_left > 2 && c.days_left <= 5)
      case "normal":
        return countdowns.filter(c => c.days_left > 5)
      default:
        return countdowns
    }
  }

  const filteredCountdowns = filterCountdowns()
  const criticalCount = countdowns.filter(c => c.days_left <= 2).length
  const warningCount = countdowns.filter(c => c.days_left > 2 && c.days_left <= 5).length
  const pendingWarnings = warnings.filter(w => w.status === "pending").length

  const handleSendReminder = async (staffId: string, staffName: string) => {
    try {
      const response = await fetch("/api/leave/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: staffId, staff_name: staffName }),
      })
      if (response.ok) {
        alert(`Reminder sent to ${staffName}`)
      }
    } catch (error) {
      console.error("[v0] Error sending reminder:", error)
    }
  }

  const handleIssueWarning = async (staffId: string, staffName: string, warningType: string) => {
    try {
      const response = await fetch("/api/leave/issue-warning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_id: staffId,
          staff_name: staffName,
          warning_type: warningType,
        }),
      })
      if (response.ok) {
        alert(`Warning issued to ${staffName}`)
        fetchData()
      }
    } catch (error) {
      console.error("[v0] Error issuing warning:", error)
    }
  }

  const downloadReport = () => {
    const csv = [
      ["Staff Name", "Leave Type", "End Date", "Resume Date", "Days Left", "Status"],
      ...countdowns.map(c => [
        c.staff_name,
        c.leave_type,
        c.end_date,
        c.resume_date,
        c.days_left,
        c.days_left <= 2 ? "CRITICAL" : c.days_left <= 5 ? "WARNING" : "NORMAL",
      ]),
    ]
      .map(row => row.join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `resumption-countdowns-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
  }

  if (loading) {
    return <div className="text-center py-8">Loading resumption data...</div>
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700">Critical (≤2 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-xs text-red-600 mt-1">🚨 Immediate action required</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-700">Warning (3-5 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{warningCount}</div>
            <p className="text-xs text-yellow-600 mt-1">⏰ Plan ahead</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-700">Total Returning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{countdowns.length}</div>
            <p className="text-xs text-blue-600 mt-1">within 5 days</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700">Pending Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{pendingWarnings}</div>
            <p className="text-xs text-orange-600 mt-1">awaiting response</p>
          </CardContent>
        </Card>
      </div>

      {/* Countdown List with Filters and Actions */}
      <Tabs defaultValue="countdowns" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="countdowns">Resumption Countdowns ({countdowns.length})</TabsTrigger>
          <TabsTrigger value="warnings">Warnings & Queries ({warnings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="countdowns" className="space-y-4">
          {/* Filter Bar */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFilter("all")}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              All
            </Button>
            <Button
              variant={selectedFilter === "critical" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFilter("critical")}
              className="gap-2"
            >
              🚨 Critical ({criticalCount})
            </Button>
            <Button
              variant={selectedFilter === "warning" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFilter("warning")}
              className="gap-2"
            >
              ⏰ Warning ({warningCount})
            </Button>
            <Button size="sm" variant="outline" onClick={downloadReport} className="gap-2 ml-auto">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {/* Countdowns Grid */}
          {filteredCountdowns.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600">No staff matching this filter</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredCountdowns.map(countdown => {
                const urgencyColor =
                  countdown.days_left <= 2
                    ? "border-red-300 bg-red-50"
                    : countdown.days_left <= 5
                      ? "border-yellow-300 bg-yellow-50"
                      : "border-blue-300 bg-blue-50"

                const urgencyEmoji =
                  countdown.days_left <= 2 ? "🚨" : countdown.days_left <= 5 ? "⏰" : "✓"

                return (
                  <Card key={countdown.id} className={`border-2 ${urgencyColor}`}>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{urgencyEmoji}</span>
                            <div>
                              <p className="font-semibold text-gray-900">{countdown.staff_name}</p>
                              <p className="text-sm text-gray-600">{countdown.leave_type}</p>
                            </div>
                          </div>
                          <Badge
                            variant={countdown.days_left <= 2 ? "destructive" : "secondary"}
                            className="text-base"
                          >
                            {countdown.days_left} {countdown.days_left === 1 ? "day" : "days"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-white rounded p-2">
                            <p className="text-xs text-gray-600">Leave Ends</p>
                            <p className="font-medium">{format(parseISO(countdown.end_date), "MMM dd, yyyy")}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-xs text-gray-600">Resumes</p>
                            <p className="font-medium">{format(parseISO(countdown.resume_date), "MMM dd, yyyy")}</p>
                          </div>
                        </div>

                        <Progress value={((5 - countdown.days_left) / 5) * 100} className="h-2" />

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => handleSendReminder(countdown.user_id || "", countdown.staff_name)}
                          >
                            <Mail className="h-4 w-4" />
                            Send Reminder
                          </Button>
                          {countdown.days_left <= 3 && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-2"
                              onClick={() => handleIssueWarning(countdown.user_id || "", countdown.staff_name, "return_warning")}
                            >
                              <AlertTriangle className="h-4 w-4" />
                              Issue Warning
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="gap-2">
                            <Phone className="h-4 w-4" />
                            Contact HOD
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="warnings" className="space-y-4">
          {warnings.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600">No warnings or queries issued yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {warnings.map((warning, idx) => (
                <Card
                  key={idx}
                  className={
                    warning.status === "pending"
                      ? "border-orange-200 bg-orange-50"
                      : warning.status === "resolved"
                        ? "border-green-200 bg-green-50"
                        : "border-gray-200"
                  }
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{warning.staff_name}</p>
                        <p className="text-sm text-gray-700 mt-1">{warning.details}</p>
                        <p className="text-xs text-gray-600 mt-2">{format(parseISO(warning.date_issued), "MMM dd, yyyy")}</p>
                      </div>
                      <Badge
                        variant={
                          warning.status === "pending"
                            ? "destructive"
                            : warning.status === "resolved"
                              ? "secondary"
                              : "default"
                        }
                      >
                        {warning.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Instructions Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-sm">📋 HR Leave Office Procedures</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium">Critical Staff (≤2 days):</p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
            <li>Send immediate reminders</li>
            <li>Contact HODs for any anticipated issues</li>
            <li>Issue warnings if non-resumption is likely</li>
            <li>Prepare welcome-back documentation</li>
          </ul>
          <p className="font-medium mt-4">Warning Staff (3-5 days):</p>
          <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
            <li>Monitor for any deferment requests</li>
            <li>Arrange cover if necessary</li>
            <li>Prepare leave documentation</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
