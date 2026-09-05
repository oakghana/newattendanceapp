import { describe, expect, it } from "vitest"
import {
  countMeaningfulWords,
  hasExcessiveConsecutiveWhitespace,
  hasRepeatedConsecutiveCharacters,
  validateAttendanceReason,
  validateMeaningfulText,
} from "./meaningful-text"

describe("meaningful text / attendance reasons", () => {
  it("rejects more than 3 continuous spaces", () => {
    expect(hasExcessiveConsecutiveWhitespace("ok   here")).toBe(false) // 3 spaces
    expect(hasExcessiveConsecutiveWhitespace("bad    here")).toBe(true) // 4 spaces
    const r = validateAttendanceReason("This is a padded    reason with spaces used instead of real detail about the delay today morning traffic issue only.")
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/continuous spaces/i)
  })

  it("rejects space-padding used instead of characters", () => {
    const r = validateMeaningfulText("a b c d e f g h i j", { minWords: 20, minLength: 10 })
    expect(r.ok).toBe(false)
  })

  it("rejects repeated consecutive characters", () => {
    expect(hasRepeatedConsecutiveCharacters("Reason... for delay")).toBe(true)
    expect(hasRepeatedConsecutiveCharacters("Reason,,, for delay")).toBe(true)
    expect(hasRepeatedConsecutiveCharacters("Reason/// for delay")).toBe(true)
    expect(validateAttendanceReason("I was late because traffic delayed my arrival... today").ok).toBe(false)
  })

  it("requires more than 20 alphabetic characters for attendance reasons", () => {
    const short = validateAttendanceReason("I was late")
    expect(short.ok).toBe(false)
    expect(short.error).toMatch(/more than 20 alphabetic characters/i)

    const spacesDoNotCount = validateAttendanceReason("abcdefghijklmnopqrst")
    expect(spacesDoNotCount.ok).toBe(false)
    expect(spacesDoNotCount.letterCount).toBe(20)

    const good =
      "I arrived late this morning because heavy traffic on the main highway delayed several vehicles including the staff bus from Accra. " +
      "My supervisor was informed before arrival and I proceeded directly to my workstation after clearing security."
    const r = validateAttendanceReason(good)
    expect(r.ok).toBe(true)
    expect(r.letterCount).toBeGreaterThan(20)
  })

  it("does not count filler tokens as meaningful words", () => {
    const filler = Array(25).fill("asdf").join(" ")
    expect(countMeaningfulWords(filler)).toBe(0)
    const r = validateAttendanceReason(filler)
    expect(r.ok).toBe(false)
  })
})
