import { describe, expect, it } from 'vitest'
import { calculateSalaryAdvance } from '../lib/salary-advance'

describe('calculateSalaryAdvance', () => {
  it('multiplies the monthly value of annual salary by the requested months', () => {
    expect(calculateSalaryAdvance(120_000, 2)).toEqual({
      annualSalary: 120_000,
      monthlySalary: 10_000,
      requestedMonths: 2,
      amount: 20_000,
    })
  })

  it('rejects missing salary and invalid month counts', () => {
    expect(calculateSalaryAdvance(0, 2)).toBeNull()
    expect(calculateSalaryAdvance(120_000, 0)).toBeNull()
    expect(calculateSalaryAdvance(120_000, 4)).toBeNull()
  })
})