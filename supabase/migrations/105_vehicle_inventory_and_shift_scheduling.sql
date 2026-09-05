CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  make text NOT NULL,
  model text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car',
  capacity integer NOT NULL CHECK (capacity > 0),
  assigned_region_id uuid REFERENCES public.regions(id),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'inactive')),
  odometer_reading integer CHECK (odometer_reading >= 0),
  insurance_expiry_date date,
  roadworthy_expiry_date date,
  notes text,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transport_vehicles_region_status_idx ON public.transport_vehicles(assigned_region_id, status);
CREATE INDEX IF NOT EXISTS transport_vehicles_registration_idx ON public.transport_vehicles(registration_number);

ALTER TABLE public.transport_requests
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid REFERENCES public.transport_vehicles(id);

ALTER TABLE public.nonregional_transport_requisitions
  ADD COLUMN IF NOT EXISTS assigned_vehicle_id uuid REFERENCES public.transport_vehicles(id);

CREATE TABLE IF NOT EXISTS public.transport_vehicle_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  transport_request_id uuid REFERENCES public.transport_requests(id) ON DELETE CASCADE,
  nonregional_requisition_id uuid REFERENCES public.nonregional_transport_requisitions(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled')),
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((transport_request_id IS NOT NULL)::integer + (nonregional_requisition_id IS NOT NULL)::integer = 1)
);

CREATE INDEX IF NOT EXISTS transport_vehicle_bookings_availability_idx ON public.transport_vehicle_bookings(vehicle_id, starts_at, ends_at) WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS public.shift_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  color text NOT NULL DEFAULT '#0f766e',
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  shift_pattern_id uuid NOT NULL REFERENCES public.shift_patterns(id),
  shift_date date NOT NULL,
  assigned_by uuid REFERENCES public.user_profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, shift_date)
);

CREATE INDEX IF NOT EXISTS shift_assignments_date_idx ON public.shift_assignments(shift_date);
CREATE INDEX IF NOT EXISTS shift_assignments_employee_date_idx ON public.shift_assignments(employee_id, shift_date);

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.user_profiles(id),
  target_employee_id uuid NOT NULL REFERENCES public.user_profiles(id),
  target_assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'approved', 'rejected', 'cancelled')),
  requester_note text,
  reviewed_by uuid REFERENCES public.user_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_by <> target_employee_id)
);

CREATE INDEX IF NOT EXISTS shift_swap_requests_status_idx ON public.shift_swap_requests(status, created_at DESC);

ALTER TABLE public.transport_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_vehicle_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_vehicles_authenticated_access ON public.transport_vehicles;
CREATE POLICY transport_vehicles_authenticated_access ON public.transport_vehicles FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager'))
);

DROP POLICY IF EXISTS transport_vehicle_bookings_authenticated_access ON public.transport_vehicle_bookings;
CREATE POLICY transport_vehicle_bookings_authenticated_access ON public.transport_vehicle_bookings FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'transport_manager', 'regional_hr', 'regional_manager'))
);

DROP POLICY IF EXISTS shift_patterns_authenticated_access ON public.shift_patterns;
CREATE POLICY shift_patterns_authenticated_access ON public.shift_patterns FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS shift_assignments_authenticated_access ON public.shift_assignments;
CREATE POLICY shift_assignments_authenticated_access ON public.shift_assignments FOR ALL TO authenticated USING (
  employee_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive', 'director_hr', 'manager_hr', 'regional_manager', 'department_head'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive', 'director_hr', 'manager_hr', 'regional_manager', 'department_head'))
);

DROP POLICY IF EXISTS shift_swap_requests_authenticated_access ON public.shift_swap_requests;
CREATE POLICY shift_swap_requests_authenticated_access ON public.shift_swap_requests FOR ALL TO authenticated USING (
  requested_by = auth.uid() OR target_employee_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive', 'director_hr', 'manager_hr', 'regional_manager', 'department_head'))
) WITH CHECK (
  requested_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'hr_leave_office', 'hr_office', 'hr', 'hr_executive', 'director_hr', 'manager_hr', 'regional_manager', 'department_head'))
);