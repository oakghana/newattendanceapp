import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://vgtajtqxgczhjboatvol.supabase.co"
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseKey) {
    return NextResponse.json({ error: "Supabase key not configured for server time sync" }, { status: 500 })
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "HEAD",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
    })

    const serverDateHeader = response.headers.get("date")
    if (!serverDateHeader) {
      throw new Error("Missing Date header from Supabase")
    }

    const dbNow = new Date(serverDateHeader)
    if (Number.isNaN(dbNow.getTime())) {
      throw new Error("Invalid Date header from Supabase")
    }

    return NextResponse.json(
      {
        utcIso: dbNow.toISOString(),
        utcEpochMs: dbNow.getTime(),
        timezone: "Africa/Accra",
        gmtOffset: "GMT+00:00",
        source: "supabase-server-date-header",
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
    console.error("[v0] Failed to fetch Supabase server time:", error)
    return NextResponse.json({ error: "Failed to resolve authoritative server time" }, { status: 500 })
  }
}
