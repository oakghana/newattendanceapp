'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { FDCalculationSummary } from './fd-calculation-summary'

interface FormData {
  staff_id: string
  loan_amount: string
  recovery_period_months: string
  annual_salary: string
  notes: string
}

interface StaffMember {
  id: string
  full_name: string
  employee_id: string
  department_name: string
  position: string
}

interface CalculationResult {
  monthly_repayment_amount: number
  total_recovery_value: number
  repayment_percentage: number
  is_affordable: boolean
  affordability_status: string
  calculation_memo: string
}

export function FDEntryForm({ onSubmit }: { onSubmit?: (data: any) => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [calculation, setCalculation] = useState<CalculationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const { toast } = useToast()
  const { register, watch, setValue, formState: { isValid }, reset } = useForm<FormData>({
    defaultValues: {
      staff_id: '',
      loan_amount: '',
      recovery_period_months: '',
      annual_salary: '',
      notes: '',
    },
  })

  const loanAmount = watch('loan_amount')
  const recoveryMonths = watch('recovery_period_months')
  const annualSalary = watch('annual_salary')
  const staffId = watch('staff_id')

  // Load staff members
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await fetch('/api/staff/list')
        const data = await res.json()
        if (data.success) {
          setStaff(data.staff || [])
        }
      } catch (error) {
        console.error('[v0] Error loading staff:', error)
        toast({
          title: 'Error',
          description: 'Failed to load staff list',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStaff()
  }, [toast])

  // Auto-calculate when values change
  useEffect(() => {
    if (!loanAmount || !recoveryMonths || !annualSalary) {
      setCalculation(null)
      return
    }

    calculateFD()
  }, [loanAmount, recoveryMonths, annualSalary])

  const calculateFD = async () => {
    try {
      setCalculating(true)
      const res = await fetch('/api/loan/fd-review/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: parseFloat(loanAmount),
          recovery_period_months: parseInt(recoveryMonths),
          annual_salary: parseFloat(annualSalary),
          staff_id: staffId,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setCalculation(data.calculations)
      } else {
        toast({
          title: 'Calculation Error',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('[v0] Calculation error:', error)
      toast({
        title: 'Error',
        description: 'Failed to calculate FD values',
        variant: 'destructive',
      })
    } finally {
      setCalculating(false)
    }
  }

  const handleStaffSelect = (staffId: string) => {
    const selected = staff.find(s => s.id === staffId)
    setSelectedStaff(selected || null)
    setValue('staff_id', staffId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!loanAmount || !recoveryMonths || !annualSalary || !staffId) {
      toast({
        title: 'Validation Error',
        description: 'All fields are required',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)

      // Here you would submit to the backend to create the FD request
      if (onSubmit) {
        await onSubmit({
          staff_id: staffId,
          loan_amount: parseFloat(loanAmount),
          recovery_period_months: parseInt(recoveryMonths),
          annual_salary: parseFloat(annualSalary),
          calculation_memo: calculation?.calculation_memo,
          notes: watch('notes'),
        })
      }

      toast({
        title: 'Success',
        description: 'FD request submitted successfully',
      })
      reset()
      setCalculation(null)
      setSelectedStaff(null)
    } catch (error) {
      console.error('[v0] Submission error:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit FD request',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fixed Deposit (FD) Entry Form</CardTitle>
          <CardDescription>
            Enter FD information to calculate monthly repayment and verify affordability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Staff Selection */}
            <div className="space-y-2">
              <Label htmlFor="staff-select">Staff Member</Label>
              <Select value={staffId} onValueChange={handleStaffSelect}>
                <SelectTrigger id="staff-select">
                  <SelectValue placeholder="Search and select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} ({s.employee_id}) - {s.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStaff && (
                <div className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded">
                  <div>Department: {selectedStaff.department_name}</div>
                  <div>Position: {selectedStaff.position}</div>
                </div>
              )}
            </div>

            {/* Loan Amount */}
            <div className="space-y-2">
              <Label htmlFor="loan-amount">Loan Amount (GHc)</Label>
              <Input
                id="loan-amount"
                type="number"
                step="0.01"
                placeholder="Enter loan amount"
                {...register('loan_amount', { required: true })}
              />
            </div>

            {/* Recovery Period */}
            <div className="space-y-2">
              <Label htmlFor="recovery-months">Recovery Period (Months)</Label>
              <Input
                id="recovery-months"
                type="number"
                placeholder="Enter recovery period in months"
                {...register('recovery_period_months', { required: true })}
              />
            </div>

            {/* Annual Salary */}
            <div className="space-y-2">
              <Label htmlFor="annual-salary">Annual Salary (GHc)</Label>
              <Input
                id="annual-salary"
                type="number"
                step="0.01"
                placeholder="Enter annual salary"
                {...register('annual_salary', { required: true })}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes or requirements..."
                {...register('notes')}
              />
            </div>

            {/* Calculation Results */}
            {calculation && (
              <FDCalculationSummary calculation={calculation} />
            )}

            {/* Affordability Warning */}
            {calculation && !calculation.is_affordable && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Monthly repayment ({calculation.repayment_percentage.toFixed(2)}% of salary) exceeds
                  30% threshold. Consider reducing the loan amount or extending the recovery period.
                </AlertDescription>
              </Alert>
            )}

            {/* Affordability Success */}
            {calculation && calculation.is_affordable && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Affordability check passed. Monthly repayment is within acceptable limits.
                </AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={submitting || !staffId || !loanAmount || !recoveryMonths || !annualSalary}
              className="w-full"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit FD Request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
