-- Create leave_balance_transactions (Immutable Audit Log)
CREATE TABLE IF NOT EXISTS leave_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year character varying(50) NOT NULL,
  leave_type_key character varying(100) NOT NULL,
  
  -- Transaction details
  transaction_type character varying(50) NOT NULL,
  -- Values: OPENING, TAKEN, ADJUSTMENT, CARRYOVER_REQUEST, CARRYOVER_APPROVED, CARRYOVER_REJECTED, FORFEITED, CLOSING
  
  days_change numeric(10,2) NOT NULL,
  running_balance numeric(10,2) NOT NULL,
  
  -- Context
  reason_code character varying(100),
  -- Values: LEAVE_TAKEN, PUBLIC_HOLIDAY_DEDUCTED, TRAVELLING_DAYS_ADDED, MANUAL_ADJUSTMENT, FORFEITURE, CARRYOVER_APPROVAL, etc.
  
  notes text,
  
  -- Audit trail
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,
  
  -- Links to source
  leave_request_id uuid,
  carryover_request_id uuid,
  
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_balance_transactions_staff_id ON leave_balance_transactions(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_transactions_leave_year ON leave_balance_transactions(leave_year);
CREATE INDEX IF NOT EXISTS idx_leave_balance_transactions_transaction_type ON leave_balance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_leave_balance_transactions_created_at ON leave_balance_transactions(created_at);

-- Enable RLS
ALTER TABLE leave_balance_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own balance transactions" ON leave_balance_transactions
  FOR SELECT USING (staff_id = auth.uid() OR 
    auth.uid() IN (SELECT user_id FROM staff_roles WHERE role IN ('hr_office', 'hod', 'admin')));

CREATE POLICY "Only HR/Admin can insert transactions" ON leave_balance_transactions
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT user_id FROM staff_roles WHERE role IN ('hr_office', 'admin')));

---

-- Create carryover_approval_requests
CREATE TABLE IF NOT EXISTS carryover_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year character varying(50) NOT NULL,
  leave_type_key character varying(100) NOT NULL,
  
  -- Balance info
  balance_available numeric(10,2) NOT NULL,
  max_carryover_allowed numeric(10,2) NOT NULL,
  requested_carryover_days numeric(10,2) NOT NULL,
  
  -- Status workflow
  status character varying(50) NOT NULL DEFAULT 'PENDING',
  -- Values: PENDING, APPROVED, REJECTED, FORFEITED
  
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamp with time zone DEFAULT now(),
  
  -- HR approval
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  approval_note text,
  approval_reason character varying(100),
  -- Values: CRITICAL_ROLE, HEALTH_REASONS, OPERATIONAL_NEED, POLICY_EXCEPTION
  
  -- Outcome
  forfeited_days numeric(10,2),
  forfeited_reason text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carryover_approval_requests_staff_id ON carryover_approval_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_carryover_approval_requests_status ON carryover_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_carryover_approval_requests_leave_year ON carryover_approval_requests(leave_year);
CREATE INDEX IF NOT EXISTS idx_carryover_approval_requests_reviewed_at ON carryover_approval_requests(reviewed_at);

ALTER TABLE carryover_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own carryover requests" ON carryover_approval_requests
  FOR SELECT USING (staff_id = auth.uid() OR 
    auth.uid() IN (SELECT user_id FROM staff_roles WHERE role IN ('hr_office', 'hod', 'admin')));

CREATE POLICY "Only HR/Admin can modify carryover requests" ON carryover_approval_requests
  FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM staff_roles WHERE role IN ('hr_office', 'admin')));

---

-- Create forfeiture_policies
CREATE TABLE IF NOT EXISTS forfeiture_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_key character varying(100) NOT NULL,
  leave_year character varying(50) NOT NULL,
  
  -- Policy config
  max_carryover_days integer NOT NULL DEFAULT 0,
  carryover_allowed boolean NOT NULL DEFAULT false,
  forfeiture_date date NOT NULL,
  forfeiture_month integer NOT NULL,
  
  -- HR approval requirement
  requires_hr_approval boolean NOT NULL DEFAULT true,
  approval_deadline date,
  
  -- Financial impact
  forfeiture_valuation_method character varying(50),
  -- Values: SALARY_BASED, POLICY_FIXED, NONE
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(leave_type_key, leave_year)
);

CREATE INDEX IF NOT EXISTS idx_forfeiture_policies_leave_type_key ON forfeiture_policies(leave_type_key);
CREATE INDEX IF NOT EXISTS idx_forfeiture_policies_leave_year ON forfeiture_policies(leave_year);

ALTER TABLE forfeiture_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view forfeiture policies" ON forfeiture_policies
  FOR SELECT USING (true);

CREATE POLICY "Only Admin can modify forfeiture policies" ON forfeiture_policies
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM staff_roles WHERE role = 'admin'));
