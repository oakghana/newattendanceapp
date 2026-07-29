import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    // Get current UTC time from the server
    const now = new Date()
    
    return NextResponse.json(
      {
        utcIso: now.toISOString(),
        utcEpochMs: now.getTime(),
        timezone: "Africa/Accra",
        gmtOffset: "GMT+00:00",
        source: "server-system-time",
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  } catch (error) {
    console.error("[v0] Failed to get server time:", error)
    return NextResponse.json({ error: "Failed to resolve server time" }, { status: 500 })
  }
}
