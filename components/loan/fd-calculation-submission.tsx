'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Calculator, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { calculateFD, validateFDInput, FDCalculationInput, FDCalculationResult } from '@/lib/fd-calculator'

interface LoanRequest {
  id: string
  request_number: string
  staff_number: string
  staff_full_name: string
  requested_amount: number
  repayment_duration_months: number
  loan_type_label?: string
  monthly_deduction?: number
  status?: string
  fd_calculated?: boolean
}

interface FDCalculationSubmissionProps {
  loanRequest: LoanRequest
  onSubmitComplete?: () => void
}

export function FDCalculationSubmission({ loanRequest, onSubmitComplete }: FDCalculationSubmissionProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [calculated, setCalculated] = useState(false)
  const [calculation, setCalculation] = useState<FDCalculationResult | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Form inputs
  const [formData, setFormData] = useState({
    salary_per_annum: '',
    other_allowances_monthly: '',
    gross_deduction_monthly: '',
    outstanding_loans_json: '{}',
  })

  const [accountsNotes, setAccountsNotes] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCalculate = () => {
    setLoading(true)
    setValidationErrors([])

    try {
      const salary = parseFloat(formData.salary_per_annum)
      const allowances = parseFloat(formData.other_allowances_monthly) || 0
      const deductions = parseFloat(formData.gross_deduction_monthly) || 0
      let outstanding: Record<string, number> = {}

      try {
        outstanding = JSON.parse(formData.outstanding_loans_json)
      } catch {
        // Invalid JSON, ignore
      }

      const input: FDCalculationInput = {
        staffNumber: loanRequest.staff_number,
        staffName: loanRequest.staff_full_name,
        salary_per_annum: salary,
        other_allowances: allowances,
        gross_deduction: deductions,
        requested_loan_amount: loanRequest.requested_amount,
        recovery_period_months: loanRequest.repayment_duration_months,
        loan_type: loanRequest.loan_type_label,
        outstanding_loans: outstanding,
      }

      const errors = validateFDInput(input)
      if (errors.length > 0) {
        setValidationErrors(errors)
        toast({ title: 'Validation Error', description: errors[0], variant: 'destructive' })
        return
      }

      const result = calculateFD(input)
      setCalculation(result)
      setCalculated(true)
      toast({ title: 'FD Calculated', description: `FD Score: ${result.fd_score}/100` })
    } catch (error) {
      console.error('[v0] FD calculation error:', error)
      toast({ title: 'Calculation Error', description: 'Failed to calculate FD', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!calculated || !calculation) {
      toast({ title: 'Error', description: 'Please calculate FD first', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/loan/fd-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: loanRequest.id,
          fd_score: calculation.fd_score,
          fd_good: calculation.fd_good,
          fd_calculation_data: {
            salary_per_annum: calculation.salary_per_annum,
            consolidated_salary_per_month: calculation.consolidated_salary_per_month,
            other_allowances: calculation.other_allowances_per_month,
            gross_salary_monthly: calculation.gross_salary_per_month,
            gross_deductions_monthly: calculation.gross_deduction_monthly,
            loan_installment_monthly: calculation.loan_installment_monthly,
            total_deductions_monthly: calculation.total_deduction_monthly,
            net_salary_monthly: calculation.net_salary_monthly,
            half_gross_monthly: calculation.half_gross_salary_per_month,
            total_outstanding_loans: calculation.total_outstanding,
            net_to_gross_ratio: calculation.net_to_gross_ratio,
          },
          accounts_notes: accountsNotes,
          submission_type: 'automated_calculation', // Mark as automated, not manual upload
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast({
          title: 'Success',
          description: `FD calculation submitted with score ${calculation.fd_score}/100`,
        })
        setCalculated(false)
        setCalculation(null)
        setFormData({ salary_per_annum: '', other_allowances_monthly: '', gross_deduction_monthly: '', outstanding_loans_json: '{}' })
        setAccountsNotes('')
        onSubmitComplete?.()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to submit FD calculation', variant: 'destructive' })
      }
    } catch (error) {
      console.error('[v0] Error submitting FD:', error)
      toast({ title: 'Error', description: 'Failed to submit FD calculation', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Loan Request Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Loan Request Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-600">Staff Name</Label>
              <p className="font-semibold">{loanRequest.staff_full_name}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Staff Number</Label>
              <p className="font-semibold">{loanRequest.staff_number}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Loan Type</Label>
              <p className="font-semibold">{loanRequest.loan_type_label || 'N/A'}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Requested Amount</Label>
              <p className="font-semibold">GH¢ {loanRequest.requested_amount.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Repayment Period</Label>
              <p className="font-semibold">{loanRequest.repayment_duration_months} months</p>
            </div>
            <div>
              <Label className="text-xs text-gray-600">Request Number</Label>
              <p className="font-semibold">{loanRequest.request_number}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FD Calculation Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Financial Due Diligence Calculation
          </CardTitle>
          <CardDescription>
            Enter the staff member's financial information to automatically calculate their FD score
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              {validationErrors.map((error, i) => (
                <div key={i} className="flex gap-2 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salary_per_annum">
                Annual Salary <span className="text-red-500">*</span>
              </Label>
              <Input
                id="salary_per_annum"
                name="salary_per_annum"
                type="number"
                placeholder="e.g., 125831"
                value={formData.salary_per_annum}
                onChange={handleInputChange}
                step="0.01"
              />
            </div>

            <div>
              <Label htmlFor="other_allowances_monthly">
                Monthly Allowances <span className="text-gray-400">(optional)</span>
              </Label>
              <Input
                id="other_allowances_monthly"
                name="other_allowances_monthly"
                type="number"
                placeholder="e.g., 4318.39"
                value={formData.other_allowances_monthly}
                onChange={handleInputChange}
                step="0.01"
              />
            </div>

            <div>
              <Label htmlFor="gross_deduction_monthly">
                Monthly Gross Deductions <span className="text-gray-400">(optional)</span>
              </Label>
              <Input
                id="gross_deduction_monthly"
                name="gross_deduction_monthly"
                type="number"
                placeholder="e.g., 6698.08"
                value={formData.gross_deduction_monthly}
                onChange={handleInputChange}
                step="0.01"
              />
            </div>

            <div>
              <Label htmlFor="outstanding_loans_json">
                Outstanding Loans (JSON) <span className="text-gray-400">(optional)</span>
              </Label>
              <Input
                id="outstanding_loans_json"
                name="outstanding_loans_json"
                type="text"
                placeholder={`{"Motor Loan": 5000, "House Loan": 10000}`}
                value={formData.outstanding_loans_json}
                onChange={handleInputChange}
                className="text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleCalculate}
            disabled={loading || !formData.salary_per_annum}
            className="w-full"
          >
            {loading ? 'Calculating...' : 'Calculate FD Score'}
          </Button>
        </CardContent>
      </Card>

      {/* FD Calculation Results */}
      {calculated && calculation && (
        <Card className={calculated ? (calculation.fd_good ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50') : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>FD Calculation Results</CardTitle>
              <Badge variant={calculation.fd_good ? 'default' : 'secondary'} className="text-lg px-3 py-1">
                Score: {calculation.fd_score}/100
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Status */}
            <div className="flex items-center gap-3">
              {calculation.fd_good ? (
                <>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Good FD</p>
                    <p className="text-sm text-green-700">Financial standing is satisfactory</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                  <div>
                    <p className="font-semibold text-orange-900">Poor FD</p>
                    <p className="text-sm text-orange-700">Financial standing needs review</p>
                  </div>
                </>
              )}
            </div>

            {/* Calculation Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Consolidated Monthly Salary</Label>
                <p className="font-semibold">GH¢ {calculation.consolidated_salary_per_month.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Monthly Allowances</Label>
                <p className="font-semibold">GH¢ {calculation.other_allowances_per_month.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Gross Monthly Salary</Label>
                <p className="font-semibold">GH¢ {calculation.gross_salary_per_month.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Gross Monthly Deductions</Label>
                <p className="font-semibold">GH¢ {calculation.gross_deduction_monthly.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Loan Installment (Monthly)</Label>
                <p className="font-semibold">GH¢ {calculation.loan_installment_monthly.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Total Monthly Deductions</Label>
                <p className="font-semibold">GH¢ {calculation.total_deduction_monthly.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Net Monthly Salary</Label>
                <p className="font-semibold text-green-600">GH¢ {calculation.net_salary_monthly.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Half of Gross Monthly</Label>
                <p className="font-semibold">GH¢ {calculation.half_gross_salary_per_month.toFixed(2)}</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Net to Gross Ratio</Label>
                <p className="font-semibold">{calculation.net_to_gross_ratio.toFixed(1)}%</p>
              </div>
              <div className="bg-white p-3 rounded border">
                <Label className="text-xs text-gray-600">Total Outstanding Loans</Label>
                <p className="font-semibold">GH¢ {calculation.total_outstanding.toFixed(2)}</p>
              </div>
            </div>

            {/* Accounts Notes */}
            <div>
              <Label htmlFor="accountsNotes">
                Accounts Notes <span className="text-gray-400">(optional)</span>
              </Label>
              <Textarea
                id="accountsNotes"
                placeholder="Add any additional notes or observations about this FD calculation..."
                value={accountsNotes}
                onChange={e => setAccountsNotes(e.target.value)}
                className="min-h-24"
              />
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
              size="lg"
            >
              {submitting ? 'Submitting...' : 'Submit FD Calculation to Accounts Review'}
            </Button>
            <p className="text-xs text-gray-600 text-center">
              No attachment needed - calculation data is automatically captured
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
