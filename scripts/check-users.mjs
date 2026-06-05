import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  try {
    const { data: users, error } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, email, role")
      .in("first_name", ["OHENEBA", "FREDUA", "Mary", "Oheneba", "Fredua"]);

    if (error) throw error;

    console.log("[v0] User IDs for approvers:");
    for (const user of users) {
      console.log(`${user.first_name} ${user.last_name} (${user.role}): ${user.id}`);
    }
    
    console.log("\n[v0] The assigned signer ID in memos: 8e4f964b-97c2-42fb-8ddf-8c3f4500940e");
  } catch (err) {
    console.error("[v0] Error:", err.message);
  }
}

check();
