'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Plus, Edit2, Trash2, Calendar, Search, ChevronUp, ChevronDown, Gift, Users, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

// Types
interface Holiday {
  id: string
  holiday_date: string
  holiday_name: string
}

interface Recall {
  id: string
  employee_id: string
  employee_name: string
  leave_type: string
  recall_date: string
  status: string
  department?: string
}

interface Deferment {
  id: string
  employee_id: string
  employee_name: string
  leave_type: string
  deferral_year: string
  status: string
  department?: string
}

interface OutstandingLeave {
  id: string
  user_id: string
  staff_name: string
  employee_id: string
  department_name: string
  leave_year_period: string
  opening_balance: number
  entitlement_days: number
  used_this_period: number
  carryover_to_next_year: number
  max_carryover_allowed: number
  notes: string | null
}

type SortField = 'name' | 'date' | 'type' | 'status'
type SortOrder = 'asc' | 'desc'

export default function HRLeaveAdminClient({ profile }: { profile?: { id: string; role: string } }) {
  // Shared states
  const [activeTab, setActiveTab] = useState('holidays')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [componentError, setComponentError] = useState<string | null>(null)

  // Holidays states
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [holidayForm, setHolidayForm] = useState({ holiday_date: '', holiday_name: '' })
  const [submittingHoliday, setSubmittingHoliday] = useState(false)

  // Recalls states
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [recallsPage, setRecallsPage] = useState(1)
  const [recallsSearch, setRecallsSearch] = useState('')
  const [recallsSort, setRecallsSort] = useState<{ field: SortField; order: SortOrder }>({ field: 'name', order: 'asc' })
  const itemsPerPage = 10

  // Deferments states
  const [deferments, setDeferments] = useState<Deferment[]>([])
  const [deferPage, setDeferPage] = useState(1)
  const [deferSearch, setDeferSearch] = useState('')
  const [deferSort, setDeferSort] = useState<{ field: SortField; order: SortOrder }>({ field: 'name', order: 'asc' })

  // Outstanding Leave states
  const [outstandingLeave, setOutstandingLeave] = useState<OutstandingLeave[]>([])
  const [outstandingPage, setOutstandingPage] = useState(1)
  const [outstandingSearch, setOutstandingSearch] = useState('')
  const [outstandingYearFilter, setOutstandingYearFilter] = useState('2025/2026')
  const [loadingOutstanding, setLoadingOutstanding] = useState(false)

  // Load all data on mount
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('[v0] Loading HR Leave Admin data...')

      // Load holidays
      const holidaysRes = await fetch('/api/leave/holidays')
      if (holidaysRes.ok) {
        const data = await holidaysRes.json()
        setHolidays(data.holidays || [])
        console.log('[v0] Holidays loaded:', data.holidays?.length)
      } else {
        console.warn('[v0] Failed to load holidays:', holidaysRes.status)
      }

      // Load outstanding leave balances
      const outstandingRes = await fetch('/api/leave/hr-admin/outstanding')
      if (outstandingRes.ok) {
        const data = await outstandingRes.json()
        setOutstandingLeave(data.data || [])
        console.log('[v0] Outstanding leave loaded:', data.data?.length)
      } else {
        console.warn('[v0] Failed to load outstanding leave:', outstandingRes.status)
      }

      // Load recalls
      const recallsRes = await fetch('/api/leave/hr-admin/recalls')
      if (recallsRes.ok) {
        const data = await recallsRes.json()
        setRecalls(Array.isArray(data) ? data : data.recalls || [])
        console.log('[v0] Recalls loaded:', (Array.isArray(data) ? data : data.recalls)?.length)
      } else {
        console.warn('[v0] Failed to load recalls:', recallsRes.status)
      }

      // Load deferments
      const deferRes = await fetch('/api/leave/hr-admin/deferrments')
      if (deferRes.ok) {
        const data = await deferRes.json()
        setDeferments(Array.isArray(data) ? data : data.deferrments || [])
        console.log('[v0] Deferments loaded:', (Array.isArray(data) ? data : data.deferrments)?.length)
      } else {
        console.warn('[v0] Failed to load deferments:', deferRes.status)
      }

      setLoading(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load data'
      console.error('[v0] Load error:', msg)
      setError(msg)
      setLoading(false)
    }
  }

  // ============ HOLIDAYS HANDLERS ============
  const handleAddHoliday = () => {
    setEditingHoliday(null)
    setHolidayForm({ holiday_date: '', holiday_name: '' })
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
        setError('Please fill in all fields')
        return
      }

      setSubmittingHoliday(true)
      console.log('[v0] Saving holiday:', editingHoliday?.id ? 'Update' : 'Create')

      if (editingHoliday) {
        // Update
        const res = await fetch(`/api/leave/holidays/${editingHoliday.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(holidayForm),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to update holiday')
        }
      } else {
        // Create
        const res = await fetch('/api/leave/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(holidayForm),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to add holiday')
        }
      }

      setSuccess('Holiday saved successfully')
      setShowHolidayModal(false)
      await loadAllData()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving holiday'
      console.error('[v0] Save error:', msg)
      setError(msg)
    } finally {
      setSubmittingHoliday(false)
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
      const msg = err instanceof Error ? err.message : 'Error deleting holiday'
      console.error('[v0] Delete error:', msg)
      setError(msg)
    }
  }

  // ============ RECALLS HANDLERS ============
  const filterAndSortRecalls = () => {
    try {
      let filtered = (recalls || []).filter((r) => {
        if (!r) return false
        const name = String(r.employee_name || '').toLowerCase()
        const type = String(r.leave_type || '').toLowerCase()
        const dept = String(r.department || '').toLowerCase()
        const searchTerm = recallsSearch.toLowerCase()
        return name.includes(searchTerm) || type.includes(searchTerm) || dept.includes(searchTerm)
      })

      filtered.sort((a, b) => {
        if (!a || !b) return 0
        let aVal, bVal

        if (recallsSort.field === 'name') {
          aVal = a.employee_name || ''
          bVal = b.employee_name || ''
        } else if (recallsSort.field === 'type') {
          aVal = a.leave_type || ''
          bVal = b.leave_type || ''
        } else if (recallsSort.field === 'date') {
          aVal = a.recall_date || ''
          bVal = b.recall_date || ''
        } else {
          aVal = a.status || ''
          bVal = b.status || ''
        }

        return recallsSort.order === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
      })

      return filtered
    } catch (err) {
      console.error('[v0] Error filtering recalls:', err)
      return recalls || []
    }
  }

  const handleRecallsSort = (field: SortField) => {
    setRecallsSort({
      field,
      order: recallsSort.field === field && recallsSort.order === 'asc' ? 'desc' : 'asc',
    })
  }

  const filteredRecalls = filterAndSortRecalls()
  const recallsTotal = Math.max(1, Math.ceil((filteredRecalls?.length || 0) / itemsPerPage))
  const recallsPaginated = (filteredRecalls || []).slice((recallsPage - 1) * itemsPerPage, recallsPage * itemsPerPage)

  // ============ DEFERMENTS HANDLERS ============
  const filterAndSortDeferments = () => {
    try {
      let filtered = (deferments || []).filter((d) => {
        if (!d) return false
        const name = String(d.employee_name || '').toLowerCase()
        const type = String(d.leave_type || '').toLowerCase()
        const dept = String(d.department || '').toLowerCase()
        const searchTerm = deferSearch.toLowerCase()
        return name.includes(searchTerm) || type.includes(searchTerm) || dept.includes(searchTerm)
      })

      filtered.sort((a, b) => {
        if (!a || !b) return 0
        let aVal, bVal

        if (deferSort.field === 'name') {
          aVal = a.employee_name || ''
          bVal = b.employee_name || ''
        } else if (deferSort.field === 'type') {
          aVal = a.leave_type || ''
          bVal = b.leave_type || ''
        } else if (deferSort.field === 'date') {
          aVal = a.deferral_year || ''
          bVal = b.deferral_year || ''
        } else {
          aVal = a.status || ''
          bVal = b.status || ''
        }

        return deferSort.order === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
      })

      return filtered
    } catch (err) {
      console.error('[v0] Error filtering deferments:', err)
      return deferments || []
    }
  }

  const handleDefermentSort = (field: SortField) => {
    setDeferSort({
      field,
      order: deferSort.field === field && deferSort.order === 'asc' ? 'desc' : 'asc',
    })
  }

  const filteredDeferments = filterAndSortDeferments()
  const deferTotal = Math.max(1, Math.ceil((filteredDeferments?.length || 0) / itemsPerPage))
  const defermentsPaginated = (filteredDeferments || []).slice((deferPage - 1) * itemsPerPage, deferPage * itemsPerPage)

  // ============ OUTSTANDING LEAVE HANDLERS ============
  const filterOutstandingLeave = () => {
    try {
      let filtered = (outstandingLeave || []).filter((o) => {
        if (!o) return false
        // Filter by year
        if (outstandingYearFilter && o.leave_year_period !== outstandingYearFilter) return false
        // Search filter
        const name = String(o.staff_name || '').toLowerCase()
        const empId = String(o.employee_id || '').toLowerCase()
        const dept = String(o.department_name || '').toLowerCase()
        const searchTerm = outstandingSearch.toLowerCase()
        return name.includes(searchTerm) || empId.includes(searchTerm) || dept.includes(searchTerm)
      })
      return filtered
    } catch (err) {
      console.error('[v0] Error filtering outstanding leave:', err)
      return outstandingLeave || []
    }
  }

  const filteredOutstanding = filterOutstandingLeave()
  const outstandingTotal = Math.max(1, Math.ceil((filteredOutstanding?.length || 0) / itemsPerPage))
  const outstandingPaginated = (filteredOutstanding || []).slice((outstandingPage - 1) * itemsPerPage, outstandingPage * itemsPerPage)

  // Calculate summary stats
  const outstandingSummary = {
    totalStaff: filteredOutstanding.length,
    totalUnused: filteredOutstanding.reduce((sum, o) => sum + Math.max(0, o.entitlement_days - o.used_this_period), 0),
    totalCarryover: filteredOutstanding.reduce((sum, o) => sum + (o.carryover_to_next_year || 0), 0),
    avgUtilization: filteredOutstanding.length > 0 
      ? Math.round(filteredOutstanding.reduce((sum, o) => sum + (o.used_this_period / Math.max(1, o.entitlement_days)) * 100, 0) / filteredOutstanding.length)
      : 0,
  }

  // ============ RENDER ============
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-400">Loading data...</p>
      </div>
    )
  }

  if (componentError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">HR Leave Office Admin</h1>
          <p className="text-slate-400">Manage holidays, recalls, and deferments</p>
        </div>
        <Card className="bg-red-900/20 border-red-700">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200 font-semibold mb-2">Component Error</p>
              <p className="text-red-200 text-sm">{componentError}</p>
              <Button variant="ghost" size="sm" onClick={() => {
                setComponentError(null)
                location.reload()
              }} className="mt-3 text-red-400 hover:text-red-300">
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  try {
  // Render component
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">HR Leave Office Admin</h1>
        <p className="text-slate-400">Manage holidays, outstanding leave, recalls, and deferments</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <Card className="bg-red-900/20 border-red-700">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)} className="mt-2">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="bg-green-900/20 border-green-700">
          <CardContent className="pt-6 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-green-200">{success}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-slate-800">
          <TabsTrigger value="holidays" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Holidays
          </TabsTrigger>
          <TabsTrigger value="outstanding" className="flex items-center gap-2">
            <Gift className="w-4 h-4" />
            Outstanding
          </TabsTrigger>
          <TabsTrigger value="recalls" className="flex items-center gap-2">
            Recalls
          </TabsTrigger>
          <TabsTrigger value="deferments" className="flex items-center gap-2">
            Deferments
          </TabsTrigger>
        </TabsList>

        {/* HOLIDAYS TAB */}
        <TabsContent value="holidays" className="mt-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-white">Public Holidays</CardTitle>
                  <CardDescription>Manage Ghana public holidays</CardDescription>
                </div>
                <Button onClick={handleAddHoliday} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Holiday
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {holidays.length === 0 ? (
                <p className="text-slate-400 py-8 text-center">No holidays configured</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Date</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Name</th>
                        <th className="text-right py-3 px-4 text-slate-300 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holidays.map((holiday) => (
                        <tr key={holiday.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white">{holiday.holiday_date}</td>
                          <td className="py-3 px-4 text-white">{holiday.holiday_name}</td>
                          <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditHoliday(holiday)}
                              className="text-blue-400 hover:text-blue-300"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteHoliday(holiday.id)}
                              className="text-red-400 hover:text-red-300"
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

        {/* OUTSTANDING LEAVE TAB */}
        <TabsContent value="outstanding" className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-blue-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{outstandingSummary.totalStaff}</p>
                    <p className="text-xs text-blue-300">Staff with Balances</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-amber-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{outstandingSummary.totalUnused}</p>
                    <p className="text-xs text-amber-300">Total Unused Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Gift className="w-8 h-8 text-green-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{outstandingSummary.totalCarryover}</p>
                    <p className="text-xs text-green-300">Total Carryover Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-purple-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{outstandingSummary.avgUtilization}%</p>
                    <p className="text-xs text-purple-300">Avg Utilization</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Table Card */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Gift className="w-5 h-5 text-green-400" />
                    Outstanding Leave Days
                  </CardTitle>
                  <CardDescription>Track unused Annual Leave and carryover balances</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={outstandingYearFilter}
                    onChange={(e) => {
                      setOutstandingYearFilter(e.target.value)
                      setOutstandingPage(1)
                    }}
                    className="px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white text-sm"
                  >
                    <option value="2024/2025">2024/2025</option>
                    <option value="2025/2026">2025/2026</option>
                    <option value="2026/2027">2026/2027</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, employee ID, or department..."
                  value={outstandingSearch}
                  onChange={(e) => {
                    setOutstandingSearch(e.target.value)
                    setOutstandingPage(1)
                  }}
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                />
              </div>

              {/* Table */}
              {outstandingPaginated.length === 0 ? (
                <div className="py-12 text-center">
                  <Gift className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-400">No outstanding leave records found</p>
                  <p className="text-slate-500 text-sm mt-1">Records will appear here when staff have unused leave balances</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Employee</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Department</th>
                        <th className="text-center py-3 px-4 text-slate-300 font-semibold">Entitlement</th>
                        <th className="text-center py-3 px-4 text-slate-300 font-semibold">Used</th>
                        <th className="text-center py-3 px-4 text-slate-300 font-semibold">Remaining</th>
                        <th className="text-center py-3 px-4 text-slate-300 font-semibold">Carryover</th>
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outstandingPaginated.map((record) => {
                        const remaining = Math.max(0, record.entitlement_days - record.used_this_period)
                        const utilizationPct = Math.round((record.used_this_period / Math.max(1, record.entitlement_days)) * 100)
                        return (
                          <tr key={record.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                            <td className="py-3 px-4">
                              <p className="text-white font-medium">{record.staff_name}</p>
                              <p className="text-slate-400 text-xs">{record.employee_id}</p>
                            </td>
                            <td className="py-3 px-4 text-slate-300">{record.department_name}</td>
                            <td className="py-3 px-4 text-center text-white font-semibold">{record.entitlement_days}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-white">{record.used_this_period}</span>
                              <span className="text-slate-400 text-xs ml-1">({utilizationPct}%)</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`font-semibold ${remaining > 10 ? 'text-green-400' : remaining > 5 ? 'text-amber-400' : 'text-red-400'}`}>
                                {remaining}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {record.carryover_to_next_year > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-900/30 text-green-400 text-xs font-medium">
                                  <Gift className="w-3 h-3" />
                                  {record.carryover_to_next_year} / {record.max_carryover_allowed}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-sm max-w-[200px] truncate">
                              {record.notes || '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {outstandingTotal > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-slate-400 text-sm">
                    Showing {(outstandingPage - 1) * itemsPerPage + 1} - {Math.min(outstandingPage * itemsPerPage, filteredOutstanding.length)} of {filteredOutstanding.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOutstandingPage(p => Math.max(1, p - 1))}
                      disabled={outstandingPage === 1}
                      className="border-slate-600 text-slate-300"
                    >
                      Previous
                    </Button>
                    <span className="text-slate-400 text-sm">
                      Page {outstandingPage} of {outstandingTotal}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOutstandingPage(p => Math.min(outstandingTotal, p + 1))}
                      disabled={outstandingPage === outstandingTotal}
                      className="border-slate-600 text-slate-300"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {/* Info Notice */}
              <div className="mt-4 p-4 rounded-lg bg-blue-900/20 border border-blue-800">
                <h4 className="text-blue-300 font-medium mb-2">About Leave Carryover</h4>
                <ul className="text-blue-200 text-sm space-y-1">
                  <li>Unused annual leave from the previous year can be carried over (max {filteredOutstanding[0]?.max_carryover_allowed || 5} days by policy)</li>
                  <li>Carryover days must be used within the first quarter of the new leave year</li>
                  <li>Staff should plan ahead to avoid losing unused leave days</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECALLS TAB */}
        <TabsContent value="recalls" className="mt-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Leave Recalls</CardTitle>
              <CardDescription>Manage leave recall requests across the country</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by employee, leave type, or department..."
                  value={recallsSearch}
                  onChange={(e) => {
                    setRecallsSearch(e.target.value)
                    setRecallsPage(1)
                  }}
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                />
              </div>

              {/* Table */}
              {recallsPaginated.length === 0 ? (
                <p className="text-slate-400 py-8 text-center">No recalls found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleRecallsSort('name')}
                        >
                          <div className="flex items-center gap-2">
                            Employee
                            {recallsSort.field === 'name' && (
                              recallsSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleRecallsSort('type')}
                        >
                          <div className="flex items-center gap-2">
                            Leave Type
                            {recallsSort.field === 'type' && (
                              recallsSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Department</th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleRecallsSort('date')}
                        >
                          <div className="flex items-center gap-2">
                            Recall Date
                            {recallsSort.field === 'date' && (
                              recallsSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleRecallsSort('status')}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {recallsSort.field === 'status' && (
                              recallsSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recallsPaginated.map((recall) => (
                        <tr key={recall.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white">{recall.employee_name}</td>
                          <td className="py-3 px-4 text-white">{recall.leave_type}</td>
                          <td className="py-3 px-4 text-slate-300">{recall.department || 'N/A'}</td>
                          <td className="py-3 px-4 text-white">{recall.recall_date}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                recall.status === 'approved'
                                  ? 'bg-green-900/30 text-green-400'
                                  : recall.status === 'rejected'
                                  ? 'bg-red-900/30 text-red-400'
                                  : 'bg-yellow-900/30 text-yellow-400'
                              }`}
                            >
                              {recall.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {recallsTotal > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-400">
                    Page {recallsPage} of {recallsTotal} ({filteredRecalls.length} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecallsPage(Math.max(1, recallsPage - 1))}
                      disabled={recallsPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecallsPage(Math.min(recallsTotal, recallsPage + 1))}
                      disabled={recallsPage === recallsTotal}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEFERMENTS TAB */}
        <TabsContent value="deferments" className="mt-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Leave Deferments</CardTitle>
              <CardDescription>Manage leave deferment requests across the country</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by employee, leave type, or department..."
                  value={deferSearch}
                  onChange={(e) => {
                    setDeferSearch(e.target.value)
                    setDeferPage(1)
                  }}
                  className="pl-10 bg-slate-700 border-slate-600 text-white"
                />
              </div>

              {/* Table */}
              {defermentsPaginated.length === 0 ? (
                <p className="text-slate-400 py-8 text-center">No deferments found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleDefermentSort('name')}
                        >
                          <div className="flex items-center gap-2">
                            Employee
                            {deferSort.field === 'name' && (
                              deferSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleDefermentSort('type')}
                        >
                          <div className="flex items-center gap-2">
                            Leave Type
                            {deferSort.field === 'type' && (
                              deferSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th className="text-left py-3 px-4 text-slate-300 font-semibold">Department</th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleDefermentSort('date')}
                        >
                          <div className="flex items-center gap-2">
                            Deferral Year
                            {deferSort.field === 'date' && (
                              deferSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-slate-300 font-semibold cursor-pointer hover:text-white"
                          onClick={() => handleDefermentSort('status')}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {deferSort.field === 'status' && (
                              deferSort.order === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {defermentsPaginated.map((deferment) => (
                        <tr key={deferment.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-white">{deferment.employee_name}</td>
                          <td className="py-3 px-4 text-white">{deferment.leave_type}</td>
                          <td className="py-3 px-4 text-slate-300">{deferment.department || 'N/A'}</td>
                          <td className="py-3 px-4 text-white">{deferment.deferral_year}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                deferment.status === 'approved'
                                  ? 'bg-green-900/30 text-green-400'
                                  : deferment.status === 'rejected'
                                  ? 'bg-red-900/30 text-red-400'
                                  : 'bg-yellow-900/30 text-yellow-400'
                              }`}
                            >
                              {deferment.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {deferTotal > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-400">
                    Page {deferPage} of {deferTotal} ({filteredDeferments.length} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeferPage(Math.max(1, deferPage - 1))}
                      disabled={deferPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeferPage(Math.min(deferTotal, deferPage + 1))}
                      disabled={deferPage === deferTotal}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Holiday Modal */}
      <Dialog open={showHolidayModal} onOpenChange={setShowHolidayModal}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
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
                placeholder="e.g., Christmas"
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHolidayModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveHoliday} disabled={submittingHoliday} className="bg-green-600 hover:bg-green-700">
              {submittingHoliday ? 'Saving...' : 'Save Holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
  } catch (err) {
    console.error('[v0] Render error:', err)
    const errorMsg = err instanceof Error ? err.message : 'Unknown rendering error'
    setComponentError(errorMsg)
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">HR Leave Office Admin</h1>
          <p className="text-slate-400">Manage holidays, recalls, and deferments</p>
        </div>
        <Card className="bg-red-900/20 border-red-700">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-200 font-semibold mb-2">Rendering Error</p>
              <p className="text-red-200 text-sm">{errorMsg}</p>
              <Button variant="ghost" size="sm" onClick={() => location.reload()} className="mt-3 text-red-400 hover:text-red-300">
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
}
