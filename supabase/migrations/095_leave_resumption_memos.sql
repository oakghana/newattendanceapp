-- Create leave_resumption_memos table for tracking staff return-to-work notifications
CREATE TABLE IF NOT EXISTS public.leave_resumption_memos (
  id TEXT PRIMARY KEY,
  staff_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  staff_position TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  department_name TEXT NOT NULL,
  department_code TEXT NOT NULL,
  leave_end_date DATE NOT NULL,
  leave_type TEXT NOT NULL,
  resumption_date DATE NOT NULL,
  hod_name TEXT,
  hod_position TEXT,
  company_name TEXT DEFAULT 'Quality Control Company Limited (COCOBOD)',
  is_downloaded BOOLEAN DEFAULT FALSE,
  last_downloaded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on staff_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_leave_resumption_memos_staff_user_id 
  ON public.leave_resumption_memos(staff_user_id);

-- Create index on resumption_date for date range queries
CREATE INDEX IF NOT EXISTS idx_leave_resumption_memos_resumption_date 
  ON public.leave_resumption_memos(resumption_date);

-- Add RLS policy to allow users to view their own memos
ALTER TABLE public.leave_resumption_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own resumption memos"
  ON public.leave_resumption_memos FOR SELECT
  USING (staff_user_id = auth.uid());

CREATE POLICY "HR and admin can view all resumption memos"
  ON public.leave_resumption_memos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'director_hr', 'manager_hr', 'hr_office', 'hr_executive')
    )
  );

-- Allow service role to insert memos (from API)
CREATE POLICY "Service role can insert memos"
  ON public.leave_resumption_memos FOR INSERT
  WITH CHECK (true);

-- Allow service role to update download tracking
CREATE POLICY "Service role can update memos"
  ON public.leave_resumption_memos FOR UPDATE
  USING (true)
  WITH CHECK (true);
