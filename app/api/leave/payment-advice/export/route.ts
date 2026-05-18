import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const { month, staffList, format } = await request.json()

    if (!month || !staffList || !format) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    if (format === "excel") {
      return exportToExcel(month, staffList)
    } else if (format === "pdf") {
      return exportToPdf(month, staffList)
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 })
  } catch (err) {
    console.error("[v0] Error exporting:", err)
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    )
  }
}

function exportToExcel(month: string, staffList: any[]) {
  // Create CSV format (Excel compatible)
  let csv = "Staff No.,Name,Employee ID,Department,Position,Category,Start Date,End Date\n"

  staffList.forEach((staff, idx) => {
    csv += `${idx + 1},"${staff.full_name}","${staff.employee_id}","${staff.department_name}","${staff.position}","${staff.staff_category}","${staff.start_date}","${staff.end_date}"\n`
  })

  const buffer = Buffer.from(csv, "utf-8")

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payment-advice-${month}.csv"`,
    },
  })
}

function exportToPdf(month: string, staffList: any[]) {
  // Create simple text-based "PDF" content (for demo - would need actual PDF library in production)
  let pdfContent = `PAYMENT ADVICE - STAFF LIST
Generated: ${new Date().toLocaleDateString()}
Month: ${month}

STAFF SUMMARY:
Total Staff: ${staffList.length}

DETAILED LIST:
---
`

  staffList.forEach((staff, idx) => {
    pdfContent += `${idx + 1}. ${staff.full_name} (${staff.employee_id})
   Department: ${staff.department_name}
   Position: ${staff.position}
   Category: ${staff.staff_category}
   Leave: ${staff.start_date} to ${staff.end_date}

`
  })

  const buffer = Buffer.from(pdfContent, "utf-8")

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="payment-advice-${month}.txt"`,
    },
  })
}
