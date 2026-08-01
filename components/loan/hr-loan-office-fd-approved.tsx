'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, FileCheck, CreditCard, Download, AlertCircle } from 'lucide-react'

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

  const handleViewDetails = (loan: FDApprovedLoan) => {
    // TODO: Open detailed view modal
    console.log('[v0] View FD details for loan:', loan.id)
  }

  const handleProcessLoan = (loan: FDApprovedLoan) => {
    // TODO: Open loan processing modal
    console.log('[v0] Process loan:', loan.id)
  }

  const handleApproveDisbursement = (loan: FDApprovedLoan) => {
    // TODO: Approve for disbursement
    console.log('[v0] Approve disbursement for:', loan.id)
  }

  const getFDStatusColor = (score?: number) => {
    if (!score) return 'bg-slate-100 text-slate-700'
    return score >= 40 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
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
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Approve for Disbursement"
                                onClick={() => handleApproveDisbursement(loan)}
                              >
                                <CreditCard className="h-4 w-4 mr-1" />
                                Approve
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
    </div>
  )
}
