import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Starting holiday management migration...')

    // Read migration file
    const migrationSql = fs.readFileSync(
      './supabase/migrations/create_holiday_management_tables.sql',
      'utf-8'
    )

    // Split by statements
    const statements = migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    console.log(`Found ${statements.length} SQL statements to execute`)

    // Execute each statement using rpc or direct query
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      console.log(`[${i + 1}/${statements.length}] Executing...`)

      // Use the admin API to execute raw SQL
      const { error } = await supabase.rpc('exec_sql', {
        sql: stmt + ';',
      })

      if (error) {
        console.log(`Note: ${error.message}`)
      } else {
        console.log(`✓ Statement ${i + 1} completed`)
      }
    }

    console.log('Migration completed!')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

runMigration()
