import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET: Fetch outstanding balance and schedule for a loan
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
      .select("id, staff_id, fixed_amount, repayment_duration_months")
      .eq("id", loanRequestId)
      .single();

    if (!loanReq || loanReq.staff_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch outstanding balance from view
    const { data: balanceData } = await admin
      .from("loan_outstanding_balance")
      .select("*")
      .eq("loan_request_id", loanRequestId)
      .single();

    // Fetch repayment schedule
    const { data: schedule, error: scheduleError } = await admin
      .from("loan_repayment_schedule")
      .select("*")
      .eq("loan_request_id", loanRequestId)
      .order("installment_number", { ascending: true });

    if (scheduleError) {
      console.error("[API] Schedule fetch error:", scheduleError);
      return NextResponse.json(
        { error: "Failed to fetch repayment schedule" },
        { status: 500 }
      );
    }

    // Fetch payment history
    const { data: payments } = await admin
      .from("loan_payment_records")
      .select("*")
      .eq("loan_request_id", loanRequestId)
      .eq("overall_status", "approved")
      .order("payment_date", { ascending: false });

    return NextResponse.json(
      {
        balance: balanceData,
        schedule,
        payments,
        loanAmount: loanReq.fixed_amount,
        repaymentDuration: loanReq.repayment_duration_months,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API] Get repayment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Generate repayment schedule for a newly approved loan
export async function POST(req: NextRequest) {
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

    // Only HR and admin can generate schedules
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["hr_executive", "admin", "super_admin"].includes(profile?.role || "")) {
      return NextResponse.json(
        { error: "Only HR admin can generate schedules" },
        { status: 403 }
      );
    }

    const {
      loanRequestId,
      startDate = new Date().toISOString().split("T")[0],
      durationMonths = 12,
    } = await req.json();

    if (!loanRequestId) {
      return NextResponse.json(
        { error: "loanRequestId required" },
        { status: 400 }
      );
    }

    // Call the PL/pgSQL function to generate schedule
    const { data: schedule, error: rpcError } = await admin.rpc(
      "generate_repayment_schedule",
      {
        p_loan_request_id: loanRequestId,
        p_start_date: startDate,
        p_duration_months: durationMonths,
      }
    );

    if (rpcError) {
      console.error("[API] Schedule generation error:", rpcError);
      return NextResponse.json(
        { error: "Failed to generate repayment schedule" },
        { status: 500 }
      );
    }

    // Update loan_requests with repayment plan metadata
    await admin
      .from("loan_requests")
      .update({
        repayment_plan_generated_at: new Date().toISOString(),
        repayment_duration_months: durationMonths,
        repayment_status: "active",
      })
      .eq("id", loanRequestId);

    return NextResponse.json(
      {
        success: true,
        schedule,
        message: `Repayment schedule generated for ${durationMonths} months`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Generate schedule error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
