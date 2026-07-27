import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(req: NextRequest) {
  try {
    // Get unique departments from leave_plan_requests
    const { data: departmentData, error: deptError } = await admin
      .from("leave_plan_requests")
      .select("department", { count: "exact" })
      .neq("department", null)

    if (deptError) {
      console.error("[filter-options] Department query error:", deptError)
      return NextResponse.json({ departments: [], leaveTypes: [] })
    }

    // Get unique leave types
    const { data: leaveTypeData, error: typeError } = await admin
      .from("leave_plan_requests")
      .select("leave_type_key", { count: "exact" })
      .neq("leave_type_key", null)

    if (typeError) {
      console.error("[filter-options] Leave type query error:", typeError)
      return NextResponse.json({ departments: [], leaveTypes: [] })
    }

    // Extract unique values
    const departments = Array.from(
      new Set(
        (departmentData || [])
          .map((d: any) => d.department)
          .filter(Boolean)
      )
    ).sort() as string[]

    const leaveTypes = Array.from(
      new Set(
        (leaveTypeData || [])
          .map((d: any) => d.leave_type_key)
          .filter(Boolean)
      )
    ).sort() as string[]

    return NextResponse.json({
      departments,
      leaveTypes,
    })
  } catch (error) {
    console.error("[filter-options] Error:", error)
    return NextResponse.json(
      { error: "Failed to load filter options" },
      { status: 500 }
    )
  }
}
