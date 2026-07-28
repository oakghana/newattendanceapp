import { NextResponse } from "next/server"

/**
 * POST /api/migrate/memo-reference
 * Returns the SQL required to add memo_reference to leave_plan_requests.
 * The actual DDL must be run by an admin in the Supabase SQL Editor.
 */
export async function POST() {
  const sql =
    "ALTER TABLE public.leave_plan_requests ADD COLUMN IF NOT EXISTS memo_reference TEXT;"

  return NextResponse.json({
    message:
      "Please run the following SQL in your Supabase SQL Editor to add the memo_reference column, then retry the action.",
    sql,
  })
}
