import { NextResponse } from "next/server"
import * as XLSX from "xlsx"

export async function GET() {
  const workbook = XLSX.utils.book_new()

  const headers = [
    "employee_id",
    "email",
    "loan_type_key",
    "requested_amount",
    "reason",
    "recovery_months",
    "recovery_start_date",
    "disbursement_date",
    "md_approved_at",
    "fd_score",
    "fd_good",
    "fd_note",
    "fd_document_url",
    "fd_checked_at",
    "status",
    "repayment_status",
  ]

  const rows = [
    headers,
    [
      "EMP00123",
      "staff@example.com",
      "salary_advance",
      2500,
      "Imported historical loan from previous month",
      3,
      "2026-08-01",
      "2026-08-05",
      "2026-08-05",
      45,
      "Yes",
      "FD value imported from historical loan register",
      "",
      "2026-08-06",
      "partially_recovered",
      "active",
    ],
  ]

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Loan Import Template")
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Use this sheet to import historical, already approved and disbursed loan records."],
      ["Leave email blank if employee_id is enough to identify the staff member."],
      ["Use status = partially_recovered for active repayment loans, or payment_completed for cleared loans."],
      ["disbursement_date is required and recovery_start_date should be ISO dates in YYYY-MM-DD format."],
      ["fd_score is the FD value/score from the historical register (0 to 100)."],
      ["fd_good accepts Yes/No, True/False, or 1/0. It is calculated from fd_score when left blank (39 or higher = Yes)."],
      ["fd_note, fd_document_url, and fd_checked_at are optional FD audit details; fd_checked_at must be YYYY-MM-DD."],
    ]),
    "Instructions",
  )

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="loan-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  })
}