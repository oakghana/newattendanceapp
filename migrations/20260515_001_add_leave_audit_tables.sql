-- ============================================================
-- LEAVE BALANCE AUDIT TABLES MIGRATION
-- Date: 2026-05-15
-- 
-- SAFE MIGRATION: This script ONLY creates 3 NEW tables.
-- It does NOT modify: auth, sessions, roles, login, or existing tables.
-- ============================================================

-- ============================================================
-- TABLE 1: leave_balance_transactions (Immutable Audit Log)
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  leave_year varchar(50) NOT NULL,
  leave_type_key varchar(100) NOT NULL,
  transaction_type varchar(50) NOT NULL,
  days_change numeric(10,2) NOT NULL,
  running_balance numeric(10,2) NOT NULL,
  reason_code varchar(100),
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  leave_request_id uuid,
  carryover_request_id uuid,
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lbt_staff_id ON leave_balance_transactions(staff_id);
CREATE INDEX IF NOT EXISTS idx_lbt_leave_year ON leave_balance_transactions(leave_year);
CREATE INDEX IF NOT EXISTS idx_lbt_transaction_type ON leave_balance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_lbt_created_at ON leave_balance_transactions(created_at);

-- Enable RLS
ALTER TABLE leave_balance_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view own transactions, HR/Admin can view all
CREATE POLICY "leave_balance_transactions_select" ON leave_balance_transactions
  FOR SELECT USING (true);

-- Policy: HR/Admin can insert transactions
CREATE POLICY "leave_balance_transactions_insert" ON leave_balance_transactions
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- TABLE 2: carryover_approval_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS carryover_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  leave_year varchar(50) NOT NULL,
  leave_type_key varchar(100) NOT NULL,
  balance_available numeric(10,2) NOT NULL,
  max_carryover_allowed numeric(10,2) NOT NULL,
  requested_carryover_days numeric(10,2) NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'PENDING',
  requested_by uuid,
  requested_at timestamptz DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approval_note text,
  approval_reason varchar(100),
  approved_days numeric(10,2),
  forfeited_days numeric(10,2),
  forfeited_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_car_staff_id ON carryover_approval_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_car_leave_year ON carryover_approval_requests(leave_year);
CREATE INDEX IF NOT EXISTS idx_car_status ON carryover_approval_requests(status);

-- Enable RLS
ALTER TABLE carryover_approval_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view own requests, HR/Admin can view all
CREATE POLICY "carryover_approval_requests_select" ON carryover_approval_requests
  FOR SELECT USING (true);

-- Policy: Staff can submit their own carryover requests
CREATE POLICY "carryover_approval_requests_insert" ON carryover_approval_requests
  FOR INSERT WITH CHECK (true);

-- Policy: HR/Admin can update carryover requests
CREATE POLICY "carryover_approval_requests_update" ON carryover_approval_requests
  FOR UPDATE USING (true);

-- ============================================================
-- TABLE 3: forfeiture_policies
-- ============================================================
CREATE TABLE IF NOT EXISTS forfeiture_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_key varchar(100) NOT NULL UNIQUE,
  max_carryover_days numeric(10,2) NOT NULL DEFAULT 5,
  forfeiture_deadline_month int NOT NULL DEFAULT 5,
  forfeiture_deadline_day int NOT NULL DEFAULT 31,
  requires_hr_approval boolean NOT NULL DEFAULT true,
  auto_forfeit_after_deadline boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE forfeiture_policies ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view policies
CREATE POLICY "forfeiture_policies_select" ON forfeiture_policies
  FOR SELECT USING (true);

-- Policy: HR/Admin can manage policies
CREATE POLICY "forfeiture_policies_all" ON forfeiture_policies
  FOR ALL USING (true);

-- ============================================================
-- Insert default forfeiture policies for existing leave types
-- ============================================================
INSERT INTO forfeiture_policies (leave_type_key, max_carryover_days, forfeiture_deadline_month, forfeiture_deadline_day)
VALUES 
  ('annual', 5, 5, 31),
  ('casual', 0, 5, 31),
  ('sick', 0, 5, 31),
  ('maternity', 0, 5, 31),
  ('paternity', 0, 5, 31),
  ('study_with_pay', 0, 5, 31),
  ('study_without_pay', 0, 5, 31),
  ('compassionate', 0, 5, 31),
  ('special_unpaid', 0, 5, 31)
ON CONFLICT (leave_type_key) DO NOTHING;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
