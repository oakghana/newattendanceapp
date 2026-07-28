import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * POST /api/migrate/memo-reference
 * Adds the memo_reference column to leave_plan_requests if it does not exist.
 * Called automatically by the hr-office route when the column is missing.
 */
export async function POST() {
  try {
    const admin = await createAdminClient()

    // Check if column already exists
    const { error: checkError } = await admin
      .from("leave_plan_requests")
      .select("memo_reference")
      .limit(1)

    if (!checkError) {
      return NextResponse.json({ message: "memo_reference column already exists" })
    }

    // Column is missing — run the DDL via the Supabase REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error: "Supabase configuration missing",
          sql: "ALTER TABLE public.leave_plan_requests ADD COLUMN IF NOT EXISTS memo_reference TEXT;",
          message: "Please run the SQL above in your Supabase SQL Editor.",
        },
        { status: 500 },
      )
    }

    const sql =
      "ALTER TABLE public.leave_plan_requests ADD COLUMN IF NOT EXISTS memo_reference TEXT;"

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ sql }),
    })

    if (!response.ok) {
      const body = await response.text()
      return NextResponse.json(
        {
          error: "Auto-migration failed",
          sql,
          message:
            "Please run the SQL above manually in your Supabase SQL Editor, then retry.",
          detail: body,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({ message: "memo_reference column added successfully" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 },
    )
  }
}
