# How to Run the Signature Migration

## Quick Start (Copy-Paste Ready)

### Step 1: Open Supabase Dashboard
Go to: https://app.supabase.com → Select your project

### Step 2: Click SQL Editor
In the left sidebar, click **SQL Editor** → Click **New Query**

### Step 3: Copy & Paste This SQL
```sql
-- Add signature fields to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_signature_data_url 
ON public.user_profiles(id) 
WHERE signature_data_url IS NOT NULL;

-- Add documentation
COMMENT ON COLUMN public.user_profiles.signature_data_url IS 'Permanent storage of digital signature (Vercel Blob URL or data URL)';
COMMENT ON COLUMN public.user_profiles.signature_updated_at IS 'Timestamp when signature was last saved or updated';
COMMENT ON COLUMN public.user_profiles.signature_mode IS 'How signature was created: "draw" (canvas) or "upload" (file upload)';
```

### Step 4: Click "Run"
- Press `Ctrl+Enter` (or `Cmd+Enter` on Mac)
- Or click the blue **Run** button in the top right

### Step 5: Verify Success
You should see: **"Query executed successfully"**

---

## Verification Query (Optional)

After running the migration, you can verify the columns were created:

```sql
-- Check if signature columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_profiles' AND column_name LIKE 'signature%'
ORDER BY ordinal_position;
```

**Expected result:**
```
column_name              | data_type
------------------------+---------------------------
signature_data_url       | text
signature_updated_at     | timestamp with time zone
signature_mode           | character varying
```

---

## Troubleshooting

### ✅ "Query executed successfully"
Perfect! Migration complete.

### ⚠️ "Column already exists"
This is FINE. The migration uses `IF NOT EXISTS` so it won't fail if the columns already exist.

### ❌ "Connection refused" or "Permission denied"
- Make sure you're logged into Supabase
- Ensure you have admin permissions on the project
- Try refreshing the page and try again

### ❌ "table user_profiles does not exist"
- Verify your project is selected correctly
- Check that user_profiles table exists in your database

---

## After Migration: What's Next?

1. **Restart the application** (or clear application cache)
2. **Test signature saving**: Go to Profile > Signature tab > Draw > Save Signature
3. **Refresh the page** - signature should still be visible
4. **Close browser** - when you reopen, signature should persist

---

## File Location

If you prefer to run the migration from a file:
- File: `/vercel/share/v0-project/migrations/00_add_signature_fields.sql`
- Copy the entire content and paste it in Supabase SQL Editor

---

## Need Help?

If the migration fails:
1. Check the error message above
2. Verify the SQL syntax is correct
3. Ensure you're connected to the right Supabase project
4. Try copying just one ALTER statement at a time to isolate the issue
