"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  isHrApproverRole,
  isHrLeaveOfficeRole,
  isManagerRole,
  isStaffRole,
  getStatusLabel,
  getStatusColor,
} from "@/lib/leave-planning"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  ClipboardList,
  Send,
  UserCheck,
  ShieldCheck,
  Download,
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Plus,
  XCircle,
  Pencil,
  Trash2,
  Search,
  Clock3,
  BarChart3,
  Activity,
  MapPin,
  Users,
  LayoutList,
  FileText,
  Calendar,
  TrendingUp,
  ArrowRight,
} from "lucide-react"

// Types
interface LeaveManagementProfile {
  id: string
  role: string
  firstName: string
  lastName: string
  employeeId: string
  rank: string
  departmentId: string | null
  departmentName: string | null
  departmentCode: string | null
}

interface LeaveManagementModuleClientProps {
  profile: LeaveManagementProfile
  initialHolidays?: Array<{ holiday_date: string; holiday_name: string }>
}

// Helpers
function fmtDate(val?: string | null) {
  if (!val) return "-"
  try {
    return new Date(val).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
  } catch { return val }
}

function leaveTypeLabelShort(key: string) {
  const map: Record<string, string> = {
    annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity",
    study: "Study", compassionate: "Compassionate", part_leave: "Part Leave",
    no_pay: "Leave Without Pay", casual: "Casual", leave_of_absence: "Leave of Absence",
  }
  return map[key] || key
}

function getActiveLeaveYearPeriod(referenceDate: Date = new Date()) {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  if (month >= 9) return `${year}/${year + 1}`
  return `${year - 1}/${year}`
}

// Main Component
export function LeaveManagementModuleClient({ profile, initialHolidays = [] }: LeaveManagementModuleClientProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("request")
  const [activeAction, setActiveAction] = useState<string | null>("my-requests")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Data states
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [approvedRequests, setApprovedRequests] = useState<any[]>([])
  const [hodQueue, setHodQueue] = useState<any[]>([])
  const [hrOfficeQueue, setHrOfficeQueue] = useState<any[]>([])
  const [hrApprovalQueue, setHrApprovalQueue] = useState<any[]>([])
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [leaveBalances, setLeaveBalances] = useState<any[]>([])
  const [teamOnLeave, setTeamOnLeave] = useState<any[]>([])
  
  // Stats
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    submitted: 0,
    managerQueue: 0,
  })

  // Role checks
  const role = profile.role
  const isStaff = isStaffRole(role)
  const isManager = isManagerRole(role)
  const isHrOffice = isHrLeaveOfficeRole(role)
  const isHrApprover = isHrApproverRole(role)
  const isAdmin = role === "admin" || role === "it-admin"
  const canSelfApply = isStaff || isManager || isAdmin
  const canSeeAnalytics = isHrOffice || isHrApprover || isAdmin
  const activeLeaveYearPeriod = getActiveLeaveYearPeriod()

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch leave requests
      const reqRes = await fetch("/api/leave/planning")
      if (reqRes.ok) {
        const data = await reqRes.json()
        const allRequests = data.requests || []
        
        // Filter my requests
        setMyRequests(allRequests.filter((r: any) => r.user_id === profile.id))
        
        // Filter approved
        setApprovedRequests(allRequests.filter((r: any) => r.status === "hr_approved"))
        
        // Filter HOD queue
        if (isManager || isAdmin) {
          setHodQueue(allRequests.filter((r: any) => 
            ["pending_hod_review", "pending_manager_review"].includes(r.status)
          ))
        }
        
        // Filter HR Office queue
        if (isHrOffice || isAdmin) {
          setHrOfficeQueue(allRequests.filter((r: any) => 
            ["hod_approved", "manager_confirmed"].includes(r.status)
          ))
        }
        
        // Filter HR Approval queue
        if (isHrApprover || isAdmin) {
          setHrApprovalQueue(allRequests.filter((r: any) => 
            r.status === "hr_office_forwarded"
          ))
        }
        
        // Calculate stats
        const myReqs = allRequests.filter((r: any) => r.user_id === profile.id)
        setStats({
          pending: myReqs.filter((r: any) => !["hr_approved", "hr_rejected"].includes(r.status)).length,
          approved: myReqs.filter((r: any) => r.status === "hr_approved").length,
          submitted: myReqs.length,
          managerQueue: isManager ? allRequests.filter((r: any) => 
            ["pending_hod_review", "pending_manager_review"].includes(r.status)
          ).length : 0,
        })
      }
      
      // Fetch analytics for HR
      if (canSeeAnalytics) {
        const analyticsRes = await fetch("/api/leave/analytics")
        if (analyticsRes.ok) {
          const data = await analyticsRes.json()
          setAnalyticsData(data.analytics)
        }
      }
      
      // Fetch leave balances
      const balRes = await fetch(`/api/leave/balances?userId=${profile.id}`)
      if (balRes.ok) {
        const data = await balRes.json()
        setLeaveBalances(data.data || [])
      }
      
      // Fetch team on leave
      const teamRes = await fetch("/api/leave/team-calendar")
      if (teamRes.ok) {
        const data = await teamRes.json()
        setTeamOnLeave(data.onLeave || [])
      }
      
    } catch (err) {
      console.error("[v0] Error loading leave data:", err)
      setError("Failed to load leave data")
    } finally {
      setLoading(false)
    }
  }, [profile.id, isManager, isHrOffice, isHrApprover, isAdmin, canSeeAnalytics])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build tabs based on role
  const tabs = useMemo(() => {
    const t: { value: string; label: string; Icon: any; count?: number }[] = []
    
    // Tab 1: Leave Management (for everyone)
    t.push({ value: "leave-management", label: "Leave Management", Icon: CalendarDays })
    
    // Tab 2: Leave & HR Leave (for HR roles)
    if (isHrOffice || isHrApprover || isAdmin) {
      t.push({ value: "leave-hr", label: "Leave & HR Leave", Icon: ClipboardList, count: hrOfficeQueue.length + hrApprovalQueue.length })
    }
    
    // Tab 3: Leave Analytics (for HR roles)
    if (canSeeAnalytics) {
      t.push({ value: "analytics", label: "Leave Analytics", Icon: BarChart3 })
    }
    
    // Tab 4: Balance & Calendar (for everyone)
    t.push({ value: "balance-calendar", label: "Balance & Calendar", Icon: Calendar })
    
    return t
  }, [isHrOffice, isHrApprover, isAdmin, canSeeAnalytics, hrOfficeQueue.length, hrApprovalQueue.length])

  // Render workflow badges
  const WorkflowBadges = () => (
    <div className="flex flex-wrap items-center gap-2">
      {[
        { num: 1, label: "Staff Applies", done: true },
        { num: 2, label: "HOD Reviews", done: false },
        { num: 3, label: "HR Leave Office Adjusts", done: false },
        { num: 4, label: "HR Issues Memo", done: false },
      ].map(({ num, label, done }, idx, arr) => (
        <div key={num} className="flex items-center gap-1">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              done ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-600"
            }`}>{num}</span>
            {label}
          </div>
          {idx < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-400" />}
        </div>
      ))}
    </div>
  )

  // Action buttons for Leave Management tab
  const actionButtons = [
    { id: "my-requests", label: "My Requests", count: myRequests.length, Icon: FileText },
    { id: "apply", label: "Apply for Leave", Icon: Plus, highlight: true },
    { id: "approved", label: "Approved", count: approvedRequests.filter(r => r.user_id === profile.id).length, Icon: CheckCircle2 },
    { id: "deferments", label: "Deferments", Icon: Clock3 },
    { id: "recalls", label: "Recalls", Icon: RefreshCw },
    { id: "approved-memos", label: "Approved Memos", Icon: Download },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-green-600" />
          <p className="text-slate-500">Loading leave data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-5 space-y-4">
      {/* Notification Banner */}
      <Alert className="border-pink-200 bg-gradient-to-r from-pink-50 to-rose-50">
        <AlertCircle className="h-4 w-4 text-pink-600" />
        <AlertDescription className="text-pink-800">
          <span className="font-semibold text-pink-700">News Flash: Loan & Leave Administration Upgrade</span>
          <span className="ml-2 text-pink-600">
            We&apos;re introducing a smarter system with stronger approval tracking and improved manager notifications.
          </span>
        </AlertDescription>
      </Alert>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-nowrap gap-2 overflow-x-auto rounded-xl bg-transparent p-0">
          {tabs.map(({ value, label, Icon, count }) => (
            <TabsTrigger 
              key={value} 
              value={value}
              className="flex shrink-0 items-center gap-2 rounded-xl border-2 border-transparent bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-amber-500 hover:to-orange-500 data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:shadow-md"
            >
              <Icon className="w-4 h-4" />
              {label}
              {count != null && count > 0 && (
                <span className="ml-1 rounded-full bg-white/30 px-1.5 py-0.5 text-[10px] font-bold">
                  {count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1: Leave Management */}
        <TabsContent value="leave-management" className="mt-4 space-y-4">
          {/* Dark Blue Header Card */}
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 text-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
                    <span className="text-xs font-bold text-emerald-400">LEAVE WORKSPACE</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Leave Management</h2>
                    <p className="text-slate-300 text-sm mt-1">
                      Review leave activity, track submissions, and move quickly between personal requests and approvals.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge className="bg-slate-600/50 text-slate-200 border-slate-500">Role: {profile.role}</Badge>
                      {profile.departmentName && (
                        <Badge className="bg-blue-600/30 text-blue-200 border-blue-400">Department Linked</Badge>
                      )}
                      <Badge className="bg-emerald-600/30 text-emerald-200 border-emerald-400">Self-service Enabled</Badge>
                    </div>
                  </div>
                </div>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 min-w-[200px]">
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 uppercase">Pending</span>
                      <Clock3 className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.pending}</p>
                    <p className="text-[10px] text-slate-400">Awaiting decision</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 uppercase">Approved</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.approved}</p>
                    <p className="text-[10px] text-slate-400">Confirmed leave</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 uppercase">Submitted</span>
                      <FileText className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.submitted}</p>
                    <p className="text-[10px] text-slate-400">My requests</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 uppercase">Approvals</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{stats.managerQueue}</p>
                    <p className="text-[10px] text-slate-400">Manager queue</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Export Section */}
          <Card className="border border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Download className="w-5 h-5 text-slate-500 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Export Annual Leave Requests</h3>
                  <p className="text-sm text-slate-500">Download all staff annual leave requests for your department/region as an Excel file</p>
                </div>
              </div>
              <Button className="w-full mt-4 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white">
                <Download className="w-4 h-4 mr-2" />
                Export to Excel
              </Button>
            </CardContent>
          </Card>

          {/* Leave Application Actions */}
          <Card className="border border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-500" />
                <div>
                  <CardTitle className="text-base">Leave Application Actions</CardTitle>
                  <p className="text-sm text-slate-500">Manage your leave requests and submissions</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {actionButtons.map(({ id, label, count, Icon, highlight }) => (
                  <Button
                    key={id}
                    variant={activeAction === id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveAction(id)}
                    className={`gap-2 ${highlight ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""} ${
                      activeAction === id && !highlight ? "bg-slate-800 text-white hover:bg-slate-900" : ""
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {count != null && <span className="text-xs opacity-70">({count})</span>}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Content */}
          {activeAction === "my-requests" && (
            <Card className="border border-slate-200">
              <CardContent className="p-6">
                {myRequests.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarDays className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-700">No leave requests yet</p>
                    <p className="text-sm text-slate-500 mt-1">You haven&apos;t submitted any leave requests. Click the button below to apply for leave.</p>
                    <Button 
                      className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setActiveAction("apply")}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Apply for Leave
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map((req: any) => (
                      <div key={req.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                        <div>
                          <p className="font-medium text-slate-900">{leaveTypeLabelShort(req.leave_type_key)}</p>
                          <p className="text-sm text-slate-500">
                            {fmtDate(req.preferred_start_date)} to {fmtDate(req.preferred_end_date)}
                          </p>
                        </div>
                        <Badge className={getStatusColor(req.status)}>{getStatusLabel(req.status)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeAction === "apply" && (
            <Card className="border-2 border-emerald-200">
              <CardHeader className="bg-gradient-to-r from-emerald-600 to-green-600 text-white">
                <CardTitle className="text-lg">New Leave Application</CardTitle>
                <p className="text-emerald-100 text-sm">Leave Year Period: {activeLeaveYearPeriod}</p>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-center text-slate-500 py-8">
                  Leave application form will be rendered here with leave type selection, date picker, reason field, and signature.
                </p>
              </CardContent>
            </Card>
          )}

          {activeAction === "approved" && (
            <div className="grid gap-4 md:grid-cols-2">
              {approvedRequests.filter(r => r.user_id === profile.id).length === 0 ? (
                <Card className="md:col-span-2 border border-slate-200">
                  <CardContent className="p-6 text-center">
                    <p className="text-slate-500">No approved leave requests yet.</p>
                  </CardContent>
                </Card>
              ) : (
                approvedRequests.filter(r => r.user_id === profile.id).map((req: any) => (
                  <Card key={req.id} className="border border-slate-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-900">{leaveTypeLabelShort(req.leave_type_key)}</h4>
                          <p className="text-sm text-slate-500">{req.user?.first_name} {req.user?.last_name}</p>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Hr Approved</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 uppercase">Start Date</p>
                          <p className="font-medium">{fmtDate(req.adjusted_start_date || req.preferred_start_date)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 uppercase">End Date</p>
                          <p className="font-medium">{fmtDate(req.adjusted_end_date || req.preferred_end_date)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Leave & HR Leave */}
        <TabsContent value="leave-hr" className="mt-4 space-y-4">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-green-700 via-green-600 to-emerald-600 text-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Leave Management</h2>
                  <p className="text-green-200 text-sm mt-1">{activeLeaveYearPeriod} Leave Year · Quality Control Company Limited</p>
                </div>
                <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10" onClick={loadData}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
              <div className="mt-4">
                <WorkflowBadges />
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" className="h-12 border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
              <FileText className="w-4 h-4 mr-2" />
              Request
            </Button>
            <Button className="h-12 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500">
              <Plus className="w-4 h-4 mr-2" />
              Apply
            </Button>
            <Button variant="outline" className="h-12 border-2 border-amber-200 bg-amber-50 hover:bg-amber-100">
              <UserCheck className="w-4 h-4 mr-2" />
              HOD Review
              {hodQueue.length > 0 && (
                <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{hodQueue.length}</span>
              )}
            </Button>
          </div>

          {/* Worked On Requests */}
          <Card className="border border-slate-200">
            <CardHeader className="bg-emerald-50 border-b border-emerald-100">
              <CardTitle className="text-base text-emerald-800">Worked On Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {hrOfficeQueue.length === 0 && hrApprovalQueue.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">No requests to work on at this time.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {[...hrOfficeQueue, ...hrApprovalQueue].slice(0, 10).map((req: any) => (
                    <div key={req.id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-900">{req.user?.first_name} {req.user?.last_name}</p>
                        <p className="text-sm text-slate-500">
                          {leaveTypeLabelShort(req.leave_type_key)} · {fmtDate(req.preferred_start_date)} to {fmtDate(req.preferred_end_date)}
                        </p>
                      </div>
                      <Badge className={getStatusColor(req.status)}>{getStatusLabel(req.status)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Leave Analytics */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-violet-700 via-purple-600 to-indigo-600 text-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-6 h-6" />
                  <div>
                    <p className="text-xs font-medium text-violet-200 uppercase tracking-wider">HR Leave Intelligence</p>
                    <h2 className="text-xl font-bold">Leave Analytics Dashboard</h2>
                    <p className="text-violet-200 text-sm">Executive Insights · Quality Control Company Limited</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10" onClick={loadData}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10">
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Outstanding", value: analyticsData?.totals?.outstanding_requests || 0, color: "from-orange-400 to-amber-400", icon: Clock3 },
              { label: "Approved Total", value: analyticsData?.totals?.approved_total || 0, color: "from-teal-400 to-emerald-400", icon: CheckCircle2 },
              { label: "On Leave Now", value: analyticsData?.totals?.staff_on_leave_now || 0, color: "from-blue-400 to-cyan-400", icon: Users },
              { label: "Yet to Enjoy", value: analyticsData?.totals?.staff_yet_to_enjoy || 0, color: "from-purple-400 to-violet-400", icon: Calendar },
              { label: "Completed", value: analyticsData?.totals?.completed_leave_requests || 0, color: "from-cyan-400 to-teal-400", icon: Activity },
              { label: "Unique Staff", value: analyticsData?.totals?.unique_staff_in_range || 0, color: "from-pink-400 to-rose-400", icon: Users },
            ].map(({ label, value, color, icon: Icon }) => (
              <Card key={label} className={`border-0 shadow-md overflow-hidden`}>
                <div className={`bg-gradient-to-br ${color} p-4 text-white`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider opacity-90">{label}</p>
                    <Icon className="w-5 h-5 opacity-80" />
                  </div>
                  <p className="text-3xl font-bold mt-2">{value}</p>
                </div>
              </Card>
            ))}
          </div>

          {/* Leave by Type and Location */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Leave by Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(analyticsData?.by_type || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No data available</p>
                ) : (
                  <div className="space-y-2">
                    {(analyticsData?.by_type || []).slice(0, 5).map((item: any) => (
                      <div key={item.leave_type_key} className="flex items-center justify-between text-sm">
                        <span>{leaveTypeLabelShort(item.leave_type_key)}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Leave by Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(analyticsData?.by_location || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No data available</p>
                ) : (
                  <div className="space-y-2">
                    {(analyticsData?.by_location || []).slice(0, 5).map((item: any) => (
                      <div key={item.location_name} className="flex items-center justify-between text-sm">
                        <span>{item.location_name || "Unknown"}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Currently on Leave Table */}
          <Card className="border border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Currently on Leave
                </CardTitle>
                <Badge>{teamOnLeave.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {teamOnLeave.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No staff currently on leave</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="pb-2 font-medium">Staff</th>
                        <th className="pb-2 font-medium">ID</th>
                        <th className="pb-2 font-medium">Department</th>
                        <th className="pb-2 font-medium">Leave Type</th>
                        <th className="pb-2 font-medium">Period</th>
                        <th className="pb-2 font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {teamOnLeave.slice(0, 10).map((staff: any) => (
                        <tr key={staff.id} className="hover:bg-slate-50">
                          <td className="py-3 font-medium">{staff.staff_name}</td>
                          <td className="py-3 text-slate-500">{staff.employee_id}</td>
                          <td className="py-3 text-slate-500">{staff.department_name || "-"}</td>
                          <td className="py-3">
                            <Badge variant="outline" className="text-xs">{leaveTypeLabelShort(staff.leave_type_key)}</Badge>
                          </td>
                          <td className="py-3 text-slate-500">{fmtDate(staff.start_date)} - {fmtDate(staff.end_date)}</td>
                          <td className="py-3 font-medium">{staff.days}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Balance & Calendar */}
        <TabsContent value="balance-calendar" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Leave Balance */}
            <Card className="border border-slate-200">
              <CardHeader className="bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    <div>
                      <CardTitle className="text-base">Leave Balance</CardTitle>
                      <p className="text-xs text-slate-300">Period {activeLeaveYearPeriod}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{leaveBalances.reduce((sum, b) => sum + (b.entitlement_days - (b.used_this_period || 0)), 0)}</p>
                    <p className="text-xs text-slate-300">of {leaveBalances.reduce((sum, b) => sum + b.entitlement_days, 0)} days used</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  {leaveBalances.length === 0 ? (
                    <p className="col-span-2 text-center text-slate-500 py-4">No leave balance data available</p>
                  ) : (
                    leaveBalances.map((balance: any) => {
                      const remaining = balance.entitlement_days - (balance.used_this_period || 0)
                      const colors: Record<string, string> = {
                        annual: "from-blue-400 to-cyan-400",
                        sick: "from-red-400 to-rose-400",
                        maternity: "from-pink-400 to-rose-400",
                        paternity: "from-indigo-400 to-purple-400",
                        study: "from-amber-400 to-orange-400",
                        compassionate: "from-red-400 to-pink-400",
                        casual: "from-emerald-400 to-green-400",
                      }
                      const color = colors[balance.leave_type_key] || "from-slate-400 to-slate-500"
                      return (
                        <div key={balance.leave_type_key} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white`}>
                            <CalendarDays className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-700">{leaveTypeLabelShort(balance.leave_type_key)}</p>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div 
                                className={`h-full bg-gradient-to-r ${color}`} 
                                style={{ width: `${Math.min(100, (remaining / balance.entitlement_days) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">{remaining}d left</Badge>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Team Calendar */}
            <Card className="border border-slate-200">
              <CardHeader className="bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    <div>
                      <CardTitle className="text-base">Team Calendar</CardTitle>
                      <p className="text-xs text-slate-300">Who is off this month</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10">
                      <ArrowRight className="w-4 h-4 rotate-180" />
                    </Button>
                    <span className="text-sm font-medium">May 2026</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {/* Simple calendar placeholder */}
                <div className="grid grid-cols-7 gap-1 text-center text-sm mb-4">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(day => (
                    <div key={day} className="text-xs font-medium text-slate-500 py-2">{day}</div>
                  ))}
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <div key={day} className={`p-2 rounded-lg text-sm ${
                      teamOnLeave.some((s: any) => {
                        const start = new Date(s.start_date).getDate()
                        const end = new Date(s.end_date).getDate()
                        return day >= start && day <= end
                      }) ? "bg-orange-100 text-orange-700" : "hover:bg-slate-100"
                    }`}>
                      {day}
                    </div>
                  ))}
                </div>

                {/* Staff on leave today */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-3">Staff on Leave</p>
                  {teamOnLeave.length === 0 ? (
                    <p className="text-sm text-slate-500">No staff on leave today</p>
                  ) : (
                    <div className="space-y-2">
                      {teamOnLeave.slice(0, 3).map((staff: any) => (
                        <div key={staff.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-xs font-medium">
                              {staff.staff_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{staff.staff_name}</p>
                              <p className="text-xs text-slate-500">{staff.department_name || "No dept"}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">{leaveTypeLabelShort(staff.leave_type_key)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                  {["Annual", "Sick", "Maternity", "Paternity", "Casual"].map((type, i) => (
                    <div key={type} className="flex items-center gap-1.5 text-xs">
                      <div className={`w-3 h-3 rounded-full ${
                        ["bg-blue-400", "bg-red-400", "bg-pink-400", "bg-indigo-400", "bg-emerald-400"][i]
                      }`} />
                      <span className="text-slate-600">{type}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
