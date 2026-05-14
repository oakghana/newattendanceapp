"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  FileText,
  Plus,
  Users,
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronRight,
} from "lucide-react"

export function LeaveManagementPage() {
  const [selectedTab, setSelectedTab] = useState("leave-management")

  // Mock data
  const stats = {
    pending: 2,
    approved: 3,
    submitted: 5,
    manager_queue: 1,
  }

  const leaveRequests = [
    {
      id: 1,
      date: "14 May - 18 May 2026",
      type: "Annual Leave",
      status: "pending",
      days: 5,
    },
    {
      id: 2,
      date: "10 June 2026",
      type: "Sick Leave",
      status: "approved",
      days: 1,
    },
  ]

  const leaveBalance = [
    { type: "Annual Leave", entitlement: 30, used: 5, available: 25 },
    { type: "Sick Leave", entitlement: 10, used: 0, available: 10 },
    { type: "Study Leave", entitlement: 30, used: 0, available: 30 },
    { type: "Maternity Leave", entitlement: 84, used: 0, available: 84 },
  ]

  const analyticsData = {
    outstanding: 2,
    approved_total: 8,
    on_leave: 3,
    yet_to_enjoy: 5,
    completed: 12,
    unique_staff: 15,
  }

  const currentlyOnLeave = [
    { name: "John Doe", type: "Annual Leave", days: 5, end: "18 May 2026" },
    { name: "Jane Smith", type: "Study Leave", days: 10, end: "25 May 2026" },
    { name: "Mike Johnson", type: "Sick Leave", days: 1, end: "15 May 2026" },
  ]

  return (
    <div className="w-full space-y-6 p-6">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        {/* Tab List */}
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="leave-management">Leave Management</TabsTrigger>
          <TabsTrigger value="leave-planning">Leave & HR Leave</TabsTrigger>
          <TabsTrigger value="analytics">Leave Analytics</TabsTrigger>
          <TabsTrigger value="balance">Balance & Calendar</TabsTrigger>
        </TabsList>

        {/* Tab 1: Leave Management */}
        <TabsContent value="leave-management" className="space-y-4">
          {/* Dark Blue Header */}
          <Card className="bg-gradient-to-r from-slate-800 to-slate-900 border-0 text-white">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Leave Management</h2>
                  <p className="text-slate-300 text-sm mt-1">
                    2025/2026 Leave Year - Quality Control Company Limited
                  </p>
                </div>
                {/* Stats on Right */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-slate-300 text-xs">PENDING</p>
                    <p className="text-2xl font-bold text-white mt-1">{stats.pending}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-slate-300 text-xs">APPROVED</p>
                    <p className="text-2xl font-bold text-white mt-1">{stats.approved}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-slate-300 text-xs">SUBMITTED</p>
                    <p className="text-2xl font-bold text-white mt-1">{stats.submitted}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <p className="text-slate-300 text-xs">MANAGER QUEUE</p>
                    <p className="text-2xl font-bold text-white mt-1">{stats.manager_queue}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Export Section */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-amber-900">Export Annual Leave Requests</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Download all staff annual leave requests for your department/region as an Excel file.
                  </p>
                </div>
                <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                  <FileText className="h-4 w-4" />
                  Export to Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <FileText className="h-4 w-4" />
              Request
            </Button>
            <Button className="bg-green-500 hover:bg-green-600 text-white gap-2">
              <Plus className="h-4 w-4" />
              Apply for Leave
            </Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white gap-2">
              <Users className="h-4 w-4" />
              HOD Review
              <Badge className="ml-1 bg-blue-700">0</Badge>
            </Button>
            <Button variant="outline">HR Leave Office</Button>
            <Button variant="outline">HR Approvals</Button>
            <Button variant="outline" className="ml-auto">All Requests</Button>
          </div>

          {/* Leave Requests List */}
          <div className="space-y-3">
            {leaveRequests.map((req) => (
              <Card key={req.id} className="border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{req.type}</p>
                    <p className="text-sm text-muted-foreground">{req.date}</p>
                    <p className="text-xs text-muted-foreground mt-1">{req.days} days</p>
                  </div>
                  <Badge
                    className={
                      req.status === "approved"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }
                  >
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Leave & HR Leave Planning */}
        <TabsContent value="leave-planning" className="space-y-4">
          {/* Green Header with Workflow */}
          <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 border-0 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">Leave Management</h2>
                  <p className="text-emerald-100 text-sm mt-1">
                    2025/2026 Leave Year - Quality Control Company Limited
                  </p>
                </div>
                <Button size="sm" variant="secondary" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {/* Workflow Steps */}
              <div className="flex flex-wrap gap-2">
                {[
                  { num: "1", text: "Staff Applies" },
                  { num: "2", text: "HOD Reviews" },
                  { num: "3", text: "HR Adjusts" },
                  { num: "4", text: "HR Issues Memo" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Badge className="bg-white/20 text-white border-0">
                      <span className="bg-white/40 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-1.5">
                        {step.num}
                      </span>
                      {step.text}
                    </Badge>
                    {i < 3 && <ChevronRight className="h-4 w-4 text-white/50" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">Request</Button>
            <Button className="bg-green-500 hover:bg-green-600 text-white">Apply</Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">HOD Review</Button>
            <Button variant="outline">HR Leave Office</Button>
            <Button variant="outline">HR Approvals</Button>
            <Button variant="outline">All Requests</Button>
          </div>

          {/* Leave Planning Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Annual Leave Planning</CardTitle>
                <CardDescription>Submit your annual leave plan for the year</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                  Submit Annual Plan
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Amendments</CardTitle>
                <CardDescription>Request changes to your approved dates</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Request Amendment
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Leave Deferment Request</CardTitle>
                <CardDescription>Defer unused leave to the next year</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-4 border rounded-xl text-center bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium uppercase">Entitlement</p>
                    <p className="text-3xl font-bold text-slate-800 mt-2">30</p>
                    <p className="text-xs text-slate-500">days</p>
                  </div>
                  <div className="p-4 border rounded-xl text-center bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium uppercase">Used</p>
                    <p className="text-3xl font-bold text-slate-800 mt-2">5</p>
                    <p className="text-xs text-slate-500">days</p>
                  </div>
                  <div className="p-4 border rounded-xl text-center bg-green-50 border-green-200">
                    <p className="text-xs text-green-600 font-medium uppercase">Available</p>
                    <p className="text-3xl font-bold text-green-600 mt-2">25</p>
                    <p className="text-xs text-green-600">days</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">
                  Request Deferment
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Leave Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>This tab is visible to HR staff only</AlertDescription>
          </Alert>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Outstanding Requests", value: analyticsData.outstanding, color: "from-orange-500 to-orange-600" },
              { label: "Approved Total", value: analyticsData.approved_total, color: "from-teal-500 to-teal-600" },
              { label: "On Leave Now", value: analyticsData.on_leave, color: "from-blue-500 to-blue-600" },
              { label: "Yet to Enjoy", value: analyticsData.yet_to_enjoy, color: "from-purple-500 to-purple-600" },
              { label: "Completed", value: analyticsData.completed, color: "from-cyan-500 to-cyan-600" },
              { label: "Unique Staff", value: analyticsData.unique_staff, color: "from-pink-500 to-pink-600" },
            ].map((item, i) => (
              <Card key={i} className={`bg-gradient-to-br ${item.color} border-0 text-white`}>
                <CardContent className="p-4">
                  <p className="text-xs opacity-80 font-medium uppercase">{item.label}</p>
                  <p className="text-3xl font-bold mt-2">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Currently on Leave */}
          <Card>
            <CardHeader>
              <CardTitle>Currently on Leave</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentlyOnLeave.map((person, i) => (
                <div key={i} className="p-3 border rounded-lg bg-slate-50">
                  <p className="font-medium">{person.name}</p>
                  <p className="text-sm text-slate-600">{person.type} - {person.days} days</p>
                  <p className="text-xs text-slate-500 mt-1">Until {person.end}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Balance & Calendar */}
        <TabsContent value="balance" className="space-y-4">
          {/* Leave Balance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {leaveBalance.map((item, i) => {
              const colors = [
                "from-blue-500 to-blue-600",
                "from-green-500 to-green-600",
                "from-purple-500 to-purple-600",
                "from-pink-500 to-pink-600",
              ]
              return (
                <Card key={i} className={`bg-gradient-to-br ${colors[i % colors.length]} border-0 text-white`}>
                  <CardContent className="p-4">
                    <p className="text-xs opacity-80 font-medium uppercase">{item.type}</p>
                    <p className="text-2xl font-bold mt-2">{item.available}</p>
                    <p className="text-xs opacity-70">of {item.entitlement} days</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>Team Calendar</CardTitle>
              <CardDescription>Who is off this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-50 rounded-lg p-4 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2" />
                Interactive calendar view
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
