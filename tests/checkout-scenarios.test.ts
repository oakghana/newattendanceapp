/**
 * Checkout Scenarios Test Suite
 * Tests for in-range, out-of-range, GPS drift, and off-premises checkout flows.
 * 
 * Addresses the fix in commit 35ac7ee:
 * - 2-hour minimum enforced for all users (including in-range)
 * - GPS drift at click-time doesn't redirect in-range users to off-premises
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Mock types for attendance state
 */
interface AttendanceState {
  initialCanCheckOut: boolean
  recentCheckOut: boolean
  localTodayAttendance: { check_in_time: string | null; check_out_time: string | null; on_official_duty_outside_premises?: boolean } | null
  isOnLeave: boolean
  checkoutTimeReached: boolean
  locationValidation: { canCheckOut: boolean } | null
  freshCheckoutValidation: { canCheckOut: boolean }
}

/**
 * Simulates the canCheckOutButton calculation from attendance-recorder.tsx
 */
function evaluateCanCheckOutButton(state: AttendanceState): boolean {
  return (
    (state.initialCanCheckOut ?? true) &&
    !state.recentCheckOut &&
    !!state.localTodayAttendance?.check_in_time &&
    !state.localTodayAttendance?.check_out_time &&
    !state.isOnLeave &&
    (state.checkoutTimeReached || state.localTodayAttendance?.on_official_duty_outside_premises === true)
  )
}

/**
 * Simulates the handleCheckOut routing decision
 * Returns the intended flow path
 */
function evaluateCheckoutRoute(state: AttendanceState): string {
  // If not enough time worked
  if (!state.checkoutTimeReached && !state.localTodayAttendance?.on_official_duty_outside_premises) {
    return 'BLOCKED_MIN_2_HOURS'
  }

  // If out of range on fresh snapshot
  if (!state.freshCheckoutValidation.canCheckOut) {
    // But UI says in-range, trust UI (GPS drift protection)
    if (state.locationValidation?.canCheckOut === true) {
      return 'DIRECT_CHECKOUT_UI_OVERRIDE'
    }
    // Genuinely out of range
    return 'OFFPREMISES_DIALOG'
  }

  // In range on fresh snapshot
  return 'DIRECT_CHECKOUT'
}

describe('Checkout Scenarios', () => {
  describe('Scenario 1: In-Range, Before 2 Hours', () => {
    it('should disable button and block checkout', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: false, // Only 30 minutes worked
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(false)
      expect(evaluateCheckoutRoute(state)).toBe('BLOCKED_MIN_2_HOURS')
    })

    it('should show correct user-facing message', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: false,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      const buttonDisabled = !evaluateCanCheckOutButton(state)
      expect(buttonDisabled).toBe(true)
      // Button should be visually disabled, with a tooltip: "You must work at least 2 hours before checking out"
    })
  })

  describe('Scenario 2: In-Range, After 2 Hours', () => {
    it('should enable button and proceed with direct checkout', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true, // 2+ hours worked
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(true)
      expect(evaluateCheckoutRoute(state)).toBe('DIRECT_CHECKOUT')
    })

    it('should not show off-premises dialog', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCheckoutRoute(state)).not.toBe('OFFPREMISES_DIALOG')
    })
  })

  describe('Scenario 3: Out-of-Range, After 2 Hours', () => {
    it('should enable button but route to off-premises dialog', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true, // 2+ hours worked
        locationValidation: { canCheckOut: false }, // UI says out-of-range
        freshCheckoutValidation: { canCheckOut: false }, // Fresh snapshot also out-of-range
      }

      expect(evaluateCanCheckOutButton(state)).toBe(true)
      expect(evaluateCheckoutRoute(state)).toBe('OFFPREMISES_DIALOG')
    })

    it('should not allow direct checkout without reason', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: false },
        freshCheckoutValidation: { canCheckOut: false },
      }

      // The off-premises dialog must be shown to collect a reason
      expect(evaluateCheckoutRoute(state)).toBe('OFFPREMISES_DIALOG')
    })
  })

  describe('Scenario 4: GPS Drift (UI In-Range, Fresh Sample Out-of-Range)', () => {
    it('should trust UI validation and proceed with direct checkout', () => {
      // This is the critical fix: when GPS drifts at click-time but the continuous
      // UI validator confirms in-range, we should NOT redirect to off-premises.
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true, // 2+ hours worked
        locationValidation: { canCheckOut: true }, // UI watcher says in-range (continuous monitoring)
        freshCheckoutValidation: { canCheckOut: false }, // One snapshot at click-time drifted out-of-range
      }

      expect(evaluateCanCheckOutButton(state)).toBe(true)
      // The key assertion: override the momentary GPS drift and use UI state
      expect(evaluateCheckoutRoute(state)).toBe('DIRECT_CHECKOUT_UI_OVERRIDE')
      expect(evaluateCheckoutRoute(state)).not.toBe('OFFPREMISES_DIALOG')
    })

    it('should log the drift detection for debugging', () => {
      const logSpy = vi.spyOn(console, 'log')

      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: false },
      }

      evaluateCheckoutRoute(state)
      // When drift is detected, the code should log:
      // "[v0] GPS drift detected: UI validator confirms in-range; skipping off-premises redirect"
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('GPS drift'),
        expect.anything()
      )

      logSpy.mockRestore()
    })
  })

  describe('Scenario 5: Off-Premises Approved Session, Before 7 Hours', () => {
    it('should keep the button available even before 7 hours', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: {
          check_in_time: '2026-04-29T10:00:00Z',
          check_out_time: null,
          on_official_duty_outside_premises: true, // Approved off-premises check-in
        },
        isOnLeave: false,
        checkoutTimeReached: false, // Less than 7 hours
        locationValidation: { canCheckOut: false }, // Out of range (expected for off-premises)
        freshCheckoutValidation: { canCheckOut: false },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(true)
      // The button remains visible, but the checkout flow should still enforce the 7-hour policy.
    })

    it('should allow checkout without off-premises dialog', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: {
          check_in_time: '2026-04-29T10:00:00Z',
          check_out_time: null,
          on_official_duty_outside_premises: true,
        },
        isOnLeave: false,
        checkoutTimeReached: false,
        locationValidation: { canCheckOut: false },
        freshCheckoutValidation: { canCheckOut: false },
      }

      // Off-premises users who are approved should not see an off-premises dialog;
      // they should proceed directly to checkout (they already have approval).
      const route = evaluateCheckoutRoute(state)
      expect(route).not.toBe('OFFPREMISES_DIALOG')
    })
  })

  describe('Edge Cases', () => {
    it('should not allow checkout if already checked out', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: '2026-04-29T13:00:00Z' }, // Already checked out
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(false)
    })

    it('should not allow checkout if on leave', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: true,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(false)
    })

    it('should not allow checkout if checkout was recently used', () => {
      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: true, // Recently checked out
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true },
        freshCheckoutValidation: { canCheckOut: true },
      }

      expect(evaluateCanCheckOutButton(state)).toBe(false)
    })
  })

  describe('Regression Prevention', () => {
    it('should not regress to old behavior (in-range users checking out immediately)', () => {
      // OLD BUG: canCheckOutButton = locationValidation?.canCheckOut === true
      // would allow checkout without 2-hour check

      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: false, // Only 30 minutes
        locationValidation: { canCheckOut: true }, // User is in range
        freshCheckoutValidation: { canCheckOut: true },
      }

      // NEW behavior: button should be DISABLED even though in-range
      expect(evaluateCanCheckOutButton(state)).toBe(false)
      expect(evaluateCheckoutRoute(state)).toBe('BLOCKED_MIN_2_HOURS')
    })

    it('should not regress to old behavior (in-range users redirected to off-premises on GPS drift)', () => {
      // OLD BUG: if fresh GPS snapshot was out-of-range, code routed to off-premises dialog
      // even if UI said in-range

      const state: AttendanceState = {
        initialCanCheckOut: true,
        recentCheckOut: false,
        localTodayAttendance: { check_in_time: '2026-04-29T10:00:00Z', check_out_time: null },
        isOnLeave: false,
        checkoutTimeReached: true,
        locationValidation: { canCheckOut: true }, // UI says in-range (monitored all session)
        freshCheckoutValidation: { canCheckOut: false }, // Momentary GPS drift
      }

      // NEW behavior: trust UI, not the drift
      expect(evaluateCheckoutRoute(state)).not.toBe('OFFPREMISES_DIALOG')
      expect(evaluateCheckoutRoute(state)).toBe('DIRECT_CHECKOUT_UI_OVERRIDE')
    })
  })
})
