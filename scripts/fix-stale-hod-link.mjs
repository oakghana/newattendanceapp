import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const oldId = "bb790de0-ce90-4ec9-ac8e-f10d3b1d5427" // stale duplicate (mary.allotey@qccgh.com, last login Jul 14)
const newId = "98c497b3-5616-44c3-a915-7135badde2e3" // active account (hrm@gmail.com, currently logged in)

const { data: linkUpd, error: linkErr } = await supabase
  .from("loan_hod_linkages")
  .update({ hod_user_id: newId, updated_at: new Date().toISOString() })
  .eq("hod_user_id", oldId)
  .select("*")
console.log("Updated linkages:", JSON.stringify(linkUpd, null, 2), linkErr)

const { data: reqUpd, error: reqErr } = await supabase
  .from("loan_requests")
  .update({ hod_reviewer_id: newId, updated_at: new Date().toISOString() })
  .eq("hod_reviewer_id", oldId)
  .eq("status", "pending_hod")
  .select("id, request_number, hod_reviewer_id")
console.log("Updated pending requests:", JSON.stringify(reqUpd, null, 2), reqErr)
