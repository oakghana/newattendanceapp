"use client"

import { useState } from "react"
import {
  Calendar,
  Download,
  RefreshCw,
  FileText,
  X,
  Clock,
  CheckCircle,
  Send,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Plus,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Tab definitions
const tabs = [
  { id: "management", label: "Leave Management", icon: ClipboardList },
  { id: "hr-leave", label: "Leave & HR Leave", icon: FileText },
  { id: "analytics", label: "Leave Analytics", icon: TrendingUp },
  { id: "balance", label: "Balance & Calendar", icon: CalendarDays },
]

// Mock data
const leaveBalances = [
  { type: "Study Leave (Without Pay)", days: 180, color: "bg-purple-500", icon: "book" },
  { type: "Maternity Leave", days: 84, color: "bg-pink-500", icon: "baby" },
  { type: "Annual Leave", days: 30, color: "bg-amber-500", icon: "sun" },
  { type: "Sick Leave", days: 30, color: "bg-red-500", icon: "heart" },
  { type: "Study Leave (With Pay)", days: 30, color: "bg-blue-500", icon: "book" },
  { type: "Special / Leave Without Pay", days: 30, color: "bg-gray-500", icon: "star" },
  { type: "Casual Leave", days: 10, color: "bg-teal-500", icon: "coffee" },
  { type: "Compassionate Leave", days: 7, color: "bg-orange-500", icon: "heart" },
  { type: "Paternity Leave", days: 5, color: "bg-indigo-500", icon: "user" },
]

const analyticsData = {
  outstanding: 2,
  approvedTotal: 3,
  onLeaveNow: 2,
  yetToEnjoy: 0,
  completed: 1,
  uniqueStaff: 3,
}

const staffOnLeave = [
  { name: "Mr. Owuraku Ansah", id: "5000083", dept: "IT", type: "Annual Leave", start: "2026-04-30", end: "2026-05-28", days: "23d" },
  { name: "Mrs Yaw Ofosu Siaw", id: "99999", dept: "IT", type: "Annual Leave", start: "2026-05-01", end: "2026-06-09", days: "30d" },
]

export function LeaveManagementPage() {
  const [activeTab, setActiveTab] = useState("management")
  const [showBanner, setShowBanner] = useState(true)
  const [activeAction, setActiveAction] = useState("my-requests")
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1)) // May 2026

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return { firstDay, daysInMonth }
  }

  const { firstDay, daysInMonth } = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  return (
    <div className="min-h-screen bg-[#1a1f2e] p-4 md:p-6">
      {/* Pink Info Banner */}
      {showBanner && (
        <div className="mb-4 rounded-lg bg-gradient-to-r from-pink-100 to-pink-50 border border-pink-200 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-500 text-lg">●</span>
            <div>
              <span className="font-semibold text-pink-900 text-sm">News Flash: Loan & Leave Administration Upgrade</span>
              <p className="text-pink-700 text-xs">
                We&apos;re introducing a smarter system with stronger approval tracking and improved manager notifications to enhance loan and leave administration. Stay tuned for the rollout soon.
              </p>
            </div>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-pink-400 hover:text-pink-600 text-sm font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation - Orange/Amber gradient buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all",
                isActive
                  ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30"
                  : "bg-gradient-to-r from-amber-400/90 to-orange-500/90 text-white/90 hover:from-amber-400 hover:to-orange-500"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* TAB 1: Leave Management */}
        {activeTab === "management" && (
          <>
            {/* Dark Blue Header Section */}
            <div className="rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#0f2744] p-6 border border-slate-700">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-slate-700/50 rounded-xl">
                    <Sparkles className="w-8 h-8 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-1 rounded">LEAVE WORKSPACE</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Leave Management</h1>
                    <p className="text-slate-400 text-sm max-w-md">
                      Review leave activity, track submissions, and move quickly between personal requests and approvals.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full">Role: department head</span>
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-full">Department Linked</span>
                      <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded-full">Self-service Enabled</span>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/60 rounded-xl p-4 min-w-[120px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs uppercase">Pending</span>
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-3xl font-bold text-white mt-1">0</p>
                    <p className="text-xs text-slate-500">Awaiting decision</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 min-w-[120px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs uppercase">Approved</span>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-3xl font-bold text-white mt-1">4</p>
                    <p className="text-xs text-slate-500">Confirmed leave</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 min-w-[120px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs uppercase">Submitted</span>
                      <Send className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-3xl font-bold text-white mt-1">0</p>
                    <p className="text-xs text-slate-500">My requests</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl p-4 min-w-[120px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs uppercase">Approvals</span>
                      <ArrowRight className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-3xl font-bold text-white mt-1">0</p>
                    <p className="text-xs text-slate-500">Manager queue</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Export Section */}
            <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Download className="w-4 h-4 text-purple-400" />
                <h3 className="text-white font-semibold">Export Annual Leave Requests</h3>
              </div>
              <p className="text-slate-400 text-sm mb-4">Download all staff annual leave requests for your department/region as an Excel file.</p>
              <button className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 text-white font-medium flex items-center justify-center gap-2 hover:from-purple-700 hover:to-purple-800 transition-all">
                <Download className="w-4 h-4" />
                Export to Excel
              </button>
            </div>

            {/* Leave Application Actions */}
            <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white font-semibold">Leave Application Actions</h3>
              </div>
              <p className="text-slate-400 text-sm mb-4">Manage your leave requests and submissions</p>
              
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "my-requests", label: "My Requests (0)", color: "bg-slate-600" },
                  { id: "apply", label: "Apply for Leave", color: "bg-emerald-600", icon: Plus },
                  { id: "approved", label: "Approved (4)", color: "bg-slate-600" },
                  { id: "deferments", label: "Deferments", color: "bg-amber-600" },
                  { id: "recalls", label: "Recalls", color: "bg-slate-600" },
                  { id: "memos", label: "Approved Memos", color: "bg-slate-600" },
                ].map((action) => (
                  <button
                    key={action.id}
                    onClick={() => setActiveAction(action.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1",
                      activeAction === action.id
                        ? action.color + " text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    )}
                  >
                    {action.icon && <action.icon className="w-3 h-3" />}
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Deferment Form (shown when deferments is active) */}
            {activeAction === "deferments" && (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-white" />
                    <h3 className="text-white font-semibold">Defer Your Approved Leave</h3>
                  </div>
                  <p className="text-white/80 text-sm">Defer your approved leave to a future leave year</p>
                </div>
                <div className="bg-[#252d3d] p-5 space-y-4">
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Select Approved Leave Request</label>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white">
                      <option>-- Choose a leave request --</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Deferral Year (YYYY)</label>
                    <input type="text" placeholder="2027" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-sm mb-2">Reason (Optional)</label>
                    <textarea rows={3} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white resize-none" placeholder="Enter reason for deferment..."></textarea>
                  </div>
                  <button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium">
                    Submit Deferment
                  </button>
                </div>
              </div>
            )}

            {/* Empty State (when my-requests is active and no requests) */}
            {activeAction === "my-requests" && (
              <div className="rounded-xl bg-[#252d3d] p-12 border border-slate-700 flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-slate-500" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">No leave requests yet</h3>
                <p className="text-slate-400 text-sm text-center mb-4">You haven&apos;t submitted any leave requests. Click the button below to apply for leave.</p>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-full font-medium flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Apply for Leave
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: Leave & HR Leave */}
        {activeTab === "hr-leave" && (
          <>
            {/* Green Header */}
            <div className="rounded-xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-6 border border-emerald-600">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Leave Management</h1>
                  <p className="text-emerald-200 text-sm">2025/2026 Leave Year - Quality Control Company Limited</p>
                </div>
                <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg">
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
              
              {/* Workflow Steps */}
              <div className="flex flex-wrap items-center gap-2">
                {["1 Staff Applies", "2 HOD Reviews", "3 HR Leave Office Adjusts", "4 HR Issues Memo"].map((step, i) => (
                  <span key={i} className="px-3 py-1 bg-emerald-800/50 text-emerald-100 text-xs rounded-full border border-emerald-600">
                    {step} {i < 3 && "→"}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button className="bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" />
                Request
              </button>
              <button className="bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Apply
              </button>
              <button className="bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4" />
                HOD Review
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">0</span>
              </button>
            </div>

            {/* New Leave Application Form */}
            <div className="rounded-xl border border-emerald-600 overflow-hidden">
              <div className="bg-emerald-600 p-4 border-l-4 border-emerald-400">
                <h3 className="text-white font-semibold">New Leave Application</h3>
                <p className="text-emerald-100 text-sm">Leave Year Period: 2025/2026</p>
              </div>
              <div className="bg-[#252d3d] p-5 space-y-5">
                {/* Planning Reminder */}
                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Clock className="w-5 h-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-amber-300 font-medium text-sm">Annual Leave Planning Reminder:</p>
                      <p className="text-amber-200/80 text-xs">
                        In September, all staff must submit their annual leave requests for the October cocoa season cycle. This allows HOD/Regional Managers time to review and approve all leave days by the start of October. Plan ahead to avoid operational disruptions.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs mb-2 uppercase">Leave Year Period</label>
                    <p className="text-slate-300 text-sm">Current year: 2025/2026</p>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-2 uppercase">Leave Type</label>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm">
                      <option>Select leave type</option>
                      <option>Annual Leave</option>
                      <option>Maternity Leave</option>
                      <option>Paternity Leave</option>
                      <option>Study Leave (With Pay)</option>
                      <option>Study Leave (Without Pay)</option>
                      <option>Casual Leave</option>
                      <option>Compassionate Leave</option>
                      <option>Special / Leave Without Pay</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-2 uppercase">Start Date</label>
                  <input type="date" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm" />
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-2 uppercase">Reason / Purpose</label>
                  <textarea rows={2} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm resize-none" placeholder="Brief reason for leave (optional)"></textarea>
                </div>

                <div>
                  <label className="block text-slate-400 text-xs mb-2 uppercase">Staff Signature <span className="text-red-400">*</span></label>
                  <p className="text-white italic">Staff Signature</p>
                  <p className="text-slate-500 text-xs">Signature is auto-populated from your staff profile name.</p>
                </div>

                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium">
                  Submit Application
                </button>
              </div>
            </div>
          </>
        )}

        {/* TAB 3: Leave Analytics */}
        {activeTab === "analytics" && (
          <>
            {/* Purple Header */}
            <div className="rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 p-6 border border-purple-600 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-48 h-48 bg-gradient-to-br from-purple-600/20 to-transparent rounded-full blur-2xl"></div>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-5 h-5 text-purple-300" />
                    <span className="text-xs font-semibold text-purple-300 uppercase">HR Leave Intelligence</span>
                  </div>
                  <h1 className="text-2xl font-bold text-white">Leave Analytics Dashboard</h1>
                  <p className="text-purple-200 text-sm">Executive Insights - Quality Control Company Limited</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                  <button className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">
                    <Download className="w-3 h-3" />
                    CSV
                  </button>
                  <button className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm">
                    <FileText className="w-3 h-3" />
                    PDF
                  </button>
                  <button className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm">
                    <Send className="w-3 h-3" />
                    Send 5-Day Reminders
                  </button>
                </div>
              </div>
              
              {/* Date Range */}
              <div className="flex items-center gap-4 relative z-10">
                <div>
                  <label className="text-purple-300 text-xs block mb-1">FROM</label>
                  <input type="date" defaultValue="2026-05-01" className="bg-purple-900/50 border border-purple-600 rounded px-3 py-1.5 text-white text-sm" />
                </div>
                <div>
                  <label className="text-purple-300 text-xs block mb-1">TO</label>
                  <input type="date" defaultValue="2026-05-31" className="bg-purple-900/50 border border-purple-600 rounded px-3 py-1.5 text-white text-sm" />
                </div>
                <button className="bg-white text-purple-800 px-4 py-1.5 rounded font-medium text-sm mt-5">
                  Apply Range
                </button>
              </div>
            </div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Outstanding", value: analyticsData.outstanding, color: "from-orange-500 to-orange-600", icon: Clock },
                { label: "Approved Total", value: analyticsData.approvedTotal, color: "from-teal-500 to-teal-600", icon: CheckCircle },
                { label: "On Leave Now", value: analyticsData.onLeaveNow, color: "from-blue-500 to-blue-600", icon: Users },
                { label: "Yet to Enjoy", value: analyticsData.yetToEnjoy, color: "from-purple-500 to-purple-600", icon: Calendar },
                { label: "Completed", value: analyticsData.completed, color: "from-cyan-500 to-cyan-600", icon: CheckCircle },
                { label: "Unique Staff", value: analyticsData.uniqueStaff, color: "from-pink-500 to-pink-600", icon: Users },
              ].map((stat, i) => (
                <div key={i} className={cn("rounded-xl bg-gradient-to-br p-4", stat.color)}>
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 text-xs uppercase">{stat.label}</span>
                    <stat.icon className="w-4 h-4 text-white/60" />
                  </div>
                  <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Leave by Type & Location */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <h3 className="text-white font-semibold">Leave by Type</h3>
                  <span className="text-slate-400 text-xs">1 leave categories</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-700">
                  <span className="text-slate-300">Annual Leave</span>
                  <span className="text-white font-semibold">3</span>
                </div>
              </div>
              <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4 text-green-400" />
                  <h3 className="text-white font-semibold">Leave by Location</h3>
                  <span className="text-slate-400 text-xs">1 locations</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-700">
                  <span className="text-slate-300">QCC Head Office</span>
                  <span className="text-white font-semibold">3</span>
                </div>
              </div>
            </div>

            {/* Currently on Leave Table */}
            <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-white font-semibold">Currently on Leave</h3>
                  <span className="text-slate-400 text-xs">Active approved leave today</span>
                </div>
                <span className="bg-emerald-600 text-white text-xs px-2 py-1 rounded-full">2</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                      <th className="text-left py-3">Staff</th>
                      <th className="text-left py-3">ID</th>
                      <th className="text-left py-3">Department</th>
                      <th className="text-left py-3">Leave Type</th>
                      <th className="text-left py-3">Period</th>
                      <th className="text-right py-3">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffOnLeave.map((staff, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="py-3 text-white">{staff.name}</td>
                        <td className="py-3 text-slate-400">{staff.id}</td>
                        <td className="py-3 text-slate-400">{staff.dept}</td>
                        <td className="py-3">
                          <span className="bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded text-xs">{staff.type}</span>
                        </td>
                        <td className="py-3 text-slate-400">{staff.start} → {staff.end}</td>
                        <td className="py-3 text-right text-white font-medium">{staff.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 4: Balance & Calendar */}
        {activeTab === "balance" && (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Leave Balance */}
            <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-white font-semibold">Leave Balance</h3>
                    <p className="text-slate-400 text-xs">Period 2026/2027</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">0</p>
                  <p className="text-slate-400 text-xs">of 412 days used</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {leaveBalances.map((leave, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", leave.color)}>
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{leave.type}</p>
                      <div className="w-full bg-slate-700 rounded-full h-1 mt-1">
                        <div className={cn("h-1 rounded-full", leave.color)} style={{ width: "100%" }}></div>
                      </div>
                    </div>
                    <span className="bg-emerald-600/20 text-emerald-300 px-2 py-0.5 rounded text-xs whitespace-nowrap">
                      {leave.days}d left
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Calendar */}
            <div className="rounded-xl bg-[#252d3d] p-5 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-white font-semibold">Team Calendar</h3>
                    <p className="text-slate-400 text-xs">Who is off this month</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-1 hover:bg-slate-700 rounded">
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </button>
                  <span className="text-white font-medium px-3">{monthName}</span>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-1 hover:bg-slate-700 rounded">
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                  <div key={day} className="text-slate-500 text-xs py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square"></div>
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const hasLeave = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].includes(day)
                  const isToday = day === 17
                  return (
                    <div
                      key={day}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative",
                        isToday ? "bg-emerald-600 text-white" : "text-slate-300",
                        hasLeave && !isToday && "bg-amber-500/20"
                      )}
                    >
                      {day}
                      {hasLeave && (
                        <div className="flex gap-0.5 mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                          <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                          <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Staff on Leave Today */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-xs uppercase mb-3">Sunday, 17 May 2026</p>
                <div className="space-y-2">
                  {staffOnLeave.map((staff, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                          {staff.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-white text-sm">{staff.name}</p>
                          <p className="text-slate-500 text-xs">{staff.dept}</p>
                        </div>
                      </div>
                      <span className="bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded text-xs">Annual</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-slate-400">Annual</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-slate-400">Sick</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                  <span className="text-slate-400">Maternity</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  <span className="text-slate-400">Paternity</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                  <span className="text-slate-400">Casual</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
