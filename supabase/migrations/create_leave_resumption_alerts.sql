-- Create leave resumption alerts table
CREATE TABLE IF NOT EXISTS leave_resumption_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_request_id UUID NOT NULL REFERENCES leave_plan_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  resumption_date DATE NOT NULL,
  
  -- Alert tracking
  alert_2_weeks_sent BOOLEAN DEFAULT FALSE,
  alert_2_weeks_sent_at TIMESTAMP,
  alert_1_week_sent BOOLEAN DEFAULT FALSE,
  alert_1_week_sent_at TIMESTAMP,
  
  -- Check-in tracking
  checked_in_date DATE,
  checked_in_time TIME,
  checked_out_date DATE,
  checked_out_time TIME,
  
  -- Alerts to HOD/RM for missing check-in
  hod_rm_alert_sent BOOLEAN DEFAULT FALSE,
  hod_rm_alert_sent_at TIMESTAMP,
  hod_rm_alert_acknowledged BOOLEAN DEFAULT FALSE,
  hod_rm_alert_acknowledged_at TIMESTAMP,
  hod_rm_alert_acknowledged_by UUID,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending', -- pending, checked_in, no_show, excused
  reason_for_absence TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_leave_resumption_alerts_user_id ON leave_resumption_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_alerts_resumption_date ON leave_resumption_alerts(resumption_date);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_alerts_status ON leave_resumption_alerts(status);
CREATE INDEX IF NOT EXISTS idx_leave_resumption_alerts_leave_plan_request_id ON leave_resumption_alerts(leave_plan_request_id);

-- Enable RLS
ALTER TABLE leave_resumption_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see their own resumption alerts
CREATE POLICY "Users can view their own resumption alerts"
  ON leave_resumption_alerts FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- RLS Policy: HOD/RM/HR can see resumption alerts for their department staff
CREATE POLICY "HOD/RM can view department staff resumption alerts"
  ON leave_resumption_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles hod_user
      JOIN user_profiles staff_user ON staff_user.id = leave_resumption_alerts.user_id
      WHERE hod_user.id = auth.uid()::uuid
      AND (
        (hod_user.role = 'hod' AND hod_user.department_id = staff_user.department_id)
        OR (hod_user.role ILIKE '%rm%' AND hod_user.region = staff_user.region)
        OR hod_user.role ILIKE '%hr%'
      )
    )
  );
