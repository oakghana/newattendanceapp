import { describe, expect, it } from 'vitest'

type Notice = { resume: string; today: string; confirmed: boolean; checkedIn: boolean }

function shouldShowNotice({ resume, today, confirmed, checkedIn }: Notice) {
  if (confirmed || checkedIn) return false
  const diff = Math.round((new Date(`${resume}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
  return diff < 0 || diff <= 5
}

describe('resumption notice policy', () => {
  it('includes upcoming resumptions through five days', () => {
    expect(shouldShowNotice({ resume: '2026-08-17', today: '2026-08-12', confirmed: false, checkedIn: false })).toBe(true)
  })

  it('does not show a resumption notice for a normal check-in', () => {
    expect(shouldShowNotice({ resume: '2026-08-10', today: '2026-08-12', confirmed: false, checkedIn: true })).toBe(false)
  })

  it('removes explicitly confirmed resumptions', () => {
    expect(shouldShowNotice({ resume: '2026-08-10', today: '2026-08-12', confirmed: true, checkedIn: true })).toBe(false)
  })

  it('excludes future resumptions beyond five days', () => {
    expect(shouldShowNotice({ resume: '2026-08-20', today: '2026-08-12', confirmed: false, checkedIn: false })).toBe(false)
  })
})
