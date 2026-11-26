import { describe, expect, it } from "vitest"
import { formatMemoLayoutAsText, parseMemoLayoutFromText, type MemoLayout } from "../lib/loan-memo-layout"

const layout: MemoLayout = {
  applicantName: "AHULU EMELIA",
  applicantStaffNo: "1152760",
  applicantPosition: "PRIN. HUM. RES. OFFICER",
  throRank: "ARCHIVE HEAD",
  throLocation: "HEAD OFFICE",
  subject: "APPLICATION FOR FUNERAL LOAN",
  paragraphs: [
    "We refer to your loan application dated 2026-10-20 on the above subject and wish to inform you that, Management has given approval.",
    "The loan would be recovered in 24 Equal Monthly Instalment from your salary effective, December 2026.",
    "You can count on our co-operation.",
  ],
  signerName: "FRANK FREDUA-MENSAH (ESQ.)",
  signerTitle: "DEPUTY HUMAN RESOURCE MANAGER",
  ccRecipients: ["Managing Director", "Deputy Managing Director", "Records Unit"],
}

describe("loan memo layout text", () => {
  it("round-trips every editable line", () => {
    const parsed = parseMemoLayoutFromText(formatMemoLayoutAsText(layout))
    expect(parsed.applicantName).toBe("AHULU EMELIA")
    expect(parsed.applicantStaffNo).toBe("1152760")
    expect(parsed.applicantPosition).toBe("PRIN. HUM. RES. OFFICER")
    expect(parsed.throRank).toBe("ARCHIVE HEAD")
    expect(parsed.throLocation).toBe("HEAD OFFICE")
    expect(parsed.subject).toBe("APPLICATION FOR FUNERAL LOAN")
    expect(parsed.paragraphs).toEqual(layout.paragraphs.slice(0, 2))
    expect(parsed.signerName).toBe("FRANK FREDUA-MENSAH (ESQ.)")
    expect(parsed.signerTitle).toBe("DEPUTY HUMAN RESOURCE MANAGER")
    expect(parsed.ccRecipients).toEqual(layout.ccRecipients)
  })

  it("picks up an Admin's edits to rank, THRO, subject, body, signatory and cc", () => {
    const edited = formatMemoLayoutAsText(layout)
      .replace("PRIN. HUM. RES. OFFICER", "DEPUTY HUMAN RESOURCE MANAGER")
      .replace("THRO'   ARCHIVE HEAD", "THRO'   HUMAN RESOURCE MANAGER")
      .replace("FUNERAL LOAN", "FUNERAL SUPPORT")
      .replace("24 Equal", "12 Equal")
      .replace("FRANK FREDUA-MENSAH (ESQ.)", "FRANK ASANTE")
      .replace("Records Unit", "Registry Unit")
    const parsed = parseMemoLayoutFromText(edited)
    expect(parsed.applicantPosition).toBe("DEPUTY HUMAN RESOURCE MANAGER")
    expect(parsed.throRank).toBe("HUMAN RESOURCE MANAGER")
    expect(parsed.subject).toBe("APPLICATION FOR FUNERAL SUPPORT")
    expect(parsed.paragraphs?.[1]).toContain("12 Equal")
    expect(parsed.signerName).toBe("FRANK ASANTE")
    expect(parsed.ccRecipients?.at(-1)).toBe("Registry Unit")
  })

  it("reads a legacy saved letter that still has reference lines and extra indentation", () => {
    const legacy = [
      "Our Ref No: QCC/HRD/SWL/V.2/903",
      "Your Ref No: ________________________",
      "",
      "AHULU EMELIA (S/No.: 1152760)",
      "DEPUTY HUMAN RESOURCE MANAGER",
      "",
      "THRO'   HUMAN RESOURCE MANAGER",
      "                QUALITY CONTROL COMPANY LIMITED",
      "                HEAD OFFICE",
      "",
      "RE: APPLICATION FOR FUNERAL LOAN",
      "",
      "We refer to your loan application.",
      "",
      "You can count on our co-operation.",
      "",
      "FRANK FREDUA-MENSAH (ESQ.)",
      "DEPUTY HUMAN RESOURCE MANAGER",
      "FOR: MANAGING DIRECTOR",
      "",
      "cc:  Managing Director",
      "     Records Unit",
    ].join("\n")
    const parsed = parseMemoLayoutFromText(legacy)
    expect(parsed.throRank).toBe("HUMAN RESOURCE MANAGER")
    expect(parsed.throLocation).toBe("HEAD OFFICE")
    expect(parsed.paragraphs).toEqual(["We refer to your loan application."])
    expect(parsed.ccRecipients).toEqual(["Managing Director", "Records Unit"])
  })

  it("returns no paragraphs when the body was removed", () => {
    const parsed = parseMemoLayoutFromText("RE: SUBJECT\n\nYou can count on our co-operation.")
    expect(parsed.paragraphs).toBeUndefined()
  })
})
