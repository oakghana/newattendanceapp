import { describe, expect, it } from 'vitest'
import { calculateFD, validateFDInput } from '../lib/fd-calculator'

describe('FD calculator (FD-HANA Excel)', () => {
  it('reproduces TWUM CASTRO Sheet2 ≈ 43% net-to-gross', () => {
    const result = calculateFD({
      staffNumber: '1151564',
      staffName: 'TWUM CASTRO',
      salary_per_annum: 135263.232,
      other_allowances_monthly: 6143.33,
      gross_deduction_monthly: 9073.43,
      requested_loan_amount: 103000,
      recovery_period_months: 120,
      outstanding_loans: {
        consumer_item_nat_welf: 2438.24,
        rent_loan: 1666.6,
        salary_advance: 3471.43,
      },
    })

    expect(result.consolidated_salary_per_month).toBeCloseTo(11271.936, 3)
    expect(result.gross_salary_per_month).toBeCloseTo(17415.266, 3)
    expect(result.loan_installment_monthly).toBeCloseTo(858.333333, 4)
    expect(result.outstanding_installment_monthly).toBeCloseTo(7576.27 / 120, 4)
    expect(result.total_deduction_monthly).toBeCloseTo(9073.43 + 858.333333 + 7576.27 / 120, 4)
    expect(result.net_salary_monthly).toBeCloseTo(17415.266 - (9073.43 + 858.333333 + 7576.27 / 120), 3)
    expect(result.half_gross_salary_per_month).toBeCloseTo(8707.633, 3)
    expect(result.fd_good).toBe(false) // net < half gross
    expect(result.total_outstanding).toBeCloseTo(7576.27, 2)
    expect(result.total_loan_exposure).toBeCloseTo(110576.27, 2)
  })

  it('lowers FD score when outstanding loan balances are entered', () => {
    const base = {
      staffNumber: '1',
      staffName: 'Test',
      salary_per_annum: 120000,
      other_allowances_monthly: 0,
      gross_deduction_monthly: 0,
      requested_loan_amount: 12000,
      recovery_period_months: 12,
    }
    const withoutOutstanding = calculateFD(base)
    const withOutstanding = calculateFD({
      ...base,
      outstanding_loans: { motor_vehicle_loan: 12000, salary_advance: 6000 },
    })

    expect(withoutOutstanding.fd_score).toBe(90)
    expect(withOutstanding.total_outstanding).toBe(18000)
    expect(withOutstanding.outstanding_installment_monthly).toBe(1500)
    expect(withOutstanding.total_deduction_monthly).toBe(2500)
    expect(withOutstanding.net_salary_monthly).toBe(7500)
    expect(withOutstanding.fd_score).toBe(75)
    expect(withOutstanding.fd_score).toBeLessThan(withoutOutstanding.fd_score)
  })

  it('reproduces AHULU Sheet1 ≈ 50%', () => {
    const result = calculateFD({
      staffNumber: '1150127',
      staffName: 'AHULU ELVIS NGMETEY',
      salary_per_annum: 125831.0004,
      other_allowances_monthly: 4318.39,
      gross_deduction_monthly: 6698.08,
      requested_loan_amount: 15450,
      recovery_period_months: 24,
    })

    expect(result.consolidated_salary_per_month).toBeCloseTo(10485.9167, 3)
    expect(result.gross_salary_per_month).toBeCloseTo(14804.3067, 3)
    expect(result.loan_installment_monthly).toBeCloseTo(643.75, 4)
    expect(result.net_to_gross_fraction).toBeCloseTo(0.5040747163, 6)
    expect(result.fd_score).toBe(50)
    expect(result.fd_good).toBe(true)
  })

  it('requires recovery period for valid input', () => {
    const errors = validateFDInput({
      staffNumber: '1',
      staffName: 'Test',
      salary_per_annum: 100000,
      requested_loan_amount: 5000,
      recovery_period_months: 0,
    })
    expect(errors.some((e) => /recovery period/i.test(e))).toBe(true)
  })

  it('uses consolidated override when provided', () => {
    const result = calculateFD({
      staffNumber: '1',
      staffName: 'Test',
      salary_per_annum: 120000,
      consolidated_salary_per_month: 9000,
      other_allowances_monthly: 1000,
      gross_deduction_monthly: 2000,
      requested_loan_amount: 12000,
      recovery_period_months: 12,
    })
    expect(result.consolidated_salary_per_month).toBe(9000)
    expect(result.gross_salary_per_month).toBe(10000)
    expect(result.loan_installment_monthly).toBe(1000)
    expect(result.net_salary_monthly).toBe(7000)
    expect(result.fd_score).toBe(70)
  })
})
