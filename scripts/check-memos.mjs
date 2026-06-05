import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  try {
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select("id, staff_name, status, assigned_signers, memo_body")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    console.log("[v0] Latest memos:");
    for (const memo of memos) {
      const body = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body;
      console.log(`\nMemo: ${memo.id}`);
      console.log(`  Staff: ${memo.staff_name}`);
      console.log(`  Status: ${memo.status}`);
      console.log(`  assigned_signers: ${JSON.stringify(memo.assigned_signers)}`);
      console.log(`  signer in body: ${body?.selectedSigner?.id || "NOT FOUND"}`);
    }
  } catch (err) {
    console.error("[v0] Error:", err.message);
  }
}

check();
