'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { FileText, Download, Eye, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PaymentMemo {
  id: string
  batch_id: string
  batch_name: string
  staff_count: number
  status: 'pending' | 'approved'
  approved_on?: string
  staff_records: StaffMemoRecord[]
}

interface StaffMemoRecord {
  name: string
  staff_number: string
  rank: string
  position: string
  leave_days: number
  leave_period: string
  approved_on?: string
}

export function HRPaymentAdviceManagement() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending')
  const [paymentMemos, setPaymentMemos] = useState<PaymentMemo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPaymentMemos()
  }, [activeTab, selectedMonth])

  const fetchPaymentMemos = async () => {
    try {
      setLoading(true)
      setError(null)

      let endpoint = '/api/leave/payment-advice'
      
      if (activeTab === 'pending') {
        endpoint = '/api/leave/payment-advice/pending-approval'
      } else if (activeTab === 'approved') {
        endpoint = '/api/leave/payment-advice/approved-memos'
      }

      if (selectedMonth) {
        endpoint += `?month=${selectedMonth}`
      }

      const res = await fetch(endpoint)
      
      if (!res.ok) {
        throw new Error(`Failed to fetch payment memos: ${res.statusText}`)
      }

      const data = await res.json()
      
      const memos = (data.memos || data.records || []).map((memo: any) => ({
        id: memo.id,
        batch_id: memo.batch_id || memo.id,
        batch_name: memo.batch_name || 'Payment Advice Batch',
        staff_count: memo.staff_count || 1,
        status: activeTab as 'pending' | 'approved',
        approved_on: memo.approved_on,
        staff_records: memo.staff_records || [{
          name: memo.staff_name || memo.full_name || 'N/A',
          staff_number: memo.staff_number || memo.employee_id || 'N/A',
          rank: memo.rank || 'N/A',
          position: memo.position || 'N/A',
          leave_days: memo.leave_days || 0,
          leave_period: memo.leave_period || 'N/A',
          approved_on: memo.approved_on,
        }],
      }))

      setPaymentMemos(memos)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load payment memos'
      setError(message)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadBatch = async (batchId: string) => {
    try {
      toast({
        title: 'Downloading',
        description: 'Preparing payment advice for download...',
      })

      // Use the download-batch endpoint with memo IDs
      const res = await fetch(`/api/leave/payment-advice/download-batch?memo_ids=${encodeURIComponent(batchId)}`, {
        method: 'GET',
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to download: HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `payment-advice-${new Date().toISOString().split('T')[0]}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast({
        title: 'Success',
        description: 'Payment advice downloaded successfully',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to download',
      })
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'approved') {
      return <Badge className="bg-green-100 text-green-800 flex items-center gap-1"><Clock className="h-3 w-3" /> Approved</Badge>
    }
    return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
  }

  const approvedCount = paymentMemos.filter(m => m.status === 'approved').length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Payment Advice Management
          </CardTitle>
          <CardDescription>
            Review, approve, and download payment advice memos submitted by HR Leave Office
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              As an HR Executive, you can approve pending memos and download all approved payment advice for tracking.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === 'pending' ? 'default' : 'outline'}
          onClick={() => setActiveTab('pending')}
          className={activeTab === 'pending' ? 'bg-amber-500 hover:bg-amber-600' : ''}
        >
          <Clock className="h-4 w-4 mr-2" />
          Pending Approval
        </Button>
        <Button
          variant={activeTab === 'approved' ? 'default' : 'outline'}
          onClick={() => setActiveTab('approved')}
          className={activeTab === 'approved' ? 'bg-green-500 hover:bg-green-600' : ''}
        >
          <Download className="h-4 w-4 mr-2" />
          Approved & Download
          {approvedCount > 0 && <Badge className="ml-2 bg-white text-green-600">{approvedCount}</Badge>}
        </Button>
        <Button
          variant={activeTab === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveTab('all')}
        >
          <Eye className="h-4 w-4 mr-2" />
          View All Requests
        </Button>
      </div>

      {/* Month Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter by Month:</span>
        <Input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <Card className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Payment Memos List */}
      {!loading && !error && paymentMemos.length === 0 && (
        <Card className="text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">No payment memos found</p>
        </Card>
      )}

      {/* Memo Batches */}
      {!loading && !error && paymentMemos.map((memo) => (
        <Card key={memo.batch_id} className="overflow-hidden border-l-4 border-l-green-500">
          <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {getStatusBadge(memo.status)}
                    <span>{memo.batch_name}</span>
                  </CardTitle>
                  <CardDescription>{memo.staff_count} staff members</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Staff Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Staff No.</th>
                    <th className="text-left py-2 px-2">Rank</th>
                    <th className="text-left py-2 px-2">Position</th>
                    <th className="text-left py-2 px-2">Leave Days</th>
                    <th className="text-left py-2 px-2">Leave Period</th>
                    <th className="text-left py-2 px-2">Approved On</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.staff_records.map((record, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">{record.name}</td>
                      <td className="py-2 px-2">{record.staff_number}</td>
                      <td className="py-2 px-2">{record.rank}</td>
                      <td className="py-2 px-2">{record.position}</td>
                      <td className="py-2 px-2">{record.leave_days}</td>
                      <td className="py-2 px-2">{record.leave_period}</td>
                      <td className="py-2 px-2">{record.approved_on || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Download Button */}
            <Button
              onClick={() => handleDownloadBatch(memo.batch_id)}
              className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download All ({memo.staff_count})
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
