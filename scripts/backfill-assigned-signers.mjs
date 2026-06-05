import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[v0] Missing SUPABASE env vars");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

async function backfill() {
  try {
    console.log("[v0] Fetching memos without assigned_signers...");

    // Get all memos with NULL or empty assigned_signers
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select("id, memo_body, assigned_signers, status")
      .eq("status", "ready_for_review");

    if (error) throw error;

    const memosNeedingUpdate = memos.filter((m) => !m.assigned_signers || m.assigned_signers.length === 0);
    console.log(`[v0] Found ${memosNeedingUpdate.length} memos to update`);

    for (const memo of memosNeedingUpdate) {
      const body = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body;
      const signerId = body?.selectedSigner?.id;

      if (signerId) {
        console.log(`[v0] Updating memo ${memo.id} with signer ${signerId}`);
        await admin
          .from("leave_payment_memos")
          .update({ assigned_signers: [signerId] })
          .eq("id", memo.id);
      } else {
        console.warn(`[v0] No signer found in memo ${memo.id}`);
      }
    }

    console.log("[v0] Backfill complete!");
  } catch (err) {
    console.error("[v0] Error:", err.message);
    process.exit(1);
  }
}

backfill();
