-- Create loan_payment_evidence table to track payment evidence submissions and approvals
CREATE TABLE IF NOT EXISTS public.loan_payment_evidence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Staff member who made the payment (no direct FK to auth.users due to Supabase limitations)
  
  -- Evidence details
  payment_date DATE NOT NULL,
  payment_amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(100), -- "bank_transfer", "cheque", "cash", "mobile_money", etc.
  reference_number VARCHAR(255) NOT NULL, -- Bank reference, cheque number, transaction ID, etc.
  description TEXT, -- Additional notes about the payment
  
  -- Evidence file
  evidence_file_url TEXT, -- URL to uploaded receipt/proof file
  
  -- Status and approval
  status VARCHAR(50) DEFAULT 'pending_approval', -- pending_approval, approved, rejected, completed
  submitted_by UUID NOT NULL, -- HR/Accounts staff who submitted (no direct FK to auth.users due to Supabase limitations)
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  -- HR Executive approval
  approved_by UUID, -- HR Executive who approved (no direct FK to auth.users due to Supabase limitations)
  approved_at TIMESTAMP,
  approval_notes TEXT,
  
  -- Rejection details
  rejected_by UUID, -- HR Executive who rejected (no direct FK to auth.users due to Supabase limitations)
  rejected_at TIMESTAMP,
  rejection_reason TEXT, -- Why the payment evidence was rejected
  
  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed')),
  CONSTRAINT payment_amount_positive CHECK (payment_amount > 0),
  CONSTRAINT valid_dates CHECK (
    (approved_at IS NULL OR approved_by IS NOT NULL) AND
    (rejected_at IS NULL OR rejected_by IS NOT NULL)
  )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_loan_request_id 
  ON public.loan_payment_evidence(loan_request_id);

CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_user_id 
  ON public.loan_payment_evidence(user_id);

CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_status 
  ON public.loan_payment_evidence(status);

CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_submitted_at 
  ON public.loan_payment_evidence(submitted_at DESC);

-- Enable RLS
ALTER TABLE public.loan_payment_evidence ENABLE ROW LEVEL SECURITY;

-- RLS policies for loan_payment_evidence
-- Staff can view their own payment evidence
CREATE POLICY "Staff can view own payment evidence" 
  ON public.loan_payment_evidence 
  FOR SELECT 
  USING (user_id = auth.uid());

-- HR/Accounts can view and create payment evidence
CREATE POLICY "HR/Accounts can manage payment evidence"
  ON public.loan_payment_evidence
  FOR ALL
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('hr', 'accounts', 'admin')
  );

-- HR Executive can view and approve payment evidence
CREATE POLICY "HR Executive can approve payment evidence"
  ON public.loan_payment_evidence
  FOR ALL
  USING (
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()) IN ('hr_executive', 'admin')
  );
