-- Configurable leave policy catalog per leave period and leave type

CREATE TABLE IF NOT EXISTS public.leave_policy_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_year_period VARCHAR(20) NOT NULL,
  leave_type_key VARCHAR(80) NOT NULL,
  leave_type_label VARCHAR(120) NOT NULL,
  entitlement_days INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_active_period BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (leave_year_period, leave_type_key)
);

CREATE INDEX IF NOT EXISTS idx_leave_policy_catalog_period ON public.leave_policy_catalog(leave_year_period);
CREATE INDEX IF NOT EXISTS idx_leave_policy_catalog_active ON public.leave_policy_catalog(is_active_period);

-- Seed active 2026/2027 policy defaults
INSERT INTO public.leave_policy_catalog (leave_year_period, leave_type_key, leave_type_label, entitlement_days, is_enabled, is_active_period, sort_order)
VALUES
  ('2026/2027', 'annual', 'Annual Leave', 30, true, true, 1),
  ('2026/2027', 'sick', 'Sick Leave', 14, true, true, 2),
  ('2026/2027', 'maternity', 'Maternity Leave', 90, true, true, 3),
  ('2026/2027', 'paternity', 'Paternity Leave', 14, true, true, 4),
  ('2026/2027', 'study', 'Study Leave', 10, true, true, 5),
  ('2026/2027', 'unpaid', 'Unpaid Leave', 15, true, true, 6)
ON CONFLICT (leave_year_period, leave_type_key) DO NOTHING;
