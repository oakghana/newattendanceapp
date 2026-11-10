import { describe, expect, it } from "vitest"
import {
  DEFAULT_MEMO_CC,
  decideForwardedMemo,
  formatMemoCcLines,
  memoTermsSignature,
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
