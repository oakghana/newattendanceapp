-- ============================================================================
-- Migration: Add FD Calculation Fields
-- Purpose: Add automatic calculation fields for FD management system
-- ============================================================================

-- Add calculation fields to loan_fd_review table
ALTER TABLE loan_fd_review
ADD COLUMN IF NOT EXISTS loan_amount_ghc DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS recovery_period_months INTEGER,
ADD COLUMN IF NOT EXISTS annual_salary_ghc DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS monthly_repayment_amount DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_recovery_value DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS affordability_status VARCHAR(50) DEFAULT 'pending', -- pending, affordable, at_risk, unaffordable
ADD COLUMN IF NOT EXISTS affordability_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS fd_calculation_memo TEXT;

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_loan_fd_review_affordability ON loan_fd_review(affordability_status);
CREATE INDEX IF NOT EXISTS idx_loan_fd_review_calculated ON loan_fd_review(monthly_repayment_amount, total_recovery_value);

-- Create audit table entries for calculation changes if not exists
ALTER TABLE loan_fd_review_audit
ADD COLUMN IF NOT EXISTS calculation_details JSONB;

-- Add trigger function to update calculations
CREATE OR REPLACE FUNCTION update_fd_calculations()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate monthly repayment if loan_amount_ghc and recovery_period_months are set
  IF NEW.loan_amount_ghc IS NOT NULL AND NEW.recovery_period_months IS NOT NULL AND NEW.recovery_period_months > 0 THEN
    NEW.monthly_repayment_amount := NEW.loan_amount_ghc / NEW.recovery_period_months;
    
    -- Calculate total recovery value (simple calculation without interest for now)
    NEW.total_recovery_value := NEW.loan_amount_ghc;
    
    -- Calculate affordability if annual salary is provided
    IF NEW.annual_salary_ghc IS NOT NULL AND NEW.annual_salary_ghc > 0 THEN
      NEW.affordability_percentage := (NEW.monthly_repayment_amount / (NEW.annual_salary_ghc / 12)) * 100;
      
      -- Set affordability status based on percentage
      IF NEW.affordability_percentage <= 30 THEN
        NEW.affordability_status := 'affordable';
      ELSIF NEW.affordability_percentage <= 50 THEN
        NEW.affordability_status := 'at_risk';
      ELSE
        NEW.affordability_status := 'unaffordable';
      END IF;
      
      -- Generate calculation memo
      NEW.fd_calculation_memo := concat(
        'Loan Amount: GHc ', ROUND(NEW.loan_amount_ghc, 2), E'\n',
        'Recovery Period: ', NEW.recovery_period_months, ' months', E'\n',
        'Monthly Repayment: GHc ', ROUND(NEW.monthly_repayment_amount, 2), E'\n',
        'Total Recovery Value: GHc ', ROUND(NEW.total_recovery_value, 2), E'\n',
        'Annual Salary: GHc ', ROUND(NEW.annual_salary_ghc, 2), E'\n',
        'Monthly Salary: GHc ', ROUND(NEW.annual_salary_ghc / 12, 2), E'\n',
        'Affordability: ', ROUND(NEW.affordability_percentage, 2), '% of monthly salary', E'\n',
        'Status: ', NEW.affordability_status
      );
    END IF;
    
    NEW.updated_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace trigger for FD calculations
DROP TRIGGER IF EXISTS trigger_update_fd_calculations ON loan_fd_review;
CREATE TRIGGER trigger_update_fd_calculations
BEFORE INSERT OR UPDATE ON loan_fd_review
FOR EACH ROW
EXECUTE FUNCTION update_fd_calculations();

-- ============================================================================
-- View for FD calculation summary
-- ============================================================================
CREATE OR REPLACE VIEW fd_calculation_summary AS
SELECT
  id,
  loan_request_id,
  staff_user_id,
  loan_amount_ghc,
  recovery_period_months,
  annual_salary_ghc,
  monthly_repayment_amount,
  total_recovery_value,
  affordability_percentage,
  affordability_status,
  review_status,
  submission_date,
  updated_at
FROM loan_fd_review
ORDER BY updated_at DESC;
