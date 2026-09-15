import { NextRequest, NextResponse } from "next/server"
import { getMemoTypeLabel, lookupVerificationCode } from "@/lib/memo-security"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const userAgent = req.headers.get("user-agent") || null

  const result = await lookupVerificationCode(code, { ipAddress, userAgent })

  if (!result.found) {
    return NextResponse.json({ found: false }, { status: 404 })
  }

  return NextResponse.json({
    found: true,
    status: result.status,
    memoTypeLabel: getMemoTypeLabel(result.memoType || ""),
    referenceNumber: result.referenceNumber,
    staffName: result.staffName,
    issuedAt: result.issuedAt,
    lockedAt: result.lockedAt,
    revokedAt: result.revokedAt,
    revokedReason: result.revokedReason,
  })
}
