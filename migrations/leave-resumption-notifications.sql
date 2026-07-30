-- Leave Resumption Notification Tracking Table
-- Tracks staff who are on leave and their resumption status
-- Enables escalation workflow for non-resumption

CREATE TABLE IF NOT EXISTS leave_resumption_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  leave_request_id UUID REFERENCES leave_plan_requests(id) ON DELETE SET NULL,
  leave_end_date DATE NOT NULL,
  resumption_date DATE,
  first_check_in_date DATE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'resumed', 'overdue', 'warning_sent', 'letter_sent', 'memo_sent')) DEFAULT 'pending',
  days_overdue INT DEFAULT 0,
  notification_sent_at TIMESTAMP,
  letter_sent_at TIMESTAMP,
  memo_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indices for fast queries
CREATE INDEX IF NOT EXISTS idx_leave_resumption_user ON leave_resumption_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_status ON leave_resumption_notifications(status);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_end_date ON leave_resumption_notifications(leave_end_date);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_created ON leave_resumption_notifications(created_at DESC);

-- Audit table for tracking escalation events
CREATE TABLE IF NOT EXISTS leave_resumption_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_resumption_id UUID NOT NULL REFERENCES leave_resumption_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'resumed', 'warning_2day', 'warning_5day', 'memo_10day', 'resolved')),
  event_description TEXT,
  triggered_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_resumption_audit_leave ON leave_resumption_audit(leave_resumption_id);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_audit_user ON leave_resumption_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_audit_type ON leave_resumption_audit(event_type);

-- Enable RLS (Row Level Security) for security
ALTER TABLE leave_resumption_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_resumption_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leave_resumption_notifications
CREATE POLICY "Users can view their own leave resumption records"
  ON leave_resumption_notifications
  FOR SELECT
  USING (auth.uid()::text = user_id::text OR
         auth.uid()::text IN (
           SELECT id::text FROM user_profiles 
           WHERE role IN ('admin', 'hr_officer', 'hr_leave_office', 'hr_executive', 'director_hr')
         )
  );

CREATE POLICY "Only HR can update leave resumption status"
  ON leave_resumption_notifications
  FOR UPDATE
  USING (
    auth.uid()::text IN (
      SELECT id::text FROM user_profiles 
      WHERE role IN ('admin', 'hr_officer', 'hr_leave_office', 'hr_executive', 'director_hr')
    )
  );

-- RLS Policies for audit table
CREATE POLICY "Users can view audit records for their own resumptions"
  ON leave_resumption_audit
  FOR SELECT
  USING (
    user_id = auth.uid()::uuid OR
    auth.uid()::text IN (
      SELECT id::text FROM user_profiles 
      WHERE role IN ('admin', 'hr_officer', 'hr_leave_office', 'hr_executive', 'director_hr')
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_leave_resumption_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leave_resumption_updated_at_trigger
BEFORE UPDATE ON leave_resumption_notifications
FOR EACH ROW
EXECUTE FUNCTION update_leave_resumption_updated_at();
