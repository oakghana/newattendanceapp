'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, CheckCircle2, Plus, Edit2, Trash2, Calendar, BookOpen, Users, Loader2 } from 'lucide-react'

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

interface StaffRequest {
  id: string
  employee_id: string
  employee_name: string
  leave_type: string
  start_date: string
  end_date: string
  status: string
  reason?: string
}

export function HRLeaveAdminClient() {
  // Tab state
  const [activeTab, setActiveTab] = useState('holidays')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Holiday states
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [showHolidayDialog, setShowHolidayDialog] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [holidayForm, setHolidayForm] = useState({ holiday_date: '', holiday_name: '' })
  const [savingHoliday, setSavingHoliday] = useState(false)

  // Leave type states
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [showLeaveTypeDialog, setShowLeaveTypeDialog] = useState(false)
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null)
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    leave_type_key: '',
    leave_type_label: '',
    entitlement_days: 0,
    is_active: true,
  })
  const [savingLeaveType, setSavingLeaveType] = useState(false)

  // Staff requests states
  const [staffRequests, setStaffRequests] = useState<StaffRequest[]>([])
  const [approvingRequest, setApprovingRequest] = useState<string | null>(null)

  // Load all data
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[v0] Starting to load all HR admin data...')

      // Load holidays
      console.log('[v0] Fetching holidays...')
      const holidaysRes = await fetch('/api/leave/holidays')
      if (!holidaysRes.ok) throw new Error(`Failed to load holidays: ${holidaysRes.status}`)
      const holidaysData = await holidaysRes.json()
      setHolidays(holidaysData.holidays || [])
      console.log('[v0] Holidays loaded:', holidaysData.holidays?.length)

      // Load leave types
      console.log('[v0] Fetching leave types...')
      const typesRes = await fetch('/api/leave/leave-types')
      if (!typesRes.ok) throw new Error(`Failed to load leave types: ${typesRes.status}`)
      const typesData = await typesRes.json()
      setLeaveTypes(typesData.leaveTypes || [])
      console.log('[v0] Leave types loaded:', typesData.leaveTypes?.length)

      // Load staff requests
      console.log('[v0] Fetching staff requests...')
      const requestsRes = await fetch('/api/leave/requests')
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json()
        setStaffRequests(requestsData.requests || [])
        console.log('[v0] Staff requests loaded:', requestsData.requests?.length)
      } else {
        console.warn('[v0] Could not load staff requests')
        setStaffRequests([])
      }

      console.log('[v0] All data loaded successfully')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data'
      console.error('[v0] Data loading error:', errorMsg)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // ============ HOLIDAY HANDLERS ============
  const handleAddHoliday = () => {
    setEditingHoliday(null)
    setHolidayForm({ holiday_date: '', holiday_name: '' })
    setShowHolidayDialog(true)
  }

  const handleEditHoliday = (holiday: Holiday) => {
    setEditingHoliday(holiday)
    setHolidayForm({ holiday_date: holiday.holiday_date, holiday_name: holiday.holiday_name })
    setShowHolidayDialog(true)
  }

  const handleSaveHoliday = async () => {
    try {
      if (!holidayForm.holiday_date || !holidayForm.holiday_name) {
        setError('Please fill in all holiday fields')
        return
      }

      setSavingHoliday(true)
      setError(null)

      const url = editingHoliday
        ? `/api/leave/holidays/${editingHoliday.id}`
        : '/api/leave/holidays'

      console.log('[v0] Saving holiday:', { editingHoliday, form: holidayForm })

      const res = await fetch(url, {
        method: editingHoliday ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayForm),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save holiday')
      }

      setSuccess(`Holiday ${editingHoliday ? 'updated' : 'created'} successfully`)
      setShowHolidayDialog(false)
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error saving holiday'
      console.error('[v0] Holiday save error:', errorMsg)
      setError(errorMsg)
    } finally {
      setSavingHoliday(false)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Delete this holiday?')) return

    try {
      console.log('[v0] Deleting holiday:', id)
      const res = await fetch(`/api/leave/holidays/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete holiday')
      }

      setSuccess('Holiday deleted successfully')
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error deleting holiday'
      console.error('[v0] Holiday delete error:', errorMsg)
      setError(errorMsg)
    }
  }

  // ============ LEAVE TYPE HANDLERS ============
  const handleAddLeaveType = () => {
    setEditingLeaveType(null)
    setLeaveTypeForm({
      leave_type_key: '',
      leave_type_label: '',
      entitlement_days: 0,
      is_active: true,
    })
    setShowLeaveTypeDialog(true)
  }

  const handleEditLeaveType = (leaveType: LeaveType) => {
    setEditingLeaveType(leaveType)
    setLeaveTypeForm({
      leave_type_key: leaveType.leave_type_key,
      leave_type_label: leaveType.leave_type_label,
      entitlement_days: leaveType.entitlement_days,
      is_active: leaveType.is_active,
    })
    setShowLeaveTypeDialog(true)
  }

  const handleSaveLeaveType = async () => {
    try {
      if (!leaveTypeForm.leave_type_key || !leaveTypeForm.leave_type_label || leaveTypeForm.entitlement_days < 0) {
        setError('Please fill in all fields with valid values')
        return
      }

      setSavingLeaveType(true)
      setError(null)

      const url = editingLeaveType
        ? `/api/leave/leave-types/${editingLeaveType.id}`
        : '/api/leave/leave-types'

      console.log('[v0] Saving leave type:', { editingLeaveType, form: leaveTypeForm })

      const res = await fetch(url, {
        method: editingLeaveType ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveTypeForm),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save leave type')
      }

      setSuccess(`Leave type ${editingLeaveType ? 'updated' : 'created'} successfully`)
      setShowLeaveTypeDialog(false)
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error saving leave type'
      console.error('[v0] Leave type save error:', errorMsg)
      setError(errorMsg)
    } finally {
      setSavingLeaveType(false)
    }
  }

  const handleDeleteLeaveType = async (id: string) => {
    if (!confirm('Delete this leave type?')) return

    try {
      console.log('[v0] Deleting leave type:', id)
      const res = await fetch(`/api/leave/leave-types/${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete leave type')
      }

      setSuccess('Leave type deleted successfully')
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error deleting leave type'
      console.error('[v0] Leave type delete error:', errorMsg)
      setError(errorMsg)
    }
  }

  // ============ STAFF REQUEST HANDLERS ============
  const handleApproveRequest = async (id: string) => {
    try {
      setApprovingRequest(id)
      console.log('[v0] Approving request:', id)

      const res = await fetch(`/api/leave/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to approve request')
      }

      setSuccess('Request approved successfully')
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error approving request'
      console.error('[v0] Approve error:', errorMsg)
      setError(errorMsg)
    } finally {
      setApprovingRequest(null)
    }
  }

  const handleRejectRequest = async (id: string) => {
    try {
      setApprovingRequest(id)
      console.log('[v0] Rejecting request:', id)

      const res = await fetch(`/api/leave/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reject request')
      }

      setSuccess('Request rejected successfully')
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error rejecting request'
      console.error('[v0] Reject error:', errorMsg)
      setError(errorMsg)
    } finally {
      setApprovingRequest(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-green-500 mx-auto" />
          <p className="text-slate-400">Loading HR Leave Admin...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">HR Leave Office Admin</h1>
          <p className="text-slate-400">Manage holidays, leave types, and review staff requests</p>
        </div>

        {/* Alerts */}
        {error && (
          <Alert className="bg-red-500/10 border-red-500">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-500/10 border-green-500">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-400">{success}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 bg-slate-800">
            <TabsTrigger value="holidays" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Holidays
            </TabsTrigger>
            <TabsTrigger value="leave-types" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Leave Types
            </TabsTrigger>
            <TabsTrigger value="staff-requests" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Staff Requests
            </TabsTrigger>
          </TabsList>

          {/* HOLIDAYS TAB */}
          <TabsContent value="holidays" className="mt-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Public Holidays</CardTitle>
                  <CardDescription>Manage Ghana public holidays</CardDescription>
                </div>
                <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={handleAddHoliday} className="bg-green-600 hover:bg-green-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Holiday
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">
                        {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
                      </DialogTitle>
                      <DialogDescription>
                        {editingHoliday ? 'Update holiday details' : 'Add a new public holiday'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-slate-300">Date (YYYY-MM-DD)</Label>
                        <Input
                          type="date"
                          value={holidayForm.holiday_date}
                          onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Holiday Name</Label>
                        <Input
                          value={holidayForm.holiday_name}
                          onChange={(e) => setHolidayForm({ ...holidayForm, holiday_name: e.target.value })}
                          placeholder="e.g., Christmas Day"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button
                          onClick={handleSaveHoliday}
                          disabled={savingHoliday}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {savingHoliday ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          onClick={() => setShowHolidayDialog(false)}
                          variant="outline"
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {holidays.length === 0 ? (
                  <p className="text-slate-400 py-8 text-center">No holidays configured</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4 text-slate-300">Date</th>
                          <th className="text-left py-3 px-4 text-slate-300">Name</th>
                          <th className="text-right py-3 px-4 text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holidays.map((holiday) => (
                          <tr key={holiday.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                            <td className="py-3 px-4 text-slate-200">{holiday.holiday_date}</td>
                            <td className="py-3 px-4 text-slate-200">{holiday.holiday_name}</td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditHoliday(holiday)}
                                className="text-blue-400 hover:bg-blue-900/20"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                className="text-red-400 hover:bg-red-900/20"
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

          {/* LEAVE TYPES TAB */}
          <TabsContent value="leave-types" className="mt-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">Leave Types</CardTitle>
                  <CardDescription>Manage leave type configurations</CardDescription>
                </div>
                <Dialog open={showLeaveTypeDialog} onOpenChange={setShowLeaveTypeDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={handleAddLeaveType} className="bg-green-600 hover:bg-green-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Leave Type
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-800 border-slate-700">
                    <DialogHeader>
                      <DialogTitle className="text-white">
                        {editingLeaveType ? 'Edit Leave Type' : 'Add Leave Type'}
                      </DialogTitle>
                      <DialogDescription>
                        {editingLeaveType ? 'Update leave type configuration' : 'Create a new leave type'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-slate-300">Type Key</Label>
                        <Input
                          value={leaveTypeForm.leave_type_key}
                          onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_key: e.target.value })}
                          placeholder="e.g., annual"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Type Label</Label>
                        <Input
                          value={leaveTypeForm.leave_type_label}
                          onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, leave_type_label: e.target.value })}
                          placeholder="e.g., Annual Leave"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Entitlement Days</Label>
                        <Input
                          type="number"
                          value={leaveTypeForm.entitlement_days}
                          onChange={(e) =>
                            setLeaveTypeForm({
                              ...leaveTypeForm,
                              entitlement_days: parseInt(e.target.value) || 0,
                            })
                          }
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={leaveTypeForm.is_active}
                          onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, is_active: e.target.checked })}
                          className="rounded"
                        />
                        <Label className="text-slate-300">Active</Label>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button
                          onClick={handleSaveLeaveType}
                          disabled={savingLeaveType}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {savingLeaveType ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          onClick={() => setShowLeaveTypeDialog(false)}
                          variant="outline"
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {leaveTypes.length === 0 ? (
                  <p className="text-slate-400 py-8 text-center">No leave types configured</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-3 px-4 text-slate-300">Key</th>
                          <th className="text-left py-3 px-4 text-slate-300">Label</th>
                          <th className="text-left py-3 px-4 text-slate-300">Days</th>
                          <th className="text-left py-3 px-4 text-slate-300">Status</th>
                          <th className="text-right py-3 px-4 text-slate-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveTypes.map((lt) => (
                          <tr key={lt.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                            <td className="py-3 px-4 text-slate-200">{lt.leave_type_key}</td>
                            <td className="py-3 px-4 text-slate-200">{lt.leave_type_label}</td>
                            <td className="py-3 px-4 text-slate-200">{lt.entitlement_days}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${
                                  lt.is_active
                                    ? 'bg-green-900/30 text-green-400'
                                    : 'bg-red-900/30 text-red-400'
                                }`}
                              >
                                {lt.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditLeaveType(lt)}
                                className="text-blue-400 hover:bg-blue-900/20"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteLeaveType(lt.id)}
                                className="text-red-400 hover:bg-red-900/20"
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

          {/* STAFF REQUESTS TAB */}
          <TabsContent value="staff-requests" className="mt-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Staff Leave Requests</CardTitle>
                <CardDescription>Review and approve/reject staff leave requests</CardDescription>
              </CardHeader>
              <CardContent>
                {staffRequests.length === 0 ? (
                  <p className="text-slate-400 py-8 text-center">No staff requests</p>
                ) : (
                  <div className="space-y-4">
                    {staffRequests.map((req) => (
                      <Card key={req.id} className="bg-slate-700/50 border-slate-600">
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <p className="text-sm text-slate-400">Employee</p>
                              <p className="text-white font-semibold">{req.employee_name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Leave Type</p>
                              <p className="text-white">{req.leave_type}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Period</p>
                              <p className="text-white text-sm">
                                {req.start_date} to {req.end_date}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Status</p>
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                  req.status === 'approved'
                                    ? 'bg-green-900/30 text-green-400'
                                    : req.status === 'rejected'
                                    ? 'bg-red-900/30 text-red-400'
                                    : 'bg-yellow-900/30 text-yellow-400'
                                }`}
                              >
                                {req.status}
                              </span>
                            </div>
                          </div>
                          {req.reason && (
                            <div className="mb-4">
                              <p className="text-sm text-slate-400">Reason</p>
                              <p className="text-slate-300">{req.reason}</p>
                            </div>
                          )}
                          {req.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleApproveRequest(req.id)}
                                disabled={approvingRequest === req.id}
                                className="bg-green-600 hover:bg-green-700"
                                size="sm"
                              >
                                {approvingRequest === req.id ? 'Processing...' : 'Approve'}
                              </Button>
                              <Button
                                onClick={() => handleRejectRequest(req.id)}
                                disabled={approvingRequest === req.id}
                                variant="destructive"
                                size="sm"
                              >
                                {approvingRequest === req.id ? 'Processing...' : 'Reject'}
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
