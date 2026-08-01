/**
 * FD (Financial Due Diligence) Calculator
 * Based on QCC financial assessment formula
 * Calculates FD score based on employee financial standing
 */

export interface FDCalculationInput {
  staffNumber: string;
  staffName: string;
  salary_per_annum: number;
  other_allowances?: number; // Monthly allowances
  gross_deduction?: number; // Existing monthly deductions
  requested_loan_amount: number;
  recovery_period_months: number;
  loan_type?: string;
  outstanding_loans?: {
    [key: string]: number; // Loan type -> amount outstanding
  };
}

export interface FDCalculationResult {
  salary_per_annum: number;
  consolidated_salary_per_month: number;
  other_allowances_per_month: number;
  gross_salary_per_month: number;
  gross_deduction_monthly: number;
  loan_installment_monthly: number;
  total_deduction_monthly: number;
  net_salary_monthly: number;
  half_gross_salary_per_month: number;
  total_outstanding: number;
  fd_score: number; // 0-100 scale
  fd_good: boolean; // True if score >= 50
  net_to_gross_ratio: number;
  loan_approval_recommended: boolean;
}

const MONTHS_IN_YEAR = 12;
const FD_APPROVAL_THRESHOLD = 50; // 50% is considered "good"
const MINIMUM_NET_SALARY_BUFFER = 0.35; // Minimum 35% net salary remaining after loan deduction

/**
 * Calculate monthly salary from annual salary
 */
function calculateMonthlySalary(annualSalary: number): number {
  return annualSalary / MONTHS_IN_YEAR;
}

/**
 * Calculate monthly loan installment
 */
function calculateMonthlyInstallment(loanAmount: number, months: number): number {
  // Simple straight-line amortization (constant monthly payment)
  return loanAmount / months;
}

/**
 * Calculate net to gross salary ratio (as percentage)
 */
function calculateNetToGrossRatio(netSalary: number, grossSalary: number): number {
  if (grossSalary === 0) return 0;
  return (netSalary / grossSalary) * 100;
}

/**
 * Calculate FD Score (0-100)
 * Score is based on:
 * - Ratio of net salary remaining after loan deduction to gross salary
 * - Ability to service the loan without financial hardship
 */
function calculateFDScore(
  netSalaryAfterLoan: number,
  grossSalaryMonthly: number,
  totalOutstanding: number,
  requestedAmount: number
): number {
  if (grossSalaryMonthly === 0) return 0;

  // Ratio of net salary to gross salary after loan deduction
  const netToGrossRatio = (netSalaryAfterLoan / grossSalaryMonthly) * 100;

  // Base score from ratio
  let score = Math.min(netToGrossRatio, 100);

  // Penalty if too much debt relative to requested amount
  const debtToRequestRatio = totalOutstanding / Math.max(requestedAmount, 1);
  if (debtToRequestRatio > 2) {
    score = Math.max(0, score - 20); // Reduce score if existing debt is > 2x new loan
  }

  // Penalty if net salary after loan is too low
  if (netSalaryAfterLoan < 2000) {
    // GH¢ 2000 minimum living allowance
    score = Math.max(0, score - 15);
  }

  return Math.round(score);
}

/**
 * Main FD Calculation Function
 */
export function calculateFD(input: FDCalculationInput): FDCalculationResult {
  // Calculate monthly salaries
  const consolidated_salary_per_month = calculateMonthlySalary(input.salary_per_annum);
  const other_allowances_per_month = input.other_allowances || 0;
  const gross_salary_per_month = consolidated_salary_per_month + other_allowances_per_month;

  // Calculate deductions
  const gross_deduction_monthly = input.gross_deduction || 0;
  const loan_installment_monthly = calculateMonthlyInstallment(
    input.requested_loan_amount,
    input.recovery_period_months
  );
  const total_deduction_monthly = gross_deduction_monthly + loan_installment_monthly;

  // Calculate net salary
  const net_salary_monthly = gross_salary_per_month - total_deduction_monthly;
  const half_gross_salary_per_month = gross_salary_per_month / 2;

  // Calculate total outstanding loans
  const total_outstanding = Object.values(input.outstanding_loans || {}).reduce((a, b) => a + b, 0);

  // Calculate ratio
  const net_to_gross_ratio = calculateNetToGrossRatio(net_salary_monthly, gross_salary_per_month);

  // Calculate FD Score
  const fd_score = calculateFDScore(
    net_salary_monthly,
    gross_salary_per_month,
    total_outstanding,
    input.requested_loan_amount
  );

  // Determine if FD is good
  const fd_good = fd_score >= FD_APPROVAL_THRESHOLD;

  // Determine if loan approval is recommended
  // Loan should be approved if:
  // 1. FD score is good (>= 50)
  // 2. Net salary remaining is at least 35% of gross salary
  // 3. Net salary after loan is at least GH¢ 2000
  const loan_approval_recommended =
    fd_good &&
    net_to_gross_ratio >= MINIMUM_NET_SALARY_BUFFER * 100 &&
    net_salary_monthly >= 2000;

  return {
    salary_per_annum: input.salary_per_annum,
    consolidated_salary_per_month,
    other_allowances_per_month,
    gross_salary_per_month,
    gross_deduction_monthly,
    loan_installment_monthly,
    total_deduction_monthly,
    net_salary_monthly,
    half_gross_salary_per_month,
    total_outstanding,
    fd_score,
    fd_good,
    net_to_gross_ratio,
    loan_approval_recommended,
  };
}

/**
 * Validate FD calculation input
 */
export function validateFDInput(input: Partial<FDCalculationInput>): string[] {
  const errors: string[] = [];

  if (!input.staffNumber?.trim()) errors.push("Staff number is required");
  if (!input.staffName?.trim()) errors.push("Staff name is required");
  if (!input.salary_per_annum || input.salary_per_annum <= 0)
    errors.push("Annual salary must be greater than 0");
  if (!input.requested_loan_amount || input.requested_loan_amount <= 0)
    errors.push("Loan amount must be greater than 0");
  if (!input.recovery_period_months || input.recovery_period_months <= 0)
    errors.push("Recovery period must be greater than 0");

  return errors;
}
