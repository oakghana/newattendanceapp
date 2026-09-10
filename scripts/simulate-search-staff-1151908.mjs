#!/usr/bin/env node
// Read-only simulation of the attendance search feature for staff number 1151908.
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/ANON_KEY in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const STAFF_NUMBER = '1151908'

async function main() {
  console.log(`Simulating attendance search for staff number "${STAFF_NUMBER}"...\n`)

  // Step 1: locate the staff profile the same way the reports API resolves employee_id matches.
  const { data: staff, error: staffError } = await supabase
    .from('user_profiles')
    .select('id, first_name, last_name, employee_id, email, position, role, is_active, department_id, departments(name), assigned_location_id, assigned_location:geofence_locations!user_profiles_assigned_location_id_fkey(name)')
    .eq('employee_id', STAFF_NUMBER)
    .maybeSingle()

  if (staffError) {
    console.error('Error querying user_profiles:', staffError.message)
    process.exit(1)
  }

  if (!staff) {
    console.log(`No staff profile found with employee_id = ${STAFF_NUMBER}.`)
    console.log('Search would return 0 records (expected UI state: "No Data Found").')
    return
  }

  console.log('Matched staff profile:')
  console.log({
    id: staff.id,
    name: `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim(),
    employee_id: staff.employee_id,
    department: staff.departments?.name ?? null,
    location: staff.assigned_location?.name ?? null,
    role: staff.role,
    is_active: staff.is_active,
  })

  // Step 2: pull recent attendance records for that staff member, same fields the report reads.
  const { data: records, error: recordsError } = await supabase
    .from('attendance_records')
    .select('id, check_in_time, check_out_time, status, work_hours')
    .eq('user_id', staff.id)
    .order('check_in_time', { ascending: false })
    .limit(10)

  if (recordsError) {
    console.error('Error querying attendance_records:', recordsError.message)
    process.exit(1)
  }

  console.log(`\nFound ${records?.length ?? 0} recent attendance record(s) for this staff member:`)
  for (const record of records ?? []) {
    console.log(`  - ${record.check_in_time} → ${record.check_out_time ?? 'not checked out'} (${record.status}, ${record.work_hours ?? 0}h)`)
  }

  console.log('\nSimulation complete: search by staff number resolves to the profile above and its attendance history, matching the behaviour of the redesigned search box.')
}

main().catch((error) => {
  console.error('Simulation failed:', error)
  process.exit(1)
})
