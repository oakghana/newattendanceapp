-- Create leave_deferment_requests table
CREATE TABLE IF NOT EXISTS leave_deferment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_plan_request_id UUID REFERENCES leave_plan_requests(id) ON DELETE SET NULL,
  original_start_date DATE NOT NULL,
  original_end_date DATE NOT NULL,
  new_start_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending_hod' CHECK (status IN ('pending_hod', 'pending_hr_office', 'pending_executive_hr', 'approved', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  hod_reviewer_id UUID REFERENCES auth.users(id),
  hod_decision VARCHAR(50),
  hod_comments TEXT,
  hod_reviewed_at TIMESTAMP,
  hr_office_reviewer_id UUID REFERENCES auth.users(id),
  hr_office_decision VARCHAR(50),
  hr_office_comments TEXT,
  hr_office_reviewed_at TIMESTAMP,
  executive_hr_reviewer_id UUID REFERENCES auth.users(id),
  executive_hr_decision VARCHAR(50),
  executive_hr_comments TEXT,
  executive_hr_reviewed_at TIMESTAMP,
  original_leave_days INTEGER,
  new_leave_days INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create leave_recall_requests table
CREATE TABLE IF NOT EXISTS leave_recall_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_plan_request_id UUID REFERENCES leave_plan_requests(id) ON DELETE SET NULL,
  leave_start_date DATE NOT NULL,
  leave_end_date DATE NOT NULL,
  recall_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending_hod' CHECK (status IN ('pending_hod', 'pending_hr_office', 'pending_executive_hr', 'approved', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  hod_reviewer_id UUID REFERENCES auth.users(id),
  hod_decision VARCHAR(50),
  hod_comments TEXT,
  hod_reviewed_at TIMESTAMP,
  hr_office_reviewer_id UUID REFERENCES auth.users(id),
  hr_office_decision VARCHAR(50),
  hr_office_comments TEXT,
  hr_office_reviewed_at TIMESTAMP,
  executive_hr_reviewer_id UUID REFERENCES auth.users(id),
  executive_hr_decision VARCHAR(50),
  executive_hr_comments TEXT,
  executive_hr_reviewed_at TIMESTAMP,
  original_leave_days INTEGER,
  recalled_leave_days INTEGER,
  restored_days INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create audit log table
CREATE TABLE IF NOT EXISTS leave_deferment_recall_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('deferment_requested', 'deferment_hod_reviewed', 'deferment_hr_approved', 'deferment_executive_approved', 'deferment_approved', 'deferment_rejected', 'recall_requested', 'recall_hod_reviewed', 'recall_hr_approved', 'recall_executive_approved', 'recall_approved', 'recall_rejected')),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('deferment', 'recall')),
  entity_id UUID NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  changes JSONB,
  comments TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_leave_deferment_user_id ON leave_deferment_requests(user_id);
CREATE INDEX idx_leave_deferment_status ON leave_deferment_requests(status);
CREATE INDEX idx_leave_deferment_created_at ON leave_deferment_requests(created_at DESC);
CREATE INDEX idx_leave_recall_user_id ON leave_recall_requests(user_id);
CREATE INDEX idx_leave_recall_status ON leave_recall_requests(status);
CREATE INDEX idx_leave_recall_created_at ON leave_recall_requests(created_at DESC);
CREATE INDEX idx_audit_log_entity_id ON leave_deferment_recall_audit_log(entity_id);
CREATE INDEX idx_audit_log_performed_by ON leave_deferment_recall_audit_log(performed_by);

-- Enable RLS
ALTER TABLE leave_deferment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_recall_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_deferment_recall_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leave_deferment_requests
CREATE POLICY "Users can view their own deferment requests" ON leave_deferment_requests
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = requested_by);

CREATE POLICY "Users can create deferment requests" ON leave_deferment_requests
  FOR INSERT WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins can view all deferment requests" ON leave_deferment_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "HR staff can view deferment requests in their queue" ON leave_deferment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('hr_leave_office', 'hr_office', 'executive_hr')
    )
  );

-- RLS Policies for leave_recall_requests
CREATE POLICY "Users can view their own recall requests" ON leave_recall_requests
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = requested_by);

CREATE POLICY "Users can create recall requests" ON leave_recall_requests
  FOR INSERT WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Admins can view all recall requests" ON leave_recall_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "HR staff can view recall requests in their queue" ON leave_recall_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('hr_leave_office', 'hr_office', 'executive_hr')
    )
  );

-- RLS Policies for audit log
CREATE POLICY "Audit log is readable by admins and HR staff" ON leave_deferment_recall_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'hr_leave_office', 'hr_office', 'executive_hr', 'audit_staff')
    )
  );

CREATE POLICY "Audit log entries can be inserted by the system" ON leave_deferment_recall_audit_log
  FOR INSERT WITH CHECK (true);
