'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Download, Search, TrendingDown, RefreshCw, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Transaction {
  id: string
  created_at: string
  staff_name: string
  employee_id: string
  department: string
  leave_year: string
  leave_type: string
  transaction_type: string
  days_change: number
  running_balance: number
  reason_code: string
  notes: string
  status: string
}

interface Summary {
  total_days_taken: number
  days_forfeited: number
  carryovers_approved: number
  adjustments_made: number
}

export function AuditComplianceDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<Summary>({ total_days_taken: 0, days_forfeited: 0, carryovers_approved: 0, adjustments_made: 0 })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('ALL')
  const [leaveYear, setLeaveYear] = useState<string>('2025/2026')
  const { toast } = useToast()

  useEffect(() => {
    fetchTransactions()
  }, [filterType, leaveYear])

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('leave_year', leaveYear)
      if (filterType !== 'ALL') params.append('transaction_type', filterType)

      const res = await fetch(`/api/leave/audit/report?${params.toString()}`, { cache: 'no-store' })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[v0] Audit fetch error:', res.status, errorData)
        toast({
          title: 'Error',
          description: errorData.error || `Failed to load audit trail (${res.status})`,
          variant: 'destructive',
        })
        setTransactions([])
        return
      }
      
      const data = await res.json()
      setTransactions(data.transactions || [])
      setSummary(data.summary || { total_days_taken: 0, days_forfeited: 0, carryovers_approved: 0, adjustments_made: 0 })
    } catch (error) {
      console.error('[v0] Failed to fetch transactions:', error)
      toast({
        title: 'Error',
        description: 'Failed to load audit trail',
        variant: 'destructive',
      })
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.append('format', 'csv')
      params.append('leave_year', leaveYear)
      if (filterType !== 'ALL') params.append('transaction_type', filterType)

      const res = await fetch(`/api/leave/audit/report?${params.toString()}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-report-${leaveYear.replace('/', '-')}.csv`
      a.click()
      URL.revokeObjectURL(url)

      toast({
        title: 'Exported',
        description: 'Audit report downloaded successfully',
      })
    } catch (error) {
      console.error('[v0] Export error:', error)
      toast({
        title: 'Error',
        description: 'Failed to export audit report',
        variant: 'destructive',
      })
    } finally {
      setExporting(false)
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'LEAVE_TAKEN':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Leave Taken</Badge>
      case 'CARRYOVER':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Carryover</Badge>
      case 'ADJUSTMENT':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Adjustment</Badge>
      case 'FORFEITED':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Forfeited</Badge>
      case 'OUTSTANDING':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Outstanding</Badge>
      default:
        return <Badge variant="outline">{type}</Badge>
    }
  }

  // Filter by search
  const filteredTransactions = transactions.filter(t =>
    searchQuery === '' ||
    t.staff_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.employee_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.department?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-rose-50 border-rose-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-rose-700 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Total Days Taken
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-rose-700">{summary.total_days_taken}</div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-700">Days Forfeited</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">{summary.days_forfeited}</div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-emerald-700">Carryovers Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">{summary.carryovers_approved}</div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-amber-700">Adjustments Made</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-700">{summary.adjustments_made}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters & Export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search staff or leave type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <select
              value={leaveYear}
              onChange={(e) => setLeaveYear(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2023/2024">2023/2024</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="ALL">All Types</option>
              <option value="LEAVE_TAKEN">Leave Taken</option>
              <option value="CARRYOVER">Carryover</option>
              <option value="ADJUSTMENT">Adjustments</option>
              <option value="OUTSTANDING">Outstanding</option>
            </select>

            <Button
              onClick={handleExportCSV}
              disabled={exporting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading audit trail...</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTransactions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="text-slate-600 font-medium">No audit records found</p>
            <p className="text-sm text-slate-500 mt-1">There are no leave transactions for this period</p>
          </CardContent>
        </Card>
      )}

      {/* Transactions Table */}
      {!loading && filteredTransactions.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Leave Year</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Days</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{t.staff_name}</div>
                        <div className="text-xs text-slate-500">{t.employee_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{t.leave_year}</td>
                      <td className="px-4 py-3">{getTypeBadge(t.transaction_type)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        <span className={t.days_change > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {t.days_change > 0 ? '+' : ''}{t.days_change}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                        {t.running_balance}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{t.reason_code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">System</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Total Records */}
      {!loading && (
        <div className="text-xs text-slate-500 text-right">
          Showing {filteredTransactions.length} of {transactions.length} records
        </div>
      )}
    </div>
  )
}
