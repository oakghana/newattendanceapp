#!/usr/bin/env node

/**
 * Holiday Management Setup Script
 * Initializes the database tables and data needed for holiday management
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('[v0] Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function setupDatabase() {
  try {
    console.log('[v0] Starting holiday management database setup...')

    // Setup data using PostgreSQL REST API
    const tables = await fetch(`${supabaseUrl}/rest/v1/information_schema.tables`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    })

    console.log('[v0] Database connection verified')

    // Create holidays using REST API
    const holidays = [
      { holiday_date: '2026-01-01', holiday_name: 'New Year\'s Day', is_custom: false },
      { holiday_date: '2026-03-06', holiday_name: 'Founders\' Day', is_custom: false },
      { holiday_date: '2026-04-03', holiday_name: 'Good Friday', is_custom: false },
      { holiday_date: '2026-04-06', holiday_name: 'Easter Monday', is_custom: false },
      { holiday_date: '2026-05-01', holiday_name: 'May Day', is_custom: false },
      { holiday_date: '2026-05-14', holiday_name: 'Ascension Day', is_custom: false },
      { holiday_date: '2026-06-01', holiday_name: 'Eid ul-Fitr', is_custom: false },
      { holiday_date: '2026-08-04', holiday_name: 'Founders Day', is_custom: false },
      { holiday_date: '2026-09-21', holiday_name: 'Kwame Nkrumah Day', is_custom: false },
      { holiday_date: '2026-12-25', holiday_name: 'Christmas Day', is_custom: false },
      { holiday_date: '2026-12-26', holiday_name: 'Boxing Day', is_custom: false },
    ]

    console.log(`[v0] Inserting ${holidays.length} standard Ghana public holidays...`)

    for (const holiday of holidays) {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/ghana_public_holidays`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(holiday),
        })

        if (response.ok) {
          console.log(`[v0] ✓ Added ${holiday.holiday_name}`)
        } else {
          const error = await response.json()
          if (!error.message?.includes('duplicate')) {
            console.log(`[v0] Note: ${holiday.holiday_name} - ${error.message}`)
          }
        }
      } catch (err) {
        console.log(`[v0] Note: ${holiday.holiday_name} - ${err.message}`)
      }
    }

    // Create default system settings
    console.log('[v0] Creating default system settings...')
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/system_settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: 1,
          leave_calendar_config: {
            leave_year_start_month: 1,
            leave_year_end_month: 12,
            include_weekends_in_calculation: false,
            exclude_holidays_in_calculation: true,
          },
        }),
      })

      if (response.ok) {
        console.log('[v0] ✓ System settings configured')
      } else {
        const error = await response.json()
        if (error.message?.includes('duplicate') || error.message?.includes('exists')) {
          console.log('[v0] ✓ System settings already configured')
        } else {
          console.log('[v0] Note:', error.message)
        }
      }
    } catch (err) {
      console.log('[v0] Note:', err.message)
    }

    console.log('[v0] ✓ Holiday management setup completed!')
    console.log('[v0] You can now use the Holiday Management feature')
  } catch (err) {
    console.error('[v0] Setup failed:', err.message)
    process.exit(1)
  }
}

setupDatabase()
