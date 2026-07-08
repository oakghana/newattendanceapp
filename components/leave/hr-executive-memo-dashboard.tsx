'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Download,
  Eye,
  FileText,
  Filter,
  ArrowRight,
  BarChart3,
  Briefcase
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { MemoApprovalModal } from './memo-approval-modal'
import { MemoViewerModal } from './memo-viewer-modal'

interface DefermentMemo {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  staff?: {
    first_name: string
    last_name: string
    employee_id: string
    position: string
    departments?: { name: string }
  }
  signer_name: string
  signer_position: string
  generated_at: string
  created_at: string
  memo_body?: {
    leave_type?: string
    original_start_date?: string
    original_end_date?: string
    requested_days?: number
  }
}

interface RecallMemo {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  staff?: {
    first_name: string
    last_name: string
    employee_id: string
    position: string
    departments?: { name: string }
  }
  signer_name: string
  signer_position: string
  generated_at: string
  created_at: string
  memo_body?: {
    leave_type?: string
    original_start_date?: string
    original_end_date?: string
  }
}

interface MemoStats {
  total: number
  pending: number
  approved: number
  rejected: number
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'approved':
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>
    case 'rejected':
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
    default:
      return <Badge className="bg-slate-100 text-slate-700">{status}</Badge>
  }
}

interface HRExecutiveMemoDashboardProps {
  userId?: string
}

export function HRExecutiveMemoDashboard({ userId }: HRExecutiveMemoDashboardProps) {
  const { toast } = useToast()
  const [defermentMemos, setDefermentMemos] = useState<DefermentMemo[]>([])
  const [recallMemos, setRecallMemos] = useState<RecallMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [memoTypeFilter, setMemoTypeFilter] = useState<'all' | 'deferment' | 'recall'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [stats, setStats] = useState<MemoStats>({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [selectedMemo, setSelectedMemo] = useState<(DefermentMemo | RecallMemo) | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [selectedMemoType, setSelectedMemoType] = useState<'deferment' | 'recall' | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)

  const fetchMemos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (memoTypeFilter !== 'all') params.set('type', memoTypeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchTerm) params.set('search', searchTerm)

      const res = await fetch(`/api/leave/deferment-recall/memos/get-memos?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch memos')

      const data = await res.json()
      setDefermentMemos(data.deferment_memos || [])
      setRecallMemos(data.recall_memos || [])

      // Calculate stats
      const allMemos = [...(data.deferment_memos || []), ...(data.recall_memos || [])]
      setStats({
        total: allMemos.length,
        pending: allMemos.filter(m => m.status === 'pending').length,
        approved: allMemos.filter(m => m.status === 'approved').length,
        rejected: allMemos.filter(m => m.status === 'rejected').length
      })
    } catch (error) {
      console.error('[v0] Error fetching memos:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load memos',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMemos()
  }, [memoTypeFilter, statusFilter, searchTerm])

  const downloadPDF = async (memoId: string, memoType: 'deferment' | 'recall') => {
    try {
      const res = await fetch('/api/leave/deferment-recall/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo_id: memoId, memo_type: memoType })
      })

      if (!res.ok) throw new Error('Failed to generate PDF')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${memoType}-memo-${memoId.substring(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: 'Memo downloaded successfully'
      })
    } catch (error) {
      console.error('[v0] Error downloading PDF:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download memo',
        variant: 'destructive'
      })
    }
  }

  const allMemos = memoTypeFilter === 'all'
    ? [...defermentMemos, ...recallMemos]
    : memoTypeFilter === 'deferment'
    ? defermentMemos
    : recallMemos

  const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 font-medium">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
          <Icon className={`h-10 w-10 ${color} opacity-20`} />
        </div>
      </CardContent>
    </Card>
  )

  const MemoCard = ({ memo, type }: { memo: DefermentMemo | RecallMemo; type: 'deferment' | 'recall' }) => (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Briefcase className={`h-4 w-4 ${type === 'deferment' ? 'text-amber-600' : 'text-rose-600'}`} />
              <h3 className="font-semibold text-slate-800 truncate">
                {memo.staff?.first_name} {memo.staff?.last_name}
              </h3>
              <Badge variant="outline" className={type === 'deferment' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}>
                {type === 'deferment' ? 'Deferment' : 'Recall'}
              </Badge>
              {getStatusBadge(memo.status)}
              {(memo as any).assigned_hr_executive_id && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200" variant="outline">
                  Directed to You
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              {memo.staff?.employee_id} • {memo.staff?.departments?.name}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Leave Type</p>
                <p className="font-medium text-slate-700">{memo.memo_body?.leave_type || 'Annual Leave'}</p>
              </div>
              <div>
                <p className="text-slate-500">Position</p>
                <p className="font-medium text-slate-700 truncate">{memo.staff?.position}</p>
              </div>
              <div>
                <p className="text-slate-500">Created</p>
                <p className="font-medium text-slate-700">{format(new Date(memo.created_at), 'dd MMM')}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedMemo(memo)
                setSelectedMemoType(type)
                setViewerOpen(true)
              }}
              className="gap-1 whitespace-nowrap"
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">View</span>
            </Button>
            {memo.status === 'pending' && (
              <Button
                size="sm"
                className="gap-1 bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                onClick={() => {
                  setSelectedMemo(memo)
                  setSelectedMemoType(type)
                  setSelectedRequestId((memo as any).deferment_request?.id || (memo as any).recall_request?.id || '')
                  setApprovalModalOpen(true)
                }}
              >
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Approve</span>
              </Button>
            )}
            {memo.status === 'approved' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadPDF(memo.id, type)}
                className="gap-1 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Memo Management</h1>
        <p className="text-slate-600">Manage and approve deferment and recall memos</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Memos" value={stats.total} icon={FileText} color="text-blue-600" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="text-amber-600" />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle} color="text-emerald-600" />
        <StatCard label="Rejected" value={stats.rejected} icon={XCircle} color="text-red-600" />
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Staff name, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-50"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Memo Type</label>
              <Select value={memoTypeFilter} onValueChange={(value: any) => setMemoTypeFilter(value)}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Memos</SelectItem>
                  <SelectItem value="deferment">Deferment Only</SelectItem>
                  <SelectItem value="recall">Recall Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="bg-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setSearchTerm('')
                  setMemoTypeFilter('all')
                  setStatusFilter('all')
                }}
              >
                <Filter className="h-4 w-4" />
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memos List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : allMemos.length === 0 ? (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700">
            No memos found matching your filters.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          {defermentMemos.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-amber-600 rounded-full" />
                Deferment Memos
              </h2>
              <div className="space-y-3">
                {defermentMemos.map(memo => (
                  <MemoCard key={memo.id} memo={memo} type="deferment" />
                ))}
              </div>
            </div>
          )}

          {recallMemos.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-rose-600 rounded-full" />
                Recall Memos
              </h2>
              <div className="space-y-3">
                {recallMemos.map(memo => (
                  <MemoCard key={memo.id} memo={memo} type="recall" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedMemo && selectedMemoType && (
        <>
          <MemoViewerModal
            open={viewerOpen}
            onOpenChange={setViewerOpen}
            memo={selectedMemo}
            memoType={selectedMemoType}
          />
          <MemoApprovalModal
            open={approvalModalOpen}
            onOpenChange={setApprovalModalOpen}
            memo={selectedMemo}
            memoType={selectedMemoType}
            requestId={selectedRequestId || ''}
            onApprovalSuccess={() => {
              setApprovalModalOpen(false)
              fetchMemos()
            }}
          />
        </>
      )}
    </div>
  )
}
