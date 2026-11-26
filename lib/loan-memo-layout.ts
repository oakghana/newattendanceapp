export const MEMO_CORRECTION_ACTION = "ADMIN_APPROVED_LOAN_MEMO_CORRECTION"
export const MEMO_CORRECTION_LAYOUT_VERSION = 2
export const MEMO_COURTESY_LINE = "You can count on our co-operation."
export const MEMO_COMPANY_LINE = "QUALITY CONTROL COMPANY LIMITED"

export interface MemoLayout {
  applicantName: string
  applicantStaffNo: string
  applicantPosition: string
  throRank: string
  throLocation: string
  subject: string
  paragraphs: string[]
  signerName: string
  signerTitle: string
  ccRecipients: string[]
}

const COURTESY_PATTERN = /^you can count on our co-operation\.?$/i

export function formatMemoLayoutAsText(layout: MemoLayout): string {
  const lines: string[] = []
  lines.push(layout.applicantStaffNo ? `${layout.applicantName}  (S/No.: ${layout.applicantStaffNo})` : layout.applicantName)
  lines.push(layout.applicantPosition)
  lines.push("")
  if (layout.throRank || layout.throLocation) {
    lines.push(`THRO'   ${layout.throRank || layout.throLocation}`)
    lines.push(`    ${MEMO_COMPANY_LINE}`)
    lines.push(`    ${layout.throLocation}`)
    lines.push("")
  }
  lines.push(`RE: ${layout.subject}`)
  lines.push("")
  const body = layout.paragraphs.filter((paragraph) => paragraph.trim() && !COURTESY_PATTERN.test(paragraph.trim()))
  for (const paragraph of body) {
    lines.push(paragraph, "")
  }
  lines.push(MEMO_COURTESY_LINE, "")
  lines.push(layout.signerName)
  lines.push(layout.signerTitle)
  lines.push("FOR: MANAGING DIRECTOR")
  if (layout.ccRecipients.length) {
    lines.push("")
    layout.ccRecipients.forEach((recipient, index) => lines.push(index === 0 ? `cc:  ${recipient}` : `     ${recipient}`))
  }
  return lines.join("\n")
}

export function stripStaffSummaryLinesFromMemoText(text: string): string {
  const lines = String(text || "").replace(/\r/g, "").split("\n")
  const subjectIndex = lines.findIndex((line) => /^\s*re\s*:/i.test(line))
  if (subjectIndex < 0) return lines.join("\n")

  const cleaned = lines.filter((line, index) =>
    index >= subjectIndex || !/^\s*(department|location)\s*:/i.test(line),
  )
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function parseMemoLayoutFromText(text: string): Partial<MemoLayout> {
  const rawLines = String(text || "").replace(/\r/g, "").split("\n")
  const lines = rawLines.map((line) => line.replace(/\s+/g, " ").trim())
  const findFrom = (pattern: RegExp, from = 0) => {
    for (let index = Math.max(from, 0); index < lines.length; index++) if (pattern.test(lines[index])) return index
    return -1
  }
  const nextNonEmpty = (from: number) => {
    for (let index = from; index < lines.length; index++) if (lines[index]) return index
    return -1
  }

  const result: Partial<MemoLayout> = {}

  const nameIndex = findFrom(/\(\s*s\/?\s*no\.?\s*:?\s*[^)]*\)/i)
  if (nameIndex >= 0) {
    const match = lines[nameIndex].match(/^(.*?)\s*\(\s*s\/?\s*no\.?\s*:?\s*([^)]*)\)/i)
    if (match) {
      const name = match[1].trim()
      if (name) result.applicantName = name.toUpperCase()
      result.applicantStaffNo = match[2].trim()
    }
    const rankIndex = nextNonEmpty(nameIndex + 1)
    if (rankIndex >= 0 && !/^(thro['’`]?(\s|$)|re\s*:)/i.test(lines[rankIndex])) result.applicantPosition = lines[rankIndex].toUpperCase()
  }

  const reIndex = findFrom(/^re\s*:/i)
  const throIndex = findFrom(/^thro/i)
  if (throIndex >= 0) {
    result.throRank = lines[throIndex].replace(/^thro['’`]?\s*/i, "").trim().toUpperCase()
    const blockEnd = reIndex > throIndex ? reIndex : lines.length
    const throLines: string[] = []
    for (let index = throIndex + 1; index < blockEnd && throLines.length < 2; index++) if (lines[index]) throLines.push(lines[index])
    const locationLine = throLines.find((line) => !/^quality control company/i.test(line))
    if (locationLine) result.throLocation = locationLine.toUpperCase()
  }

  if (reIndex >= 0) {
    const subject = lines[reIndex].replace(/^re\s*:\s*/i, "").trim()
    if (subject) result.subject = subject.toUpperCase()
  }

  const ccIndex = findFrom(/^cc\s*:/i, Math.max(reIndex, 0))
  const courtesyIndex = findFrom(COURTESY_PATTERN, Math.max(reIndex, 0))
  const bodyStart = reIndex >= 0 ? reIndex + 1 : throIndex >= 0 ? throIndex + 3 : 0
  const bodyEnd = courtesyIndex >= 0 ? courtesyIndex : ccIndex >= 0 ? ccIndex : lines.length
  const paragraphs: string[] = []
  let current: string[] = []
  for (let index = bodyStart; index < bodyEnd; index++) {
    if (lines[index]) current.push(lines[index])
    else if (current.length) {
      paragraphs.push(current.join(" "))
      current = []
    }
  }
  if (current.length) paragraphs.push(current.join(" "))
  if (paragraphs.length) result.paragraphs = paragraphs

  const signerStart = courtesyIndex >= 0 ? courtesyIndex + 1 : -1
  if (signerStart >= 0) {
    const signerEnd = ccIndex >= 0 ? ccIndex : lines.length
    const signerLines: string[] = []
    for (let index = signerStart; index < signerEnd; index++) if (lines[index] && !/^for\s*:/i.test(lines[index])) signerLines.push(lines[index])
    if (signerLines[0]) result.signerName = signerLines[0].toUpperCase()
    if (signerLines[1]) result.signerTitle = signerLines[1].toUpperCase()
  }

  if (ccIndex >= 0) {
    const recipients: string[] = []
    for (let index = ccIndex; index < lines.length; index++) {
      const value = (index === ccIndex ? lines[index].replace(/^cc\s*:\s*/i, "") : lines[index]).trim()
      if (value) recipients.push(value)
    }
    result.ccRecipients = recipients
  }

  return result
}
