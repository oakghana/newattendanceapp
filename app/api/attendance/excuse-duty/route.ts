import { createAdminClient, createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { notifyExcuseDutySubmitted } from "@/lib/excuse-duty-notifications"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Excuse duty API - Starting request")

    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log("[v0] Excuse duty API - Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Excuse duty API - User authenticated:", user.id)

    // Get form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const excuseDate = formData.get("excuseDate") as string
    const documentType = formData.get("documentType") as string
    const excuseReason = formData.get("excuseReason") as string

    if (!file || !excuseDate || !documentType || !excuseReason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Validate file
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 5MB" }, { status: 400 })
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 })
    }

    // Convert file to base64 for storage (in a real app, you'd use proper file storage like Supabase Storage)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64File = buffer.toString("base64")
    const fileUrl = `data:${file.type};base64,${base64File}`

    console.log("[v0] Excuse duty API - File processed:", file.name, file.type, file.size)

    // Check if there's an attendance record for this date
    const startOfDay = `${excuseDate}T00:00:00`
    const endOfDay = `${excuseDate}T23:59:59`

    const { data: attendanceRecords } = await supabase
      .from("attendance_records")
      .select("id")
      .eq("user_id", user.id)
      .gte("check_in_time", startOfDay)
      .lte("check_in_time", endOfDay)
      .limit(1)

    const attendanceRecord = attendanceRecords?.[0] || null

    console.log("[v0] Excuse duty API - Attendance record check:", attendanceRecord?.id || "none")

    // Insert excuse document
    const { data: excuseDoc, error: insertError } = await supabase
      .from("excuse_documents")
      .insert({
        user_id: user.id,
        attendance_record_id: attendanceRecord?.id || null,
        document_name: file.name,
        document_type: documentType,
        file_url: fileUrl,
        file_size: file.size,
        mime_type: file.type,
        excuse_reason: excuseReason,
        excuse_date: excuseDate,
        status: "pending",
      })
      .select()
      .single()

    if (insertError) {
      console.error("[v0] Excuse duty API - Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save excuse document" }, { status: 500 })
    }

    console.log("[v0] Excuse duty API - Document saved:", excuseDoc.id)

    // Update attendance record notes if it exists
    if (attendanceRecord) {
      const { error: updateError } = await supabase
        .from("attendance_records")
        .update({
          notes: `Excuse duty note submitted: ${documentType} - ${excuseReason}`,
          status: "absent", // Mark as absent with excuse
        })
        .eq("id", attendanceRecord.id)

      if (updateError) {
        console.error("[v0] Excuse duty API - Update attendance error:", updateError)
      } else {
        console.log("[v0] Excuse duty API - Attendance record updated")
      }
    }

    // Get user profile to find approvers
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("department_id, assigned_location_id, first_name, last_name, employee_id")
      .eq("id", user.id)
      .single()

    if (userProfile) {
      const admin = await createAdminClient()
      await notifyExcuseDutySubmitted(admin, {
        staffId: user.id,
        staffName: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
        departmentId: userProfile.department_id || null,
        assignedLocationId: userProfile.assigned_location_id || null,
        excuseDate,
        documentType,
        reason: excuseReason,
      })
      console.log("[v0] Excuse duty API - Notifications dispatched to HOD/RM/HR Executive")
    }

    // Log the action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "excuse_duty_submitted",
      table_name: "excuse_documents",
      record_id: excuseDoc.id,
      new_values: {
        excuse_date: excuseDate,
        document_type: documentType,
        status: "pending",
      },
    })

    console.log("[v0] Excuse duty API - Success")

    return NextResponse.json({
      success: true,
      message: "Excuse duty note submitted successfully",
      id: excuseDoc.id,
    })
  } catch (error) {
    console.error("[v0] Excuse duty API - Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Excuse duty GET API - Starting request")

    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log("[v0] Excuse duty GET API - Authentication failed")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Excuse duty GET API - User authenticated:", user.id)

    // Get excuse documents without trying to use a non-existent relationship
    const { data: excuseDocs, error } = await supabase
      .from("excuse_documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Excuse duty GET API - Query error:", error.message)
      return NextResponse.json({ error: "Failed to fetch excuse documents" }, { status: 500 })
    }

    const docsWithReviewers = await Promise.all(
      (excuseDocs || []).map(async (doc) => {
        if (doc.reviewed_by) {
          const { data: reviewer } = await supabase
            .from("user_profiles")
            .select("first_name, last_name")
            .eq("id", doc.reviewed_by)
            .single()

          return {
            ...doc,
            reviewed_by_profile: reviewer,
          }
        }
        return {
          ...doc,
          reviewed_by_profile: null,
        }
      }),
    )

    console.log("[v0] Excuse duty GET API - Found documents:", docsWithReviewers.length)

    return NextResponse.json({ excuseDocuments: docsWithReviewers })
  } catch (error) {
    console.error("[v0] Excuse duty GET API - Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
