'use client'

import { useState, useEffect } from 'react'
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
  fd_good?: boolean | null
}

interface FDCalculationSubmissionProps {
  loanRequest: LoanRequest
  onSubmitComplete?: () => void
  /** When true, show correction UI for pending AE queue (never approve). */
  allowPendingCorrection?: boolean
}

/** Statuses where Accounts Loan Office may still correct FD before AE decision. */
const FD_EDITABLE_STATUSES = new Set([
  'pending_accounts_fd_review',
  'fd_review_pending',
  'sent_to_accounts',
  'rejected_fd',
  'fd_rejected',
])

const GHC = (n: number) =>
  `GH\u00a2 ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function FDCalculationSubmission({
  loanRequest,
  onSubmitComplete,
  allowPendingCorrection = false,
}: FDCalculationSubmissionProps) {
  const { toast } = useToast()
  const [fdTab, setFdTab] = useState('salary')
  const [calculating, setCalculating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<FDCalculationResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [outstandingOpen, setOutstandingOpen] = useState(false)
  const [accountsNotes, setAccountsNotes] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [manualScoreOverride, setManualScoreOverride] = useState('')
  const [isSentForApproval, setIsSentForApproval] = useState(
    Boolean(loanRequest.fd_score != null && FD_EDITABLE_STATUSES.has(String(loanRequest.status || ''))),
  )

  const [salaryPerAnnum, setSalaryPerAnnum] = useState('')
  const [consolidatedMonthly, setConsolidatedMonthly] = useState('')
  const [otherAllowances, setOtherAllowances] = useState('')
  const [grossDeduction, setGrossDeduction] = useState(
    loanRequest.monthly_deduction != null ? String(loanRequest.monthly_deduction) : ''
  )
  const [recoveryPeriodMonths, setRecoveryPeriodMonths] = useState(
    loanRequest.repayment_duration_months != null && loanRequest.repayment_duration_months > 0
      ? String(loanRequest.repayment_duration_months)
      : ''
  )
  const [outstanding, setOutstanding] = useState<Partial<Record<keyof OutstandingLoans, string>>>({})

  const setOutstandingField = (key: keyof OutstandingLoans, value: string) =>
    setOutstanding(prev => ({ ...prev, [key]: value }))

  const parsedOutstanding: OutstandingLoans = Object.fromEntries(
    Object.entries(outstanding)
      .map(([k, v]) => [k, parseFloat(v as string) || 0])
      .filter(([, v]) => (v as number) > 0)
  ) as OutstandingLoans

  const statusKey = String(loanRequest.status || '')
  const hasExistingFd = Boolean(loanRequest.fd_calculated || loanRequest.fd_score != null)
  const canCorrectPending =
    allowPendingCorrection &&
    hasExistingFd &&
    (FD_EDITABLE_STATUSES.has(statusKey) || !statusKey)
  const isLockedAfterAe =
    hasExistingFd &&
    !FD_EDITABLE_STATUSES.has(statusKey) &&
    !['', 'hod_approved'].includes(statusKey)
  const isEditMode = Boolean(canCorrectPending)

  const derivedConsolidated =
    parseFloat(salaryPerAnnum) > 0 ? parseFloat(salaryPerAnnum) / 12 : 0
  const effectiveConsolidated =
    parseFloat(consolidatedMonthly) > 0 ? parseFloat(consolidatedMonthly) : derivedConsolidated
  const recoveryMonthsNum = parseFloat(recoveryPeriodMonths) || 0
  const installmentPreview =
    recoveryMonthsNum > 0 && loanRequest.requested_amount > 0
      ? loanRequest.requested_amount / recoveryMonthsNum
      : 0

  const buildFdInput = (): FDCalculationInput => ({
    staffNumber: loanRequest.staff_number,
    staffName: loanRequest.staff_full_name,
    salary_per_annum: parseFloat(salaryPerAnnum) || 0,
    consolidated_salary_per_month:
      parseFloat(consolidatedMonthly) > 0 ? parseFloat(consolidatedMonthly) : undefined,
    other_allowances_monthly: parseFloat(otherAllowances) || 0,
    gross_deduction_monthly: parseFloat(grossDeduction) || 0,
    requested_loan_amount: loanRequest.requested_amount,
    recovery_period_months: recoveryMonthsNum || loanRequest.repayment_duration_months || 0,
    loan_type: loanRequest.loan_type_label,
    outstanding_loans: parsedOutstanding,
  })

  // Auto-recalculate FD when any field changes (real-time calculation)
  useEffect(() => {
    const autoRecalculate = () => {
      if (!salaryPerAnnum && !otherAllowances && !grossDeduction && Object.keys(outstanding).length === 0) {
        return // Don't calculate with empty fields
      }

      setErrors([])
      try {
        const input = buildFdInput()
        const validationErrors = validateFDInput(input)
        if (validationErrors.length === 0) {
          const calc = calculateFD(input)
          setResult(calc)
        }
      } catch (err) {
        console.error('[v0] FD auto-calculation error:', err)
      }
    }

    // Debounce auto-calculation to avoid excessive re-renders
    const timer = setTimeout(autoRecalculate, 500)
    return () => clearTimeout(timer)
  }, [salaryPerAnnum, consolidatedMonthly, otherAllowances, grossDeduction, recoveryPeriodMonths, outstanding, loanRequest])

  const handleCalculate = () => {
    setCalculating(true)
    setErrors([])
    setResult(null)
    try {
      const input = buildFdInput()
      const validationErrors = validateFDInput(input)
      if (validationErrors.length > 0) { setErrors(validationErrors); return }
      const calc = calculateFD(input)
      setResult(calc)
      toast({
        title: 'FD Calculated',
        description: `Score: ${calc.fd_score}% (Net/Gross) — ${calc.fd_good ? 'GOOD standing' : 'Below half-gross'}`,
      })
    } finally {
      setCalculating(false)
    }
  }

  const handleSubmit = async () => {
    if (!result) return
    if (isLockedAfterAe) {
      toast({
        title: 'Locked',
        description: 'This FD was already decided by Accounts Executive and can no longer be edited.',
        variant: 'destructive',
      })
      return
    }
    if (isEditMode && !correctionReason.trim()) {
      toast({
        title: 'Correction reason required',
        description: 'Explain what was wrong and why values were adjusted before re-submitting.',
        variant: 'destructive',
      })
      return
    }

    const overrideRaw = manualScoreOverride.trim()
    const overrideScore = overrideRaw === '' ? null : Number(overrideRaw)
    if (overrideRaw !== '' && (!Number.isFinite(overrideScore) || (overrideScore as number) < 0 || (overrideScore as number) > 100)) {
      toast({ title: 'Invalid override', description: 'FD score override must be between 0 and 100.', variant: 'destructive' })
      return
    }

    const finalScore = overrideScore != null ? Math.round(overrideScore as number) : result.fd_score
    const finalGood = finalScore >= 39
    const adjusted = overrideScore != null && Math.round(overrideScore as number) !== result.fd_score

    setSubmitting(true)
    try {
      const notesPayload = [
        accountsNotes.trim(),
        isEditMode ? `CORRECTION REASON: ${correctionReason.trim()}` : '',
        adjusted ? `SCORE OVERRIDE: auto-calc ${result.fd_score}% → adjusted ${finalScore}%` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const res = await fetch('/api/loan/fd-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: loanRequest.id,
          fd_score: finalScore,
          fd_good: finalGood,
          accounts_notes: notesPayload,
          correction_reason: isEditMode ? correctionReason.trim() : undefined,
          is_correction: Boolean(isEditMode),
          submission_type: 'automated_calculation',
          fd_calculation_data: {
            salary_per_annum: result.salary_per_annum,
            consolidated_salary_per_month: result.consolidated_salary_per_month,
            recovery_period_months: result.recovery_period_months,
            other_allowances: result.other_allowances_per_month,
            gross_salary_monthly: result.gross_salary_per_month,
            gross_deductions_monthly: result.gross_deduction_monthly,
            loan_installment_monthly: result.loan_installment_monthly,
            total_deductions_monthly: result.total_deduction_monthly,
            net_salary_monthly: result.net_salary_monthly,
            half_gross_monthly: result.half_gross_salary_per_month,
            net_to_gross_ratio: result.net_to_gross_ratio,
            net_to_gross_fraction: result.net_to_gross_fraction,
            total_outstanding_loans: result.total_outstanding,
            total_loan_exposure: result.total_loan_exposure,
            outstanding_loans: parsedOutstanding,
            auto_calculated_score: result.fd_score,
            score_override: adjusted ? finalScore : null,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({
          title: isEditMode ? 'FD Correction Saved' : 'FD Submitted',
          description: `Score ${finalScore}% ${isEditMode ? 'updated for' : 'forwarded to'} Accounts Executive review. You cannot approve.`,
        })
        setIsSentForApproval(true)
        setCorrectionReason('')
        setManualScoreOverride('')
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

  const handleSendForApproval = async () => {
    if (!result) return
    setSending(true)
    try {
      const res = await fetch('/api/loan/fd-send-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_request_id: loanRequest.id,
          fd_score: result.fd_score,
          fd_good: result.fd_good,
          fd_calculation_data: {
            salary_per_annum: result.salary_per_annum,
            consolidated_salary_per_month: result.consolidated_salary_per_month,
            recovery_period_months: result.recovery_period_months,
            other_allowances: result.other_allowances_per_month,
            gross_salary_monthly: result.gross_salary_per_month,
            gross_deductions_monthly: result.gross_deduction_monthly,
            loan_installment_monthly: result.loan_installment_monthly,
            total_deductions_monthly: result.total_deduction_monthly,
            net_salary_monthly: result.net_salary_monthly,
            half_gross_monthly: result.half_gross_salary_per_month,
            net_to_gross_ratio: result.net_to_gross_ratio,
            net_to_gross_fraction: result.net_to_gross_fraction,
            total_outstanding_loans: result.total_outstanding,
            total_loan_exposure: result.total_loan_exposure,
            outstanding_loans: parsedOutstanding,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'Sent for Approval', description: `FD Score ${result.fd_score}/100 sent to Accounts Executive` })
        setIsSentForApproval(true)
      } else {
        toast({ title: 'Send Failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Network Error', description: 'Could not reach server', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const isGood = result?.fd_good ?? false

  if (isLockedAfterAe && allowPendingCorrection) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">{loanRequest.staff_full_name}</p>
          <p className="text-xs mt-1">
            FD score {loanRequest.fd_score ?? 'N/A'}% is locked (status: {statusKey || 'n/a'}).
            Accounts Loan Office can only correct values before Accounts Executive approval.
          </p>
        </CardContent>
      </Card>
    )
  }

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
                      Correction mode (no approve)
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
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
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

            {/* Tab 1: Salary Information — matches FD-HANA Excel rows */}
            <TabsContent value="salary" className="space-y-3 p-4">
              <p className="text-[11px] text-muted-foreground">
                Excel formula: Consolidated = Annual ÷ 12 · Gross = Consolidated + Allowances · Installment = Loan ÷ Recovery Period ·
                FD% = Net ÷ Gross
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fd-salary" className="text-xs">
                    Salary Per Annum (GH&cent;) <span className="text-destructive">*</span>
                  </Label>
                  <Input id="fd-salary" type="number" min={0} step="0.01" placeholder="e.g. 135263.23"
                    value={salaryPerAnnum} onChange={e => setSalaryPerAnnum(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-consolidated" className="text-xs">
                    Consolidated Salary / Month (GH&cent;)
                  </Label>
                  <Input
                    id="fd-consolidated"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={derivedConsolidated > 0 ? derivedConsolidated.toFixed(2) : 'Annual ÷ 12'}
                    value={consolidatedMonthly}
                    onChange={e => setConsolidatedMonthly(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Auto: {derivedConsolidated > 0 ? GHC(derivedConsolidated) : '—'} (override only if payroll differs)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-recovery" className="text-xs">
                    Recovery Period (months) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="fd-recovery"
                    type="number"
                    min={1}
                    max={240}
                    step={1}
                    placeholder="e.g. 120"
                    value={recoveryPeriodMonths}
                    onChange={e => setRecoveryPeriodMonths(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Approx. installment: {installmentPreview > 0 ? GHC(installmentPreview) : '—'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-allowances" className="text-xs">Other Monthly Allowances (GH&cent;)</Label>
                  <Input id="fd-allowances" type="number" min={0} step="0.01" placeholder="e.g. 6143.33"
                    value={otherAllowances} onChange={e => setOtherAllowances(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fd-deductions" className="text-xs">Existing Gross Deductions / Month (GH&cent;)</Label>
                  <Input id="fd-deductions" type="number" min={0} step="0.01" placeholder="e.g. 9073.43"
                    value={grossDeduction} onChange={e => setGrossDeduction(e.target.value)} />
                </div>
                <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Live gross (preview)</p>
                  <p className="text-sm font-semibold">
                    {effectiveConsolidated > 0
                      ? GHC(effectiveConsolidated + (parseFloat(otherAllowances) || 0))
                      : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Consolidated + allowances</p>
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

              <Button
                onClick={handleCalculate}
                disabled={calculating || !salaryPerAnnum || !recoveryPeriodMonths}
                className="w-full"
              >
                <Calculator className="h-4 w-4 mr-2" />
                {calculating ? 'Calculating...' : 'Calculate FD Score'}
              </Button>
            </TabsContent>

            {/* Tab 2: Outstanding Loans */}
            <TabsContent value="outstanding" className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground mb-3">Enter any outstanding loan balances that apply to this staff member. Leave blank if none apply.</p>
              
              <div className="border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOutstandingOpen(p => !p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <span>{outstandingOpen ? 'Hide' : 'Show'} All {Object.keys(OUTSTANDING_LOAN_LABELS).length} Available Loan Types</span>
                  {outstandingOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {outstandingOpen && (
                  <div className="bg-muted/20 p-4 max-h-96 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(Object.keys(OUTSTANDING_LOAN_LABELS) as Array<keyof OutstandingLoans>).map(key => (
                        <div key={key} className="space-y-1.5 p-2 rounded border border-border/40 bg-background/50 hover:bg-background transition-colors">
                          <Label className="text-[11px] text-muted-foreground leading-tight block font-medium">
                            {OUTSTANDING_LOAN_LABELS[key]}
                          </Label>
                          <Input 
                            type="number" 
                            min={0} 
                            step="0.01" 
                            placeholder="0.00"
                            value={outstanding[key] ?? ''}
                            onChange={e => setOutstandingField(key, e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                    ['Recovery Period', `${result.recovery_period_months} months`, false],
                  ] as [string, string, boolean][]).map(([label, value, bold]) => (
                    <div key={label} className="flex justify-between items-center px-3 py-2 border-b last:border-0">
                      <span className={`text-xs ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                      <span className={`text-xs ${bold ? 'font-semibold' : ''}`}>{value}</span>
                    </div>
                  ))}
                  <Separator />
                  {([
                    ['Existing Gross Deductions', GHC(result.gross_deduction_monthly), false],
                    ['Approx. Loan Installment (Loan ÷ Recovery)', GHC(result.loan_installment_monthly), false],
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
                    <span className="text-xs text-muted-foreground">Percentage of Net Salary to Gross Salary</span>
                    <span className="text-xs font-medium">
                      {(result.net_to_gross_fraction * 100).toFixed(2)}% → score {result.fd_score}%
                    </span>
                  </div>
                  {result.total_outstanding > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 border-b">
                      <span className="text-xs text-muted-foreground">Total Balance Outstanding</span>
                      <span className="text-xs font-medium">{GHC(result.total_outstanding)}</span>
                    </div>
                  )}
                  {result.total_loan_exposure > 0 && (
                    <div className="flex justify-between items-center px-3 py-2 border-b">
                      <span className="text-xs text-muted-foreground">Loan + Outstanding Exposure</span>
                      <span className="text-xs font-medium">{GHC(result.total_loan_exposure)}</span>
                    </div>
                  )}
                </div>

                {/* Outstanding Loans Breakdown */}
                {Object.keys(parsedOutstanding).length > 0 && (
                  <div className="border rounded-md bg-amber-50 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-900">Outstanding Loans Breakdown</div>
                    <div className="space-y-1">
                      {(Object.entries(parsedOutstanding) as [keyof OutstandingLoans, number][]).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center text-xs">
                          <span className="text-amber-700">{OUTSTANDING_LOAN_LABELS[key]}</span>
                          <span className="font-medium text-amber-900">{GHC(value)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-amber-200 pt-1 flex justify-between items-center font-semibold text-xs">
                      <span>Total</span>
                      <span className="text-amber-900">{GHC(result.total_outstanding)}</span>
                    </div>
                  </div>
                )}

                {/* Accounts Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="fd-accounts-notes" className="text-xs">
                    Accounts Loan Office Remarks (optional)
                  </Label>
                  <Textarea id="fd-accounts-notes" placeholder="Add remarks or observations..."
                    value={accountsNotes} onChange={e => setAccountsNotes(e.target.value)}
                    className="min-h-[64px] text-sm" />
                </div>

                {isEditMode && (
                  <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/60 p-3">
                    <p className="text-xs text-purple-900 font-medium">
                      Correction before Accounts Executive approval only. You cannot approve this FD.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="fd-score-override" className="text-xs">
                        Adjust FD score (%) if auto-calc is wrong (optional)
                      </Label>
                      <Input
                        id="fd-score-override"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        placeholder={`Auto: ${result.fd_score}`}
                        value={manualScoreOverride}
                        onChange={(e) => setManualScoreOverride(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fd-correction-reason" className="text-xs">
                        Correction reason <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="fd-correction-reason"
                        placeholder="e.g. Wrong allowance figure entered; corrected gross deductions..."
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        className="min-h-[64px] text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Button onClick={handleSubmit} disabled={submitting || isLockedAfterAe} size="lg" className="w-full">
                    {submitting
                      ? (isEditMode ? 'Saving correction...' : 'Submitting...')
                      : (isEditMode ? 'Save FD Correction (no approve)' : 'Submit FD to Accounts Review')}
                  </Button>
                  
                  {!isEditMode && !isSentForApproval && (
                    <Button 
                      onClick={handleSendForApproval} 
                      disabled={sending || isSentForApproval} 
                      size="lg" 
                      variant="outline"
                      className="w-full border-green-300 text-green-700 hover:bg-green-50"
                    >
                      {sending ? 'Sending...' : '✓ Send for Approval'}
                    </Button>
                  )}
                  
                  {(isSentForApproval || isEditMode) && (
                    <div className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-center text-amber-800 font-medium">
                      Awaiting Accounts Executive decision — Loan Office cannot approve
                    </div>
                  )}
                </div>
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
