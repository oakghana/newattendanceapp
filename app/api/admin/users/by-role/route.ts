import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface UserProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string
  department_id: string | null
}

export async function GET(request: NextRequest) {
  try {
    // Support both ?role=X (single) and ?roles=X,Y,Z (multi)
    const roleSingle = request.nextUrl.searchParams.get('role')
    const rolesParam = request.nextUrl.searchParams.get('roles')

    const rolesRaw = rolesParam
      ? rolesParam.split(',').map((r) => r.trim()).filter(Boolean)
      : roleSingle
        ? [roleSingle.trim()]
        : []

    if (rolesRaw.length === 0) {
      return NextResponse.json({ error: 'role or roles parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Query user_profiles for users with any of the specified roles
    const { data, error } = await admin
      .from('user_profiles')
      .select('id, email, first_name, last_name, role, department_id')
      .in('role', rolesRaw)
      .order('first_name', { ascending: true })

    if (error) {
      console.error('[v0] Error fetching users by role:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Deduplicate by id in case a user somehow appears multiple times
    const seen = new Set<string>()
    const uniqueUsers = (data || []).filter((user: UserProfile) => {
      if (seen.has(user.id)) return false
      seen.add(user.id)
      return true
    })

    return NextResponse.json({
      success: true,
      data: uniqueUsers.map((user: UserProfile) => ({
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        role: user.role,
        department_id: user.department_id,
      })),
    })
  } catch (error) {
    console.error('[v0] Exception in users by-role API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
