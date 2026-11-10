import { describe, expect, it } from "vitest"
import {
  DEFAULT_MEMO_CC,
  decideForwardedMemo,
  formatMemoCcLines,
  isUsableSignatureImage,
  memoTermsSignature,
  monthToFirstOfMonthDate,
  splitMemoAtSigner,
  toMonthInputValue,
  type MemoTermsInputs,
} from "../lib/loan-memo-forwarding"

const terms: MemoTermsInputs = {
  disbursement: "2026-11",
  recovery: "2026-12",
  months: "3",
  basicSalary: "10000",
  hodName: "",
  hodRank: "Regional Manager",
  hodLocation: "Takoradi - Djatabu",
  memoRecipient: "Senior Accounts Manager",
  memoRef: "QCC/HRD/SWL/V.2/1124",
  memoCc: "Managing Director\nAudit Manager",
  directorApproverId: "approver-1",
}

describe("month helpers used when forwarding HR terms", () => {
  it("turns saved dates and timestamps into month-input values", () => {
    expect(toMonthInputValue("2026-10-01")).toBe("2026-10")
    expect(toMonthInputValue("2026-11-15T08:30:00+00:00")).toBe("2026-11")
    expect(toMonthInputValue("2026-12")).toBe("2026-12")
  })

  it("returns an empty string when there is no usable date, so the field is not faked", () => {
    expect(toMonthInputValue(null)).toBe("")
    expect(toMonthInputValue(undefined)).toBe("")
    expect(toMonthInputValue("")).toBe("")
    expect(toMonthInputValue("TBD")).toBe("")
  })

  it("sends the server a first-of-month date for every format the form can hold", () => {
    expect(monthToFirstOfMonthDate("2026-10")).toBe("2026-10-01")
    expect(monthToFirstOfMonthDate("2026-10-15")).toBe("2026-10-01")
    expect(monthToFirstOfMonthDate("October 2026")).toBe("2026-10-01")
    expect(monthToFirstOfMonthDate("nov 2026")).toBe("2026-11-01")
  })

  it("rejects values that are not a month instead of sending a bad date", () => {
    expect(monthToFirstOfMonthDate("")).toBeNull()
    expect(monthToFirstOfMonthDate(null)).toBeNull()
    expect(monthToFirstOfMonthDate("TBD")).toBeNull()
    expect(monthToFirstOfMonthDate("Octember 2026")).toBeNull()
  })

  it("falls back to the date saved on the loan exactly when the field is blank", () => {
    const effective = (field: string, saved: string | null) => field || toMonthInputValue(saved)
    expect(effective("", "2026-10-01")).toBe("2026-10")
    expect(effective("2026-09", "2026-10-01")).toBe("2026-09")
    expect(monthToFirstOfMonthDate(effective("", null))).toBeNull()
  })
})

describe("isUsableSignatureImage", () => {
  it("rejects the tiny blank image a signature pad exports when nothing was drawn", () => {
    expect(isUsableSignatureImage("data:image/png;base64," + "A".repeat(99))).toBe(false)
  })

  it("accepts a real signature image", () => {
    expect(isUsableSignatureImage("data:image/png;base64," + "A".repeat(2000))).toBe(true)
  })

  it("rejects empty values and anything that is not an image", () => {
    expect(isUsableSignatureImage(null)).toBe(false)
    expect(isUsableSignatureImage("")).toBe(false)
    expect(isUsableSignatureImage("https://example.com/" + "a".repeat(400))).toBe(false)
  })
})

describe("splitMemoAtSigner", () => {
  const memo = [
    "YAW AMPOFO (S/No.: 234567)",
    "We refer to your request. Mr. Frank Ofusu has reviewed it.",
    "You can count on our co-operation.",
    "MR. FRANK OFUSU",
    "DEPUTY HUMAN RESOURCE MANAGER",
    "cc:  Managing Director",
    "     Audit Manager",
  ].join("\n")

  it("puts the signature slot directly above the signer's name and keeps cc separate", () => {
    const parts = splitMemoAtSigner(memo, "Mr. Frank Ofusu")
    expect(parts.before.endsWith("You can count on our co-operation.")).toBe(true)
    expect(parts.signer).toBe("MR. FRANK OFUSU\nDEPUTY HUMAN RESOURCE MANAGER")
    expect(parts.cc).toBe("cc:  Managing Director\n     Audit Manager")
  })

  it("ignores the name when it is only mentioned earlier in the body", () => {
    expect(splitMemoAtSigner(memo, "Frank Ofusu").signer.startsWith("MR. FRANK OFUSU")).toBe(true)
  })

  it("matches the name whatever the title or capitalisation", () => {
    expect(splitMemoAtSigner(memo, "frank ofusu").signer).toContain("DEPUTY HUMAN RESOURCE MANAGER")
  })

  it("puts the signature just before the cc block when the name is not found", () => {
    const parts = splitMemoAtSigner(memo, "Someone Else")
    expect(parts.signer).toBe("")
    expect(parts.cc.startsWith("cc:")).toBe(true)
    expect(parts.before).toContain("DEPUTY HUMAN RESOURCE MANAGER")
  })

  it("works when there is no cc block", () => {
    const parts = splitMemoAtSigner("Body text\nMR. FRANK OFUSU\nDEPUTY HUMAN RESOURCE MANAGER", "Mr. Frank Ofusu")
    expect(parts.before).toBe("Body text")
    expect(parts.cc).toBe("")
  })

  it("does not guess when no signer name is known", () => {
    const parts = splitMemoAtSigner(memo, null)
    expect(parts.signer).toBe("")
  })
})

describe("formatMemoCcLines", () => {
  it("prints exactly the recipients the HR Loan Office entered, one per aligned line", () => {
    expect(formatMemoCcLines("Managing Director\nAudit Manager\nRegistry Unit")).toEqual([
      "cc:  Managing Director",
      "     Audit Manager",
      "     Registry Unit",
    ])
  })

  it("falls back to the standard list only when no CC text exists at all", () => {
    expect(formatMemoCcLines(undefined)).toEqual(formatMemoCcLines(DEFAULT_MEMO_CC))
    expect(formatMemoCcLines("")).toEqual([])
  })

  it("does not repeat a recipient that differs only by case, spacing or punctuation", () => {
    const lines = formatMemoCcLines("Deputy Director Finance\nDEPUTY  DIRECTOR FINANCE\nDeputy Director Finance.")
    expect(lines).toEqual(["cc:  Deputy Director Finance"])
  })

  it("separates recipients on commas and semicolons exactly like the PDF renderer", () => {
    // The memo PDF splits the saved CC text on new lines, commas and semicolons, so the
    // editable memo must too; otherwise the two would list different recipients.
    expect(formatMemoCcLines("Audit Manager, Registry Unit; Records Unit")).toEqual([
      "cc:  Audit Manager",
      "     Registry Unit",
      "     Records Unit",
    ])
  })
})

describe("memoTermsSignature", () => {
  it("is stable for identical terms and ignores stray whitespace", () => {
    expect(memoTermsSignature(terms)).toBe(memoTermsSignature({ ...terms, hodRank: "  Regional   Manager " }))
  })

  it("changes when any printed term changes", () => {
    const base = memoTermsSignature(terms)
    expect(memoTermsSignature({ ...terms, months: "2" })).not.toBe(base)
    expect(memoTermsSignature({ ...terms, memoCc: "Managing Director" })).not.toBe(base)
    expect(memoTermsSignature({ ...terms, hodLocation: "Head Office" })).not.toBe(base)
    expect(memoTermsSignature({ ...terms, memoRecipient: "Accounts Manager" })).not.toBe(base)
  })
})

describe("decideForwardedMemo", () => {
  const signature = memoTermsSignature(terms)

  it("builds the memo when the officer forwards without previewing", () => {
    expect(decideForwardedMemo("", null, signature)).toBe("regenerate")
    expect(decideForwardedMemo("   ", null, signature)).toBe("regenerate")
  })

  it("keeps the previewed and edited memo while the terms are unchanged", () => {
    expect(decideForwardedMemo("edited text", { signature, generated: "original text" }, signature)).toBe("keep")
  })

  it("keeps a saved draft while the terms are unchanged", () => {
    expect(decideForwardedMemo("saved draft", { signature, generated: null }, signature)).toBe("keep")
  })

  it("rebuilds an untouched auto draft when the terms change", () => {
    const changed = memoTermsSignature({ ...terms, months: "2" })
    expect(decideForwardedMemo("original text", { signature, generated: "original text" }, changed)).toBe("regenerate")
  })

  it("blocks forwarding an edited or saved memo whose terms have since changed", () => {
    const changed = memoTermsSignature({ ...terms, months: "2" })
    expect(decideForwardedMemo("edited text", { signature, generated: "original text" }, changed)).toBe("blocked")
    expect(decideForwardedMemo("saved draft", { signature, generated: null }, changed)).toBe("blocked")
  })
})
