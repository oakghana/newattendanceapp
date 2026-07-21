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
    const role = request.nextUrl.searchParams.get('role')
    if (!role) {
      return NextResponse.json({ error: 'role parameter required' }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Query user_profiles for users with the specified role (simple select without join)
    const { data, error } = await admin
      .from('user_profiles')
      .select('id, email, first_name, last_name, role, department_id')
      .eq('role', role)
      .order('first_name', { ascending: true })

    if (error) {
      console.error('[v0] Error fetching users by role:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((user: UserProfile) => ({
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
