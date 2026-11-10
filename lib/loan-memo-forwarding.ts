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

/**
 * Value for an <input type="month">. Accepts a saved date (YYYY-MM-DD or a full
 * timestamp) or YYYY-MM and returns YYYY-MM, or "" when there is nothing usable.
 */
export function toMonthInputValue(value?: string | null): string {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}` : ""
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]

/**
 * Converts a month value to the first day of that month (YYYY-MM-01) for the API.
 * Accepts YYYY-MM, YYYY-MM-DD, or a displayed value such as "October 2026" and
 * returns null when the value cannot be read as a month.
 */
export function monthToFirstOfMonthDate(value?: string | null): string | null {
  const text = String(value ?? "").trim()
  if (!text) return null
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return `${text.slice(0, 7)}-01`
  const named = text.match(/^([A-Za-z]+)\.?\s+(\d{4})$/)
  if (named) {
    const index = MONTH_NAMES.findIndex((name) => name === named[1].toLowerCase() || name.slice(0, 3) === named[1].toLowerCase())
    if (index >= 0) return `${named[2]}-${String(index + 1).padStart(2, "0")}-01`
  }
  return null
}

/**
 * A signature pad that was never drawn on still exports a tiny blank PNG. Treat that as "no
 * signature" instead of showing an empty box.
 */
export function isUsableSignatureImage(dataUrl?: string | null): boolean {
  const value = String(dataUrl ?? "")
  return value.startsWith("data:image/") && value.length > 200
}

function normalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof|rev|hon)\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Splits memo text so a signature can be placed directly above the signer's name:
 * everything before the name, the name/position lines, and the cc block. The last line that
 * contains the signer's name wins, so a name mentioned earlier in the body is ignored. When the
 * name is not found, the signature goes just before the cc block.
 */
export function splitMemoAtSigner(text: string, signerName?: string | null): { before: string; signer: string; cc: string } {
  const lines = String(text ?? "").split("\n")
  const ccIndex = lines.findIndex((line) => /^\s*cc\s*:/i.test(line))
  const end = ccIndex === -1 ? lines.length : ccIndex
  const needle = normalizePersonName(String(signerName ?? ""))
  let signerIndex = -1
  if (needle.length >= 3) {
    for (let index = end - 1; index >= 0; index -= 1) {
      if (lines[index].trim() && normalizePersonName(lines[index]).includes(needle)) {
        signerIndex = index
        break
      }
    }
  }
  const splitAt = signerIndex === -1 ? end : signerIndex
  return {
    before: lines.slice(0, splitAt).join("\n").replace(/\s+$/, ""),
    signer: lines.slice(splitAt, end).join("\n").trim(),
    cc: lines.slice(end).join("\n").trim(),
  }
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
