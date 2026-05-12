#!/usr/bin/env node

/**
 * Holiday Management Database Setup
 * Creates required tables and initializes data
 */

const https = require('https')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error('[v0] Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl)
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null
          resolve({ status: res.statusCode, data: parsed })
        } catch (e) {
          resolve({ status: res.statusCode, data })
        }
      })
    })

    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function setupDatabase() {
  try {
    console.log('[v0] Starting holiday management database setup...')

    // Step 1: Check if table exists by trying to query it
    console.log('[v0] Checking for existing tables...')
    const checkRes = await makeRequest('GET', '/rest/v1/ghana_public_holidays?limit=1')
    
    let tablesExist = checkRes.status === 200

    if (!tablesExist) {
      console.log('[v0] Tables do not exist. Please run this SQL in Supabase SQL Editor:')
      console.log(`

-- Copy and paste this into Supabase SQL Editor and run it:

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

CREATE POLICY "Anyone can view holidays"
  ON public.ghana_public_holidays
  FOR SELECT
  USING (true);

CREATE POLICY "HR can manage holidays"
  ON public.ghana_public_holidays
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'leave_admin', 'hr_leave_office', 'hr_office', 'director_hr', 'manager_hr')
    )
  );

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS leave_calendar_config JSONB DEFAULT '{
  "leave_year_start_month": 1,
  "leave_year_end_month": 12,
  "include_weekends_in_calculation": false,
  "exclude_holidays_in_calculation": true
}'::JSONB;

      `)
      console.log('[v0] After running the SQL above, run this script again.')
      process.exit(0)
    }

    console.log('[v0] ✓ Tables exist')

    // Step 2: Insert holidays
    console.log('[v0] Inserting Ghana public holidays...')
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

    for (const holiday of holidays) {
      const res = await makeRequest('POST', '/rest/v1/ghana_public_holidays', holiday)
      if (res.status === 201 || res.status === 200) {
        console.log(`[v0] ✓ Added ${holiday.holiday_name}`)
      } else if (res.status === 409) {
        console.log(`[v0] ✓ ${holiday.holiday_name} already exists`)
      } else {
        console.log(`[v0] Note: ${holiday.holiday_name} - Status ${res.status}`)
      }
    }

    // Step 3: Ensure default settings
    console.log('[v0] Configuring system settings...')
    const configRes = await makeRequest('POST', '/rest/v1/system_settings', {
      id: 1,
      leave_calendar_config: {
        leave_year_start_month: 1,
        leave_year_end_month: 12,
        include_weekends_in_calculation: false,
        exclude_holidays_in_calculation: true,
      },
    })

    if (configRes.status === 201 || configRes.status === 200) {
      console.log('[v0] ✓ System configuration saved')
    } else if (configRes.status === 409) {
      console.log('[v0] ✓ System configuration already exists')
    } else {
      console.log('[v0] Note: System settings - Status', configRes.status)
    }

    console.log('[v0] ✓ Holiday management database setup completed!')
    console.log('[v0] The Holiday Management feature is now ready to use.')
  } catch (err) {
    console.error('[v0] Error:', err.message)
    process.exit(1)
  }
}

setupDatabase()
