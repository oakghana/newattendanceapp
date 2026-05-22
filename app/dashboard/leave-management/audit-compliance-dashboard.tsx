'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Download, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Transaction {
  id: string
  staff_id: string
  leave_year: string
  leave_type_key: string
  transaction_type: string
  days_change: number
  running_balance: number
  reason_code: string
  notes: string
  created_at: string
  approved_at: string
  created_by_user: {
    email: string
  }
  approved_by_user: {
    email: string
  }
  staff: {
    email: string
  }
}

export function AuditComplianceDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
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
      let url = '/api/leave/audit/report?'
      if (leaveYear) url += `leave_year=${encodeURIComponent(leaveYear)}&`
      if (filterType !== 'ALL') url += `transaction_type=${encodeURIComponent(filterType)}&`

      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        console.error('[v0] Audit fetch error:', res.status, res.statusText)
        toast({
          title: 'Error',
          description: `Failed to load audit trail: ${res.statusText}`,
          variant: 'destructive',
        })
        setTransactions([])
      } else {
        const data = await res.json()
        setTransactions(data.transactions || [])
      }
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
      let url = '/api/leave/audit/report?format=csv&'
      if (leaveYear) url += `leave_year=${encodeURIComponent(leaveYear)}&`
      if (filterType !== 'ALL') url += `transaction_type=${encodeURIComponent(filterType)}&`

      const res = await fetch(url)
      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `audit-report-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(downloadUrl)
      document.body.removeChild(a)

      toast({
        title: 'Exported',
        description: 'Audit report downloaded',
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'OPENING':
        return 'bg-blue-100 text-blue-900'
      case 'TAKEN':
        return 'bg-red-100 text-red-900'
      case 'ADJUSTMENT':
        return 'bg-yellow-100 text-yellow-900'
      case 'CARRYOVER_APPROVED':
        return 'bg-emerald-100 text-emerald-900'
      case 'FORFEITED':
        return 'bg-purple-100 text-purple-900'
      default:
        return 'bg-slate-100 text-slate-900'
    }
  }

  const filteredTransactions = transactions.filter(t =>
    searchQuery === '' ||
    t.staff?.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.leave_type_key.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Days Taken</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">
              {Math.abs(transactions.filter(t => t.transaction_type === 'TAKEN').reduce((sum, t) => sum + t.days_change, 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Days Forfeited</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">
              {Math.abs(transactions.filter(t => t.transaction_type === 'FORFEITED').reduce((sum, t) => sum + t.days_change, 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Carryovers Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">
              {transactions.filter(t => t.transaction_type === 'CARRYOVER_APPROVED').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Adjustments Made</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-700">
              {transactions.filter(t => t.transaction_type === 'ADJUSTMENT').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters & Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search staff or leave type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={leaveYear} onValueChange={setLeaveYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024/2025">2024/2025</SelectItem>
                <SelectItem value="2025/2026">2025/2026</SelectItem>
                <SelectItem value="2026/2027">2026/2027</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="OPENING">Opening Balance</SelectItem>
                <SelectItem value="TAKEN">Leave Taken</SelectItem>
                <SelectItem value="ADJUSTMENT">Adjustments</SelectItem>
                <SelectItem value="CARRYOVER_APPROVED">Carryover Approved</SelectItem>
                <SelectItem value="FORFEITED">Forfeited</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleExportCSV}
              disabled={exporting}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
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

      {/* Transactions Table */}
      {!loading && filteredTransactions.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Staff</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Leave Year</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Days</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Balance</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Reason</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{t.staff?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{t.leave_year}</td>
                    <td className="px-4 py-3">
                      <Badge className={getTypeColor(t.transaction_type)}>
                        {t.transaction_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={t.days_change > 0 ? 'text-emerald-700' : 'text-red-700'}>
                        {t.days_change > 0 ? '+' : ''}{t.days_change}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {t.running_balance}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                      {t.reason_code}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {t.created_by_user?.email || 'System'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTransactions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">No transactions found</p>
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
