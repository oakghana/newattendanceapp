"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Calendar, Download, Eye, Loader2 } from "lucide-react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, addMonths, subMonths } from "date-fns"

export default function RepaymentTrackingPage() {
  const router = useRouter()

  const [repaymentData, setRepaymentData] = useState<any[]>([])
  const [balanceData, setBalanceData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  // Check authorization on mount
  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        const response = await fetch("/api/auth/current-user")
        if (response.ok) {
          const { user } = await response.json()
          // Check for both database role ('accounts') and UI role ('accounts_executive')
          const authorizedRoles = ["loan_office", "accounts_executive", "accounts", "admin"]
          if (user && authorizedRoles.includes(user.role)) {
            setAuthorized(true)
          } else {
            setAuthorized(false)
            router.push("/dashboard/loan-app")
          }
        } else {
          setAuthorized(false)
          router.push("/auth/login")
        }
      } catch (err) {
        console.error("[v0] Auth check error:", err)
        setAuthorized(false)
        router.push("/auth/login")
      }
    }

    checkAuthorization()
  }, [router])

  // Fetch repayment schedule data
  useEffect(() => {
    if (authorized !== true) return

    const fetchRepaymentData = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/loan/repayment")
        if (response.ok) {
          const result = await response.json()
          setRepaymentData(result.data || [])
        }
      } catch (err) {
        console.error("[v0] Error fetching repayment data:", err)
      } finally {
        setLoading(false)
      }
    }

    // Fetch outstanding balance data
    const fetchBalanceData = async () => {
      try {
        const response = await fetch("/api/loan/repayment")
        if (response.ok) {
          const result = await response.json()
          setBalanceData(result.data || [])
        }
      } catch (err) {
        console.error("[v0] Error fetching balance data:", err)
      }
    }

    fetchRepaymentData()
    fetchBalanceData()
  }, [authorized])

  if (authorized === null || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (authorized !== true) {
    return null
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Group repayment data by due date
  const paymentsByDate: { [key: string]: any[] } = {}
  repaymentData.forEach((payment) => {
    const key = format(new Date(payment.due_date), "yyyy-MM-dd")
    if (!paymentsByDate[key]) {
      paymentsByDate[key] = []
    }
    paymentsByDate[key].push(payment)
  })

  // Get staff balance cards data
  const staffBalances = balanceData.slice(0, 5) // Show top 5 by outstanding balance

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Loan Repayment Tracking</h1>
            <p className="text-sm text-slate-600">Monitor monthly payment schedules and staff balances</p>
          </div>
        </div>

        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="calendar">Monthly Calendar</TabsTrigger>
            <TabsTrigger value="staff-balances">Staff Balances</TabsTrigger>
            <TabsTrigger value="export">Reports</TabsTrigger>
          </TabsList>

          {/* Calendar View Tab */}
          <TabsContent value="calendar" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Monthly Payment Schedule</CardTitle>
                    <CardDescription>
                      {format(currentMonth, "MMMM yyyy")} - Payment due dates and status
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Calendar Grid */}
                <div className="space-y-4">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div key={day} className="text-center text-xs font-semibold text-slate-600 py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar days */}
                  <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day) => {
                      const dateKey = format(day, "yyyy-MM-dd")
                      const dayPayments = paymentsByDate[dateKey] || []
                      const isCurrentDay = isToday(day)
                      const isCurrentMonth = isSameMonth(day, currentMonth)

                      return (
                        <div
                          key={dateKey}
                          className={`min-h-24 p-2 rounded-lg border ${
                            isCurrentDay
                              ? "border-blue-300 bg-blue-50"
                              : isCurrentMonth
                                ? "border-slate-200 bg-white"
                                : "border-slate-100 bg-slate-50"
                          }`}
                        >
                          <div className={`text-xs font-semibold mb-1 ${isCurrentDay ? "text-blue-700" : isCurrentMonth ? "text-slate-900" : "text-slate-400"}`}>
                            {format(day, "d")}
                          </div>
                          <div className="space-y-1">
                            {dayPayments.map((payment) => (
                              <div
                                key={payment.id}
                                className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 truncate"
                                title={`${payment.staff_name}: GHc ${payment.monthly_amount}`}
                              >
                                {payment.staff_name}
                              </div>
                            ))}
                          </div>
                          {dayPayments.length > 0 && (
                            <div className="text-xs mt-1 text-slate-500">
                              {dayPayments.length} payment{dayPayments.length > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Payment Schedule Table */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Details</CardTitle>
                <CardDescription>All scheduled payments for {format(currentMonth, "MMMM yyyy")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Staff Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Loan Reference</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Due Date</th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">Monthly Amount</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Status</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repaymentData
                        .filter((r) => isSameMonth(new Date(r.due_date), currentMonth))
                        .map((payment) => (
                          <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4 text-slate-900">{payment.staff_name}</td>
                            <td className="py-3 px-4 text-slate-600">{payment.loan_reference}</td>
                            <td className="py-3 px-4 text-slate-600">{format(new Date(payment.due_date), "MMM dd, yyyy")}</td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-900">
                              GHc {Number(payment.monthly_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                className={
                                  payment.status === "paid"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : payment.status === "overdue"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                }
                              >
                                {payment.status === "paid"
                                  ? "Paid"
                                  : payment.status === "overdue"
                                    ? "Overdue"
                                    : "Pending"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Staff Balances Tab */}
          <TabsContent value="staff-balances" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {staffBalances.map((staff) => (
                <Card key={staff.staff_id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{staff.staff_name}</CardTitle>
                        <CardDescription className="text-xs">{staff.loan_reference}</CardDescription>
                      </div>
                      <Badge
                        className={
                          staff.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : staff.status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : staff.status === "on-track"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                        }
                      >
                        {staff.status === "completed"
                          ? "Completed"
                          : staff.status === "overdue"
                            ? "Overdue"
                            : staff.status === "on-track"
                              ? "On Track"
                              : "Active"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-600 font-semibold">Total Loan Amount</div>
                        <div className="text-lg font-bold text-slate-900">
                          GHc {Number(staff.total_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 font-semibold">Paid to Date</div>
                        <div className="text-lg font-bold text-emerald-600">
                          GHc {Number(staff.paid_to_date).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <div className="text-xs text-slate-600 font-semibold mb-1">Outstanding Balance</div>
                      <div className="text-2xl font-bold text-slate-900">
                        GHc {Number(staff.outstanding_balance).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-600 font-semibold">Next Payment Due</div>
                        <div className="text-sm font-medium text-slate-900">
                          {staff.next_payment_due ? format(new Date(staff.next_payment_due), "MMM dd, yyyy") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600 font-semibold">Expected Completion</div>
                        <div className="text-sm font-medium text-slate-900">
                          {staff.expected_completion_date
                            ? format(new Date(staff.expected_completion_date), "MMM dd, yyyy")
                            : "—"}
                        </div>
                      </div>
                    </div>

                    {staff.outstanding_balance > 0 && (
                      <div className="bg-slate-50 rounded p-2">
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-600 h-2 rounded-full"
                            style={{
                              width: `${((staff.paid_to_date / staff.total_amount) * 100) | 0}%`,
                            }}
                          />
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {((staff.paid_to_date / staff.total_amount) * 100).toFixed(1)}% repaid
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Export/Reports Tab */}
          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Generate Reports</CardTitle>
                <CardDescription>Export monthly reconciliation and payment records</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-slate-200">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Monthly Reconciliation Report</h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Export all payment records for {format(currentMonth, "MMMM yyyy")} including staff balances
                        </p>
                        <Button className="w-full gap-2" variant="outline">
                          <Download className="h-4 w-4" />
                          Download Excel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Audit Trail Report</h3>
                        <p className="text-sm text-slate-600 mb-4">
                          Export approval history and audit trail for compliance and verification
                        </p>
                        <Button className="w-full gap-2" variant="outline">
                          <Download className="h-4 w-4" />
                          Download PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Outstanding Balances Report</h3>
                        <p className="text-sm text-slate-600 mb-4">
                          View current outstanding balance for all active loans and payment schedules
                        </p>
                        <Button className="w-full gap-2" variant="outline">
                          <Download className="h-4 w-4" />
                          Download Excel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Overdue Payments Report</h3>
                        <p className="text-sm text-slate-600 mb-4">
                          List of all overdue payments requiring follow-up action
                        </p>
                        <Button className="w-full gap-2" variant="outline">
                          <Download className="h-4 w-4" />
                          Download CSV
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Summary Statistics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <div className="text-xs text-slate-600 font-semibold">Total Outstanding</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">
                        GHc {balanceData.reduce((sum, b) => sum + (Number(b.outstanding_balance) || 0), 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <div className="text-xs text-slate-600 font-semibold">Active Loans</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{balanceData.length}</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <div className="text-xs text-slate-600 font-semibold">Completed Loans</div>
                      <div className="text-xl font-bold text-emerald-600 mt-1">
                        {balanceData.filter((b) => b.status === "completed").length}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <div className="text-xs text-slate-600 font-semibold">Overdue Payments</div>
                      <div className="text-xl font-bold text-red-600 mt-1">
                        {repaymentData.filter((r) => r.status === "overdue").length}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
