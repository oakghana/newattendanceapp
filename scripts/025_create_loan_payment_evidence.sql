-- Create loan_payment_evidence table to track payment evidence submissions and approvals
CREATE TABLE IF NOT EXISTS public.loan_payment_evidence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE, -- Staff member who made payment
  
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
  submitted_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT, -- HR/Accounts staff
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- HR Executive approval
  approved_by UUID REFERENCES public.user_profiles(id) ON DELETE RESTRICT, -- HR Executive
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  
  -- Rejection details
  rejected_by UUID REFERENCES public.user_profiles(id) ON DELETE RESTRICT, -- HR Executive
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT, -- Why rejected
  
  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed')),
  CONSTRAINT payment_amount_positive CHECK (payment_amount > 0),
  CONSTRAINT valid_approval CHECK (
    (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
    (status != 'approved')
  ),
  CONSTRAINT valid_rejection CHECK (
    (status = 'rejected' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL) OR
    (status != 'rejected')
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

CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_submitted_by 
  ON public.loan_payment_evidence(submitted_by);

CREATE INDEX IF NOT EXISTS idx_loan_payment_evidence_approved_by
  ON public.loan_payment_evidence(approved_by) 
  WHERE status = 'approved';

-- Enable RLS
ALTER TABLE public.loan_payment_evidence ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe for re-runs)
DROP POLICY IF EXISTS "Staff can view own payment evidence" ON public.loan_payment_evidence;
DROP POLICY IF EXISTS "Staff can insert own payment evidence" ON public.loan_payment_evidence;
DROP POLICY IF EXISTS "HR/Accounts can manage payment evidence" ON public.loan_payment_evidence;
DROP POLICY IF EXISTS "HR Executive can approve payment evidence" ON public.loan_payment_evidence;

-- Staff can view their own payment evidence
CREATE POLICY "Staff can view own payment evidence" 
  ON public.loan_payment_evidence 
  FOR SELECT 
  USING (user_id = auth.uid());

-- Staff can insert their own payment evidence
CREATE POLICY "Staff can insert own payment evidence" 
  ON public.loan_payment_evidence 
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- HR/Accounts can view and manage all payment evidence
CREATE POLICY "HR/Accounts can manage payment evidence"
  ON public.loan_payment_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'hr', 'accounts')
    )
  );

-- HR Executive/Admin can view and approve payment evidence
CREATE POLICY "HR Executive can approve payment evidence"
  ON public.loan_payment_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'hr')
    )
  );

-- Add table and column comments for documentation
COMMENT ON TABLE public.loan_payment_evidence IS 'Tracks payment evidence submissions and HR Executive approvals for loan repayment verification';
COMMENT ON COLUMN public.loan_payment_evidence.status IS 'Status flow: pending_approval → approved/rejected → completed';
COMMENT ON COLUMN public.loan_payment_evidence.payment_method IS 'Payment method: bank_transfer, cheque, cash, mobile_money, other';
