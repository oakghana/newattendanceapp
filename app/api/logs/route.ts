import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { logs } = await request.json()
    const supabase = await createClient()

    const headers = {
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    }

    // Get current user if available
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Batch insert logs
    const logEntries = logs.map((log: any) => ({
      level: log.level,
      message: log.message,
      timestamp: log.timestamp,
      context: log.context,
      user_id: user?.id || log.userId,
      session_id: log.sessionId,
      component: log.component,
      action: log.action,
      error_details: log.error,
    }))

    const { error } = await supabase.from("application_logs").insert(logEntries)

    if (error) {
      console.error("Failed to insert logs:", error)
      return NextResponse.json({ error: "Failed to save logs" }, { status: 500, headers })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("Logging endpoint failed:", error)
    return NextResponse.json(
      { error: "Failed to process logs" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, private",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    )
  }
}
