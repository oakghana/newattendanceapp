"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Clock, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react"
import { addDays, differenceInDays, format, parseISO } from "date-fns"

interface LeaveToReturn {
  id: string
  leave_id: string
  end_date: string
  leave_type: string
  days_until_return: number
  staff_name?: string
}

export function ReturnToWorkReminder() {
  const [leavesToReturn, setLeavesToReturn] = useState<LeaveToReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTime, setSelectedTime] = useState<{ [key: string]: string }>({})
  const [submitting, setSubmitting] = useState<{ [key: string]: boolean }>({})
  const [submitted, setSubmitted] = useState<{ [key: string]: boolean }>({})

  useEffect(() => {
    fetchLeavesToReturn()
  }, [])

  const fetchLeavesToReturn = async () => {
    try {
      const response = await fetch("/api/leave/return-to-work-reminders")
      if (response.ok) {
        const data = await response.json()
        setLeavesToReturn(data.leavesToReturn || [])
        // Initialize selected times with default 8:00 AM
        const times: { [key: string]: string } = {}
        data.leavesToReturn?.forEach((leave: LeaveToReturn) => {
          times[leave.id] = "08:00"
        })
        setSelectedTime(times)
      }
    } catch (error) {
      console.error("[v0] Error fetching leaves to return:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckInReminder = async (leaveId: string) => {
    if (!selectedTime[leaveId]) return

    setSubmitting((prev) => ({ ...prev, [leaveId]: true }))
    try {
      const response = await fetch("/api/leave/return-to-work-reminders/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_id: leaveId,
          expected_check_in_time: selectedTime[leaveId],
        }),
      })

      if (response.ok) {
        setSubmitted((prev) => ({ ...prev, [leaveId]: true }))
        setTimeout(() => {
          setLeavesToReturn((prev) => prev.filter((l) => l.id !== leaveId))
          setSubmitted((prev) => ({ ...prev, [leaveId]: false }))
        }, 2000)
      }
    } catch (error) {
      console.error("[v0] Error submitting check-in reminder:", error)
    } finally {
      setSubmitting((prev) => ({ ...prev, [leaveId]: false }))
    }
  }

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your return-to-work information...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (leavesToReturn.length === 0) {
    return null
  }

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-900">
          <Calendar className="w-5 h-5 text-emerald-600" />
          Ready to Return to Work?
        </CardTitle>
        <CardDescription>
          You have {leavesToReturn.length} leave {leavesToReturn.length === 1 ? "period" : "periods"} ending soon. Let your supervisors know when you are returning.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {leavesToReturn.map((leave) => (
          <div key={leave.id} className="space-y-3">
            {/* Leave Details */}
            <div className="p-3 rounded-lg border border-emerald-200 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-emerald-900 capitalize">
                      {leave.leave_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      {leave.days_until_return} day{leave.days_until_return !== 1 ? "s" : ""} to return
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Returns: {format(parseISO(leave.end_date), "dd MMM yyyy (EEEE)")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Check-in Time Selection */}
            {!submitted[leave.id] ? (
              <div className="space-y-2">
                <Alert className="border-emerald-200 bg-emerald-50/30">
                  <AlertCircle className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="text-emerald-900 text-sm">
                    Select your expected check-in time to notify your HOD/RM and supervisors of your return.
                  </AlertDescription>
                </Alert>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                      Expected Check-in Time
                    </label>
                    <Select value={selectedTime[leave.id] || "08:00"} onValueChange={(time) => setSelectedTime((prev) => ({ ...prev, [leave.id]: time }))}>
                      <SelectTrigger className="w-full">
                        <Clock className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }).map((_, hour) => (
                          <SelectItem key={hour} value={`${String(hour).padStart(2, "0")}:00`}>
                            {`${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => handleCheckInReminder(leave.id)}
                    disabled={submitting[leave.id] || !selectedTime[leave.id]}
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  >
                    {submitting[leave.id] ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Set Check-in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900 text-sm">
                  Check-in reminder set for {selectedTime[leave.id]}. Your supervisors have been notified of your expected return.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ))}

        {/* Additional Information */}
        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900 text-xs">
            <strong>Tip:</strong> You can also check in directly through the Attendance App when you arrive at work. This reminder helps your managers plan for your return.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
