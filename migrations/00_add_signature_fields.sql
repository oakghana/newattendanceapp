-- ============================================================
-- SIGNATURE PERSISTENCE MIGRATION
-- Purpose: Add permanent signature storage to user_profiles
-- Run this in Supabase SQL Editor: https://app.supabase.com
-- ============================================================

-- Step 1: Add signature fields to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_signature_data_url 
ON public.user_profiles(id) 
WHERE signature_data_url IS NOT NULL;

-- Step 3: Add documentation comments
COMMENT ON COLUMN public.user_profiles.signature_data_url IS 'Permanent storage of digital signature (Vercel Blob URL or data URL)';
COMMENT ON COLUMN public.user_profiles.signature_updated_at IS 'Timestamp when signature was last saved or updated';
COMMENT ON COLUMN public.user_profiles.signature_mode IS 'How signature was created: "draw" (canvas) or "upload" (file upload)';

-- ============================================================
-- VERIFICATION QUERIES (run these to confirm the migration worked)
-- ============================================================

-- Query 1: Check if columns were created successfully
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'user_profiles' AND column_name LIKE 'signature%'
-- ORDER BY ordinal_position;

-- Query 2: Check if index was created
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'user_profiles' AND indexname LIKE '%signature%';

-- ============================================================
-- Expected Results After Running:
-- ============================================================
-- 1. Three new columns appear in user_profiles:
--    - signature_data_url (text)
--    - signature_updated_at (timestamp with time zone)
--    - signature_mode (character varying)
-- 2. Index idx_user_profiles_signature_data_url is created
-- 3. No errors should occur
-- ============================================================
