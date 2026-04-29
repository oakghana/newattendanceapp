import crypto from "crypto"

type MemoTokenPayload = {
  loanId: string
  userId: string
  exp: number
}

function getMemoSecret() {
  return (
    process.env.LOAN_MEMO_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "loan-memo-dev-secret"
  )
}

function toBase64Url(input: Buffer | string) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8")
  return raw.toString("base64url")
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url")
}

export function createMemoToken(payload: MemoTokenPayload) {
  const encoded = toBase64Url(JSON.stringify(payload))
  const signature = crypto.createHmac("sha256", getMemoSecret()).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyMemoToken(token: string): MemoTokenPayload | null {
  const parts = String(token || "").split(".")
  if (parts.length !== 2) return null

  const [encoded, signature] = parts
  const expected = crypto.createHmac("sha256", getMemoSecret()).update(encoded).digest("base64url")
  if (signature.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  try {
    const payload = JSON.parse(fromBase64Url(encoded).toString("utf8")) as MemoTokenPayload
    if (!payload?.loanId || !payload?.userId || !payload?.exp) return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
