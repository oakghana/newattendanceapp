import { beforeEach, describe, expect, it, vi } from 'vitest'

const notificationInsertMock = vi.fn()
const notificationSelectMock = vi.fn()
const notificationEqMock = vi.fn()
const notificationMaybeSingleMock = vi.fn()
const auditInsertMock = vi.fn()

vi.mock('../lib/notification-service', () => ({
  sendNotification: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'leave_resumption_notifications') {
        return {
          select: notificationSelectMock.mockReturnValue({
            eq: notificationEqMock.mockReturnValue({
              maybeSingle: notificationMaybeSingleMock.mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: notificationInsertMock.mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'resumption-1' }, error: null }),
            }),
          }),
          update: vi.fn().mockResolvedValue({ error: null }),
        }
      }

      if (table === 'leave_resumption_audit') {
        return {
          insert: auditInsertMock.mockResolvedValue({ error: null }),
        }
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    },
  }),
}))

describe('leave resumption service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects warning, letter, and memo escalation by current status', async () => {
    const { getResumptionEscalationLevel } = await import('../lib/leave-resumption-service')

    expect(getResumptionEscalationLevel(2, 'pending')).toBe('warning')
    expect(getResumptionEscalationLevel(5, 'warning_sent')).toBe('letter')
    expect(getResumptionEscalationLevel(10, 'letter_sent')).toBe('memo')
    expect(getResumptionEscalationLevel(10, 'memo_sent')).toBeNull()
    expect(getResumptionEscalationLevel(1, 'pending')).toBeNull()
  })

  it('creates a pending resumption record for an approved leave request', async () => {
    const { createLeaveResumptionTrackingForLeaveRequest } = await import('../lib/leave-resumption-service')

    await createLeaveResumptionTrackingForLeaveRequest({
      id: 'leave-123',
      user_id: 'user-123',
      start_date: '2026-08-01',
      end_date: '2026-08-10',
    })

    expect(notificationInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        leave_request_id: 'leave-123',
        leave_end_date: '2026-08-10',
        status: 'pending',
      })
    )
  })
})
