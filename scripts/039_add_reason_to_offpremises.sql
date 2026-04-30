-- Add reason column to pending_offpremises_checkins table
ALTER TABLE public.pending_offpremises_checkins
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS google_maps_name TEXT;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_pending_offpremises_reason
  ON public.pending_offpremises_checkins(reason);
