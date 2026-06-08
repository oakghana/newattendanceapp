import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { searchParams } = new URL(request.url)
    const managerId = searchParams.get('managerId')
    const role = searchParams.get('role')

    if (!managerId) {
      return NextResponse.json(
        { error: 'Missing required parameter: managerId' },
        { status: 400 }
      )
    }

    // Get manager's department or region
    const { data: managerProfile, error: managerError } = await supabase
      .from('user_profiles')
      .select('department_id, region, id')
      .eq('id', managerId)
      .single()

    if (managerError || !managerProfile) {
      return NextResponse.json(
        { error: 'Manager profile not found' },
        { status: 404 }
      )
    }

    // Get all missing check-in alerts for this manager's department/region
    let query = supabase
      .from('leave_resumption_alerts')
      .select(`
        *,
        user:user_profiles(id, first_name, last_name, employee_id, email),
        leave:leave_plan_requests(id, leave_type)
      `)
      .eq('status', 'no_show')
      .is('checked_in_date', null)

    // Filter based on manager role
    const normalizedRole = (role || '').toLowerCase().replace(/[-\s]+/g, '_')

    if (normalizedRole.includes('hod')) {
      // HOD sees their department staff
      query = query.eq('user.department_id', managerProfile.department_id)
    } else if (normalizedRole.includes('rm')) {
      // RM sees their region staff
      query = query.eq('user.region', managerProfile.region)
    } else if (normalizedRole.includes('hr')) {
      // HR sees all missing check-ins
      // No additional filter needed
    } else {
      return NextResponse.json(
        { error: 'Your role does not have permission to view these alerts' },
        { status: 403 }
      )
    }

    const { data, error } = await query.order('resumption_date', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || [],
      totalAlerts: (data || []).length
    })
  } catch (error) {
    console.error('[v0] Missing check-in alerts error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
