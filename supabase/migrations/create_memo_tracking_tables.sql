-- Create deferment_memos table to track auto-generated memos
CREATE TABLE deferment_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deferment_request_id uuid NOT NULL REFERENCES leave_deferment_requests(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES user_profiles(id),
  hod_id uuid REFERENCES user_profiles(id),
  hr_signer_id uuid NOT NULL REFERENCES user_profiles(id),
  memo_body jsonb NOT NULL,
  signer_name text NOT NULL,
  signer_position text NOT NULL,
  signature_image_url text,
  status character varying NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged')),
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_to_staff_at timestamp with time zone,
  sent_to_hod_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create recall_memos table to track auto-generated memos
CREATE TABLE recall_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_request_id uuid NOT NULL REFERENCES leave_recall_requests(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES user_profiles(id),
  hr_signer_id uuid NOT NULL REFERENCES user_profiles(id),
  memo_body jsonb NOT NULL,
  signer_name text NOT NULL,
  signer_position text NOT NULL,
  signature_image_url text,
  status character varying NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acknowledged')),
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_to_staff_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create deferment_memo_distributions table to track who received copies
CREATE TABLE deferment_memo_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deferment_memo_id uuid NOT NULL REFERENCES deferment_memos(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES user_profiles(id),
  recipient_role character varying NOT NULL CHECK (recipient_role IN ('staff', 'hod', 'hr')),
  received_at timestamp with time zone,
  acknowledged_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create recall_memo_distributions table
CREATE TABLE recall_memo_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_memo_id uuid NOT NULL REFERENCES recall_memos(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES user_profiles(id),
  recipient_role character varying NOT NULL CHECK (recipient_role IN ('staff', 'hr')),
  received_at timestamp with time zone,
  acknowledged_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE deferment_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deferment_memo_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_memo_distributions ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_deferment_memos_deferment_request ON deferment_memos(deferment_request_id);
CREATE INDEX idx_deferment_memos_staff ON deferment_memos(staff_id);
CREATE INDEX idx_deferment_memos_status ON deferment_memos(status);
CREATE INDEX idx_recall_memos_recall_request ON recall_memos(recall_request_id);
CREATE INDEX idx_recall_memos_staff ON recall_memos(staff_id);
CREATE INDEX idx_recall_memos_status ON recall_memos(status);
CREATE INDEX idx_deferment_distributions_recipient ON deferment_memo_distributions(recipient_id);
CREATE INDEX idx_recall_distributions_recipient ON recall_memo_distributions(recipient_id);

-- RLS Policies for deferment_memos
CREATE POLICY "Staff can view their own deferment memos" ON deferment_memos
  FOR SELECT USING (auth.uid() = staff_id);

CREATE POLICY "HOD can view deferment memos for their staff" ON deferment_memos
  FOR SELECT USING (
    auth.uid() = hod_id OR
    auth.uid() IN (
      SELECT hod_user_id FROM loan_hod_linkages WHERE staff_user_id = deferment_memos.staff_id
    )
  );

CREATE POLICY "HR can view all deferment memos" ON deferment_memos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'HR_EXECUTIVE'
    )
  );

-- RLS Policies for recall_memos
CREATE POLICY "Staff can view their own recall memos" ON recall_memos
  FOR SELECT USING (auth.uid() = staff_id);

CREATE POLICY "HR can view all recall memos" ON recall_memos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'HR_EXECUTIVE'
    )
  );

-- RLS Policies for deferment_memo_distributions
CREATE POLICY "Users can view memo distributions for themselves" ON deferment_memo_distributions
  FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "HR can manage deferment memo distributions" ON deferment_memo_distributions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'HR_EXECUTIVE'
    )
  );

-- RLS Policies for recall_memo_distributions
CREATE POLICY "Users can view memo distributions for themselves" ON recall_memo_distributions
  FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "HR can manage recall memo distributions" ON recall_memo_distributions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'HR_EXECUTIVE'
    )
  );
