'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'

interface FDEntryFormProps {
  staffId?: string
  onSubmitSuccess?: (reviewId: string) => void
}

interface CalculationResult {
  monthly_repayment_amount: number
  total_recovery_value: number
  affordability_percentage: number
  affordability_status: 'affordable' | 'at_risk' | 'unaffordable'
  calculation_memo: string
  is_valid: boolean
  errors: string[]
}

interface FormData {
  staff_name: string
  staff_number: string
  department: string
  loan_amount_ghc: number
  recovery_period_months: number
  annual_salary_ghc: number
  submission_memo: string
  supporting_docs_url?: string
}

export function FDEntryForm({ staffId, onSubmitSuccess }: FDEntryFormProps) {
  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<FormData>({
    defaultValues: {
      loan_amount_ghc: 0,
      recovery_period_months: 12,
      annual_salary_ghc: 0,
      submission_memo: '',
    },
  })

  const [calculations, setCalculations] = useState<CalculationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { toast } = useToast()

  const loanAmount = watch('loan_amount_ghc')
  const recoveryPeriod = watch('recovery_period_months')
  const annualSalary = watch('annual_salary_ghc')

  // Trigger calculations whenever values change
  useEffect(() => {
    const triggerCalculations = async () => {
      if (!loanAmount || !recoveryPeriod || !annualSalary) {
        setCalculations(null)
        return
      }

      try {
        setCalculating(true)
        const response = await fetch('/api/loan/fd-review/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loan_amount_ghc: parseFloat(loanAmount.toString()),
            recovery_period_months: parseInt(recoveryPeriod.toString()),
            annual_salary_ghc: parseFloat(annualSalary.toString()),
          }),
        })

        const data = await response.json()
        if (data.success) {
          setCalculations(data.data)
        }
      } catch (error) {
        console.error('[v0] Calculation error:', error)
      } finally {
        setCalculating(false)
      }
    }

    const debounceTimer = setTimeout(triggerCalculations, 500)
    return () => clearTimeout(debounceTimer)
  }, [loanAmount, recoveryPeriod, annualSalary])

  const onSubmit = async (data: FormData) => {
    if (!calculations?.is_valid) {
      toast({
        title: 'Calculation Error',
        description: 'Please fix calculation errors before submitting',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/loan/fd-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: staffId || '',
          staff_user_id: staffId || '',
          fd_value: calculations.total_recovery_value,
          loan_amount_ghc: data.loan_amount_ghc,
          recovery_period_months: data.recovery_period_months,
          annual_salary_ghc: data.annual_salary_ghc,
          monthly_repayment_amount: calculations.monthly_repayment_amount,
          total_recovery_value: calculations.total_recovery_value,
          affordability_percentage: calculations.affordability_percentage,
          affordability_status: calculations.affordability_status,
          fd_calculation_memo: calculations.calculation_memo,
          submission_memo: data.submission_memo,
          supporting_docs_url: data.supporting_docs_url,
        }),
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Success',
          description: 'FD request submitted to Accounts Executive for review',
        })
        setSubmitted(true)
        reset()
        onSubmitSuccess?.(result.review.id)
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to submit FD request',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('[v0] Submit error:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit FD request',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Fixed Deposit (FD) Entry Form</CardTitle>
          <CardDescription>
            Enter staff loan details and FD calculation will be automatic
          </CardDescription>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Staff Information Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Staff Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Staff Name</label>
                <Input
                  placeholder="Enter staff name"
                  {...register('staff_name', { required: 'Staff name is required' })}
                  className={errors.staff_name ? 'border-red-500' : ''}
                />
                {errors.staff_name && (
                  <p className="text-sm text-red-500">{errors.staff_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Staff Number</label>
                <Input
                  placeholder="Enter staff number"
                  {...register('staff_number', { required: 'Staff number is required' })}
                  className={errors.staff_number ? 'border-red-500' : ''}
                />
                {errors.staff_number && (
                  <p className="text-sm text-red-500">{errors.staff_number.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Department</label>
                <Input
                  placeholder="Enter department"
                  {...register('department', { required: 'Department is required' })}
                  className={errors.department ? 'border-red-500' : ''}
                />
                {errors.department && (
                  <p className="text-sm text-red-500">{errors.department.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loan Details Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Loan Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Loan Amount (GHc) *</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  {...register('loan_amount_ghc', {
                    required: 'Loan amount is required',
                    min: { value: 0.01, message: 'Must be greater than 0' },
                  })}
                  className={errors.loan_amount_ghc ? 'border-red-500' : ''}
                />
                {errors.loan_amount_ghc && (
                  <p className="text-sm text-red-500">{errors.loan_amount_ghc.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recovery Period (Months) *</label>
                <Input
                  type="number"
                  placeholder="12"
                  min="1"
                  max="60"
                  {...register('recovery_period_months', {
                    required: 'Recovery period is required',
                    min: { value: 1, message: 'Must be at least 1 month' },
                    max: { value: 60, message: 'Maximum 60 months' },
                  })}
                  className={errors.recovery_period_months ? 'border-red-500' : ''}
                />
                {errors.recovery_period_months && (
                  <p className="text-sm text-red-500">{errors.recovery_period_months.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Annual Salary (GHc) *</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  {...register('annual_salary_ghc', {
                    required: 'Annual salary is required',
                    min: { value: 0.01, message: 'Must be greater than 0' },
                  })}
                  className={errors.annual_salary_ghc ? 'border-red-500' : ''}
                />
                {errors.annual_salary_ghc && (
                  <p className="text-sm text-red-500">{errors.annual_salary_ghc.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calculations Display */}
        {calculating && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4 flex items-center gap-2 text-amber-900">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating FD values...
            </CardContent>
          </Card>
        )}

        {calculations && !calculating && (
          <>
            {/* Affordability Alert */}
            {calculations.affordability_status === 'affordable' && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-900">Affordable</AlertTitle>
                <AlertDescription className="text-green-800">
                  Monthly repayment is {calculations.affordability_percentage.toFixed(2)}% of monthly salary. This FD request is sustainable.
                </AlertDescription>
              </Alert>
            )}

            {calculations.affordability_status === 'at_risk' && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-900">At Risk</AlertTitle>
                <AlertDescription className="text-amber-800">
                  Monthly repayment is {calculations.affordability_percentage.toFixed(2)}% of monthly salary. The repayment capacity is constrained and may need review.
                </AlertDescription>
              </Alert>
            )}

            {calculations.affordability_status === 'unaffordable' && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-900">Unaffordable</AlertTitle>
                <AlertDescription className="text-red-800">
                  Monthly repayment is {calculations.affordability_percentage.toFixed(2)}% of monthly salary. The staff may struggle with repayment. Consider reducing the amount or extending the period.
                </AlertDescription>
              </Alert>
            )}

            {/* Calculation Summary */}
            <Card className="border-blue-100 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">FD Calculation Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-sm text-gray-600">Monthly Repayment</p>
                    <p className="text-2xl font-bold text-blue-900">
                      GHc {calculations.monthly_repayment_amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-sm text-gray-600">Total Recovery Value</p>
                    <p className="text-2xl font-bold text-blue-900">
                      GHc {calculations.total_recovery_value.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-sm text-gray-600">Affordability Ratio</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {calculations.affordability_percentage.toFixed(2)}%
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-sm text-gray-600">Status</p>
                    <div className="mt-2">
                      <Badge
                        variant={
                          calculations.affordability_status === 'affordable'
                            ? 'default'
                            : calculations.affordability_status === 'at_risk'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {calculations.affordability_status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Full Memo */}
                <div className="bg-white p-3 rounded border border-blue-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Calculation Memo:</p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                    {calculations.calculation_memo}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Supporting Documents and Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Supporting Documents URL</label>
              <Input
                placeholder="https://example.com/documents"
                type="url"
                {...register('supporting_docs_url')}
              />
              <p className="text-xs text-gray-500">Link to supporting documents (optional)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Submission Memo / Notes</label>
              <Textarea
                placeholder="Add any additional notes or memo for Accounts Executive review..."
                {...register('submission_memo')}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={loading || !calculations?.is_valid}
            className="flex-1"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Submitting...' : 'Submit FD Request to Accounts Executive'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset()
              setCalculations(null)
              setSubmitted(false)
            }}
          >
            Reset Form
          </Button>
        </div>
      </form>
    </div>
  )
}
