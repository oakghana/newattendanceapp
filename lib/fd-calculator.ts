/**
 * FD (Financial Due Diligence) Calculator
 * Implements the QCC Financial Standing formula from the FD-HANA Excel template.
 *
 * Formula (per the Excel template):
 *   Consolidated Monthly Salary  = Salary Per Annum / 12
 *   Gross Monthly Salary         = Consolidated Monthly Salary + Other Allowances
 *   Approx. Loan Installment     = Loan Amount / Recovery Period (months)
 *   Total Deduction              = Gross Deduction (existing) + Loan Installment
 *   Net Salary                   = Gross Monthly Salary - Total Deduction
 *   1/2 Gross Monthly            = Gross Monthly Salary / 2
 *   FD Good                      = Net Salary > 1/2 Gross Monthly Salary
 *   Percentage of Net to Gross   = Net Salary / Gross Monthly Salary
 *   FD Score (%)                 = round(Percentage × 100)
 *
 * Outstanding balances are recorded for exposure / "Loan Required" total but do NOT
 * change net salary (existing monthly burden is already in Gross Deduction).
 *
 * Verified against FD-HANA Sheet2 (TWUM CASTRO): 42.97% → 43%
 * and Sheet1 (AHULU): 50.41% → 50%
 */

export interface OutstandingLoans {
  car_deposit?: number
  consumer_item_nat_welf?: number
  motor_cycle_loan?: number
  motor_cycle_loan_interest?: number
  rent_advance?: number
  rent_loan?: number
  rent_staff_quarters?: number
  funeral_loan?: number
  repair_loan?: number
  motor_vehicle_loan?: number
  two_month_salary_advance?: number
  accounts_welfare?: number
  ched_welfare_scheme?: number
  special_advance?: number
  household_durables?: number
  homeownership_loan?: number
  student_loan_trust_fund?: number
  insurance_loan?: number
  educational_loan?: number
  transport_welfare_loan?: number
  car_repairs?: number
  liberty_trust?: number
  scf_skyview_reality?: number
  syndicated_capital?: number
  cocobod_employees_loan?: number
  ched_welfare_scheme_loan?: number
  qcc_welfare_scheme_loan?: number
  scf_crig_coop_credit_union?: number
  salary_advance?: number
  scf_consolidated_bank_ghana?: number
  scf_adeiso_staff_land?: number
  senior_staff_dues?: number
  fralien_service?: number
  qcc_welfare_scheme?: number
  head_office_welfare?: number
  wf_tema_welfare_loan?: number
  glico_loan?: number
  stanbic_loan?: number
  tema_welfare_loan?: number
  national_welfare?: number
  other?: number
}

export interface FDCalculationInput {
  staffNumber: string
  staffName: string
  /** Annual (per annum) salary in GH¢ */
  salary_per_annum: number
  /**
   * Optional override for consolidated monthly salary.
   * When omitted, derived as salary_per_annum / 12 (Excel default).
   */
  consolidated_salary_per_month?: number
  /** Other monthly allowances in GH¢ */
  other_allowances_monthly?: number
  /** Existing gross monthly deductions (before new loan) in GH¢ */
  gross_deduction_monthly?: number
  /** Loan amount being requested in GH¢ */
  requested_loan_amount: number
  /** Repayment / recovery period in months — required for installment */
  recovery_period_months: number
  loan_type?: string
  outstanding_loans?: OutstandingLoans
}

export interface FDCalculationResult {
  salary_per_annum: number
  requested_loan_amount: number
  recovery_period_months: number

  consolidated_salary_per_month: number
  other_allowances_per_month: number
  gross_salary_per_month: number
  gross_deduction_monthly: number
  loan_installment_monthly: number
  total_deduction_monthly: number
  net_salary_monthly: number
  half_gross_salary_per_month: number
  total_outstanding: number
  /** Loan required + outstanding balances (Excel total exposure line) */
  total_loan_exposure: number

  /** Net / Gross as percent (e.g. 42.9709) */
  net_to_gross_ratio: number
  /** Raw Excel fraction (e.g. 0.4297) */
  net_to_gross_fraction: number
  fd_good: boolean
  /** 0–100 integer percent, matches Excel percentage row rounded */
  fd_score: number
  loan_approval_recommended: boolean
}

/** Round money to 2 d.p. for display consistency; keep full precision in core math. */
export function roundMoney(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

export function sumOutstanding(loans?: OutstandingLoans | null): number {
  return Object.values(loans ?? {}).reduce((sum, val) => sum + (Number(val) || 0), 0)
}

/**
 * Core FD calculation — mirrors FD-HANA Excel arithmetic.
 */
export function calculateFD(input: FDCalculationInput): FDCalculationResult {
  const salary_per_annum = Number(input.salary_per_annum) || 0
  const recovery_period_months = Math.max(0, Number(input.recovery_period_months) || 0)
  const requested_loan_amount = Number(input.requested_loan_amount) || 0

  // Excel: Consolidated = Annual / 12 (allow explicit override if payroll figure differs)
  const derivedConsolidated = salary_per_annum / 12
  const consolidated_salary_per_month =
    input.consolidated_salary_per_month != null && Number(input.consolidated_salary_per_month) > 0
      ? Number(input.consolidated_salary_per_month)
      : derivedConsolidated

  const other_allowances_per_month = Number(input.other_allowances_monthly) || 0
  const gross_salary_per_month = consolidated_salary_per_month + other_allowances_per_month

  const gross_deduction_monthly = Number(input.gross_deduction_monthly) || 0

  // Excel: Approximated Installment = Loan Required / Recovery Period
  const loan_installment_monthly =
    recovery_period_months > 0 ? requested_loan_amount / recovery_period_months : 0

  const total_deduction_monthly = gross_deduction_monthly + loan_installment_monthly
  const net_salary_monthly = gross_salary_per_month - total_deduction_monthly
  const half_gross_salary_per_month = gross_salary_per_month / 2

  const total_outstanding = sumOutstanding(input.outstanding_loans)
  const total_loan_exposure = requested_loan_amount + total_outstanding

  // QCC rule: good standing when net > half of gross
  const fd_good = net_salary_monthly > half_gross_salary_per_month

  const net_to_gross_fraction =
    gross_salary_per_month > 0 ? net_salary_monthly / gross_salary_per_month : 0

  const net_to_gross_ratio = net_to_gross_fraction * 100

  // FD score = percentage of net to gross, nearest whole percent (Excel 42.97% → 43)
  const fd_score = Math.max(0, Math.min(100, Math.round(net_to_gross_ratio)))

  return {
    salary_per_annum,
    requested_loan_amount,
    recovery_period_months,
    consolidated_salary_per_month,
    other_allowances_per_month,
    gross_salary_per_month,
    gross_deduction_monthly,
    loan_installment_monthly,
    total_deduction_monthly,
    net_salary_monthly,
    half_gross_salary_per_month,
    total_outstanding,
    total_loan_exposure,
    net_to_gross_ratio,
    net_to_gross_fraction,
    fd_good,
    fd_score,
    loan_approval_recommended: fd_good,
  }
}

export function validateFDInput(input: Partial<FDCalculationInput>): string[] {
  const errors: string[] = []
  if (!input.staffNumber?.trim()) errors.push('Staff number is required')
  if (!input.staffName?.trim()) errors.push('Staff name is required')
  if (!input.salary_per_annum || input.salary_per_annum <= 0) {
    errors.push('Annual salary must be greater than 0')
  }
  if (!input.requested_loan_amount || input.requested_loan_amount <= 0) {
    errors.push('Loan amount must be greater than 0')
  }
  if (!input.recovery_period_months || input.recovery_period_months <= 0) {
    errors.push('Recovery period (months) must be greater than 0 — installment = loan ÷ recovery months')
  }
  if (input.recovery_period_months != null && input.recovery_period_months > 240) {
    errors.push('Recovery period looks too high (max 240 months)')
  }
  return errors
}

/** Human-readable labels (FD-HANA balance outstanding rows) */
export const OUTSTANDING_LOAN_LABELS: Record<keyof OutstandingLoans, string> = {
  car_deposit: 'Car Deposit',
  consumer_item_nat_welf: 'Consumer Item (Nat. Welf)',
  motor_cycle_loan: 'Motor Cycle Loan',
  motor_cycle_loan_interest: 'Interest (Motor Cycle Loan)',
  rent_advance: 'Rent Advance',
  rent_loan: 'Rent Loan',
  rent_staff_quarters: 'Rent Staff Quarters',
  funeral_loan: 'Funeral Loan',
  repair_loan: 'Repair Loan',
  motor_vehicle_loan: 'Motor Vehicle Loan',
  two_month_salary_advance: 'Two Month Salary Advance',
  accounts_welfare: 'Accounts Welfare',
  ched_welfare_scheme: 'CHED Welfare Scheme',
  special_advance: 'Special Advance',
  household_durables: 'Household Durables',
  homeownership_loan: 'Homeownership Loan',
  student_loan_trust_fund: 'Student Loan Trust Fund',
  insurance_loan: 'Insurance Loan',
  educational_loan: 'Educational Loan',
  transport_welfare_loan: 'Transport Welfare Loan',
  car_repairs: 'Car Repairs',
  liberty_trust: 'Liberty Trust',
  scf_skyview_reality: 'SCF - Skyview Reality Limited',
  syndicated_capital: 'Syndicated Capital',
  cocobod_employees_loan: 'Cocobod Employees Loan',
  ched_welfare_scheme_loan: 'CHED Welfare Scheme Loan',
  qcc_welfare_scheme_loan: 'QCC Welfare Scheme Loan',
  scf_crig_coop_credit_union: 'SCF - CRIG Co-op Credit Union',
  salary_advance: 'Salary Advance',
  scf_consolidated_bank_ghana: 'SCF - Consolidated Bank Ghana',
  scf_adeiso_staff_land: 'SCF - Adeiso Staff Land',
  senior_staff_dues: 'Senior Staff Dues',
  fralien_service: 'Fralien Service',
  qcc_welfare_scheme: 'QCC Welfare Scheme',
  head_office_welfare: 'Head Office Welfare',
  wf_tema_welfare_loan: 'WF - Tema Welfare Loan',
  glico_loan: 'Glico Loan',
  stanbic_loan: 'Stanbic Loan',
  tema_welfare_loan: 'Tema Welfare Loan',
  national_welfare: 'National Welfare',
  other: 'Other',
}

export default {
  calculateFD,
  validateFDInput,
  sumOutstanding,
  roundMoney,
  OUTSTANDING_LOAN_LABELS,
}
