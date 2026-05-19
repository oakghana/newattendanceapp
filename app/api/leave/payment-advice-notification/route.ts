import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables")
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

/**
 * POST: Record that payment advice has been sent to staff
 * Body: { staffIds: string[], month: string, category: string, memoId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { staffIds, month, category, memoId } = await request.json()

    if (!staffIds || !Array.isArray(staffIds) || staffIds.length === 0) {
      return NextResponse.json(
        { error: "staffIds array is required" },
        { status: 400 }
      )
    }

    if (!month) {
      return NextResponse.json(
        { error: "month is required (format: YYYY-MM)" },
        { status: 400 }
      )
    }

    // Create notification records for each staff member
    const notifications = staffIds.map((staffId) => ({
      user_id: staffId,
      notification_type: "payment_advice_sent",
      title: `Payment Advice Sent - ${category} Staff`,
      message: `Your leave payment advice for ${month} has been generated and sent to Finance.`,
      related_month: month,
      staff_category: category,
      memo_id: memoId,
      is_read: false,
      created_at: new Date().toISOString(),
    }))

    const { error: insertError } = await supabase
      .from("staff_notifications")
      .insert(notifications)

    if (insertError) {
      console.error("[v0] Error inserting notifications:", insertError)
      return NextResponse.json(
        { error: "Failed to create notifications" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      notificationsCount: notifications.length,
    })
  } catch (err) {
    console.error("[v0] Error in payment-advice-notification POST:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * GET: Fetch payment advice notifications for current user
 * Query: userId
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const userId = request.nextUrl.searchParams.get("userId")

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      )
    }

    // Fetch payment advice notifications for the user
    const { data, error } = await supabase
      .from("staff_notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("notification_type", "payment_advice_sent")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching notifications:", error)
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      notifications: data || [],
    })
  } catch (err) {
    console.error("[v0] Error in payment-advice-notification GET:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
