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

export async function GET() {
  try {
    const auth = await resolveUserAndRole()
    if (auth.error || !auth.admin || !auth.role) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!TEMPLATE_VIEW_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await auth.admin
      .from("leave_memo_templates")
      .select("id, template_key, template_name, description, subject_template, body_template, cc_recipients, is_active, updated_at")
      .order("template_name", { ascending: true })

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
      .select("id, template_key, template_name, description, subject_template, body_template, cc_recipients, is_active, updated_at")
      .maybeSingle()

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
      .select("id, template_key, template_name, description, subject_template, body_template, cc_recipients, is_active, updated_at")
      .single()

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
