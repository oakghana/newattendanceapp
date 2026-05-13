import { createAdminClient } from '../lib/supabase/server.js'

async function setupHolidayManagement() {
  try {
    console.log('[v0] Starting holiday management setup...')
    
    const admin = await createAdminClient()

    // 1. Create ghana_public_holidays table
    console.log('[v0] Creating ghana_public_holidays table...')
    const { error: createTableError } = await admin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.ghana_public_holidays (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          holiday_date DATE NOT NULL,
          holiday_name VARCHAR(255) NOT NULL,
          is_custom BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(holiday_date)
        );
        
        CREATE INDEX IF NOT EXISTS idx_ghana_public_holidays_date 
        ON public.ghana_public_holidays(holiday_date);
        
        ALTER TABLE public.ghana_public_holidays ENABLE ROW LEVEL SECURITY;
      `
    })

    if (createTableError && !createTableError.message.includes('already exists')) {
      console.error('[v0] Error creating table:', createTableError)
    } else {
      console.log('[v0] ✓ ghana_public_holidays table ready')
    }

    // 2. Insert standard Ghana holidays
    console.log('[v0] Inserting Ghana public holidays...')
    const holidays = [
      { date: '2026-01-01', name: 'New Year\'s Day' },
      { date: '2026-03-06', name: 'Founders\' Day' },
      { date: '2026-04-03', name: 'Good Friday' },
      { date: '2026-04-06', name: 'Easter Monday' },
      { date: '2026-05-01', name: 'May Day' },
      { date: '2026-05-14', name: 'Ascension Day' },
      { date: '2026-06-01', name: 'Eid ul-Fitr' },
      { date: '2026-08-04', name: 'Founders Day' },
      { date: '2026-09-21', name: 'Kwame Nkrumah Day' },
      { date: '2026-12-25', name: 'Christmas Day' },
      { date: '2026-12-26', name: 'Boxing Day' }
    ]

    for (const holiday of holidays) {
      const { error: insertError } = await admin
        .from('ghana_public_holidays')
        .insert({
          holiday_date: holiday.date,
          holiday_name: holiday.name,
          is_custom: false
        })
        .select()

      if (insertError && !insertError.message.includes('Duplicate')) {
        console.log(`[v0] Note: ${holiday.name} - ${insertError.message}`)
      } else if (!insertError) {
        console.log(`[v0] ✓ Added ${holiday.name}`)
      }
    }

    // 3. Ensure system_settings has leave_calendar_config column
    console.log('[v0] Updating system_settings table...')
    const { error: altertableError } = await admin.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.system_settings 
        ADD COLUMN IF NOT EXISTS leave_calendar_config JSONB DEFAULT '{
          "leave_year_start_month": 1,
          "leave_year_end_month": 12,
          "include_weekends_in_calculation": false,
          "exclude_holidays_in_calculation": true
        }'::JSONB;
      `
    })

    if (altertableError) {
      console.log('[v0] Note:', altertableError.message)
    } else {
      console.log('[v0] ✓ system_settings updated')
    }

    // 4. Ensure default config exists
    console.log('[v0] Ensuring default calendar configuration...')
    const { data: existingConfig } = await admin
      .from('system_settings')
      .select('id')
      .eq('id', 1)
      .single()

    if (!existingConfig) {
      const { error: insertConfigError } = await admin
        .from('system_settings')
        .insert({
          id: 1,
          leave_calendar_config: {
            leave_year_start_month: 1,
            leave_year_end_month: 12,
            include_weekends_in_calculation: false,
            exclude_holidays_in_calculation: true
          }
        })

      if (insertConfigError) {
        console.log('[v0] Note:', insertConfigError.message)
      } else {
        console.log('[v0] ✓ Default configuration created')
      }
    } else {
      console.log('[v0] ✓ Configuration already exists')
    }

    console.log('[v0] Holiday management setup completed successfully!')
    return true
  } catch (err) {
    console.error('[v0] Setup failed:', err)
    return false
  }
}

// Run setup
setupHolidayManagement()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((err) => {
    console.error('[v0] Fatal error:', err)
    process.exit(1)
  })
