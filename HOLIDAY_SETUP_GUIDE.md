# Holiday Management Database Setup Guide

## Problem
The Holiday Management feature requires two database tables that don't exist yet:
1. `ghana_public_holidays` - For storing holidays
2. `leave_calendar_config` column in `system_settings` - For storing calendar configuration

## Solution

### Step 1: Copy the SQL

Copy the entire SQL block below:

```sql
-- Create ghana_public_holidays table
CREATE TABLE IF NOT EXISTS public.ghana_public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  holiday_name VARCHAR(255) NOT NULL,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(holiday_date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ghana_public_holidays_date 
ON public.ghana_public_holidays(holiday_date);

-- Enable Row Level Security
ALTER TABLE public.ghana_public_holidays ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view holidays
CREATE POLICY "Anyone can view holidays"
  ON public.ghana_public_holidays
  FOR SELECT
  USING (true);

-- Allow HR roles to manage holidays
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

-- Add leave_calendar_config to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS leave_calendar_config JSONB DEFAULT '{
  "leave_year_start_month": 1,
  "leave_year_end_month": 12,
  "include_weekends_in_calculation": false,
  "exclude_holidays_in_calculation": true
}'::JSONB;
```

### Step 2: Run in Supabase SQL Editor

1. Go to your **Supabase Dashboard**
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste the SQL code above
6. Click **Run**
7. Wait for the query to complete (you should see "Success" message)

### Step 3: Verify Setup

After running the SQL, you should see:
- Table `ghana_public_holidays` created
- Column `leave_calendar_config` added to `system_settings`
- All policies enabled

### Step 4: Initialize Holiday Data

Run the setup script to insert the standard Ghana public holidays:

```bash
cd /vercel/share/v0-project
node scripts/setup-holidays-db.js
```

You should see output like:
```
[v0] ✓ Added New Year's Day
[v0] ✓ Added Founders' Day
[v0] ✓ Added Good Friday
...
[v0] ✓ Holiday management database setup completed!
```

### Step 5: Test Holiday Management

1. Go to **Dashboard → Leave Management → Holiday Management** tab
2. Try adding a new holiday
3. The error should be gone!

---

## Troubleshooting

### "Failed to add holiday" still shows

**Cause:** SQL hasn't been executed yet or tables don't exist

**Solution:** 
1. Go to Supabase SQL Editor
2. Run the SQL from Step 2 above
3. Refresh the application page
4. Try adding a holiday again

### "Failed to save configuration" error

**Cause:** The `leave_calendar_config` column doesn't exist

**Solution:**
1. Run the ALTER TABLE statement from the SQL above
2. Refresh the application
3. Try saving configuration again

### Cannot see Ghana public holidays list

**Cause:** Data wasn't inserted

**Solution:**
1. Run: `node scripts/setup-holidays-db.js`
2. This will insert all 11 standard Ghana holidays
3. Refresh the application

---

## Database Structure

### ghana_public_holidays table
```
Columns:
- id: UUID (Primary Key)
- holiday_date: DATE (unique)
- holiday_name: VARCHAR(255)
- is_custom: BOOLEAN (false for system holidays, true for custom)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

Indexes:
- idx_ghana_public_holidays_date (on holiday_date for fast lookups)
```

### system_settings table (updated)
```
New Column Added:
- leave_calendar_config: JSONB

Default value:
{
  "leave_year_start_month": 1,
  "leave_year_end_month": 12,
  "include_weekends_in_calculation": false,
  "exclude_holidays_in_calculation": true
}
```

---

## Row Level Security (RLS) Policies

### Public Holidays - "Anyone can view holidays"
- Allows all authenticated users to view holidays

### Public Holidays - "HR can manage holidays"
- Allows only HR roles (admin, leave_admin, hr_leave_office, hr_office, director_hr, manager_hr) to:
  - Create new holidays
  - Update holidays
  - Delete holidays

---

## Standard Ghana Public Holidays (2026)

The setup script inserts these holidays:

1. January 1 - New Year's Day
2. March 6 - Founders' Day
3. April 3 - Good Friday
4. April 6 - Easter Monday
5. May 1 - May Day
6. May 14 - Ascension Day
7. June 1 - Eid ul-Fitr
8. August 4 - Founders Day
9. September 21 - Kwame Nkrumah Day
10. December 25 - Christmas Day
11. December 26 - Boxing Day

---

## After Setup

Once setup is complete:
- ✓ Holiday Management tab will be visible to HR roles
- ✓ Users can add custom holidays
- ✓ Holiday dates are used in leave calculations
- ✓ Configuration is saved and persisted
- ✓ Holidays appear on the Balance & Calendar view

---

## Need Help?

If you encounter any issues:
1. Check the error message in the application
2. Verify the SQL was executed successfully in Supabase
3. Run the setup script again: `node scripts/setup-holidays-db.js`
4. Check the browser console (F12) for detailed error messages

