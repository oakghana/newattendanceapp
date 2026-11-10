export const DEFAULT_MEMO_CC =
  "Managing Director\nDeputy Managing Director\nDeputy Director Finance\nDeputy Director Human Resource\nAudit Manager\nRegistry Unit\nRecords Unit"

/**
 * Turns the HR Loan Office "Memo CC Recipients" text into the cc block printed in
 * the memo body. Names are split the same way the PDF renderer splits them (new
 * line, comma or semicolon) and de-duplicated ignoring punctuation and case, so
 * "Deputy Director Finance" and "Deputy Director, Finance" are one recipient.
 */
export function formatMemoCcLines(memoCc?: string | null): string[] {
  const seen = new Set<string>()
  const recipients = String(memoCc ?? DEFAULT_MEMO_CC)
    .split(/[\r\n,;]+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      const key = line.toLowerCase().replace(/[^a-z0-9]+/g, "")
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  return recipients.map((name, index) => (index === 0 ? `cc:  ${name}` : `     ${name}`))
}

export type MemoTermsInputs = {
  disbursement: string
  recovery: string
  months: string
  basicSalary: string
  hodName: string
  hodRank: string
  hodLocation: string
  memoRecipient: string
  memoRef: string
  memoCc: string
  directorApproverId: string
}

/** Fingerprint of every Set Terms input that is printed in the memo. */
export function memoTermsSignature(inputs: MemoTermsInputs): string {
  const clean = (value: string) => String(value ?? "").replace(/\s+/g, " ").trim()
  return JSON.stringify([
    clean(inputs.disbursement),
    clean(inputs.recovery),
    clean(inputs.months),
    clean(inputs.basicSalary),
    clean(inputs.hodName),
    clean(inputs.hodRank),
    clean(inputs.hodLocation),
    clean(inputs.memoRecipient),
    clean(inputs.memoRef),
    clean(inputs.memoCc),
    clean(inputs.directorApproverId),
  ])
}

/**
 * The memo text last shown to the HR Loan Office officer, and the terms it was
 * built from. `generated` is null when the text was loaded from a saved draft, so
 * we cannot tell whether it carries manual edits.
 */
export type MemoDraftBase = { signature: string; generated: string | null }

export type ForwardedMemoDecision = "regenerate" | "keep" | "blocked"

/**
 * Decides which memo text is forwarded to the HR Executive:
 *  - no memo text yet                      -> build it from the current terms
 *  - terms unchanged since it was drafted  -> keep it (preserves manual edits)
 *  - terms changed, text was never edited  -> rebuild it from the new terms
 *  - terms changed, text may be edited     -> blocked, the officer must re-preview
 */
export function decideForwardedMemo(
  existingText: string,
  base: MemoDraftBase | null,
  currentSignature: string,
): ForwardedMemoDecision {
  if (!String(existingText || "").trim()) return "regenerate"
  if (base && base.signature === currentSignature) return "keep"
  if (base && base.generated !== null && existingText === base.generated) return "regenerate"
  return "blocked"
}
