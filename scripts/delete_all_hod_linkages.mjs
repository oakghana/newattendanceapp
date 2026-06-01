#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

async function deleteAllHodLinkages() {
  try {
    console.log("🗑️  Deleting all hardcoded HOD linkages...");

    const { data, error: deleteError } = await admin
      .from("loan_hod_linkages")
      .delete()
      .neq("id", "");

    if (deleteError) {
      console.error("❌ Error deleting linkages:", deleteError.message);
      process.exit(1);
    }

    console.log("✅ Successfully deleted all HOD linkages from the database");
    console.log("   Staff must now set their real HOD linkages");
    process.exit(0);
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

deleteAllHodLinkages();
