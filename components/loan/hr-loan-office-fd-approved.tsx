'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, FileCheck, CreditCard, Download, AlertCircle, Send, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useEffect } from 'react'
import { GOOD_FD_THRESHOLD } from '@/lib/loan-workflow'

interface FDApprovedLoan {
  id: string
  staff_name: string
  staff_number?: string
  loan_type?: string
  request_number?: string
  requested_amount?: number
  fd_score?: number
  fd_value?: number
  status: string
  submission_date: string
  approval_date?: string
}

export function HRLoanOfficeFDApproved() {
  const [fdApprovedLoans, setFdApprovedLoans] = useState<FDApprovedLoan[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const [selectedForPush, setSelectedForPush] = useState<FDApprovedLoan | null>(null)
  const [selectedDetailLoan, setSelectedDetailLoan] = useState<FDApprovedLoan | null>(null)
  const [pushMemo, setPushMemo] = useState('')
  const [pushing, setPushing] = useState(false)
  const { toast } = useToast()

  // Fetch FD-approved loans from API
  const fetchFdApprovedLoans = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/loan/workflow?inbox=true')
      const data = await res.json()
      
      if (data.inbox?.loanOffice) {
        // Filter for loans in pending_hr_loan_office status (approved FD from Accounts Executive)
        const approvedFdLoans = data.inbox.loanOffice.filter(
          (loan: any) => loan.status === 'pending_hr_loan_office'
        )
        setFdApprovedLoans(approvedFdLoans)
      }
    } catch (error) {
      console.error('[v0] Error fetching FD-approved loans:', error)
      toast({ title: 'Error', description: 'Failed to fetch FD-approved loans', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFdApprovedLoans()
  }, [])

  // Filter loans based on search
  const filteredLoans = useMemo(() => {
    let result = fdApprovedLoans
    
    if (searchTerm) {
      result = result.filter(loan =>
        loan.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        loan.staff_number?.includes(searchTerm) ||
        loan.request_number?.includes(searchTerm)
      )
    }

    result.sort((a, b) => {
      const dateA = new Date(a.approval_date || a.submission_date).getTime()
      const dateB = new Date(b.approval_date || b.submission_date).getTime()
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB
    })

    return result
  }, [fdApprovedLoans, searchTerm, sortBy])

  const stats = useMemo(() => {
    return {
      total: fdApprovedLoans.length,
      pending: fdApprovedLoans.filter(l => l.status === 'pending_hr_loan_office').length,
      processed: fdApprovedLoans.filter(l => l.status !== 'pending_hr_loan_office').length,
    }
  }, [fdApprovedLoans])

  const openHandoffDialog = (loan: FDApprovedLoan, defaultMemo: string) => {
    setSelectedForPush(loan)
    setPushMemo(defaultMemo)
  }

  const handleViewDetails = (loan: FDApprovedLoan) => {
    setSelectedDetailLoan(loan)
  }

  const handleProcessLoan = (loan: FDApprovedLoan) => {
    openHandoffDialog(
      loan,
      `Process ${loan.request_number || loan.id}: confirm FD approval status and prepare the HR Executive handoff.`,
    )
  }

  const handleApproveDisbursement = (loan: FDApprovedLoan) => {
    openHandoffDialog(
      loan,
      `Approve disbursement readiness for ${loan.request_number || loan.id}. Confirm the memo and supporting details before forwarding.`,
    )
  }

  const handlePushToHRExecutive = async () => {
    if (!selectedForPush || !pushMemo.trim()) {
      toast({ title: 'Error', description: 'Please enter a memo before pushing to HR Executive', variant: 'destructive' })
      return
    }

    try {
      setPushing(true)
      const res = await fetch('/api/loan/push-to-hr-executive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: selectedForPush.id,
          hr_loan_office_memo: pushMemo,
          action: 'push_to_hr_executive',
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({ 
          title: 'Success', 
          description: 'Loan memo pushed to HR Executive for signing and approval. Will be forwarded to MD dashboard for final approval.' 
        })
        setSelectedForPush(null)
        setPushMemo('')
        // Refresh the loans list
        await fetchFdApprovedLoans()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to push to HR Executive', variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error pushing to HR Executive:', error)
      toast({ title: 'Error', description: 'Failed to push to HR Executive', variant: 'destructive' })
    } finally {
      setPushing(false)
    }
  }

  const getFDStatusColor = (score?: number) => {
    if (!score && score !== 0) return 'bg-slate-100 text-slate-700'
    return score >= GOOD_FD_THRESHOLD ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_hr_loan_office':
        return <Badge className="bg-amber-100 text-amber-700">Pending Review</Badge>
      case 'hr_approved':
        return <Badge className="bg-emerald-100 text-emerald-700">HR Approved</Badge>
      case 'disbursement_approved':
        return <Badge className="bg-blue-100 text-blue-700">Ready to Disburse</Badge>
      default:
        return <Badge className="bg-slate-100 text-slate-700">{status}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total FD Approved', value: stats.total, color: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white' },
          { label: 'Pending Review', value: stats.pending, color: 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' },
          { label: 'Processed', value: stats.processed, color: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white' },
        ].map((stat, idx) => (
          <Card key={idx} className={`${stat.color} border-0`}>
            <CardContent className="pt-4">
              <div className="text-xs font-medium opacity-90">{stat.label}</div>
              <div className="text-3xl font-bold mt-1">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter and Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Search by staff name, number, or request ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'oldest')}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loans Table/Cards */}
      {filteredLoans.length === 0 ? (
        <Card>
          <CardContent className="pt-8">
            <div className="text-center text-slate-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No FD-approved loans</p>
              <p className="text-sm">When Accounts Executives approve FD calculations, they'll appear here for processing</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Staff</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Loan Type</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Amount</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-600">FD Score</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Approved Date</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLoans.map((loan) => (
                    <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{loan.staff_name || 'Unknown Staff'}</p>
                          <p className="text-xs text-slate-500">{loan.request_number}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{loan.loan_type || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">₵{Number(loan.requested_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFDStatusColor(loan.fd_score)}`}>
                          {loan.fd_score ?? 'N/A'}%
                        </span>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(loan.status)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {loan.approval_date ? new Date(loan.approval_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="View FD Calculation Details"
                            onClick={() => handleViewDetails(loan)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {loan.status === 'pending_hr_loan_office' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Process Loan"
                                onClick={() => handleProcessLoan(loan)}
                              >
                                <FileCheck className="h-4 w-4 mr-1" />
                                Process
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Approve the handoff for HR Executive review"
                                onClick={() => handleApproveDisbursement(loan)}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                Ready for Handoff
                              </Button>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                title="Push to HR Executive for Signing and Approval"
                                onClick={() => setSelectedForPush(loan)}
                              >
                                <Send className="h-4 w-4 mr-1" />
                                Push to HR Exec
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loan Details Dialog */}
      <Dialog open={!!selectedDetailLoan} onOpenChange={(open) => !open && setSelectedDetailLoan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>FD Approved Loan Details</DialogTitle>
            <DialogDescription>Review the loan summary before handing it over to HR Executive.</DialogDescription>
          </DialogHeader>

          {selectedDetailLoan && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Staff</p>
                  <p className="font-medium text-slate-900">{selectedDetailLoan.staff_name}</p>
                  <p className="text-sm text-slate-600">{selectedDetailLoan.staff_number || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Request</p>
                  <p className="font-medium text-slate-900">{selectedDetailLoan.request_number || selectedDetailLoan.id}</p>
                  <p className="text-sm text-slate-600">{selectedDetailLoan.loan_type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</p>
                  <p className="font-medium text-slate-900">₵{Number(selectedDetailLoan.requested_amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FD Score</p>
                  <p className={`font-medium ${Number(selectedDetailLoan.fd_score || 0) >= GOOD_FD_THRESHOLD ? 'text-emerald-700' : 'text-red-700'}`}>
                    {selectedDetailLoan.fd_score ?? 'N/A'}%
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-semibold">Next step</p>
                <p className="mt-1">This loan is ready for the HR Executive handoff after the Loan Office memo is confirmed.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDetailLoan(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to HR Executive Dialog */}
      <Dialog open={!!selectedForPush} onOpenChange={(open) => !open && setSelectedForPush(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Push to HR Executive for Signing & Approval</DialogTitle>
            <DialogDescription>
              Send this approved FD loan to HR Executive for signing. The loan memo will then be forwarded to MD's dashboard for final approval and disbursement authorization.
            </DialogDescription>
          </DialogHeader>

          {selectedForPush && (
            <div className="space-y-4">
              {/* Loan Summary */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded">
                <div>
                  <p className="text-xs text-slate-600 font-semibold">Staff</p>
                  <p className="text-sm font-medium">{selectedForPush.staff_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 font-semibold">Loan Amount</p>
                  <p className="text-sm font-medium">₵{Number(selectedForPush.requested_amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 font-semibold">FD Score</p>
                  <p className={`text-sm font-medium ${(selectedForPush.fd_score ?? 0) >= 40 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {selectedForPush.fd_score}%
                  </p>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-xs text-blue-900">
                  <CheckCircle2 className="h-4 w-4 inline mr-2" />
                  This loan has been approved by Accounts Executive with an acceptable FD score. Once you push to HR Executive, they will review and sign. The loan memo will then appear on MD's dashboard for final approval before disbursement.
                </p>
              </div>

              {/* Memo Input */}
              <div>
                <label className="text-sm font-semibold text-slate-900">HR Loan Office Processing Memo *</label>
                <p className="text-xs text-slate-500 mb-2">Add any processing notes or requirements for HR Executive review</p>
                <Textarea
                  placeholder="Enter memo for HR Executive (e.g., specific disbursement instructions, conditions, notes)..."
                  value={pushMemo}
                  onChange={(e) => setPushMemo(e.target.value)}
                  className="min-h-20"
                />
              </div>

              {/* Process Flow */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                <p className="text-xs font-semibold text-emerald-900 mb-2">Approval Flow:</p>
                <div className="text-xs text-emerald-800 space-y-1">
                  <p>1️⃣ HR Loan Office sends to HR Executive for signing</p>
                  <p>2️⃣ HR Executive reviews, signs, and approves</p>
                  <p>3️⃣ Loan memo forwarded to MD's dashboard</p>
                  <p>4️⃣ MD reviews and approves for final disbursement</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedForPush(null)} disabled={pushing}>
              Cancel
            </Button>
            <Button
              onClick={handlePushToHRExecutive}
              disabled={pushing || !pushMemo.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4 mr-2" />
              {pushing ? 'Pushing...' : 'Push to HR Executive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
