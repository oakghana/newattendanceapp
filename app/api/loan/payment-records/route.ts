import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const {
      loanRequestId,
      paymentDate,
      amountPaid,
      paymentMethod,
      referenceNumber,
      description,
      evidenceFilePath,
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

    // Validate loan belongs to this user
    const { data: loanReq, error: loanError } = await admin
      .from("loan_requests")
      .select("id, staff_id, fixed_amount")
      .eq("id", loanRequestId)
      .single();

    if (loanError || !loanReq || loanReq.staff_id !== user.id) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    // Insert payment record
    const { data: paymentRecord, error: insertError } = await admin
      .from("loan_payment_records")
      .insert({
        loan_request_id: loanRequestId,
        payment_date: paymentDate,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        description,
        evidence_file_path: evidenceFilePath,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
        hr_approval_status: "pending",
        accounts_approval_status: "pending",
        overall_status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[API] Payment record insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save payment record" },
        { status: 500 }
      );
    }

    // Get HR and Accounts executives to notify them
    const { data: executives } = await admin
      .from("user_profiles")
      .select("id, email, first_name, last_name")
      .in("role", ["hr_executive", "accounts_executive"]);

    // TODO: Send notifications to executives about pending approval

    return NextResponse.json(
      {
        success: true,
        paymentRecord,
        message: "Payment submitted for approval by HR and Accounts Executive",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Payment record error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Fetch payment records for a loan
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

    const loanRequestId = req.nextUrl.searchParams.get("loanId");
    if (!loanRequestId) {
      return NextResponse.json(
        { error: "loanId parameter required" },
        { status: 400 }
      );
    }

    // Verify access to this loan
    const { data: loanReq } = await admin
      .from("loan_requests")
      .select("id, staff_id")
      .eq("id", loanRequestId)
      .single();

    if (!loanReq || loanReq.staff_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data: payments, error } = await admin
      .from("loan_payment_records")
      .select(
        `
        id,
        payment_date,
        amount_paid,
        payment_method,
        reference_number,
        submitted_at,
        hr_approval_status,
        accounts_approval_status,
        overall_status,
        description,
        hr_executive_id,
        accounts_executive_id
      `
      )
      .eq("loan_request_id", loanRequestId)
      .order("payment_date", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments }, { status: 200 });
  } catch (error) {
    console.error("[API] Fetch payments error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
