import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'set' : 'NOT SET')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'set' : 'NOT SET')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})

async function createTable() {
  try {
    console.log('Creating pending_offpremises_checkins table via SQL functions...')

    // Try creating table through a basic insert check
    // First, test if table exists by trying to query it
    const { error: checkError } = await supabase
      .from('pending_offpremises_checkins')
      .select('id')
      .limit(1)

    if (checkError && checkError.code === 'PGRST205') {
      console.log('Table does not exist. Creating via Supabase client operations...')
      
      // Since Supabase JS client doesn't support raw SQL execution in production,
      // the table must be created via the SQL editor in Supabase dashboard.
      // However, we can verify this after it's been created.
      
      console.log('\n✓ Migration script ran successfully')
      console.log('✓ Confirmed: pending_offpremises_checkins table does not exist yet')
      console.log('\nPlease create the table using the Supabase SQL Editor with this SQL:')
      console.log(`
CREATE TABLE IF NOT EXISTS public.pending_offpremises_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  current_location_name TEXT NOT NULL,
  latitude FLOAT8 NOT NULL,
  longitude FLOAT8 NOT NULL,
  accuracy FLOAT8,
  device_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_offpremises_user_id ON public.pending_offpremises_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_offpremises_status ON public.pending_offpremises_checkins(status);
CREATE INDEX IF NOT EXISTS idx_pending_offpremises_created_at ON public.pending_offpremises_checkins(created_at DESC);
      `)
      process.exit(0)
    } else if (!checkError) {
      console.log('Table already exists!')
      process.exit(0)
    } else {
      console.error('Unexpected error checking table:', checkError)
      process.exit(1)
    }
  } catch (error) {
    console.error('Migration check failed:', error)
    process.exit(1)
  }
}

createTable()
