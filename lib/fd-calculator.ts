/**
 * FD (Financial Due Diligence) Calculator
 * Implements the exact QCC Financial Standing formula from the FD-HANA template.
 *
 * Formula (per the Excel template):
 *   Consolidated Monthly Salary  = Salary Per Annum / 12
 *   Gross Monthly Salary         = Consolidated Monthly Salary + Other Allowances
 *   Approx. Loan Installment     = Loan Amount / Recovery Period (months)
 *   Total Deduction              = Gross Deduction (existing) + Loan Installment
 *   Net Salary                   = Gross Monthly Salary - Total Deduction
 *   1/2 Gross Monthly            = Gross Monthly Salary / 2
 *   FD Good                      = Net Salary > 1/2 Gross Monthly Salary
 *   Net to Gross Ratio (%)       = Net Salary / Gross Monthly Salary × 100
 *   FD Score                     = Net to Gross Ratio × 100 (capped 0–100)
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
  syndicated_capital?: number
  cocobod_employees_loan?: number
  ched_welfare_scheme_loan?: number
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
  /** Other monthly allowances in GH¢ */
  other_allowances_monthly?: number
  /** Existing gross monthly deductions (before new loan) in GH¢ */
  gross_deduction_monthly?: number
  /** Loan amount being requested in GH¢ */
  requested_loan_amount: number
  /** Repayment period in months */
  recovery_period_months: number
  loan_type?: string
  outstanding_loans?: OutstandingLoans
}

export interface FDCalculationResult {
  // Inputs echoed back
  salary_per_annum: number
  requested_loan_amount: number
  recovery_period_months: number

  // Computed values (match Excel row by row)
  consolidated_salary_per_month: number   // = salary_per_annum / 12
  other_allowances_per_month: number
  gross_salary_per_month: number          // = consolidated + allowances
  gross_deduction_monthly: number         // existing deductions
  loan_installment_monthly: number        // = loan_amount / months
  total_deduction_monthly: number         // = gross_deductions + installment
  net_salary_monthly: number              // = gross - total_deduction
  half_gross_salary_per_month: number     // = gross / 2
  total_outstanding: number

  // Assessment
  net_to_gross_ratio: number              // net / gross × 100  (same as Row 50 × 100)
  fd_good: boolean                        // net > half_gross  (QCC rule)
  fd_score: number                        // 0–100, = net_to_gross_ratio capped at 100
  loan_approval_recommended: boolean
}

export function calculateFD(input: FDCalculationInput): FDCalculationResult {
  const salary_per_annum = input.salary_per_annum
  const consolidated_salary_per_month = salary_per_annum / 12
  const other_allowances_per_month = input.other_allowances_monthly ?? 0
  const gross_salary_per_month = consolidated_salary_per_month + other_allowances_per_month

  const gross_deduction_monthly = input.gross_deduction_monthly ?? 0
  const loan_installment_monthly =
    input.recovery_period_months > 0
      ? input.requested_loan_amount / input.recovery_period_months
      : 0
  const total_deduction_monthly = gross_deduction_monthly + loan_installment_monthly
  const net_salary_monthly = gross_salary_per_month - total_deduction_monthly
  const half_gross_salary_per_month = gross_salary_per_month / 2

  // Total balance outstanding across all loan types
  const total_outstanding = Object.values(input.outstanding_loans ?? {}).reduce(
    (sum, val) => sum + (val ?? 0),
    0
  )

  // QCC FD Good rule: net salary must exceed half of gross salary
  const fd_good = net_salary_monthly > half_gross_salary_per_month

  // Net-to-gross ratio as percentage (matches Row 50 × 100)
  const net_to_gross_ratio =
    gross_salary_per_month > 0
      ? (net_salary_monthly / gross_salary_per_month) * 100
      : 0

  // FD Score: same as net-to-gross ratio, capped 0–100
  const fd_score = Math.max(0, Math.min(100, Math.round(net_to_gross_ratio)))

  // Loan approval recommended when FD is good (net > half gross)
  const loan_approval_recommended = fd_good

  return {
    salary_per_annum,
    requested_loan_amount: input.requested_loan_amount,
    recovery_period_months: input.recovery_period_months,
    consolidated_salary_per_month,
    other_allowances_per_month,
    gross_salary_per_month,
    gross_deduction_monthly,
    loan_installment_monthly,
    total_deduction_monthly,
    net_salary_monthly,
    half_gross_salary_per_month,
    total_outstanding,
    net_to_gross_ratio,
    fd_good,
    fd_score,
    loan_approval_recommended,
  }
}

export function validateFDInput(input: Partial<FDCalculationInput>): string[] {
  const errors: string[] = []
  if (!input.staffNumber?.trim()) errors.push("Staff number is required")
  if (!input.staffName?.trim()) errors.push("Staff name is required")
  if (!input.salary_per_annum || input.salary_per_annum <= 0)
    errors.push("Annual salary must be greater than 0")
  if (!input.requested_loan_amount || input.requested_loan_amount <= 0)
    errors.push("Loan amount must be greater than 0")
  if (!input.recovery_period_months || input.recovery_period_months <= 0)
    errors.push("Recovery period must be greater than 0")
  return errors
}

/** Human-readable label for each outstanding loan type (matches Excel rows 14–47) */
export const OUTSTANDING_LOAN_LABELS: Record<keyof OutstandingLoans, string> = {
  car_deposit: "Car Deposit",
  consumer_item_nat_welf: "Consumer Item (Nat. Welf)",
  motor_cycle_loan: "Motor Cycle Loan",
  motor_cycle_loan_interest: "Interest (Motor Cycle Loan)",
  rent_advance: "Rent Advance",
  rent_loan: "Rent Loan",
  rent_staff_quarters: "Rent Staff Quarters",
  funeral_loan: "Funeral Loan",
  motor_vehicle_loan: "Motor Vehicle Loan",
  two_month_salary_advance: "Two Month Salary Advance",
  accounts_welfare: "Accounts Welfare",
  ched_welfare_scheme: "CHED Welfare Scheme",
  special_advance: "Special Advance",
  household_durables: "Household Durables",
  homeownership_loan: "Homeownership Loan",
  student_loan_trust_fund: "Student Loan Trust Fund",
  insurance_loan: "Insurance Loan",
  educational_loan: "Educational Loan",
  transport_welfare_loan: "Transport Welfare Loan",
  car_repairs: "Car Repairs",
  liberty_trust: "Liberty Trust",
  syndicated_capital: "Syndicated Capital",
  cocobod_employees_loan: "Cocobod Employees Loan",
  ched_welfare_scheme_loan: "CHED Welfare Scheme Loan",
  scf_adeiso_staff_land: "SCF - Adeiso Staff Land",
  senior_staff_dues: "Senior Staff Dues",
  fralien_service: "Fralien Service",
  qcc_welfare_scheme: "QCC Welfare Scheme",
  head_office_welfare: "Head Office Welfare",
  wf_tema_welfare_loan: "WF - Tema Welfare Loan",
  glico_loan: "Glico Loan",
  stanbic_loan: "Stanbic Loan",
  tema_welfare_loan: "Tema Welfare Loan",
  national_welfare: "National Welfare",
  other: "Other",
}
