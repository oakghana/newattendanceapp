import { describe, it, expect } from "vitest"
import {
  isPasswordChangeRequired,
  getPasswordEnforcementMessage,
  generateTemporaryPassword,
  buildForcedPasswordChangeMetadata,
  clearForcedPasswordChangeMetadata,
} from "../lib/security"

describe("password security policy", () => {
  it("requires a password change when the password was last changed in a previous quarter", () => {
    const now = new Date("2026-04-15T10:00:00Z")
    expect(isPasswordChangeRequired("2026-03-31T23:00:00Z", now)).toBe(true)
    expect(isPasswordChangeRequired(null, now)).toBe(true)
  })

  it("does not require a password change when it was changed within the current quarter", () => {
    const now = new Date("2026-04-15T10:00:00Z")
    expect(isPasswordChangeRequired("2026-04-02T08:30:00Z", now)).toBe(false)
  })

  it("returns a clear enforcement message", () => {
    expect(getPasswordEnforcementMessage()).toContain("quarterly")
  })

  it("generates a strong temporary password", () => {
    const tempPassword = generateTemporaryPassword()

    expect(tempPassword.length).toBeGreaterThanOrEqual(6)
    expect(/[A-Z]/.test(tempPassword)).toBe(true)
    expect(/[a-z]/.test(tempPassword)).toBe(true)
    expect(/\d/.test(tempPassword)).toBe(true)
    expect(/[!@#$%^&*]/.test(tempPassword)).toBe(true)
  })

  it("marks temporary passwords for forced change while preserving metadata", () => {
    const metadata = buildForcedPasswordChangeMetadata({ team: "ops" }, "2026-04-15T10:00:00Z")

    expect(metadata).toMatchObject({
      team: "ops",
      force_password_change: true,
      temporary_password: true,
      temp_password_issued_at: "2026-04-15T10:00:00Z",
    })
  })

  it("clears forced-change metadata after a successful password change", () => {
    const metadata = clearForcedPasswordChangeMetadata({
      team: "ops",
      force_password_change: true,
      temporary_password: true,
      temp_password_issued_at: "2026-04-15T10:00:00Z",
    })

    expect(metadata).toMatchObject({
      team: "ops",
      force_password_change: false,
      temporary_password: false,
      temp_password_issued_at: null,
    })
  })
})
