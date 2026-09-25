import { describe, expect, it } from 'vitest'
import { calculateSalaryAdvance, calculateSalaryAdvanceFromFdNote } from '../lib/salary-advance'

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

  it('repairs a legacy amount from the annual salary stored in FD notes', () => {
    const note = 'Automated FD Calculation:\n- Salary Per Annum: GH¢ 249980.00\n- Consolidated Monthly Salary: GH¢ 20831.67'
    expect(calculateSalaryAdvanceFromFdNote(note, 3)).toEqual({
      annualSalary: 249_980,
      monthlySalary: 20_831.67,
      requestedMonths: 3,
      amount: 62_495,
    })
  })
})