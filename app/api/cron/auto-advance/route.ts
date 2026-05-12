import { NextResponse } from "next/server"

/**
 * Auto-Advance Cron Job Handler
 * This endpoint should be called every day to auto-advance pending leave and loan requests
 * that have been waiting for 2+ days in any approval stage
 *
 * Call this endpoint via a cron service like:
 * - Vercel Cron: `curl https://your-app.vercel.app/api/cron/auto-advance`
 * - External: Schedule with Upstash, AWS CloudWatch, or similar
 */

export async function GET(req: Request) {
  try {
    // Verify auth - check for cron secret
    const cronSecret = req.headers.get("authorization")
    const expectedSecret = process.env.CRON_SECRET || "default-secret"

    if (!cronSecret || cronSecret !== `Bearer ${expectedSecret}`) {
      console.warn("[v0] Unauthorized cron attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Starting auto-advance cron job")

    // Call leave auto-advance
    const leaveRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/leave/auto-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    const leaveData = await leaveRes.json()
    console.log("[v0] Leave auto-advance result:", leaveData)

    // Call loan auto-advance
    const loanRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/loan/auto-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    const loanData = await loanRes.json()
    console.log("[v0] Loan auto-advance result:", loanData)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      leave: leaveData,
      loan: loanData,
      message: "Auto-advance cron job completed successfully",
    })
  } catch (error: any) {
    console.error("[v0] Cron job error:", error)
    return NextResponse.json(
      { error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

// POST handler for manual triggering
export async function POST(req: Request) {
  return GET(req)
}
