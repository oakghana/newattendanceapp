-- Add staff_category_ref_prefixes table to store reference number templates/prefixes by staff category
-- HR Leave Office can configure custom prefixes like "QCC/HRD/ANL/2025/2026" per category
-- The system will auto-populate the reference number using the prefix + sequence number

CREATE TABLE IF NOT EXISTS public.staff_category_ref_prefixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_category TEXT NOT NULL UNIQUE, -- 'junior', 'senior', 'manager'
  ref_prefix TEXT NOT NULL, -- e.g. "QCC/HRD/ANL/2025/2026"
  next_sequence_number INT NOT NULL DEFAULT 1, -- auto-increment counter for this category
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.staff_category_ref_prefixes ENABLE ROW LEVEL SECURITY;

-- Policy: HR Leave Office and admins can view
CREATE POLICY "staff_category_ref_prefixes_view"
  ON public.staff_category_ref_prefixes
  FOR SELECT
  USING (true); -- visible to all (reference data)

-- Policy: Only admins can update
CREATE POLICY "staff_category_ref_prefixes_update"
  ON public.staff_category_ref_prefixes
  FOR UPDATE
  USING (
    (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- Policy: Only admins can insert
CREATE POLICY "staff_category_ref_prefixes_insert"
  ON public.staff_category_ref_prefixes
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('admin', 'super_admin')
  );

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_staff_category_ref_prefixes_active
  ON public.staff_category_ref_prefixes(staff_category)
  WHERE is_active = true;

-- Seed default prefixes for each category
INSERT INTO public.staff_category_ref_prefixes (staff_category, ref_prefix, next_sequence_number, is_active)
VALUES 
  ('junior', 'QCC/HRD/ANL/2025/2026', 1, true),
  ('senior', 'QCC/HRD/ANL/2025/2026', 1, true),
  ('manager', 'QCC/HRD/ANL/2025/2026', 1, true)
ON CONFLICT (staff_category) DO NOTHING;

COMMENT ON TABLE public.staff_category_ref_prefixes IS 'Stores reference number prefixes and sequence counters per staff category for auto-generating memo reference numbers';
COMMENT ON COLUMN public.staff_category_ref_prefixes.ref_prefix IS 'Prefix for reference numbers, e.g. QCC/HRD/ANL/2025/2026';
COMMENT ON COLUMN public.staff_category_ref_prefixes.next_sequence_number IS 'Auto-incrementing counter for this category; new refs will be prefix + this number';
