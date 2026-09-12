import { createAdminClient, createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { notifyExcuseDutyHrDecision } from "@/lib/excuse-duty-notifications"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Parallel: auth + profile in one round-trip
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, department_id, departments:departments(name, code)")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const isAdmin = profile.role === "admin"
    const isHRDepartmentHead =
      profile.role === "department_head" &&
      profile.departments &&
      (profile.departments.name.toLowerCase().includes("hr") ||
        profile.departments.name.toLowerCase().includes("human resource"))

    if (!isAdmin && !isHRDepartmentHead) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const url = new URL(request.url)

    // Fast path: single-doc file fetch (for View button)
    const docId = url.searchParams.get("doc_id")
    if (docId) {
      const { data: docFile } = await supabase
        .from("excuse_documents")
        .select("id, file_url")
        .eq("id", docId)
        .single()
      if (!docFile) return NextResponse.json({ error: "Not found" }, { status: 404 })
      return NextResponse.json({ file_url: docFile.file_url })
    }

    const finalStatus = url.searchParams.get("final_status")
    const departmentFilter = url.searchParams.get("department")
    const docType = url.searchParams.get("document_type")
    const dateFrom = url.searchParams.get("date_from")
    const dateTo = url.searchParams.get("date_to")
    const pageParam = parseInt(url.searchParams.get("page") || "1", 10)
    const perPage = Math.min(parseInt(url.searchParams.get("per_page") || "50", 10), 200)
    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam)

    // Build base query — exclude file_url (can be huge base64) from list view
    let query = supabase
      .from("excuse_documents")
      .select(
        "id,document_name,document_type,excuse_reason,excuse_date,hod_status,hod_reviewed_by,hod_reviewed_at,hod_review_notes,hr_status,hr_reviewed_by,hr_reviewed_at,hr_review_notes,final_status,created_at,user_id"
      )

    if (finalStatus && finalStatus !== "all") {
      query = query.eq("final_status", finalStatus)
    } else {
      query = query.in("final_status", ["hr_review", "approved", "rejected"])
    }

    if (docType && docType !== "all") query = query.eq("document_type", docType)
    if (dateFrom) query = query.gte("excuse_date", dateFrom)
    if (dateTo) query = query.lte("excuse_date", dateTo)

    // Department filtering — run both lookups in parallel if needed
    const deptLookups: Promise<string[] | null>[] = []

    if (departmentFilter && departmentFilter !== "all" && isAdmin) {
      deptLookups.push(
        supabase.from("user_profiles").select("id").eq("department_id", departmentFilter)
          .then(({ data }) => (data || []).map((u: any) => u.id))
      )
    } else {
      deptLookups.push(Promise.resolve(null))
    }

    if (!isAdmin && profile.role === "department_head" && profile.department_id) {
      deptLookups.push(
        supabase.from("user_profiles").select("id").eq("department_id", profile.department_id)
          .then(({ data }) => (data || []).map((u: any) => u.id))
      )
    } else {
      deptLookups.push(Promise.resolve(null))
    }

    const [adminDeptUserIds, hdDeptUserIds] = await Promise.all(deptLookups)

    if (adminDeptUserIds !== null) {
      if (adminDeptUserIds.length === 0) return NextResponse.json({ excuseDocuments: [], pagination: { page, perPage, hasMore: false } })
      query = query.in("user_id", adminDeptUserIds)
    }
    if (hdDeptUserIds !== null) {
      if (hdDeptUserIds.length === 0) return NextResponse.json({ excuseDocuments: [], pagination: { page, perPage, hasMore: false } })
      query = query.in("user_id", hdDeptUserIds)
    }

    // Fetch perPage+1 to detect if there are more pages
    const start = (page - 1) * perPage
    const { data: excuseDocsRaw, error } = await query
      .order("created_at", { ascending: false })
      .range(start, start + perPage)

    if (error) {
      console.error("[v0] HR Excuse duty API - Query error:", error.message)
      return NextResponse.json({ error: "Failed to fetch excuse documents" }, { status: 500 })
    }

    const excuseDocs = excuseDocsRaw || []
    const hasMore = excuseDocs.length > perPage
    const pageDocs = excuseDocs.slice(0, perPage)

    // Batch fetch profiles + reviewers in one query
    const uniqueUserIds = Array.from(new Set(pageDocs.map((d: any) => d.user_id).filter(Boolean)))
    const reviewerIds = Array.from(new Set(pageDocs.map((d: any) => d.hod_reviewed_by).filter(Boolean)))
    const allProfileIds = Array.from(new Set([...uniqueUserIds, ...reviewerIds]))

    const profilesMap: Record<string, any> = {}
    if (allProfileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, department_id, departments:departments(name, code)")
        .in("id", allProfileIds)

      for (const p of profiles || []) profilesMap[p.id] = p
    }

    const docsWithProfiles = pageDocs.map((doc: any) => {
      const userProfile = profilesMap[doc.user_id] || null
      const hodReviewer = doc.hod_reviewed_by ? profilesMap[doc.hod_reviewed_by] || null : null
      return {
        ...doc,
        user_profiles: userProfile
          ? {
              first_name: userProfile.first_name,
              last_name: userProfile.last_name,
              employee_id: userProfile.employee_id,
              department_id: userProfile.department_id,
              departments: userProfile.departments,
            }
          : null,
        hod_reviewer: hodReviewer ? { first_name: hodReviewer.first_name, last_name: hodReviewer.last_name } : null,
      }
    })

    return NextResponse.json({ excuseDocuments: docsWithProfiles, pagination: { page, perPage, hasMore } })
  } catch (error) {
    console.error("HR Excuse duty API - Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select(`
        role, 
        first_name, 
        last_name,
        department_id,
        departments:departments(name, code)
      `)
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const isAdmin = profile.role === "admin"
    const isHRDepartmentHead =
      profile.role === "department_head" &&
      profile.departments &&
      (profile.departments.name.toLowerCase().includes("hr") ||
        profile.departments.name.toLowerCase().includes("human resource"))

    if (!isAdmin && !isHRDepartmentHead) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { documentId, hrStatus, hrNotes } = body

    if (!documentId || !hrStatus || !["approved", "rejected", "archived"].includes(hrStatus)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    const { data: excuseDoc, error: fetchError } = await supabase
      .from("excuse_documents")
      .select("*")
      .eq("id", documentId)
      .single()

    if (fetchError || !excuseDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    if (excuseDoc.final_status !== "hr_review") {
      return NextResponse.json({ error: "Document is not awaiting HR review" }, { status: 400 })
    }

    const { data: docUserProfile } = await supabase
      .from("user_profiles")
      .select("first_name, last_name, employee_id, email")
      .eq("id", excuseDoc.user_id)
      .single()

    if (!docUserProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    const finalStatus = hrStatus === "approved" || hrStatus === "archived" ? "approved" : "rejected"

    const { data: updatedDoc, error: updateError } = await supabase
      .from("excuse_documents")
      .update({
        hr_status: hrStatus,
        hr_reviewed_by: user.id,
        hr_reviewed_at: new Date().toISOString(),
        hr_review_notes: hrNotes || null,
        final_status: finalStatus,
      })
      .eq("id", documentId)
      .select()
      .single()

    if (updateError) {
      console.error("HR Excuse duty API - Update error:", updateError)
      return NextResponse.json({ error: "Failed to update document" }, { status: 500 })
    }

    await supabase.from("email_notifications").insert({
      user_id: excuseDoc.user_id,
      email_type: "excuse_duty_hr_decision",
      subject: `Excuse Duty ${hrStatus === "approved" ? "Fully Approved" : hrStatus === "archived" ? "Archived" : "Rejected"} by HR`,
      body: `Your excuse duty request has been ${hrStatus} by HR:

Staff Member: ${docUserProfile.first_name} ${docUserProfile.last_name} (${docUserProfile.employee_id})
Date of Absence: ${new Date(excuseDoc.excuse_date).toLocaleDateString()}
Document Type: ${excuseDoc.document_type}
HR Processed By: ${profile.first_name} ${profile.last_name}
${hrNotes ? `\nHR Notes: ${hrNotes}` : ""}

${
  hrStatus === "approved"
    ? "Your excuse duty has been fully approved and processed by HR."
    : hrStatus === "archived"
      ? "Your excuse duty has been archived for records."
      : "Please contact HR if you have questions about this decision."
}`,
      status: "pending",
    })

    if (excuseDoc.hod_reviewed_by) {
      await supabase.from("email_notifications").insert({
        user_id: excuseDoc.hod_reviewed_by,
        email_type: "excuse_duty_hr_update",
        subject: "Excuse Duty Request Processed by HR",
        body: `An excuse duty request you approved has been processed by HR:

Staff Member: ${docUserProfile.first_name} ${docUserProfile.last_name} (${docUserProfile.employee_id})
Date of Absence: ${new Date(excuseDoc.excuse_date).toLocaleDateString()}
HR Decision: ${hrStatus.charAt(0).toUpperCase() + hrStatus.slice(1)}
HR Processed By: ${profile.first_name} ${profile.last_name}

This is for your records.`,
        status: "pending",
      })
    }

    const notificationAdmin = await createAdminClient()
    await notifyExcuseDutyHrDecision(notificationAdmin, {
      staffId: excuseDoc.user_id,
      staffName: `${docUserProfile.first_name} ${docUserProfile.last_name}`.trim(),
      reviewerId: user.id,
      reviewerName: `${profile.first_name} ${profile.last_name}`.trim(),
      decision: hrStatus,
      excuseDate: excuseDoc.excuse_date,
      hodReviewerId: excuseDoc.hod_reviewed_by || null,
      notes: hrNotes || null,
    })

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: `excuse_duty_hr_${hrStatus}`,
      table_name: "excuse_documents",
      record_id: documentId,
      old_values: {
        hr_status: excuseDoc.hr_status,
        final_status: excuseDoc.final_status,
      },
      new_values: {
        hr_status: hrStatus,
        final_status: finalStatus,
        hr_review_notes: hrNotes,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Excuse duty ${hrStatus} successfully`,
      document: updatedDoc,
    })
  } catch (error) {
    console.error("HR Excuse duty API - Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
