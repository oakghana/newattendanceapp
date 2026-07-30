-- Loan Repayment Tracking System
-- Adds payment records, repayment schedules, and balance tracking

-- ============================================================================
-- 1. LOAN PAYMENT RECORDS TABLE
-- ============================================================================
-- Tracks all payments made by staff towards their loans
CREATE TABLE IF NOT EXISTS loan_payment_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  loan_request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount_paid NUMERIC(15, 2) NOT NULL,
  payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'mobile_money')),
  reference_number TEXT,
  
  -- Audit: Who submitted the payment
  submitted_by TEXT NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Approval workflow: Both HR and Accounts must approve
  hr_executive_id TEXT REFERENCES auth.users(id) ON DELETE SET NULL,
  hr_approval_at TIMESTAMP WITH TIME ZONE,
  hr_approval_status TEXT DEFAULT 'pending' CHECK (hr_approval_status IN ('pending', 'approved', 'rejected')),
  hr_approval_notes TEXT,
  
  accounts_executive_id TEXT REFERENCES auth.users(id) ON DELETE SET NULL,
  accounts_approval_at TIMESTAMP WITH TIME ZONE,
  accounts_approval_status TEXT DEFAULT 'pending' CHECK (accounts_approval_status IN ('pending', 'approved', 'rejected')),
  accounts_approval_notes TEXT,
  
  -- Overall status (both must be approved)
  overall_status TEXT DEFAULT 'pending' CHECK (overall_status IN ('pending', 'approved', 'rejected', 'completed')),
  
  -- Evidence and notes
  evidence_file_path TEXT,
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_payment_amount CHECK (amount_paid > 0)
);

CREATE INDEX idx_loan_payment_records_loan_id ON loan_payment_records(loan_request_id);
CREATE INDEX idx_loan_payment_records_submitted_by ON loan_payment_records(submitted_by);
CREATE INDEX idx_loan_payment_records_status ON loan_payment_records(overall_status);
CREATE INDEX idx_loan_payment_records_payment_date ON loan_payment_records(payment_date);

-- ============================================================================
-- 2. LOAN REPAYMENT SCHEDULE TABLE
-- ============================================================================
-- Pre-calculated monthly repayment schedule
CREATE TABLE IF NOT EXISTS loan_repayment_schedule (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  loan_request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  monthly_amount NUMERIC(15, 2) NOT NULL,
  
  -- Payment tracking
  payment_record_id TEXT REFERENCES loan_payment_records(id) ON DELETE SET NULL,
  paid_date DATE,
  paid_amount NUMERIC(15, 2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'overdue', 'waived')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_installment_number CHECK (installment_number > 0),
  CONSTRAINT valid_monthly_amount CHECK (monthly_amount > 0),
  CONSTRAINT unique_installment_per_loan UNIQUE(loan_request_id, installment_number)
);

CREATE INDEX idx_loan_repayment_schedule_loan_id ON loan_repayment_schedule(loan_request_id);
CREATE INDEX idx_loan_repayment_schedule_due_date ON loan_repayment_schedule(due_date);
CREATE INDEX idx_loan_repayment_schedule_status ON loan_repayment_schedule(status);

-- ============================================================================
-- 3. LOAN OUTSTANDING BALANCE VIEW
-- ============================================================================
-- Calculated view showing real-time outstanding balance for each loan
CREATE OR REPLACE VIEW loan_outstanding_balance AS
SELECT
  lr.id AS loan_request_id,
  lr.staff_id,
  lr.fixed_amount AS total_loan_amount,
  COALESCE(SUM(lpr.amount_paid), 0) AS paid_to_date,
  lr.fixed_amount - COALESCE(SUM(lpr.amount_paid), 0) AS outstanding_balance,
  MIN(lrs.due_date) FILTER (WHERE lrs.status IN ('pending', 'overdue')) AS next_payment_due,
  MAX(lrs.due_date) FILTER (WHERE lrs.status NOT IN ('waived')) AS expected_completion_date,
  CASE
    WHEN lr.fixed_amount - COALESCE(SUM(lpr.amount_paid), 0) <= 0 THEN 'completed'
    WHEN COUNT(lrs.id) FILTER (WHERE lrs.due_date < CURRENT_DATE AND lrs.status = 'pending') > 0 THEN 'overdue'
    WHEN COUNT(lrs.id) FILTER (WHERE lrs.due_date <= CURRENT_DATE + INTERVAL '7 days' AND lrs.status = 'pending') > 0 THEN 'due_soon'
    ELSE 'on_track'
  END AS repayment_status
FROM
  loan_requests lr
  LEFT JOIN loan_payment_records lpr ON lr.id = lpr.loan_request_id AND lpr.overall_status = 'approved'
  LEFT JOIN loan_repayment_schedule lrs ON lr.id = lrs.loan_request_id
WHERE
  lr.status IN ('approved_director', 'director_rejected')
GROUP BY
  lr.id, lr.staff_id, lr.fixed_amount;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on payment records
ALTER TABLE loan_payment_records ENABLE ROW LEVEL SECURITY;

-- Staff can view their own payment records
CREATE POLICY "staff_view_own_payment_records" ON loan_payment_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM loan_requests lr
      WHERE lr.id = loan_payment_records.loan_request_id
      AND lr.staff_id = auth.uid()::text
    )
  );

-- HR and Accounts executives can view payment records for approval
CREATE POLICY "executives_view_payment_records" ON loan_payment_records
  FOR SELECT USING (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role IN ('hr_executive', 'accounts_executive')
    )
  );

-- Staff can insert payment records for their own loans
CREATE POLICY "staff_submit_payment_records" ON loan_payment_records
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM loan_requests lr
      WHERE lr.id = loan_payment_records.loan_request_id
      AND lr.staff_id = auth.uid()::text
    )
  );

-- HR Executives can update HR approval status
CREATE POLICY "hr_executive_approve_payments" ON loan_payment_records
  FOR UPDATE USING (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role = 'hr_executive'
    )
  )
  WITH CHECK (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role = 'hr_executive'
    )
  );

-- Accounts Executives can update accounts approval status
CREATE POLICY "accounts_executive_approve_payments" ON loan_payment_records
  FOR UPDATE USING (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role = 'accounts_executive'
    )
  )
  WITH CHECK (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role = 'accounts_executive'
    )
  );

-- Enable RLS on repayment schedule
ALTER TABLE loan_repayment_schedule ENABLE ROW LEVEL SECURITY;

-- Staff can view their own repayment schedule
CREATE POLICY "staff_view_own_schedule" ON loan_repayment_schedule
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM loan_requests lr
      WHERE lr.id = loan_repayment_schedule.loan_request_id
      AND lr.staff_id = auth.uid()::text
    )
  );

-- Executives can view all repayment schedules
CREATE POLICY "executives_view_schedule" ON loan_repayment_schedule
  FOR SELECT USING (
    auth.uid()::text IN (
      SELECT id FROM user_profiles WHERE role IN ('hr_executive', 'accounts_executive', 'admin', 'super_admin')
    )
  );

-- ============================================================================
-- 5. ADD COLUMNS TO LOAN_REQUESTS TABLE
-- ============================================================================
-- Track repayment plan and status on the main loan table
ALTER TABLE loan_requests
ADD COLUMN IF NOT EXISTS repayment_plan_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS repayment_duration_months INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS repayment_status TEXT DEFAULT 'not_started' CHECK (
  repayment_status IN ('not_started', 'active', 'on_track', 'overdue', 'completed', 'defaulted')
);

-- ============================================================================
-- 6. FUNCTION: Auto-generate repayment schedule
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_repayment_schedule(
  p_loan_request_id TEXT,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_duration_months INTEGER DEFAULT 12
)
RETURNS TABLE (schedule_id TEXT, monthly_amount NUMERIC) AS $$
DECLARE
  v_loan_amount NUMERIC;
  v_monthly_amount NUMERIC;
  v_current_date DATE;
  v_installment INTEGER := 1;
BEGIN
  -- Get loan amount
  SELECT fixed_amount INTO v_loan_amount
  FROM loan_requests
  WHERE id = p_loan_request_id;

  IF v_loan_amount IS NULL THEN
    RAISE EXCEPTION 'Loan request not found: %', p_loan_request_id;
  END IF;

  -- Calculate monthly payment
  v_monthly_amount := v_loan_amount / p_duration_months;
  v_current_date := p_start_date + INTERVAL '1 month';

  -- Delete existing schedule if any
  DELETE FROM loan_repayment_schedule WHERE loan_request_id = p_loan_request_id;

  -- Generate monthly installments
  FOR v_installment IN 1..p_duration_months LOOP
    INSERT INTO loan_repayment_schedule (
      loan_request_id,
      installment_number,
      due_date,
      monthly_amount,
      status
    ) VALUES (
      p_loan_request_id,
      v_installment,
      v_current_date,
      v_monthly_amount,
      'pending'
    )
    RETURNING id, v_monthly_amount INTO schedule_id, monthly_amount;

    v_current_date := v_current_date + INTERVAL '1 month';
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. TRIGGER: Update overall payment status when both executives approve
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payment_overall_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.overall_status := CASE
    WHEN NEW.hr_approval_status = 'rejected' OR NEW.accounts_approval_status = 'rejected' THEN 'rejected'
    WHEN NEW.hr_approval_status = 'approved' AND NEW.accounts_approval_status = 'approved' THEN 'completed'
    ELSE 'pending'
  END;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_payment_overall_status ON loan_payment_records;
CREATE TRIGGER trg_update_payment_overall_status
  BEFORE INSERT OR UPDATE ON loan_payment_records
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_overall_status();

-- ============================================================================
-- 8. TRIGGER: Update repayment schedule when payment is approved
-- ============================================================================
CREATE OR REPLACE FUNCTION update_repayment_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.overall_status = 'completed' AND OLD.overall_status != 'completed' THEN
    -- Mark next pending installment(s) as paid/partial
    UPDATE loan_repayment_schedule
    SET
      payment_record_id = NEW.id,
      paid_date = NEW.payment_date,
      paid_amount = NEW.amount_paid,
      status = CASE
        WHEN NEW.amount_paid >= monthly_amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = NOW()
    WHERE
      loan_request_id = NEW.loan_request_id
      AND status IN ('pending', 'partial')
      AND due_date <= NEW.payment_date
    LIMIT 1;

    -- Update loan repayment status
    UPDATE loan_requests
    SET
      repayment_status = (
        SELECT CASE
          WHEN COALESCE(SUM(lpr.amount_paid), 0) >= fixed_amount THEN 'completed'
          WHEN COUNT(lrs.id) FILTER (WHERE lrs.due_date < CURRENT_DATE AND lrs.status = 'pending') > 0 THEN 'overdue'
          ELSE 'on_track'
        END
        FROM loan_repayment_schedule lrs
        LEFT JOIN loan_payment_records lpr ON lrs.loan_request_id = lpr.loan_request_id AND lpr.overall_status = 'approved'
        WHERE lrs.loan_request_id = NEW.loan_request_id
      )
    WHERE id = NEW.loan_request_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_repayment_on_payment ON loan_payment_records;
CREATE TRIGGER trg_update_repayment_on_payment
  AFTER UPDATE ON loan_payment_records
  FOR EACH ROW
  EXECUTE FUNCTION update_repayment_on_payment();
