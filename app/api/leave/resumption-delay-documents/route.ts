import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const EDITOR_ROLES = new Set(['admin', 'hr_leave_office', 'hr_office', 'hr_executive', 'director_hr', 'manager_hr'])

async function getEditor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = await createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role || '').toLowerCase().replace(/[-\s]+/g, '_')
  return EDITOR_ROLES.has(role) ? { user, admin } : null
}

export async function GET() {
  const editor = await getEditor()
  if (!editor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await editor.admin.from('leave_resumption_delay_documents').select('*').order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data || [] })
}

export async function PATCH(request: NextRequest) {
  const editor = await getEditor()
  if (!editor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const id = String(body.id || '')
  const title = String(body.title || '').trim()
  const content = String(body.body || '').trim()
  if (!id || !title || !content) return NextResponse.json({ error: 'id, title, and body are required' }, { status: 400 })

  const { data: current, error: currentError } = await editor.admin.from('leave_resumption_delay_documents').select('id, title, body, version').eq('id', id).single()
  if (currentError || !current) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  const nextVersion = Number(current.version || 1) + 1

  const { error: versionError } = await editor.admin.from('leave_resumption_delay_document_versions').insert({
    document_id: id,
    version: nextVersion,
    title: current.title,
    body: current.body,
    edited_by: editor.user.id,
  })
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })

  const { data, error } = await editor.admin.from('leave_resumption_delay_documents').update({
    title,
    body: content,
    version: nextVersion,
    updated_by: editor.user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}
