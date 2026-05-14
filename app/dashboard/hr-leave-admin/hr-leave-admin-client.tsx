"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Plus, Edit2, Trash2, X, AlertCircle, CheckCircle2, Calendar, FileText, ArrowRight, ArrowLeft } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Holiday {
  id: string
  holiday_date: string
  holiday_name: string
}

interface LeaveType {
  id: string
  leave_type_key: string
  leave_type_label: string
  entitlement_days: number
  is_active: boolean
}

interface ApprovedMemo {
  id: string
  employee_name: string
  employee_id: string
  leave_type: string
  start_date: string
  end_date: string
  status: string
}

interface Deferment {
  id: string
  employee_name: string
  leave_type: string
  deferral_year: string
  status: string
}

interface Recall {
  id: string
  employee_name: string
  leave_type: string
  recall_date: string
  status: string
}

interface HRLeaveAdminClientProps {
  profile: { id: string; role: string }
}

export function HRLeaveAdminClient({ profile }: HRLeaveAdminClientProps) {
  const [activeTab, setActiveTab] = useState("holidays")
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [approvedMemos, setApprovedMemos] = useState<ApprovedMemo[]>([])
  const [deferrments, setDeferrments] = useState<Deferment[]>([])
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Holiday modal states
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [holidayForm, setHolidayForm] = useState({ holiday_date: "", holiday_name: "" })
  const [submittingHoliday, setSubmittingHoliday] = useState(false)

  // Leave type modal states
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false)
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null)
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    leave_type_key: "",
    leave_type_label: "",
    entitlement_days: 0,
    is_active: true,
  })
  const [submittingLeaveType, setSubmittingLeaveType] = useState(false)

  // Load all data on mount
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Load holidays
      const holidaysRes = await fetch("/api/leave/holidays")
      const holidaysData = await holidaysRes.json()
      if (holidaysData.holidays) {
        setHolidays(holidaysData.holidays)
      }

      // Load leave types
      const typesRes = await fetch("/api/leave/leave-types")
      const typesData = await typesRes.json()
      if (typesData.leaveTypes) {
        setLeaveTypes(typesData.leaveTypes)
      }

      // Load approved memos, deferrments, and recalls
      const memosRes = await fetch("/api/leave/hr-admin/memos")
      const memosData = await memosRes.json()
      if (memosData.memos) {
        setApprovedMemos(memosData.memos)
      }

      const deferRes = await fetch("/api/leave/hr-admin/deferrments")
      const deferData = await deferRes.json()
      if (deferData.deferrments) {
        setDeferrments(deferData.deferrments)
      }

      const recallRes = await fetch("/api/leave/hr-admin/recalls")
      const recallData = await recallRes.json()
      if (recallData.recalls) {
        setRecalls(recallData.recalls)
      }
    } catch (err) {
      console.error("[v0] Error loading data:", err)
      setError("Failed to load data. Please refresh the page.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Holiday handlers
  const handleAddHoliday = () => {
    setEditingHoliday(null)
    setHolidayForm({ holiday_date: "", holiday_name: "" })
    setShowHolidayModal(true)
  }

  const handleEditHoliday = (holiday: Holiday) => {
    setEditingHoliday(holiday)
    setHolidayForm({ holiday_date: holiday.holiday_date, holiday_name: holiday.holiday_name })
    setShowHolidayModal(true)
  }

  const handleSaveHoliday = async () => {
    if (!holidayForm.holiday_date || !holidayForm.holiday_name) {
      setError("Please fill in all holiday fields")
      return
    }

    try {
      setSubmittingHoliday(true)
      setError(null)

      const method = editingHoliday ? "PUT" : "POST"
      const url = editingHoliday
        ? `/api/leave/holidays/${editingHoliday.id}`
        : "/api/leave/holidays"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holiday_date: holidayForm.holiday_date,
          holiday_name: holidayForm.holiday_name,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to save holiday")
      }

      setSuccessMessage(`Holiday ${editingHoliday ? "updated" : "added"} successfully`)
      setShowHolidayModal(false)
      loadAllData()

      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("[v0] Error saving holiday:", err)
      setError(err instanceof Error ? err.message : "Failed to save holiday")
    } finally {
      setSubmittingHoliday(false)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return

    try {
      setError(null)
      const res = await fetch(`/api/leave/holidays/${id}`, { method: "DELETE" })

      if (!res.ok) {
        throw new Error("Failed to delete holiday")
      }

      setSuccessMessage("Holiday deleted successfully")
      loadAllData()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("[v0] Error deleting holiday:", err)
      setError(err instanceof Error ? err.message : "Failed to delete holiday")
    }
  }

  // Leave type handlers
  const handleAddLeaveType = () => {
    setEditingLeaveType(null)
    setLeaveTypeForm({
      leave_type_key: "",
      leave_type_label: "",
      entitlement_days: 0,
      is_active: true,
    })
    setShowLeaveTypeModal(true)
  }

  const handleEditLeaveType = (leaveType: LeaveType) => {
    setEditingLeaveType(leaveType)
    setLeaveTypeForm({
      leave_type_key: leaveType.leave_type_key,
      leave_type_label: leaveType.leave_type_label,
      entitlement_days: leaveType.entitlement_days,
      is_active: leaveType.is_active,
    })
    setShowLeaveTypeModal(true)
  }

  const handleSaveLeaveType = async () => {
    if (!leaveTypeForm.leave_type_label || leaveTypeForm.entitlement_days <= 0) {
      setError("Please fill in all leave type fields with valid values")
      return
    }

    try {
      setSubmittingLeaveType(true)
      setError(null)

      const method = editingLeaveType ? "PUT" : "POST"
      const url = editingLeaveType
        ? `/api/leave/leave-types/${editingLeaveType.id}`
        : "/api/leave/leave-types"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaveTypeForm),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to save leave type")
      }

      setSuccessMessage(`Leave type ${editingLeaveType ? "updated" : "added"} successfully`)
      setShowLeaveTypeModal(false)
      loadAllData()

      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("[v0] Error saving leave type:", err)
      setError(err instanceof Error ? err.message : "Failed to save leave type")
    } finally {
      setSubmittingLeaveType(false)
    }
  }

  const handleDeleteLeaveType = async (id: string) => {
    if (!confirm("Are you sure you want to delete this leave type?")) return

    try {
      setError(null)
      const res = await fetch(`/api/leave/leave-types/${id}`, { method: "DELETE" })

      if (!res.ok) {
        throw new Error("Failed to delete leave type")
      }

      setSuccessMessage("Leave type deleted successfully")
      loadAllData()
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error("[v0] Error deleting leave type:", err)
      setError(err instanceof Error ? err.message : "Failed to delete leave type")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-full mb-4">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-300">Loading HR Leave Admin Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">HR Leave Office Admin</h1>
          <p className="text-slate-400">Manage holidays, leave types, and review staff requests</p>
        </div>

        {/* Alerts */}
        {error && (
          <Alert className="mb-6 border-red-500 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-6 border-green-500 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-400">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="holidays" className="flex items-center gap-2 data-[state=active]:bg-green-600">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Holidays</span>
            </TabsTrigger>
            <TabsTrigger value="memos" className="flex items-center gap-2 data-[state=active]:bg-green-600">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Memos</span>
            </TabsTrigger>
            <TabsTrigger value="deferrments" className="flex items-center gap-2 data-[state=active]:bg-green-600">
              <ArrowRight className="w-4 h-4" />
              <span className="hidden sm:inline">Deferrments</span>
            </TabsTrigger>
            <TabsTrigger value="recalls" className="flex items-center gap-2 data-[state=active]:bg-green-600">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Recalls</span>
            </TabsTrigger>
          </TabsList>

          {/* Holidays Tab */}
          <TabsContent value="holidays" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Public Holidays</CardTitle>
                  <CardDescription>Manage Ghana public holidays</CardDescription>
                </div>
                <Button
                  onClick={handleAddHoliday}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Holiday
                </Button>
              </CardHeader>
              <CardContent>
                {holidays.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No holidays configured yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4 text-slate-300">Date</th>
                          <th className="text-left py-3 px-4 text-slate-300">Holiday Name</th>
                          <th className="text-right py-3 px-4 text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holidays.map((holiday) => (
                          <tr key={holiday.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                            <td className="py-3 px-4 text-slate-200">{holiday.holiday_date}</td>
                            <td className="py-3 px-4 text-slate-200">{holiday.holiday_name}</td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditHoliday(holiday)}
                                className="text-blue-400 hover:bg-blue-400/20"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                className="text-red-400 hover:bg-red-400/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Approved Memos Tab */}
          <TabsContent value="memos" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Approved Leave Memos</CardTitle>
                <CardDescription>Review and manage approved leave memos</CardDescription>
              </CardHeader>
              <CardContent>
                {approvedMemos.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No approved memos available</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {approvedMemos.map((memo) => (
                      <Card key={memo.id} className="bg-slate-700/50 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-slate-400">Employee</p>
                              <p className="text-white font-semibold">{memo.employee_name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Leave Type</p>
                              <p className="text-white">{memo.leave_type}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Period</p>
                              <p className="text-white text-sm">{memo.start_date} to {memo.end_date}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Status</p>
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">
                                {memo.status}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deferrments Tab */}
          <TabsContent value="deferrments" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Leave Deferrments</CardTitle>
                <CardDescription>Manage leave deferrment requests</CardDescription>
              </CardHeader>
              <CardContent>
                {deferrments.length === 0 ? (
                  <div className="text-center py-12">
                    <ArrowRight className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No deferrments pending</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deferrments.map((defer) => (
                      <Card key={defer.id} className="bg-slate-700/50 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-slate-400">Employee</p>
                              <p className="text-white font-semibold">{defer.employee_name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Leave Type</p>
                              <p className="text-white">{defer.leave_type}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Deferral Year</p>
                              <p className="text-white">{defer.deferral_year}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Status</p>
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400">
                                {defer.status}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recalls Tab */}
          <TabsContent value="recalls" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Leave Recalls</CardTitle>
                <CardDescription>Manage leave recall requests</CardDescription>
              </CardHeader>
              <CardContent>
                {recalls.length === 0 ? (
                  <div className="text-center py-12">
                    <ArrowLeft className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No recalls pending</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recalls.map((recall) => (
                      <Card key={recall.id} className="bg-slate-700/50 border-slate-600">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-slate-400">Employee</p>
                              <p className="text-white font-semibold">{recall.employee_name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Leave Type</p>
                              <p className="text-white">{recall.leave_type}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Recall Date</p>
                              <p className="text-white">{recall.recall_date}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Status</p>
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400">
                                {recall.status}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Holiday Modal */}
        {showHolidayModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md bg-slate-800 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-white">
                  {editingHoliday ? "Edit Holiday" : "Add Holiday"}
                </CardTitle>
                <button
                  onClick={() => setShowHolidayModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date (YYYY-MM-DD)</label>
                  <Input
                    type="date"
                    value={holidayForm.holiday_date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Holiday Name</label>
                  <Input
                    value={holidayForm.holiday_name}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holiday_name: e.target.value })}
                    placeholder="e.g., Christmas Day"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowHolidayModal(false)}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveHoliday}
                    disabled={submittingHoliday}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {submittingHoliday ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Leave Type Modal */}
        {showLeaveTypeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md bg-slate-800 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-white">
                  {editingLeaveType ? "Edit Leave Type" : "Add Leave Type"}
                </CardTitle>
                <button
                  onClick={() => setShowLeaveTypeModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Leave Type Key</label>
                  <Input
                    value={leaveTypeForm.leave_type_key}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_key: e.target.value })}
                    placeholder="e.g., annual_leave"
                    disabled={!!editingLeaveType}
                    className="bg-slate-700 border-slate-600 text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Leave Type Label</label>
                  <Input
                    value={leaveTypeForm.leave_type_label}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_label: e.target.value })}
                    placeholder="e.g., Annual Leave"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Entitlement Days</label>
                  <Input
                    type="number"
                    value={leaveTypeForm.entitlement_days}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, entitlement_days: parseInt(e.target.value) })}
                    placeholder="e.g., 21"
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={leaveTypeForm.is_active}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-slate-300">
                    Active
                  </label>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowLeaveTypeModal(false)}
                    className="flex-1 border-slate-600 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveLeaveType}
                    disabled={submittingLeaveType}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {submittingLeaveType ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
