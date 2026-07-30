import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function PUT(req: NextRequest) {
  try {
    const {
      paymentRecordId,
      approvalStatus,
      notes,
    } = await req.json();

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const { data: user } = await admin.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Check user role
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isHRExecutive = profile?.role === "hr_executive";
    const isAccountsExecutive = profile?.role === "accounts_executive";

    if (!isHRExecutive && !isAccountsExecutive) {
      return NextResponse.json(
        { error: "Only HR and Accounts executives can approve payments" },
        { status: 403 }
      );
    }

    // Get current payment record
    const { data: paymentRecord, error: fetchError } = await admin
      .from("loan_payment_records")
      .select("*")
      .eq("id", paymentRecordId)
      .single();

    if (fetchError || !paymentRecord) {
      return NextResponse.json(
        { error: "Payment record not found" },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (isHRExecutive) {
      updateData.hr_approval_status = approvalStatus;
      updateData.hr_approval_at = new Date().toISOString();
      updateData.hr_executive_id = user.id;
      updateData.hr_approval_notes = notes;
    } else if (isAccountsExecutive) {
      updateData.accounts_approval_status = approvalStatus;
      updateData.accounts_approval_at = new Date().toISOString();
      updateData.accounts_executive_id = user.id;
      updateData.accounts_approval_notes = notes;
    }

    // Calculate new overall_status based on both HR and Accounts approval statuses
    let newOverallStatus = "pending"

    // Determine overall status based on both approvals
    const hrStatus = isHRExecutive ? approvalStatus : paymentRecord.hr_approval_status
    const acctStatus = isAccountsExecutive ? approvalStatus : paymentRecord.accounts_approval_status

    if (hrStatus === "rejected" || acctStatus === "rejected") {
      newOverallStatus = "rejected"
    } else if (hrStatus === "approved" && acctStatus === "approved") {
      newOverallStatus = "completed"
    } else if (
      (hrStatus === "approved" || acctStatus === "approved") &&
      (hrStatus === "pending" || acctStatus === "pending")
    ) {
      newOverallStatus = "pending"
    }

    updateData.overall_status = newOverallStatus

    // Update payment record
    const { data: updatedRecord, error: updateError } = await admin
      .from("loan_payment_records")
      .update(updateData)
      .eq("id", paymentRecordId)
      .select()
      .single()

    if (updateError) {
      console.error("[API] Payment approval error:", updateError)
      return NextResponse.json(
        { error: "Failed to update payment approval" },
        { status: 500 }
      )
    }

    // Log the state change for audit
    console.log("[API] Payment approval updated:", {
      paymentRecordId,
      approver: isHRExecutive ? "HR_EXECUTIVE" : "ACCOUNTS_EXECUTIVE",
      approvalStatus,
      newOverallStatus,
      hrStatus,
      acctStatus,
    })

    // If both approved, trigger repayment schedule update
    if (newOverallStatus === "completed") {
      console.log("[API] Both executives approved payment:", paymentRecordId)
    }

    // If both approved, trigger repayment schedule update
    if (
      updatedRecord.hr_approval_status === "approved" &&
      updatedRecord.accounts_approval_status === "approved"
    ) {
      // The trigger will handle updating the repayment schedule
      console.log("[API] Both executives approved payment:", paymentRecordId);
    }

    return NextResponse.json(
      {
        success: true,
        record: updatedRecord,
        message: `Payment ${approvalStatus} by ${isHRExecutive ? "HR Executive" : "Accounts Executive"}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API] Approval error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Fetch pending payment records for approval
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const { data: user } = await admin.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Check user role
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isHRExecutive = profile?.role === "hr_executive";
    const isAccountsExecutive = profile?.role === "accounts_executive";

    if (!isHRExecutive && !isAccountsExecutive) {
      return NextResponse.json(
        { error: "Only HR and Accounts executives can view pending approvals" },
        { status: 403 }
      );
    }

    // Fetch pending payment records
    let query = admin
      .from("loan_payment_records")
      .select(
        `
        id,
        loan_request_id,
        payment_date,
        amount_paid,
        payment_method,
        reference_number,
        description,
        submitted_at,
        submitted_by,
        hr_approval_status,
        accounts_approval_status,
        overall_status,
        evidence_file_path,
        loan_requests:loan_request_id(
          id,
          request_number,
          staff_id,
          fixed_amount,
          loan_type_label,
          user_profiles:staff_id(first_name, last_name, staff_number)
        ),
        submitter:submitted_by(first_name, last_name, email)
      `
      );

    // Filter based on role and approval status
    if (isHRExecutive) {
      query = query.eq("hr_approval_status", "pending");
    } else if (isAccountsExecutive) {
      query = query.eq("accounts_approval_status", "pending");
    }

    const { data: payments, error } = await query.order("submitted_at", {
      ascending: false,
    });

    if (error) {
      console.error("[API] Fetch pending payments error:", error);
      return NextResponse.json(
        { error: "Failed to fetch payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments }, { status: 200 });
  } catch (error) {
    console.error("[API] GET approval error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
