'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface BalanceTransaction {
  id: string
  leave_year: string
  leave_type_key: string
  transaction_type: string
  days_change: number
  running_balance: number
  reason_code: string
  notes: string
  created_at: string
  created_by_user: {
    email: string
  }
  approved_by_user: {
    email: string
  }
}

interface BalanceSummary {
  leave_type: string
  opening_balance: number
  taken: number
  adjustments: number
  current_balance: number
  expires_on: string
}

export function StaffBalanceLedger({ staffId }: { staffId: string }) {
  const [transactions, setTransactions] = useState<BalanceTransaction[]>([])
  const [balances, setBalances] = useState<BalanceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLeaveYear, setSelectedLeaveYear] = useState('2025/2026')
  const { toast } = useToast()

  useEffect(() => {
    fetchBalanceHistory()
  }, [staffId, selectedLeaveYear])

  const fetchBalanceHistory = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/leave/balance/history?staff_id=${encodeURIComponent(staffId)}&leave_year=${encodeURIComponent(selectedLeaveYear)}&limit=100`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setTransactions(data.transactions || [])

      // Calculate balance summaries from transactions
      const summaryMap = new Map<string, BalanceSummary>()
      for (const t of data.transactions || []) {
        if (!summaryMap.has(t.leave_type_key)) {
          summaryMap.set(t.leave_type_key, {
            leave_type: t.leave_type_key,
            opening_balance: 0,
            taken: 0,
            adjustments: 0,
            current_balance: t.running_balance,
            expires_on: '31/05/2026',
          })
        }
        const summary = summaryMap.get(t.leave_type_key)!
        if (t.transaction_type === 'OPENING') summary.opening_balance = t.running_balance
        if (t.transaction_type === 'TAKEN') summary.taken += Math.abs(t.days_change)
        if (t.transaction_type === 'ADJUSTMENT') summary.adjustments += t.days_change
      }
      setBalances(Array.from(summaryMap.values()))
    } catch (error) {
      console.error('[v0] Failed to fetch balance history:', error)
      toast({
        title: 'Error',
        description: 'Failed to load balance history',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'TAKEN':
      case 'FORFEITED':
        return '➖'
      case 'CARRYOVER_APPROVED':
      case 'OPENING':
      case 'ADJUSTMENT':
        return '✅'
      default:
        return '➖'
    }
  }

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'OPENING':
        return 'bg-blue-50'
      case 'TAKEN':
        return 'bg-red-50'
      case 'ADJUSTMENT':
        return 'bg-yellow-50'
      case 'CARRYOVER_APPROVED':
        return 'bg-emerald-50'
      case 'FORFEITED':
        return 'bg-purple-50'
      default:
        return 'bg-slate-50'
    }
  }

  return (
    <div className="space-y-6">
      {/* Current Balance Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        {balances.map((balance) => (
          <Card key={balance.leave_type} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 capitalize">
                {balance.leave_type}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-slate-500">Current Balance</p>
                  <p className="text-2xl font-bold text-slate-900">{balance.current_balance} days</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Days Taken</p>
                  <p className="text-sm font-semibold text-red-700">{balance.taken} days</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, (balance.current_balance / balance.opening_balance) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500">Expires: {balance.expires_on}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert for Expiring Leave */}
      {balances.some(b => b.current_balance > 0 && new Date(b.expires_on) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Leave Expiring Soon</p>
              <p className="text-sm text-amber-800">
                You have unused leave that will expire. Please plan to take leave before the deadline.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>Complete audit trail of your leave balance changes</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">Loading...</span>
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No transactions yet</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transactions.map((t, idx) => (
                <div key={t.id} className={`rounded-lg border p-4 ${getTransactionColor(t.transaction_type)}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getTransactionIcon(t.transaction_type)}</span>
                        <Badge variant="outline" className="text-xs">
                          {t.transaction_type}
                        </Badge>
                        <span className="text-xs text-slate-600">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mb-1">
                        {t.reason_code}
                      </p>
                      {t.notes && (
                        <p className="text-xs text-slate-600 line-clamp-2">{t.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-lg font-bold ${t.days_change > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {t.days_change > 0 ? '+' : ''}{t.days_change}
                      </div>
                      <div className="text-xs text-slate-600 font-medium">
                        Bal: {t.running_balance}d
                      </div>
                    </div>
                  </div>
                  {t.created_by_user && (
                    <div className="mt-2 text-xs text-slate-600 border-t pt-2">
                      <p>By: {t.created_by_user.email}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-base text-blue-900">Important Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>• Your leave balance is calculated based on your leave entitlement and leaves taken</p>
          <p>• Adjustments may include public holidays, travelling days, or policy changes</p>
          <p>• Unused leave may be carried over to the next year subject to policy and HR approval</p>
          <p>• Leave not used by the expiry date will be forfeited as per company policy</p>
          <p>• All transactions are tracked for compliance and audit purposes</p>
        </CardContent>
      </Card>
    </div>
  )
}
