'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FDEntryForm } from './fd-entry-form'
import { FileText, Plus, Eye, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface FDRequest {
  id: string
  staff_user_id: string
  loan_amount_ghc: number
  recovery_period_months: number
  monthly_repayment_amount: number
  total_recovery_value: number
  affordability_status: string
  review_status: string
  submission_date: string
  fd_verification_memo?: string
}

export function LoanOfficeFDTab({ userId }: { userId: string }) {
  const [fdRequests, setFdRequests] = useState<FDRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<FDRequest | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchFDRequests()
  }, [])

  const fetchFDRequests = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/loan/fd-review')
      const data = await response.json()

      if (data.success) {
        setFdRequests(data.reviews || [])
      } else {
        toast({
          title: 'Error',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('[v0] Error fetching FD requests:', error)
      toast({
        title: 'Error',
        description: 'Failed to load FD requests',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return (
          <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-900">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        )
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-50 border-green-200 text-green-900">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 border-red-200 text-red-900">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getAffordabilityBadge = (status: string) => {
    switch (status) {
      case 'affordable':
        return (
          <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
            Affordable
          </Badge>
        )
      case 'at_risk':
        return (
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
            At Risk
          </Badge>
        )
      case 'unaffordable':
        return (
          <Badge className="bg-red-100 text-red-900 hover:bg-red-100">
            Unaffordable
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const pendingRequests = fdRequests.filter(r => r.review_status === 'pending_review')
  const completedRequests = fdRequests.filter(
    r => r.review_status === 'approved' || r.review_status === 'rejected'
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading FD requests...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle>FD Request Management</CardTitle>
              <CardDescription>
                Create and track Fixed Deposit (FD) requests for Accounts Executive approval
              </CardDescription>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New FD Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New FD Request</DialogTitle>
                <DialogDescription>
                  Enter staff loan details for FD calculation and submission to Accounts Executive
                </DialogDescription>
              </DialogHeader>
              <FDEntryForm
                onSubmitSuccess={(reviewId) => {
                  setIsDialogOpen(false)
                  fetchFDRequests()
                  toast({
                    title: 'Success',
                    description: 'FD request submitted to Accounts Executive',
                  })
                }}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending Review ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed ({completedRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Requests Tab */}
        <TabsContent value="pending" className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No pending FD requests. Create a new one to get started.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending FD Requests for Accounts Executive Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Loan Amount</TableHead>
                        <TableHead>Recovery Period</TableHead>
                        <TableHead>Monthly Repayment</TableHead>
                        <TableHead>Affordability</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-mono text-sm">
                            {request.staff_user_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">
                              GHc {formatCurrency(request.loan_amount_ghc)}
                            </span>
                          </TableCell>
                          <TableCell>{request.recovery_period_months} months</TableCell>
                          <TableCell>
                            GHc {formatCurrency(request.monthly_repayment_amount)}
                          </TableCell>
                          <TableCell>
                            {getAffordabilityBadge(request.affordability_status)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDate(request.submission_date)}
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => setSelectedRequest(request)}
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>FD Request Details</DialogTitle>
                                </DialogHeader>
                                {selectedRequest && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-sm text-gray-600">Loan Amount</p>
                                        <p className="text-lg font-bold">
                                          GHc {formatCurrency(selectedRequest.loan_amount_ghc)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-sm text-gray-600">Recovery Period</p>
                                        <p className="text-lg font-bold">
                                          {selectedRequest.recovery_period_months} months
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-sm text-gray-600">Monthly Repayment</p>
                                        <p className="text-lg font-bold">
                                          GHc {formatCurrency(selectedRequest.monthly_repayment_amount)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-sm text-gray-600">Total Recovery</p>
                                        <p className="text-lg font-bold">
                                          GHc {formatCurrency(selectedRequest.total_recovery_value)}
                                        </p>
                                      </div>
                                    </div>
                                    {selectedRequest.fd_verification_memo && (
                                      <div>
                                        <p className="text-sm text-gray-600 mb-2">Memo</p>
                                        <pre className="text-xs bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                                          {selectedRequest.fd_verification_memo}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Completed Requests Tab */}
        <TabsContent value="completed" className="space-y-4">
          {completedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No completed FD requests yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Completed FD Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Staff ID</TableHead>
                        <TableHead>Loan Amount</TableHead>
                        <TableHead>Monthly Repayment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Decision Date</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-mono text-sm">
                            {request.staff_user_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">
                              GHc {formatCurrency(request.loan_amount_ghc)}
                            </span>
                          </TableCell>
                          <TableCell>
                            GHc {formatCurrency(request.monthly_repayment_amount)}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(request.review_status)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDate(request.submission_date)}
                          </TableCell>
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => setSelectedRequest(request)}
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>FD Request Details</DialogTitle>
                                </DialogHeader>
                                {selectedRequest && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-sm text-gray-600">Loan Amount</p>
                                        <p className="text-lg font-bold">
                                          GHc {formatCurrency(selectedRequest.loan_amount_ghc)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-sm text-gray-600">Status</p>
                                        <p className="mt-2">
                                          {getStatusBadge(selectedRequest.review_status)}
                                        </p>
                                      </div>
                                    </div>
                                    {selectedRequest.fd_verification_memo && (
                                      <div>
                                        <p className="text-sm text-gray-600 mb-2">Review Memo</p>
                                        <pre className="text-xs bg-gray-50 p-3 rounded border whitespace-pre-wrap">
                                          {selectedRequest.fd_verification_memo}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
