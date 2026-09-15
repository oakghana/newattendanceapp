import "server-only"
import crypto from "crypto"
import QRCode from "qrcode"
import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Anti-forgery / security layer shared across ALL memo types (loan, leave,
 * deferment, recall, payment advice). Each generated memo gets:
 *  - a unique, hard-to-guess verification code
 *  - a tamper-evident SHA-256 hash of its printed content
 *  - a lock that freezes the hash once the memo reaches a final/approved
 *    state, so any later edit to the underlying record is detectable
 *  - a full audit trail of every generate/lock/verify/tamper event
 */

export type MemoType =
  | "loan"
  | "leave_annual"
  | "leave_casual"
  | "leave_sick"
  | "leave_maternity"
  | "leave_paternity"
  | "leave_study"
  | "leave_compassionate"
  | "leave_part"
  | "leave_no_pay"
  | "leave_absence"
  | "leave_generic"
  | "deferment"
  | "recall"
  | "payment_advice"

export type MemoAuditAction =
  | "generated"
  | "locked"
  | "downloaded"
  | "viewed"
  | "verified"
  | "tamper_detected"
  | "revoked"
  | "verification_not_found"

export interface MemoContentFields {
  [key: string]: string | number | boolean | null | undefined
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no ambiguous I, O, 0, 1

function canonicalize(fields: MemoContentFields): string {
  const keys = Object.keys(fields).sort()
  const normalized: Record<string, string> = {}
  for (const key of keys) {
    const value = fields[key]
    normalized[key] = value === null || value === undefined ? "" : String(value).trim()
  }
  return JSON.stringify(normalized)
}

/** Deterministic SHA-256 hash of a memo's printed content fields. */
export function computeContentHash(fields: MemoContentFields): string {
  return crypto.createHash("sha256").update(canonicalize(fields)).digest("hex")
}

function generateVerificationCode(): string {
  const random = crypto.randomBytes(12)
  let code = ""
  for (let i = 0; i < 12; i++) {
    code += CODE_ALPHABET[random[i] % CODE_ALPHABET.length]
  }
  return `ATT-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
}

/**
 * Resolves the fully-qualified origin that should be encoded into a memo's
 * verification QR code. Prefers the host the current request actually
 * arrived on (so the QR always points at whatever domain staff are using -
 * custom domain, preview alias, etc.), then falls back to explicit env vars,
 * then the Vercel-assigned deployment URL for contexts with no request (e.g.
 * background jobs). A relative-only fallback would encode a QR code with no
 * scheme/host, which most phone camera scanners cannot open as a link.
 */
async function getBaseUrl(): Promise<string> {
  try {
    const headerList = await headers()
    const host = headerList.get("x-forwarded-host") || headerList.get("host")
    if (host) {
      const proto = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")
      return `${proto}://${host}`.replace(/\/$/, "")
    }
  } catch {
    // headers() throws outside a request scope (e.g. scripts/cron); fall through.
  }
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return ""
}

export async function buildVerifyUrl(verificationCode: string): Promise<string> {
  const base = await getBaseUrl()
  return `${base}/verify/${verificationCode}`
}

interface LogAuditParams {
  verificationCode?: string | null
  memoType: MemoType
  memoId: string
  action: MemoAuditAction
  actorId?: string | null
  actorName?: string | null
  actorRole?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

export async function logMemoAudit(params: LogAuditParams): Promise<void> {
  try {
    const supabase = await createAdminClient()
    await supabase.from("memo_audit_log").insert({
      verification_code: params.verificationCode ?? null,
      memo_type: params.memoType,
      memo_id: params.memoId,
      action: params.action,
      actor_id: params.actorId ?? null,
      actor_name: params.actorName ?? null,
      actor_role: params.actorRole ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      metadata: params.metadata ?? null,
    })
  } catch (error) {
    console.error("[v0] Failed to write memo audit log entry:", error)
  }
}

export interface EnsureMemoSecurityParams {
  memoType: MemoType
  memoId: string
  fields: MemoContentFields
  referenceNumber?: string | null
  staffId?: string | null
  staffName?: string | null
  issuedBy?: string | null
  /** Pass true once the memo has reached its final/approved state. This
   * freezes the content hash permanently - any later change to the
   * underlying record will be flagged as tampering. */
  lock?: boolean
}

export interface MemoSecurityResult {
  verificationCode: string
  contentHash: string
  verifyUrl: string
  qrDataUrl: string
  isLocked: boolean
  tamperDetected: boolean
}

async function buildQrDataUrl(verifyUrl: string): Promise<string> {
  try {
    return await QRCode.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: "M" })
  } catch (error) {
    console.error("[v0] Failed to generate verification QR code:", error)
    return ""
  }
}

/**
 * Idempotently ensures a memo has a security record: creates one on first
 * generation, refreshes the hash on subsequent (pre-lock) regenerations, and
 * once locked, freezes the hash and flags any mismatch as tamper evidence.
 * Call this every time a memo PDF is generated (draft or final).
 */
export async function ensureMemoSecurity(params: EnsureMemoSecurityParams): Promise<MemoSecurityResult> {
  const { memoType, memoId, fields, referenceNumber, staffId, staffName, issuedBy, lock = false } = params
  const supabase = await createAdminClient()
  const currentHash = computeContentHash(fields)

  const { data: existing } = await supabase
    .from("memo_security_records")
    .select("*")
    .eq("memo_type", memoType)
    .eq("memo_id", memoId)
    .maybeSingle()

  if (existing) {
    if (existing.locked_at) {
      const tamperDetected = existing.content_hash !== currentHash
      if (tamperDetected) {
        await logMemoAudit({
          verificationCode: existing.verification_code,
          memoType,
          memoId,
          action: "tamper_detected",
          actorId: issuedBy,
          metadata: { expectedHash: existing.content_hash, actualHash: currentHash },
        })
      }
      const verifyUrl = await buildVerifyUrl(existing.verification_code)
      return {
        verificationCode: existing.verification_code,
        contentHash: existing.content_hash,
        verifyUrl,
        qrDataUrl: await buildQrDataUrl(verifyUrl),
        isLocked: true,
        tamperDetected,
      }
    }

    const updates: Record<string, unknown> = {
      content_hash: currentHash,
      reference_number: referenceNumber ?? existing.reference_number,
      staff_id: staffId ?? existing.staff_id,
      staff_name: staffName ?? existing.staff_name,
      updated_at: new Date().toISOString(),
    }
    if (lock) {
      updates.locked_at = new Date().toISOString()
      updates.locked_payload = fields
    }
    await supabase.from("memo_security_records").update(updates).eq("id", existing.id)
    await logMemoAudit({
      verificationCode: existing.verification_code,
      memoType,
      memoId,
      action: lock ? "locked" : "generated",
      actorId: issuedBy,
    })

    const verifyUrl = await buildVerifyUrl(existing.verification_code)
    return {
      verificationCode: existing.verification_code,
      contentHash: currentHash,
      verifyUrl,
      qrDataUrl: await buildQrDataUrl(verifyUrl),
      isLocked: lock,
      tamperDetected: false,
    }
  }

  let verificationCode = generateVerificationCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: duplicate } = await supabase
      .from("memo_security_records")
      .select("id")
      .eq("verification_code", verificationCode)
      .maybeSingle()
    if (!duplicate) break
    verificationCode = generateVerificationCode()
  }

  const insertPayload: Record<string, unknown> = {
    memo_type: memoType,
    memo_id: memoId,
    verification_code: verificationCode,
    content_hash: currentHash,
    reference_number: referenceNumber ?? null,
    staff_id: staffId ?? null,
    staff_name: staffName ?? null,
    issued_by: issuedBy ?? null,
  }
  if (lock) {
    insertPayload.locked_at = new Date().toISOString()
    insertPayload.locked_payload = fields
  }

  const { error: insertError } = await supabase.from("memo_security_records").insert(insertPayload)
  if (insertError) {
    console.error("[v0] Failed to create memo security record:", insertError)
  }

  await logMemoAudit({
    verificationCode,
    memoType,
    memoId,
    action: lock ? "locked" : "generated",
    actorId: issuedBy,
  })

  const verifyUrl = await buildVerifyUrl(verificationCode)
  return {
    verificationCode,
    contentHash: currentHash,
    verifyUrl,
    qrDataUrl: await buildQrDataUrl(verifyUrl),
    isLocked: lock,
    tamperDetected: false,
  }
}

export interface VerificationLookupResult {
  found: boolean
  status?: "active" | "revoked" | "superseded"
  memoType?: MemoType
  referenceNumber?: string | null
  staffName?: string | null
  issuedAt?: string | null
  lockedAt?: string | null
  revokedAt?: string | null
  revokedReason?: string | null
}

const MEMO_TYPE_LABELS: Record<MemoType, string> = {
  loan: "Loan Memo",
  leave_annual: "Annual Leave Memo",
  leave_casual: "Casual Leave Memo",
  leave_sick: "Sick Leave Memo",
  leave_maternity: "Maternity Leave Memo",
  leave_paternity: "Paternity Leave Memo",
  leave_study: "Study Leave Memo",
  leave_compassionate: "Compassionate Leave Memo",
  leave_part: "Part Leave Memo",
  leave_no_pay: "Leave Without Pay Memo",
  leave_absence: "Leave of Absence Memo",
  leave_generic: "Leave Memo",
  deferment: "Leave Deferment Memo",
  recall: "Leave Recall Memo",
  payment_advice: "Leave Payment Advice Memo",
}

export function getMemoTypeLabel(memoType: string): string {
  return MEMO_TYPE_LABELS[memoType as MemoType] ?? "Memo"
}

/** Looks up a verification code for the public verification page/API. Logs
 * every lookup attempt (found or not) to the audit trail. */
export async function lookupVerificationCode(
  code: string,
  context?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<VerificationLookupResult> {
  const supabase = await createAdminClient()
  const normalizedCode = code.trim().toUpperCase()

  const { data: record } = await supabase
    .from("memo_security_records")
    .select("*")
    .eq("verification_code", normalizedCode)
    .maybeSingle()

  if (!record) {
    await logMemoAudit({
      verificationCode: normalizedCode,
      memoType: "loan", // placeholder; not-found events aren't tied to a real memo type
      memoId: "00000000-0000-0000-0000-000000000000",
      action: "verification_not_found",
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    })
    return { found: false }
  }

  await logMemoAudit({
    verificationCode: record.verification_code,
    memoType: record.memo_type,
    memoId: record.memo_id,
    action: "verified",
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  })

  return {
    found: true,
    status: record.status,
    memoType: record.memo_type,
    referenceNumber: record.reference_number,
    staffName: record.staff_name,
    issuedAt: record.issued_at,
    lockedAt: record.locked_at,
    revokedAt: record.revoked_at,
    revokedReason: record.revoked_reason,
  }
}

export interface RevokeMemoParams {
  verificationCode: string
  revokedBy?: string | null
  reason: string
}

export async function revokeMemo(params: RevokeMemoParams): Promise<boolean> {
  const supabase = await createAdminClient()
  const { data: record } = await supabase
    .from("memo_security_records")
    .select("id, memo_type, memo_id")
    .eq("verification_code", params.verificationCode.trim().toUpperCase())
    .maybeSingle()

  if (!record) return false

  await supabase
    .from("memo_security_records")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: params.revokedBy ?? null,
      revoked_reason: params.reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id)

  await logMemoAudit({
    verificationCode: params.verificationCode,
    memoType: record.memo_type,
    memoId: record.memo_id,
    action: "revoked",
    actorId: params.revokedBy,
    metadata: { reason: params.reason },
  })

  return true
}
