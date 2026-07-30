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

    // Validate input
    if (!loanRequestId || !paymentDate || amountPaid === undefined) {
      return NextResponse.json({
        error: "Missing required fields: loanRequestId, paymentDate, amountPaid",
      }, { status: 400 });
    }

    if (typeof amountPaid !== "number" || amountPaid <= 0) {
      return NextResponse.json({
        error: "Payment amount must be a positive number",
      }, { status: 400 });
    }

    // Validate loan belongs to this user and get loan details
    const { data: loanReq, error: loanError } = await admin
      .from("loan_requests")
      .select("id, staff_id, fixed_amount, status")
      .eq("id", loanRequestId)
      .single();

    if (loanError || !loanReq || loanReq.staff_id !== user.id) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }

    // Validate loan is approved and ready for payment
    if (loanReq.status !== "md_final_approved") {
      return NextResponse.json({
        error: "Loan must be approved by Managing Director before payment can be recorded",
        currentStatus: loanReq.status,
      }, { status: 400 });
    }

    // Check for recent duplicate submissions (within 5 minutes)
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: recentPayments, error: duplicateCheckError } = await admin
      .from("loan_payment_records")
      .select("id, submitted_at")
      .eq("loan_request_id", loanRequestId)
      .eq("amount_paid", amountPaid)
      .eq("overall_status", "pending")
      .gte("submitted_at", recentTime)
      .limit(1);

    if (!duplicateCheckError && recentPayments && recentPayments.length > 0) {
      return NextResponse.json({
        error: "Duplicate payment detected. A similar payment was recently submitted.",
        existingRecordId: recentPayments[0].id,
        message: "If you believe this is a different payment, please wait a few moments and try again.",
      }, { status: 409 });
    }

    // Get total already paid for this loan (completed payments only)
    const { data: completedPayments, error: paymentSumError } = await admin
      .from("loan_payment_records")
      .select("amount_paid")
      .eq("loan_request_id", loanRequestId)
      .eq("overall_status", "completed");

    if (paymentSumError) {
      console.error("[API] Error checking payment history:", paymentSumError);
      return NextResponse.json(
        { error: "Failed to verify payment history" },
        { status: 500 }
      );
    }

    const totalAlreadyPaid = (completedPayments || []).reduce((sum, p) => sum + (p.amount_paid || 0), 0);
    const totalWithNewPayment = totalAlreadyPaid + amountPaid;

    // Validate payment doesn't exceed loan amount
    if (totalWithNewPayment > loanReq.fixed_amount) {
      const remaining = Math.max(0, loanReq.fixed_amount - totalAlreadyPaid);
      return NextResponse.json({
        error: "Payment amount exceeds remaining loan balance",
        loanAmount: loanReq.fixed_amount,
        alreadyPaid: totalAlreadyPaid,
        remaining,
        attemptedPayment: amountPaid,
      }, { status: 400 });
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
    // Include both UI role ("accounts_executive") and database role ("accounts")
    const { data: executives } = await admin
      .from("user_profiles")
      .select("id, email, first_name, last_name")
      .in("role", ["hr_executive", "accounts_executive", "accounts"])

    // Send notifications to executives about pending approval
    if (executives && executives.length > 0) {
      try {
        const notificationPromises = executives.map(exec => {
          return admin
            .from("staff_notifications")
            .insert({
              recipient_id: exec.id,
              type: "payment_approval_pending",
              title: "New Payment Approval Required",
              message: `Payment record submitted for approval (Amount: ${amountPaid}, Reference: ${referenceNumber})`,
              data: {
                payment_record_id: paymentRecord.id,
                loan_request_id: loanRequestId,
              },
              is_read: false,
            })
        })
        
        await Promise.all(notificationPromises)
        console.log(`[API] Notified ${executives.length} executives about payment approval`)
      } catch (notifyError) {
        console.warn("[API] Notification send failed:", notifyError)
        // Don't fail the request if notification fails
      }
    }

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
