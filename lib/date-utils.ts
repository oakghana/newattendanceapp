// Date formatting utilities following DD/MM/YYYY format as per system requirements

export function formatDateDDMMYYYY(dateInput: string | Date): string {
  try {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput
    if (isNaN(date.getTime())) return "Invalid Date"
    
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = date.getFullYear()
    
    return `${day}/${month}/${year}`
  } catch (e) {
    console.log("[v0] Date format error:", e)
    return "Invalid Date"
  }
}

export function parseDDMMYYYY(dateStr: string): Date | null {
  try {
    const [day, month, year] = dateStr.split("/").map(Number)
    if (!day || !month || !year) return null
    
    const date = new Date(year, month - 1, day)
    if (isNaN(date.getTime())) return null
    
    return date
  } catch (e) {
    console.log("[v0] Date parse error:", e)
    return null
  }
}

export function formatDateInput(date: string | Date): string {
  // Returns YYYY-MM-DD format for HTML input[type="date"]
  try {
    const d = typeof date === "string" ? new Date(date) : date
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  } catch {
    return ""
  }
}

export function getReturnToWorkDate(endDate: string | Date): string {
  try {
    const date = typeof endDate === "string" ? new Date(endDate) : endDate
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    return formatDateDDMMYYYY(nextDay)
  } catch {
    return "Invalid Date"
  }
}
