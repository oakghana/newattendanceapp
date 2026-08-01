'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle2, AlertTriangle, Calculator, ChevronDown, ChevronUp, User, Banknote, DollarSign, FileText, CheckSquare } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  calculateFD,
  validateFDInput,
  type FDCalculationInput,
  type FDCalculationResult,
  type OutstandingLoans,
  OUTSTANDING_LOAN_LABELS,
} from '@/lib/fd-calculator'

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
  fd_score?: number
  fd_note?: string
}

interface FDCalculationSubmissionProps {
  loanRequest: LoanRequest
  onSubmitComplete?: () => void
}

const GHC = (n: number) =>
  `GH\u00a2 ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function FDCalculationSubmission({ loanRequest, onSubmitComplete }: FDCalculationSubmissionProps) {
  const { toast } = useToast()
  const [fdTab, setFdTab] = useState('salary')
  const [calculating, setCalculating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<FDCalculationResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [outstandingOpen, setOutstandingOpen] = useState(false)
  const [accountsNotes, setAccountsNotes] = useState('')

  const [salaryPerAnnum, setSalaryPerAnnum] = useState('')
  const [otherAllowances, setOtherAllowances] = useState('')
  const [grossDeduction, setGrossDeduction] = useState(
    loanRequest.monthly_deduction != null ? String(loanRequest.monthly_deduction) : ''
  )
  const [outstanding, setOutstanding] = useState<Partial<Record<keyof OutstandingLoans, string>>>({})

  const setOutstandingField = (key: keyof OutstandingLoans, value: string) =>
    setOutstanding(prev => ({ ...prev, [key]: value }))

  const parsedOutstanding: OutstandingLoans = Object.fromEntries(
    Object.entries(outstanding)
      .map(([k, v]) => [k, parseFloat(v as string) || 0])
      .filter(([, v]) => (v as number) > 0)
  ) as OutstandingLoans

  const handleCalculate = () => {
    setCalculating(true)
    setErrors([])
    setResult(null)
    try {
      const input: FDCalculationInput = {
        staffNumber: loanRequest.staff_number,
        staffName: loanRequest.staff_full_name,
        salary_per_annum: parseFloat(salaryPerAnnum) || 0,
        other_allowances_monthly: parseFloat(otherAllowances) || 0,
        gross_deduction_monthly: parseFloat(grossDeduction) || 0,
        requested_loan_amount: loanRequest.requested_amount,
        recovery_period_months: loanRequest.repayment_duration_months,
        loan_type: loanRequest.loan_type_label,
        outstanding_loans: parsedOutstanding,
      }
      const validationErrors = validateFDInput(input)
      if (validationErrors.length > 0) { setErrors(validationErrors); return }
      const calc = calculateFD(input)
      setResult(calc)
      toast({ title: 'FD Calculated', description: `Score: ${calc.fd_score}/100 — ${calc.fd_good ? 'GOOD' : 'POOR'}` })
    } finally {
      setCalculating(false)
    }
  }

  const handleSubmit = async () => {
    if (!result) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/loan/fd-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: loanRequest.id,
          fd_score: result.fd_score,
          fd_good: result.fd_good,
          accounts_notes: accountsNotes,
          submission_type: 'automated_calculation',
          fd_calculation_data: {
            salary_per_annum: result.salary_per_annum,
            consolidated_salary_per_month: result.consolidated_salary_per_month,
            other_allowances: result.other_allowances_per_month,
            gross_salary_monthly: result.gross_salary_per_month,
            gross_deductions_monthly: result.gross_deduction_monthly,
            loan_installment_monthly: result.loan_installment_monthly,
            total_deductions_monthly: result.total_deduction_monthly,
            net_salary_monthly: result.net_salary_monthly,
            half_gross_monthly: result.half_gross_salary_per_month,
            net_to_gross_ratio: result.net_to_gross_ratio,
            total_outstanding_loans: result.total_outstanding,
            outstanding_loans: parsedOutstanding,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'FD Submitted', description: `Score ${result.fd_score}/100 forwarded to Accounts review` })
        setResult(null); setSalaryPerAnnum(''); setOtherAllowances('')
        setGrossDeduction(''); setOutstanding({}); setAccountsNotes('')
        onSubmitComplete?.()
      } else {
        toast({ title: 'Submit Failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network Error', description: 'Could not reach server', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const isGood = result?.fd_good ?? false

  const isEditMode = loanRequest.fd_calculated && loanRequest.fd_score

  return (
    <div className="space-y-4">
      {/* Loan Summary */}
      <Card className={isEditMode ? "border-purple-200 bg-purple-50/40" : "border-border"}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{loanRequest.staff_full_name}</CardTitle>
                  {isEditMode && (
                    <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                      Edit Mode
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Staff No: {loanRequest.staff_number} &bull; {loanRequest.request_number}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{GHC(loanRequest.requested_amount)}</p>
              <p className="text-xs text-muted-foreground">
                {loanRequest.repayment_duration_months} months &bull; {loanRequest.loan_type_label}
              </p>
              {isEditMode && (
                <p className="text-xs font-semibold text-purple-700 mt-1">
                  Current Score: {loanRequest.fd_score}/100
                </p>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* FD Calculation Tabs */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">FD Calculation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={fdTab} onValueChange={setFdTab} className="w-full" orientation="vertical">
            <TabsList className="w-full justify-start h-auto rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="salary" className="rounded-none border-b-2 data-[state=active]:border-primary px-4 py-2 text-xs">
                <DollarSign className="h-3.5 w-3.5 mr-2" /> Salary Info
              </TabsTrigger>
              <TabsTrigger value="outstanding" className="rounded-none border-b-2 data-[state=active]:border-primary px-4 py-2 text-xs">
                <FileText className="h-3.5 w-3.5 mr-2" /> Outstanding Loans
              </TabsTrigger>
              {result && (
                <TabsTrigger value="results" className="rounded-none border-b-2 data-[state=active]:border-primary px-4 py-2 text-xs">
                  <CheckSquare className="h-3.5 w-3.5 mr-2" /> Results
                </TabsTrigger>
              )}
            </TabsList>

            {/* Tab 1: Salary Information */}
            <TabsContent value="salary" className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fd-salary" className="text-xs">
                    Salary Per Annum (GH&cent;) <span className="text-destructive">*</span>
                  </Label>
                  <Input id="fd-salary" type="number" min={0} step="0.01" placeholder="e.g. 125831.00"
                    value={salaryPerAnnum} onChange={e => setSalaryPerAnnum(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-allowances" className="text-xs">Other Monthly Allowances (GH&cent;)</Label>
                  <Input id="fd-allowances" type="number" min={0} step="0.01" placeholder="e.g. 4318.39"
                    value={otherAllowances} onChange={e => setOtherAllowances(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-deductions" className="text-xs">Existing Gross Deductions / Month (GH&cent;)</Label>
                  <Input id="fd-deductions" type="number" min={0} step="0.01" placeholder="e.g. 6698.08"
                    value={grossDeduction} onChange={e => setGrossDeduction(e.target.value)} />
                </div>
              </div>

              {errors.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 space-y-1">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {e}
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleCalculate} disabled={calculating || !salaryPerAnnum} className="w-full">
                <Calculator className="h-4 w-4 mr-2" />
                {calculating ? 'Calculating...' : 'Calculate FD Score'}
              </Button>
            </TabsContent>

            {/* Tab 2: Outstanding Loans */}
            <TabsContent value="outstanding" className="space-y-3 p-4">
              <div className="border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOutstandingOpen(p => !p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {outstandingOpen ? 'Hide Loans' : 'Show All Available Loans'}
                  {outstandingOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {outstandingOpen && (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-muted/20">
                    {(Object.keys(OUTSTANDING_LOAN_LABELS) as Array<keyof OutstandingLoans>).map(key => (
                      <div key={key} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground leading-tight block">
                          {OUTSTANDING_LOAN_LABELS[key]}
                        </Label>
                        <Input type="number" min={0} step="0.01" placeholder="0.00"
                          value={outstanding[key] ?? ''}
                          onChange={e => setOutstandingField(key, e.target.value)}
                          className="h-7 text-xs" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Enter any outstanding loan balances that apply to this staff member</p>
            </TabsContent>

            {/* Tab 3: Results */}
            {result && (
              <TabsContent value="results" className={`space-y-4 p-4 rounded-md ${isGood ? 'border border-green-300 bg-green-50/40' : 'border border-amber-300 bg-amber-50/40'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isGood
                      ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    <div>
                      <p className={`text-sm font-semibold ${isGood ? 'text-green-900' : 'text-amber-900'}`}>
                        {isGood ? 'Good Financial Standing' : 'Financial Standing Needs Review'}
                      </p>
                      <p className={`text-xs ${isGood ? 'text-green-700' : 'text-amber-700'}`}>
                        {isGood
                          ? `Net salary exceeds half gross`
                          : `Net salary is below half gross`}
                      </p>
                    </div>
                  </div>
                  <Badge className={`text-lg px-3 py-1 ${isGood ? 'bg-green-600' : 'bg-amber-500'}`}>
                    {result.fd_score}/100
                  </Badge>
                </div>

                {/* Financial Breakdown Table */}
                <div className="rounded-md border bg-background overflow-hidden text-sm">
                  <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Financial Breakdown
                  </div>
                  {([
                    ['Salary Per Annum', GHC(result.salary_per_annum), false],
                    ['Consolidated Monthly Salary', GHC(result.consolidated_salary_per_month), false],
                    ['Other Monthly Allowances', GHC(result.other_allowances_per_month), false],
                    ['Gross Monthly Salary', GHC(result.gross_salary_per_month), true],
                  ] as [string, string, boolean][]).map(([label, value, bold]) => (
                    <div key={label} className="flex justify-between items-center px-3 py-2 border-b last:border-0">
                      <span className={`text-xs ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                      <span className={`text-xs ${bold ? 'font-semibold' : ''}`}>{value}</span>
                    </div>
                  ))}
                  <Separator />
                  {([
                    ['Existing Gross Deductions', GHC(result.gross_deduction_monthly), false],
                    ['Approx. Loan Installment', GHC(result.loan_installment_monthly), false],
                    ['Total Deduction', GHC(result.total_deduction_monthly), true],
                  ] as [string, string, boolean][]).map(([label, value, bold]) => (
                    <div key={label} className="flex justify-between items-center px-3 py-2 border-b last:border-0">
                      <span className={`text-xs ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                      <span className={`text-xs text-red-600 ${bold ? 'font-semibold' : ''}`}>{value}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between items-center px-3 py-2 border-b">
                    <span className="text-xs font-bold">Net Monthly Salary</span>
                    <span className={`text-xs font-bold ${isGood ? 'text-green-600' : 'text-amber-600'}`}>
                      {GHC(result.net_salary_monthly)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2 border-b">
                    <span className="text-xs text-muted-foreground">1/2 of Gross Monthly Salary</span>
                    <span className="text-xs">{GHC(result.half_gross_salary_per_month)}</span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2 border-b">
                    <span className="text-xs text-muted-foreground">Net to Gross Ratio</span>
                    <span className="text-xs font-medium">{result.net_to_gross_ratio.toFixed(2)}%</span>
                  </div>
                  {result.total_outstanding > 0 && (
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground">Total Balance Outstanding</span>
                      <span className="text-xs font-medium">{GHC(result.total_outstanding)}</span>
                    </div>
                  )}
                </div>

                {/* Accounts Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="fd-accounts-notes" className="text-xs">
                    Accounts Manager&apos;s Remarks (optional)
                  </Label>
                  <Textarea id="fd-accounts-notes" placeholder="Add remarks or observations..."
                    value={accountsNotes} onChange={e => setAccountsNotes(e.target.value)}
                    className="min-h-[64px] text-sm" />
                </div>

                <Button onClick={handleSubmit} disabled={submitting} size="lg" className="w-full">
                  {submitting ? 'Submitting...' : 'Submit FD to Accounts Review'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  No attachment required — calculation is automatically captured and recorded
                </p>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
