-- ============================================================
-- HR Leave Office Templates & Payment Memo Module
-- Supports leave memo templates and payment drafting to accounts
-- ============================================================

-- 1. Create leave_memo_templates table for standard templates
CREATE TABLE IF NOT EXISTS public.leave_memo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'annual_leave', 'sick_leave', 'leave_of_absence'
  template_name VARCHAR(255) NOT NULL,
  description TEXT,
  subject_template TEXT, -- Template for memo subject with {{placeholders}}
  body_template TEXT,   -- Template for memo body with {{placeholders}}
  cc_recipients TEXT,   -- Default CC list
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add payment tracking columns to leave_plan_requests
ALTER TABLE public.leave_plan_requests
  ADD COLUMN IF NOT EXISTS payment_due_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3) DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS payment_reason_for_amount TEXT,
  ADD COLUMN IF NOT EXISTS payment_memo_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_memo_forwarded_to_accounts BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_memo_forwarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_acknowledgment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_notes TEXT;

-- 3. Add similar payment columns to leave_plan_stagger_requests
ALTER TABLE public.leave_plan_stagger_requests
  ADD COLUMN IF NOT EXISTS payment_due_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3) DEFAULT 'GHS',
  ADD COLUMN IF NOT EXISTS payment_reason_for_amount TEXT,
  ADD COLUMN IF NOT EXISTS payment_memo_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_memo_forwarded_to_accounts BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_memo_forwarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_acknowledgment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_notes TEXT;

-- 4. Create leave_payment_memos table for drafted/sent payment memos
CREATE TABLE IF NOT EXISTS public.leave_payment_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_plan_request_id UUID NOT NULL REFERENCES public.leave_plan_requests(id) ON DELETE CASCADE,
  hr_leave_office_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  hr_leave_office_name TEXT,
  memo_subject TEXT NOT NULL,
  memo_body TEXT NOT NULL,
  payment_amount NUMERIC(12, 2),
  payment_currency VARCHAR(3) DEFAULT 'GHS',
  staff_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  staff_name TEXT,
  staff_number VARCHAR(50),
  leave_period_start DATE,
  leave_period_end DATE,
  approved_days INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready_for_review', 'reviewed_by_hr', 'forwarded_to_accounts', 'acknowledged_by_accounts')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  forwarded_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

-- 5. Create leave_office_work_log for tracking HR leave office activities
CREATE TABLE IF NOT EXISTS public.leave_office_work_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_leave_office_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  hr_leave_office_name TEXT,
  leave_plan_request_id UUID REFERENCES public.leave_plan_requests(id) ON DELETE SET NULL,
  activity_type VARCHAR(50) NOT NULL
    CHECK (activity_type IN (
      'leave_request_received',
      'days_adjusted',
      'memo_drafted',
      'memo_forwarded_to_hr',
      'payment_memo_drafted',
      'payment_memo_forwarded',
      'staff_notified',
      'leave_request_added'
    )),
  description TEXT,
  adjustment_details JSONB, -- For storing adjustment data like {original_days, adjusted_days, reason}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_memo_templates_key ON public.leave_memo_templates(template_key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leave_payment_memos_leave_id ON public.leave_payment_memos(leave_plan_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_payment_memos_hr_office ON public.leave_payment_memos(hr_leave_office_id);
CREATE INDEX IF NOT EXISTS idx_leave_payment_memos_status ON public.leave_payment_memos(status);
CREATE INDEX IF NOT EXISTS idx_leave_office_work_log_hr_office ON public.leave_office_work_log(hr_leave_office_id);
CREATE INDEX IF NOT EXISTS idx_leave_office_work_log_leave_id ON public.leave_office_work_log(leave_plan_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_office_work_log_activity ON public.leave_office_work_log(activity_type);

-- 7. Insert default leave memo templates
INSERT INTO public.leave_memo_templates (template_key, template_name, description, subject_template, body_template, cc_recipients, is_active)
VALUES
  (
    'annual_leave_approval',
    'Annual Leave Approval',
    'Standard template for approving annual leave requests',
    'APPLICATION FOR ANNUAL LEAVE — {{leave_year_period}}',
    'We refer to your application for annual leave dated {{submitted_date}} on the above subject and wish to inform you that Management has approved your leave request as follows:

Leave Type: Annual Leave
Leave Period: {{leave_start_date}} to {{leave_end_date}}
Approved Days: {{approved_days}} day(s)
Return to Work Date: {{return_to_work_date}}

{{adjustment_details}}

You can count on our co-operation.',
    'Managing Director, Deputy Managing Director, HR Head, Accounts Manager',
    true
  ),
  (
    'sick_leave_approval',
    'Sick Leave Approval',
    'Template for sick leave approvals',
    'APPLICATION FOR SICK LEAVE — {{leave_year_period}}',
    'We refer to your sick leave application dated {{submitted_date}} and wish to inform you that Management has approved your request as follows:

Leave Type: Sick Leave
Leave Period: {{leave_start_date}} to {{leave_end_date}}
Approved Days: {{approved_days}} day(s)
Return to Work Date: {{return_to_work_date}}

Please ensure to provide the required medical documentation within the approved period.

You can count on our co-operation.',
    'Managing Director, Deputy Managing Director, HR Head, Accounts Manager',
    true
  ),
  (
    'leave_of_absence_approval',
    'Leave of Absence Approval',
    'Template for extended leave of absence',
    'APPROVAL FOR LEAVE OF ABSENCE',
    'We acknowledge receipt of your letter dated {{submitted_date}} on the above subject and wish to inform you that Management has approved of your request for {{approved_days}} months leave of absence effective {{leave_start_date}}.

Leave Period: {{leave_start_date}} to {{leave_end_date}}

Please note that the period of leave of absence shall not count towards your length of service and placement upon resumption shall be dependent on availability of vacancy at the time.

You are also advised to notify Management one (1) month prior to your resumption of duty for further action.

By copy of this letter, the Accounts Manager is advised to take note and delete your name from the payroll till otherwise advised.

You can count on our co-operation.',
    'Managing Director, Deputy Managing Director, HR Head, Accounts Manager',
    true
  ),
  (
    're_change_of_leave_date',
    'Re-change of Leave Date',
    'Template for rescheduled leave dates',
    'RE: CHANGE OF LEAVE DATE',
    'We acknowledge receipt of your letter dated {{submitted_date}} on the above subject and wish to inform you that Management has granted approval for your {{leave_type}} leave to be rescheduled to {{leave_start_date}} to {{leave_end_date}}.

Accordingly, you will be entitled to {{approved_days}} working days plus {{travelling_days}} travelling days.

Your {{leave_type}} leave, therefore, takes effect from {{leave_start_date}} to {{leave_end_date}}, {{leave_year_period}}.

You are expected to resume duty on {{return_to_work_date}}.

{{adjustment_details}}

You can count on our co-operation.',
    'Managing Director, Deputy Managing Director, HR Head, Accounts Manager',
    true
  );

-- 8. Update RLS policies for new tables
ALTER TABLE public.leave_memo_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_payment_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_office_work_log ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can view active templates
DROP POLICY IF EXISTS "Anyone can view active templates" ON public.leave_memo_templates;
CREATE POLICY "Anyone can view active templates"
ON public.leave_memo_templates FOR SELECT
USING (is_active = true);

-- RLS: HR staff can manage templates
DROP POLICY IF EXISTS "HR can manage templates" ON public.leave_memo_templates;
CREATE POLICY "HR can manage templates"
ON public.leave_memo_templates FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid()
  AND role IN ('admin', 'hr_leave_office')
));

-- RLS: HR staff can manage their payment memos
DROP POLICY IF EXISTS "HR staff can manage payment memos" ON public.leave_payment_memos;
CREATE POLICY "HR staff can manage payment memos"
ON public.leave_payment_memos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'hr_leave_office')
  )
  OR hr_leave_office_id = auth.uid()
);

-- RLS: HR Leave Office can insert payment memos
DROP POLICY IF EXISTS "HR Leave Office can create payment memos" ON public.leave_payment_memos;
CREATE POLICY "HR Leave Office can create payment memos"
ON public.leave_payment_memos FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid()
  AND role IN ('admin', 'hr_leave_office')
));

-- RLS: HR Leave Office can track their work
DROP POLICY IF EXISTS "HR Leave Office can view their work log" ON public.leave_office_work_log;
CREATE POLICY "HR Leave Office can view their work log"
ON public.leave_office_work_log FOR SELECT
USING (
  hr_leave_office_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin')
  )
);

-- RLS: HR Leave Office can log activities
DROP POLICY IF EXISTS "HR Leave Office can create work log entries" ON public.leave_office_work_log;
CREATE POLICY "HR Leave Office can create work log entries"
ON public.leave_office_work_log FOR INSERT
WITH CHECK (
  hr_leave_office_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('admin')
  )
);
