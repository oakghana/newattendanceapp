import { createAdminClient, createClientAndGetUser } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/cleanup-invalid-hod-linkages
 * Removes all staff-to-staff HOD linkages (staff linked to other staff members as HODs)
 * Only HOD roles (department_head, regional_manager, director_hr, manager_hr) should be linked
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user } = await createClientAndGetUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is admin
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || !['admin', 'it-admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only admins can perform this action' }, { status: 403 })
    }

    const validHODRoles = ['department_head', 'regional_manager', 'director_hr', 'manager_hr']

    // Find all linkages where the HOD has role='staff' (invalid linkages)
    const { data: invalidLinkages, error: fetchError } = await admin
      .from('loan_hod_linkages')
      .select(`
        id,
        hod_user_id,
        staff_user_id,
        created_at
      `)
      .then(async (result) => {
        if (!result.data) return result
        
        // Filter out invalid linkages by checking HOD role
        const invalidIds = []
        for (const linkage of result.data) {
          const { data: hodProfile } = await admin
            .from('user_profiles')
            .select('role')
            .eq('id', linkage.hod_user_id)
            .maybeSingle()
          
          if (!hodProfile || !validHODRoles.includes(hodProfile.role)) {
            invalidIds.push(linkage.id)
          }
        }
        
        return { data: invalidIds, error: null }
      })

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch linkages' }, { status: 500 })
    }

    // Delete invalid linkages
    if (invalidLinkages && invalidLinkages.length > 0) {
      const { error: deleteError } = await admin
        .from('loan_hod_linkages')
        .delete()
        .in('id', invalidLinkages)

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to delete invalid linkages' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Removed ${invalidLinkages.length} invalid staff-to-staff HOD linkages`,
        deletedCount: invalidLinkages.length,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'No invalid linkages found',
      deletedCount: 0,
    })
  } catch (error) {
    console.error('[v0] Cleanup invalid HOD linkages error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
