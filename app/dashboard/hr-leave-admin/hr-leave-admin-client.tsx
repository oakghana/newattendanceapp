"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Plus, Edit2, Trash2, X } from "lucide-react"

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

interface HRLeaveAdminClientProps {
  profile: { id: string; role: string }
}

export function HRLeaveAdminClient({ profile }: HRLeaveAdminClientProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [holidayForm, setHolidayForm] = useState({ holiday_date: "", holiday_name: "" })
  
  const [showLeaveTypeModal, setShowLeaveTypeModal] = useState(false)
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null)
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    leave_type_key: "",
    leave_type_label: "",
    entitlement_days: 0,
    is_active: true,
  })

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [holidaysRes, leaveTypesRes] = await Promise.all([
          fetch("/api/leave/holidays"),
          fetch("/api/leave/leave-types"),
        ])

        if (holidaysRes.ok) {
          const data = await holidaysRes.json()
          setHolidays(data.holidays || [])
        }

        if (leaveTypesRes.ok) {
          const data = await leaveTypesRes.json()
          setLeaveTypes(data.leaveTypes || [])
        }
      } catch (err) {
        setError("Failed to load data")
        console.error("[v0] Error loading HR admin data:", err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
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
    try {
      if (!holidayForm.holiday_date || !holidayForm.holiday_name) {
        setError("Please fill in all fields")
        return
      }

      const method = editingHoliday ? "PUT" : "POST"
      const url = editingHoliday ? `/api/leave/holidays/${editingHoliday.id}` : "/api/leave/holidays"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holiday_date: holidayForm.holiday_date,
          holiday_name: holidayForm.holiday_name,
        }),
      })

      if (!response.ok) throw new Error("Failed to save holiday")

      const data = await response.json()
      if (editingHoliday) {
        setHolidays(holidays.map((h) => (h.id === editingHoliday.id ? data.holiday : h)))
      } else {
        setHolidays([...holidays, data.holiday])
      }

      setShowHolidayModal(false)
      setError(null)
    } catch (err) {
      setError("Failed to save holiday")
      console.error("[v0] Error saving holiday:", err)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm("Delete this holiday?")) return

    try {
      const response = await fetch(`/api/leave/holidays/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete holiday")
      setHolidays(holidays.filter((h) => h.id !== id))
    } catch (err) {
      setError("Failed to delete holiday")
      console.error("[v0] Error deleting holiday:", err)
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
    try {
      if (!leaveTypeForm.leave_type_key || !leaveTypeForm.leave_type_label) {
        setError("Please fill in all required fields")
        return
      }

      const method = editingLeaveType ? "PUT" : "POST"
      const url = editingLeaveType ? `/api/leave/leave-types/${editingLeaveType.id}` : "/api/leave/leave-types"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaveTypeForm),
      })

      if (!response.ok) throw new Error("Failed to save leave type")

      const data = await response.json()
      if (editingLeaveType) {
        setLeaveTypes(leaveTypes.map((lt) => (lt.id === editingLeaveType.id ? data.leaveType : lt)))
      } else {
        setLeaveTypes([...leaveTypes, data.leaveType])
      }

      setShowLeaveTypeModal(false)
      setError(null)
    } catch (err) {
      setError("Failed to save leave type")
      console.error("[v0] Error saving leave type:", err)
    }
  }

  const handleDeleteLeaveType = async (id: string) => {
    if (!confirm("Delete this leave type?")) return

    try {
      const response = await fetch(`/api/leave/leave-types/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete leave type")
      setLeaveTypes(leaveTypes.filter((lt) => lt.id !== id))
    } catch (err) {
      setError("Failed to delete leave type")
      console.error("[v0] Error deleting leave type:", err)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">HR Leave Office Admin</h1>
          <p className="text-slate-600 dark:text-slate-400">Manage holidays, leave types, and leave configurations</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg">
            {error}
          </div>
        )}

        <Tabs defaultValue="holidays" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="holidays">Public Holidays</TabsTrigger>
            <TabsTrigger value="leave-types">Leave Types</TabsTrigger>
          </TabsList>

          {/* Holidays Tab */}
          <TabsContent value="holidays">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Public Holidays</CardTitle>
                    <CardDescription>Manage Ghana public holidays</CardDescription>
                  </div>
                  <Button onClick={handleAddHoliday} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Holiday
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {holidays.length === 0 ? (
                    <p className="text-slate-500">No holidays configured</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">Date</th>
                            <th className="text-left py-2 px-4">Holiday Name</th>
                            <th className="text-right py-2 px-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holidays.map((holiday) => (
                            <tr key={holiday.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                              <td className="py-2 px-4">{holiday.holiday_date}</td>
                              <td className="py-2 px-4">{holiday.holiday_name}</td>
                              <td className="py-2 px-4 text-right">
                                <button
                                  onClick={() => handleEditHoliday(holiday)}
                                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mr-4"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteHoliday(holiday.id)}
                                  className="inline-flex items-center gap-2 text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Types Tab */}
          <TabsContent value="leave-types">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Leave Types</CardTitle>
                    <CardDescription>Manage leave types and entitlements</CardDescription>
                  </div>
                  <Button onClick={handleAddLeaveType} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Leave Type
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {leaveTypes.length === 0 ? (
                    <p className="text-slate-500">No leave types configured</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4">Key</th>
                            <th className="text-left py-2 px-4">Label</th>
                            <th className="text-center py-2 px-4">Days</th>
                            <th className="text-center py-2 px-4">Status</th>
                            <th className="text-right py-2 px-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaveTypes.map((lt) => (
                            <tr key={lt.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                              <td className="py-2 px-4">{lt.leave_type_key}</td>
                              <td className="py-2 px-4">{lt.leave_type_label}</td>
                              <td className="py-2 px-4 text-center">{lt.entitlement_days}</td>
                              <td className="py-2 px-4 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  lt.is_active 
                                    ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200" 
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                }`}>
                                  {lt.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right">
                                <button
                                  onClick={() => handleEditLeaveType(lt)}
                                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mr-4"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteLeaveType(lt.id)}
                                  className="inline-flex items-center gap-2 text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingHoliday ? "Edit Holiday" : "Add Holiday"}</CardTitle>
              <button onClick={() => setShowHolidayModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Holiday Date (YYYY-MM-DD)</label>
                <Input
                  type="date"
                  value={holidayForm.holiday_date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Holiday Name</label>
                <Input
                  value={holidayForm.holiday_name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_name: e.target.value })}
                  placeholder="e.g., Independence Day"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowHolidayModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSaveHoliday} className="flex-1">
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Leave Type Modal */}
      {showLeaveTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingLeaveType ? "Edit Leave Type" : "Add Leave Type"}</CardTitle>
              <button onClick={() => setShowLeaveTypeModal(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type Key</label>
                <Input
                  value={leaveTypeForm.leave_type_key}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_key: e.target.value })}
                  placeholder="e.g., annual_leave"
                  disabled={!!editingLeaveType}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type Label</label>
                <Input
                  value={leaveTypeForm.leave_type_label}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_label: e.target.value })}
                  placeholder="e.g., Annual Leave"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Entitlement Days</label>
                <Input
                  type="number"
                  value={leaveTypeForm.entitlement_days}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, entitlement_days: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 21"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={leaveTypeForm.is_active}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_active" className="text-sm font-medium">
                  Active
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowLeaveTypeModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSaveLeaveType} className="flex-1">
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
