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

-- Insert standard Ghana public holidays for 2026
INSERT INTO public.ghana_public_holidays (holiday_date, holiday_name, is_custom) 
VALUES 
  ('2026-01-01', 'New Year''s Day', false),
  ('2026-03-06', 'Founders'' Day', false),
  ('2026-04-03', 'Good Friday', false),
  ('2026-04-06', 'Easter Monday', false),
  ('2026-05-01', 'May Day', false),
  ('2026-05-14', 'Ascension Day', false),
  ('2026-06-01', 'Eid ul-Fitr', false),
  ('2026-08-04', 'Founders Day', false),
  ('2026-09-21', 'Kwame Nkrumah Day', false),
  ('2026-12-25', 'Christmas Day', false),
  ('2026-12-26', 'Boxing Day', false)
ON CONFLICT (holiday_date) DO NOTHING;

-- Update system_settings table to include leave_calendar_config column
ALTER TABLE IF EXISTS public.system_settings 
ADD COLUMN IF NOT EXISTS leave_calendar_config JSONB DEFAULT '{
  "leave_year_start_month": 1,
  "leave_year_end_month": 12,
  "include_weekends_in_calculation": false,
  "exclude_holidays_in_calculation": true
}'::JSONB;

-- Enable RLS on ghana_public_holidays
ALTER TABLE public.ghana_public_holidays ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ghana_public_holidays
DROP POLICY IF EXISTS "Anyone can view holidays" ON public.ghana_public_holidays;
CREATE POLICY "Anyone can view holidays"
  ON public.ghana_public_holidays
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "HR can manage holidays" ON public.ghana_public_holidays;
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

-- Add RLS policies for system_settings if not exists
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view settings" ON public.system_settings;
CREATE POLICY "Admins can view settings"
  ON public.system_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'leave_admin', 'hr_leave_office', 'hr_office', 'director_hr', 'manager_hr')
    )
  );

DROP POLICY IF EXISTS "Admins can update settings" ON public.system_settings;
CREATE POLICY "Admins can update settings"
  ON public.system_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'leave_admin', 'hr_leave_office', 'hr_office', 'director_hr', 'manager_hr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'leave_admin', 'hr_leave_office', 'hr_office', 'director_hr', 'manager_hr')
    )
  );
