-- Enable RLS on deferment and recall tables
ALTER TABLE leave_deferment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_recall_requests ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Allow HOD/RM/HR Office deferment CRUD" ON leave_deferment_requests;
DROP POLICY IF EXISTS "Allow HOD/RM/HR Office recall CRUD" ON leave_recall_requests;

-- Policy for deferment requests - Allow full CRUD for HOD, RM, and HR Leave Office users
CREATE POLICY "Allow HOD/RM/HR Office deferment CRUD" 
ON leave_deferment_requests 
FOR ALL
USING (
  auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
)
WITH CHECK (
  auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
);

-- Policy for recall requests - Allow full CRUD for HOD, RM, and HR Leave Office users
CREATE POLICY "Allow HOD/RM/HR Office recall CRUD" 
ON leave_recall_requests 
FOR ALL
USING (
  auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
)
WITH CHECK (
  auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
);

-- Allow staff to read their own deferment requests (optional, for feedback)
CREATE POLICY "Allow staff to read own deferment requests" 
ON leave_deferment_requests 
FOR SELECT
USING (
  auth.uid()::text = staff_id 
  OR auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
);

-- Allow staff to read their own recall requests (optional, for feedback)
CREATE POLICY "Allow staff to read own recall requests" 
ON leave_recall_requests 
FOR SELECT
USING (
  auth.uid()::text = staff_id 
  OR auth.jwt() ->> 'role' IN ('department_head', 'regional_manager', 'hr_leave_office', 'admin')
);
