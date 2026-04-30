-- Add regional_manager role to user_profiles
ALTER TABLE user_profiles 
DROP CONSTRAINT "user_profiles_role_check",
ADD CONSTRAINT "user_profiles_role_check" CHECK (role IN ('admin', 'regional_manager', 'department_head', 'staff', 'it-admin', 'nsp', 'intern', 'contract'));

-- Add region_id to user_profiles for regional managers
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL;

-- Create leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  reference_number VARCHAR(80) UNIQUE,
    leave_type VARCHAR(50) NOT NULL, -- 'annual', 'sick', 'personal', 'emergency', 'other'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    rejected_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, start_date, end_date)
);

-- Create leave status tracking (daily check)
CREATE TABLE IF NOT EXISTS leave_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'at_post' CHECK (status IN ('at_post', 'on_leave', 'absent')),
    leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Create leave notifications table (for leave approval/rejection notifications)
CREATE TABLE IF NOT EXISTS leave_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'leave_request', 'leave_approved', 'leave_rejected', 'leave_cancelled'
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_taken VARCHAR(20) CHECK (action_taken IN ('approved', 'rejected', 'dismissed', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_status_user_date ON leave_status(user_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_notifications_recipient ON leave_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_leave_notifications_created_at ON leave_notifications(created_at DESC);

-- Enable RLS on leave tables
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leave_requests
-- Users can view their own leave requests
DROP POLICY IF EXISTS "Users can view their own leave requests" ON leave_requests;
CREATE POLICY "Users can view their own leave requests"
ON leave_requests FOR SELECT
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND role IN ('admin', 'regional_manager', 'department_head')
));

-- Users can create their own leave requests
DROP POLICY IF EXISTS "Users can create leave requests" ON leave_requests;
CREATE POLICY "Users can create leave requests"
ON leave_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admin, regional_manager, and department_head can approve/reject leave requests
DROP POLICY IF EXISTS "Managers can approve/reject leave requests" ON leave_requests;
CREATE POLICY "Managers can approve/reject leave requests"
ON leave_requests FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND role IN ('admin', 'regional_manager', 'department_head')
));

-- RLS Policies for leave_status
-- Users can view their own leave status
DROP POLICY IF EXISTS "Users can view their own leave status" ON leave_status;
CREATE POLICY "Users can view their own leave status"
ON leave_status FOR SELECT
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND role IN ('admin', 'regional_manager', 'department_head')
));

-- System can update leave status (from backend)
DROP POLICY IF EXISTS "System can update leave status" ON leave_status;
CREATE POLICY "System can update leave status"
ON leave_status FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "System can update leave status records" ON leave_status;
CREATE POLICY "System can update leave status records"
ON leave_status FOR UPDATE
WITH CHECK (EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND role IN ('admin', 'regional_manager', 'department_head')
) OR true);

-- RLS Policies for leave_notifications
-- Recipients can view their notifications
DROP POLICY IF EXISTS "Users can view their leave notifications" ON leave_notifications;
CREATE POLICY "Users can view their leave notifications"
ON leave_notifications FOR SELECT
USING (recipient_id = auth.uid());

-- Managers can send notifications
DROP POLICY IF EXISTS "Managers can send leave notifications" ON leave_notifications;
CREATE POLICY "Managers can send leave notifications"
ON leave_notifications FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid() AND role IN ('admin', 'regional_manager', 'department_head')
));

-- Users can mark notifications as read
DROP POLICY IF EXISTS "Users can update their leave notifications" ON leave_notifications;
CREATE POLICY "Users can update their leave notifications"
ON leave_notifications FOR UPDATE
USING (recipient_id = auth.uid());

-- Update staff_notifications RLS to include regional_manager
DROP POLICY IF EXISTS "Admins and dept heads can send notifications" ON staff_notifications;
DROP POLICY IF EXISTS "Managers can send notifications" ON staff_notifications;
CREATE POLICY "Managers can send notifications"
ON staff_notifications FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'regional_manager', 'department_head')
  )
);

-- Drop function if exists to avoid signature/name conflicts, then create
-- Ensure trigger is removed before dropping the function to avoid dependency errors
DROP TRIGGER IF EXISTS leave_status_update_trigger ON leave_requests;
DROP FUNCTION IF EXISTS update_leave_status_on_approval();
CREATE OR REPLACE FUNCTION update_leave_status_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Generate leave status records for each day in the leave period
    INSERT INTO leave_status (user_id, date, status, leave_request_id)
    SELECT NEW.user_id, d::date, 'on_leave', NEW.id
    FROM generate_series(NEW.start_date::timestamp, NEW.end_date::timestamp, '1 day'::interval) d
    ON CONFLICT (user_id, date) DO UPDATE SET status = 'on_leave', leave_request_id = NEW.id;
  END IF;
  
  IF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    -- Clear leave status if rejected
    DELETE FROM leave_status 
    WHERE leave_request_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is idempotent: drop existing trigger before (re)creating
DROP TRIGGER IF EXISTS leave_status_update_trigger ON leave_requests;
CREATE TRIGGER leave_status_update_trigger
AFTER UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_status_on_approval();

-- Ensure trigger is idempotent: drop existing trigger before (re)creating
DROP TRIGGER IF EXISTS leave_status_update_trigger ON leave_requests;
CREATE TRIGGER leave_status_update_trigger
AFTER UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_status_on_approval();

-- Drop function first to avoid parameter name/signature conflicts
DROP FUNCTION IF EXISTS is_user_on_leave(UUID, DATE);
CREATE OR REPLACE FUNCTION is_user_on_leave(user_id_param UUID, check_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM leave_status
    WHERE user_id = user_id_param
    AND date = check_date
    AND status = 'on_leave'
  );
END;
$$ LANGUAGE plpgsql;
