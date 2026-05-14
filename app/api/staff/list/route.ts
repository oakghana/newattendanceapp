import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all staff without limit - use pagination internally for large datasets
    let allData: any[] = []
    let from = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data, error: pageError } = await supabase
        .from("user_profiles")
        .select(`
          id,
          employee_id,
          first_name,
          last_name,
          department_id,
          departments (name),
          region_id,
          regions (name)
        `)
        .eq("is_active", true)
        .order("first_name", { ascending: true })
        .range(from, from + pageSize - 1)

      if (pageError) throw pageError

      if (data && data.length > 0) {
        allData = [...allData, ...data]
        from += pageSize
        hasMore = data.length === pageSize
      } else {
        hasMore = false
      }
    }

    const data = allData
    const error = null

    if (error) throw error

    const staff = (data || []).map((s: any) => ({
      id: s.id,
      employee_id: s.employee_id || "N/A",
      first_name: s.first_name || "",
      last_name: s.last_name || "",
      department_name: s.departments?.name || "Unassigned",
      region_name: s.regions?.name || "Unassigned",
      region_id: s.region_id || null,
    }))

    return NextResponse.json({ staff, success: true })
  } catch (error) {
    console.error("[v0] Error fetching staff list:", error)
    return NextResponse.json({ error: "Failed to fetch staff", success: false }, { status: 500 })
  }
}
