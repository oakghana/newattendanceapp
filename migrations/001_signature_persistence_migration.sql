-- ============================================================
-- SIGNATURE PERSISTENCE MIGRATION SCRIPT
-- ============================================================
-- This migration adds permanent signature storage to the database
-- Two options provided below - choose based on your needs
-- ============================================================

-- ============================================================
-- OPTION 1: Add signature fields to user_profiles (RECOMMENDED)
-- ============================================================
-- This is the PRIMARY storage location for user signatures
-- Ensures permanent storage across all sessions and devices

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_signature_data_url 
ON user_profiles(id) 
WHERE signature_data_url IS NOT NULL;

-- Documentation
COMMENT ON COLUMN user_profiles.signature_data_url IS 'Permanent storage of user''s digital signature image URL (Vercel Blob or data URL)';
COMMENT ON COLUMN user_profiles.signature_updated_at IS 'Timestamp of when signature was last saved or updated';
COMMENT ON COLUMN user_profiles.signature_mode IS 'Signature creation mode: "draw" (canvas) or "upload" (file)';


-- ============================================================
-- OPTION 2: Ensure approval_signature_registry has required fields
-- ============================================================
-- This is the BACKUP/WORKFLOW storage for signature approvals
-- Used when signatures are specifically for loan/leave approvals

-- Add columns if they don't exist
ALTER TABLE approval_signature_registry
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_approval_signature_registry_user_active 
ON approval_signature_registry(user_id, is_active);

-- Documentation
COMMENT ON COLUMN approval_signature_registry.signature_mode IS 'Signature creation method: "draw" or "upload"';


-- ============================================================
-- VERIFY THE CHANGES
-- ============================================================
-- Run these queries to verify the migration was successful

-- Check user_profiles columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'user_profiles' AND column_name LIKE 'signature%';

-- Check approval_signature_registry columns
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'approval_signature_registry' AND column_name LIKE 'signature%';

-- Check indexes were created
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename IN ('user_profiles', 'approval_signature_registry') 
-- AND indexname LIKE '%signature%';
