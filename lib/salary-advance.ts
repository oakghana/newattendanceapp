export type SalaryAdvanceCalculation = {
  annualSalary: number
  monthlySalary: number
  requestedMonths: number
  amount: number
}

export function calculateSalaryAdvance(
  annualSalaryValue: number | string | null | undefined,
  requestedMonthsValue: number | string | null | undefined,
): SalaryAdvanceCalculation | null {
  const annualSalary = Number(annualSalaryValue)
  const requestedMonths = Math.trunc(Number(requestedMonthsValue))

  if (!Number.isFinite(annualSalary) || annualSalary <= 0) return null
  if (!Number.isFinite(requestedMonths) || requestedMonths < 1 || requestedMonths > 3) return null

  const monthlySalary = Math.round((annualSalary / 12) * 100) / 100
  const amount = Math.round((annualSalary / 12) * requestedMonths * 100) / 100

  return { annualSalary, monthlySalary, requestedMonths, amount }
}