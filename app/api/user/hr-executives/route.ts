import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/user/hr-executives
 * Returns list of HR executives available for signer assignment
 * Used by HR Leave Office staff to select who should sign deferment/recall memos
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()

    // Query parameters
    const { searchParams } = new URL(request.url)
    const userRole = searchParams.get("role") || ""

    // HR executive roles that can sign documents
    const HR_EXECUTIVE_ROLES = [
      "manager_hr",
      "director_hr",
      "hr_officer",
      "hr_executive",
      "hr_manager",
      "deputy_hr",
      "deputy_director_hr",
      "human_resource_manager",
      "admin",
    ]

    // Fetch all active HR executives
    const { data: executives, error } = await admin
      .from("user_profiles")
      .select(
        "id, first_name, last_name, position, email, signature_data_url, role, department_id"
      )
      .in("role", HR_EXECUTIVE_ROLES)
      .eq("is_active", true)
      .order("first_name asc")
      .order("last_name asc")

    if (error) {
      console.error("[v0] Error fetching HR executives:", error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Transform data for frontend
    const transformedExecutives = (executives || []).map((exec) => ({
      id: exec.id,
      first_name: exec.first_name,
      last_name: exec.last_name,
      name: `${exec.first_name || ""} ${exec.last_name || ""}`.trim(),
      position: exec.position,
      email: exec.email,
      role: exec.role,
      signature_data_url: exec.signature_data_url,
      has_signature: !!exec.signature_data_url,
    }))

    console.log("[v0] HR executives fetched:", {
      count: transformedExecutives.length,
      fromRole: userRole,
    })

    return NextResponse.json({
      executives: transformedExecutives,
      count: transformedExecutives.length,
    })
  } catch (error) {
    console.error("[v0] HR executives endpoint error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    )
  }
}
