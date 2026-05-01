import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const TEMPLATE_VIEW_ROLES = [
  "admin",
  "hr_officer",
  "hr_director",
  "director_hr",
  "manager_hr",
  "hr_leave_office",
]

const TEMPLATE_EDIT_ROLES = [
  "admin",
  "director_hr",
  "manager_hr",
  "hr_director",
  "hr_leave_office",
]

const TEMPLATE_SELECT_COLUMNS = "id, template_key, template_name, description, subject_template, body_template, cc_recipients, is_active, updated_at"

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[-\s]+/g, "_")
}

async function resolveUserAndRole() {
  const supabase = await createClient()
  const admin = await createAdminClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 as const, user: null, role: null, admin: null }
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { error: "Profile not found", status: 404 as const, user: null, role: null, admin: null }
  }

  return { error: null, status: 200 as const, user, role: normalizeRole((profile as any).role), admin }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveUserAndRole()
    if (auth.error || !auth.admin || !auth.role) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!TEMPLATE_VIEW_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const url = new URL(request.url)
    const category = String(url.searchParams.get("category") || "").trim().toLowerCase()

    let query = auth.admin
      .from("leave_memo_templates")
      .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
      .order("template_name", { ascending: true })

    if (category) {
      query = query.eq("category", category)
    }

    let { data, error } = await query

    if (error && /category/i.test(String(error.message || ""))) {
      const fallback = await auth.admin
        .from("leave_memo_templates")
        .select(TEMPLATE_SELECT_COLUMNS)
        .order("template_name", { ascending: true })
      data = (fallback.data || []).map((row: any) => ({ ...row, category: "general" }))
      error = fallback.error
    }

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, templates: data || [] })
  } catch (error) {
    console.error("[leave-templates] GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load templates" },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await resolveUserAndRole()
    if (auth.error || !auth.admin || !auth.role || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!TEMPLATE_EDIT_ROLES.includes(auth.role)) {
      return NextResponse.json(
        { error: "Only Director HR, Manager HR, and HR Leave Office can edit templates." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const templateKey = String(body?.template_key || "").trim()

    if (!templateKey) {
      return NextResponse.json({ error: "template_key is required" }, { status: 400 })
    }

    const payload = {
      template_name: String(body?.template_name || "").trim(),
      description: body?.description ? String(body.description).trim() : null,
      subject_template: String(body?.subject_template || "").trim(),
      body_template: String(body?.body_template || "").trim(),
      cc_recipients: body?.cc_recipients ? String(body.cc_recipients).trim() : null,
      is_active: body?.is_active !== false,
      category: body?.category ? String(body.category).trim().toLowerCase() : "general",
      updated_at: new Date().toISOString(),
    }

    if (!payload.template_name || !payload.subject_template || !payload.body_template) {
      return NextResponse.json(
        { error: "template_name, subject_template, and body_template are required" },
        { status: 400 },
      )
    }

    const { data, error } = await auth.admin
      .from("leave_memo_templates")
      .update(payload)
      .eq("template_key", templateKey)
      .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
      .maybeSingle()

    if (error && /category/i.test(String(error.message || ""))) {
      const retry = await auth.admin
        .from("leave_memo_templates")
        .update({
          template_name: payload.template_name,
          description: payload.description,
          subject_template: payload.subject_template,
          body_template: payload.body_template,
          cc_recipients: payload.cc_recipients,
          is_active: payload.is_active,
          updated_at: payload.updated_at,
        })
        .eq("template_key", templateKey)
        .select(TEMPLATE_SELECT_COLUMNS)
        .maybeSingle()
      if (retry.error) {
        throw retry.error
      }
      if (!retry.data) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }
      return NextResponse.json({ success: true, template: { ...retry.data, category: "general" } })
    }

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    await auth.admin
      .from("leave_office_work_log")
      .insert({
        hr_leave_office_id: auth.user.id,
        hr_leave_office_name: auth.role,
        activity_type: "memo_drafted",
        description: `Template updated: ${templateKey}`,
        adjustment_details: {
          template_key: templateKey,
          editor_role: auth.role,
        },
      })
      .then(() => {})
      .catch(() => {})

    return NextResponse.json({ success: true, template: data })
  } catch (error) {
    console.error("[leave-templates] PUT error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveUserAndRole()
    if (auth.error || !auth.admin || !auth.role || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!TEMPLATE_EDIT_ROLES.includes(auth.role)) {
      return NextResponse.json(
        { error: "Only Director HR, Manager HR, and HR Leave Office can create templates." },
        { status: 403 },
      )
    }

    const body = await request.json()
    const payload = {
      template_key: String(body?.template_key || "").trim(),
      template_name: String(body?.template_name || "").trim(),
      description: body?.description ? String(body.description).trim() : null,
      subject_template: String(body?.subject_template || "").trim(),
      body_template: String(body?.body_template || "").trim(),
      cc_recipients: body?.cc_recipients ? String(body.cc_recipients).trim() : null,
      category: body?.category ? String(body.category).trim().toLowerCase() : "general",
      is_active: body?.is_active !== false,
    }

    if (!payload.template_key || !payload.template_name || !payload.subject_template || !payload.body_template) {
      return NextResponse.json(
        { error: "template_key, template_name, subject_template, and body_template are required" },
        { status: 400 },
      )
    }

    const { data, error } = await auth.admin
      .from("leave_memo_templates")
      .insert(payload)
      .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
      .single()

    if (error && /category/i.test(String(error.message || ""))) {
      const retry = await auth.admin
        .from("leave_memo_templates")
        .insert({
          template_key: payload.template_key,
          template_name: payload.template_name,
          description: payload.description,
          subject_template: payload.subject_template,
          body_template: payload.body_template,
          cc_recipients: payload.cc_recipients,
          is_active: payload.is_active,
        })
        .select(TEMPLATE_SELECT_COLUMNS)
        .single()
      if (retry.error) {
        throw retry.error
      }
      return NextResponse.json({ success: true, template: { ...retry.data, category: "general" } }, { status: 201 })
    }

    if (error) {
      throw error
    }

    await auth.admin
      .from("leave_office_work_log")
      .insert({
        hr_leave_office_id: auth.user.id,
        hr_leave_office_name: auth.role,
        activity_type: "memo_drafted",
        description: `Template created: ${payload.template_key}`,
        adjustment_details: {
          template_key: payload.template_key,
          editor_role: auth.role,
          action: "create",
        },
      })
      .then(() => {})
      .catch(() => {})

    return NextResponse.json({ success: true, template: data }, { status: 201 })
  } catch (error) {
    console.error("[leave-templates] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveUserAndRole()
    if (auth.error || !auth.admin || !auth.role || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!TEMPLATE_EDIT_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const action = String(body?.action || "").trim().toLowerCase()
    const templateKey = String(body?.template_key || "").trim()

    if (!action || !templateKey) {
      return NextResponse.json({ error: "action and template_key are required" }, { status: 400 })
    }

    const { data: existing, error: existingError } = await auth.admin
      .from("leave_memo_templates")
      .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
      .eq("template_key", templateKey)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    if (action === "duplicate") {
      const duplicateKey = `${templateKey}_copy_${Date.now()}`
      const duplicatePayload: Record<string, any> = {
        template_key: duplicateKey,
        template_name: `${existing.template_name} Copy`,
        description: existing.description,
        subject_template: existing.subject_template,
        body_template: existing.body_template,
        cc_recipients: existing.cc_recipients,
        is_active: false,
      }

      if ("category" in existing) {
        duplicatePayload.category = (existing as any).category || "general"
      }

      let insertResult = await auth.admin
        .from("leave_memo_templates")
        .insert(duplicatePayload)
        .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
        .single()

      if (insertResult.error && /category/i.test(String(insertResult.error.message || ""))) {
        delete duplicatePayload.category
        insertResult = await auth.admin
          .from("leave_memo_templates")
          .insert(duplicatePayload)
          .select(TEMPLATE_SELECT_COLUMNS)
          .single()
      }

      if (insertResult.error) {
        throw insertResult.error
      }

      return NextResponse.json({ success: true, template: { ...insertResult.data, category: (insertResult.data as any)?.category || "general" } })
    }

    if (action === "deactivate" || action === "activate") {
      const { data, error } = await auth.admin
        .from("leave_memo_templates")
        .update({ is_active: action === "activate", updated_at: new Date().toISOString() })
        .eq("template_key", templateKey)
        .select(`${TEMPLATE_SELECT_COLUMNS}, category`)
        .maybeSingle()

      if (error) {
        throw error
      }
      return NextResponse.json({ success: true, template: { ...data, category: (data as any)?.category || "general" } })
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 })
  } catch (error) {
    console.error("[leave-templates] PATCH error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update template state" },
      { status: 500 },
    )
  }
}
