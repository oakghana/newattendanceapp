-- Create device radius settings table for system-wide device-specific proximity rules
CREATE TABLE IF NOT EXISTS device_radius_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_type TEXT NOT NULL UNIQUE, -- 'mobile', 'tablet', 'laptop', 'desktop'
  check_in_radius_meters INTEGER NOT NULL DEFAULT 400,
  check_out_radius_meters INTEGER NOT NULL DEFAULT 400,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_in_radius_valid CHECK (check_in_radius_meters >= 50 AND check_in_radius_meters <= 5000),
  CONSTRAINT check_out_radius_valid CHECK (check_out_radius_meters >= 50 AND check_out_radius_meters <= 5000)
);

-- Insert default device radius settings
INSERT INTO device_radius_settings (device_type, check_in_radius_meters, check_out_radius_meters, description, is_active) VALUES
  ('mobile', 100, 100, 'Mobile phones and smartphones', true),
  ('tablet', 150, 150, 'Tablets and iPads', true),
  ('laptop', 200, 200, 'Laptop computers (Windows and Mac)', true),
  ('desktop', 2000, 1500, 'Desktop computers and workstations', true)
ON CONFLICT (device_type) DO NOTHING;

-- Enable RLS
ALTER TABLE device_radius_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read device radius settings (needed for validation)
CREATE POLICY "Anyone can view device radius settings"
  ON device_radius_settings
  FOR SELECT
  USING (true);

-- Policy: Only admins can update device radius settings
CREATE POLICY "Only admins can update device radius settings"
  ON device_radius_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Note: radius_meters column remains in geofence_locations for backward compatibility
-- but will be ignored in favor of device_radius_settings
-- TODO: Remove radius_meters column after updating all dependent views/functions

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_device_radius_settings_device_type ON device_radius_settings(device_type);
CREATE INDEX IF NOT EXISTS idx_device_radius_settings_active ON device_radius_settings(is_active);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_device_radius_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_radius_settings_updated_at
  BEFORE UPDATE ON device_radius_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_device_radius_settings_updated_at();
