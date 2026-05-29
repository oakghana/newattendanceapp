-- Add signature fields to user_profiles table for permanent signature storage
-- This ensures signatures persist across sessions without relying on session state

-- Add signature fields (these will store the Blob URLs after upload)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

-- Optional: Add timestamp to track when signature was last saved
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Optional: Add column to store signature mode (draw or upload)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

-- Create index for faster signature lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_signature_data_url ON user_profiles(id) WHERE signature_data_url IS NOT NULL;

-- Add comment to document the columns
COMMENT ON COLUMN user_profiles.signature_data_url IS 'Permanent storage of user''s digital signature image URL from Vercel Blob storage or data URL';
COMMENT ON COLUMN user_profiles.signature_updated_at IS 'Timestamp of when the signature was last saved or updated';
COMMENT ON COLUMN user_profiles.signature_mode IS 'Mode used to create signature: "draw" or "upload"';
