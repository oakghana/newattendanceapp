import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

interface ResumptionMemoBody {
  staffUserId: string;
  leaveEndDate: string;
  leaveType: string;
  notifyRoles?: string[]; // HOD, HR_OFFICE, HR_EXECUTIVE, etc.
}

export async function POST(request: NextRequest) {
  try {
    const body: ResumptionMemoBody = await request.json();
    const { staffUserId, leaveEndDate, leaveType, notifyRoles = ["hod", "hr_office", "hr_executive"] } = body;

    if (!staffUserId || !leaveEndDate || !leaveType) {
      return NextResponse.json(
        { error: "Missing required fields: staffUserId, leaveEndDate, leaveType" },
        { status: 400 }
      );
    }

    // Fetch staff details
    const { data: staffData, error: staffError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, position, employee_id, department_id, departments(name, code)")
      .eq("id", staffUserId)
      .single();

    if (staffError || !staffData) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // Fetch HOD/Regional Manager info
    const { data: hodLinks } = await supabase
      .from("loan_hod_linkages")
      .select("hod_user_id, hod_user:user_profiles(first_name, last_name, position)")
      .eq("staff_user_id", staffUserId)
      .single();

    // Fetch most recent approved leave
    const { data: leaveRequest } = await supabase
      .from("leave_plan_requests")
      .select(
        "id, preferred_start_date, preferred_end_date, adjusted_start_date, adjusted_end_date, leave_type_key, reason"
      )
      .eq("user_id", staffUserId)
      .eq("status", "approved")
      .order("preferred_end_date", { ascending: false })
      .limit(1)
      .single();

    // Create resumption memo record
    const memoId = `RES-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const resumptionDate = new Date().toISOString().split("T")[0]; // Today's date

    const { data: memoData, error: memoError } = await supabase
      .from("leave_resumption_memos")
      .insert({
        id: memoId,
        staff_user_id: staffUserId,
        staff_name: `${staffData.first_name} ${staffData.last_name}`,
        staff_position: staffData.position,
        employee_id: staffData.employee_id,
        department_name: staffData.departments?.name || "",
        department_code: staffData.departments?.code || "",
        leave_end_date: leaveEndDate,
        leave_type: leaveType,
        resumption_date: resumptionDate,
        hod_name: hodLinks?.hod_user?.first_name ? `${hodLinks.hod_user.first_name} ${hodLinks.hod_user.last_name}` : "",
        hod_position: hodLinks?.hod_user?.position || "",
        company_name: "Quality Control Company Limited (COCOBOD)",
        is_downloaded: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (memoError) {
      console.error("[v0] Memo creation error:", memoError);
      return NextResponse.json({ error: "Failed to create memo", details: memoError.message }, { status: 500 });
    }

    // Create notifications for relevant roles
    const notificationPromises = notifyRoles.map(async (role) => {
      let roleTitle = "";
      let recipientNote = "";
      let emoji = "";

      switch (role.toLowerCase()) {
        case "hod":
          roleTitle = "Head of Department";
          emoji = "👥";
          recipientNote = `👋 ${staffData.first_name} ${staffData.last_name} has returned from ${leaveType} leave 🎉`;
          break;
        case "hr_office":
          roleTitle = "HR Leave Office";
          emoji = "📋";
          recipientNote = `📍 Staff resumption notification for ${staffData.first_name} ${staffData.last_name} ✅`;
          break;
        case "hr_executive":
          roleTitle = "HR Executive";
          emoji = "📝";
          recipientNote = `📋 Resumption memo available for signing: ${staffData.first_name} ${staffData.last_name} 🖊️`;
          break;
      }

      return supabase.from("notifications").insert({
        type: "leave_resumption",
        title: `${emoji} ${staffData.first_name} ${staffData.last_name} - Return to Work Notification`,
        body: recipientNote,
        recipient_role: role,
        related_data: { memo_id: memoId, staff_user_id: staffUserId },
        is_read: false,
        created_at: new Date().toISOString(),
      });
    });

    await Promise.all(notificationPromises);

    return NextResponse.json(
      { success: true, memo_id: memoId, memo_data: memoData, message: "Resumption memo created and notifications sent" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[v0] Resumption memo error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET endpoint to fetch memo for printing/viewing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memoId = searchParams.get("id");

    if (!memoId) {
      return NextResponse.json({ error: "Memo ID required" }, { status: 400 });
    }

    const { data: memoData, error } = await supabase
      .from("leave_resumption_memos")
      .select("*")
      .eq("id", memoId)
      .single();

    if (error || !memoData) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 });
    }

    // Mark as downloaded
    await supabase
      .from("leave_resumption_memos")
      .update({ is_downloaded: true, last_downloaded_at: new Date().toISOString() })
      .eq("id", memoId);

    return NextResponse.json(memoData, { status: 200 });
  } catch (error) {
    console.error("[v0] Get memo error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
