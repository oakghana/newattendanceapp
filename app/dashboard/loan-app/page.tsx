'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

const LOAN_TYPES = [
  { key: 'education', label: 'Education Loan', amount: 8000 },
  { key: 'motor', label: 'Motor Loan', amount: 10000 },
  { key: 'housing', label: 'Housing Loan', amount: 15000 },
  { key: 'salary_advance', label: 'Salary Advance', amount: 5000 },
]

export default function LoanAppPage() {
  const { toast } = useToast()
  const [selectedLoan, setSelectedLoan] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedLoanType = LOAN_TYPES.find(l => l.key === selectedLoan)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLoan) {
      toast({ title: 'Error', description: 'Please select a loan type', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/loan/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_type_key: selectedLoan,
          requested_amount: selectedLoanType?.amount,
          reason: reason || null,
          staff_id: 'current-user', // Would be replaced with actual user
        }),
      })

      const result = await response.json()
      if (response.ok) {
        toast({ title: 'Success', description: 'Loan request submitted successfully' })
        setSelectedLoan('')
        setReason('')
      } else {
        toast({ title: 'Error', description: result.message || 'Failed to submit request', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Network error submitting request', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Loan Administration</h1>
          <p className="text-muted-foreground mt-2">Request a new loan or manage existing loans</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Loan Request</CardTitle>
            <CardDescription>Fill out the form below to request a new loan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="loan-type">Loan Type</Label>
                <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                  <SelectTrigger id="loan-type">
                    <SelectValue placeholder="Select a loan type" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map(loan => (
                      <SelectItem key={loan.key} value={loan.key}>
                        {loan.label} ({loan.amount} GH₵)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedLoanType && (
                <div className="space-y-2">
                  <Label>Requested Amount (GH₵)</Label>
                  <Input type="text" value={selectedLoanType.amount} readOnly disabled />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain the purpose of this loan..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Requests</CardTitle>
            <CardDescription>Your current and previous loan requests</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No loan requests yet</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
