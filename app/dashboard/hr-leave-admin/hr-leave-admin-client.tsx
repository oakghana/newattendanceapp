'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Plus, Edit2, Trash2, Calendar, Search, ChevronUp, ChevronDown } from 'lucide-react'
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
        <p className="text-slate-400">Manage holidays, recalls, and deferments</p>
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
        <TabsList className="grid w-full grid-cols-3 bg-slate-800">
          <TabsTrigger value="holidays" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Holidays
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
