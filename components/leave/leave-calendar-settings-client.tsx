"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react"

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

interface CalendarConfig {
  leave_year_start_month: number
  leave_year_end_month: number
  include_weekends_in_calculation: boolean
  exclude_holidays_in_calculation: boolean
}

interface Holiday {
  id?: string
  holiday_date: string
  holiday_name: string
  is_custom: boolean
}

export function LeaveCalendarSettingsClient() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingHoliday, setIsAddingHoliday] = useState(false)
  const [isDeletingHoliday, setIsDeletingHoliday] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const [config, setConfig] = useState<CalendarConfig>({
    leave_year_start_month: 1,
    leave_year_end_month: 12,
    include_weekends_in_calculation: false,
    exclude_holidays_in_calculation: true,
  })

  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [newHolidayDate, setNewHolidayDate] = useState("")
  const [newHolidayName, setNewHolidayName] = useState("")

  // Load configuration and holidays
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        const [configRes, holidaysRes] = await Promise.all([
          fetch("/api/admin/leave-calendar-config"),
          fetch("/api/admin/holidays"),
        ])

        if (configRes.ok) {
          const data = await configRes.json()
          setConfig(data.config)
        }

        if (holidaysRes.ok) {
          const data = await holidaysRes.json()
          setHolidays(data.holidays || [])
        }
      } catch (err) {
        console.error("[v0] Error loading data:", err)
        setMessage({ type: "error", text: "Failed to load configuration" })
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true)
      setMessage(null)
      const response = await fetch("/api/admin/leave-calendar-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        throw new Error("Failed to save configuration")
      }

      setMessage({ type: "success", text: "Calendar configuration saved" })
    } catch (err) {
      console.error("[v0] Error saving config:", err)
      setMessage({ type: "error", text: "Failed to save configuration" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddHoliday = async () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      setMessage({ type: "error", text: "Please enter date and name" })
      return
    }

    try {
      setIsAddingHoliday(true)
      setMessage(null)
      const response = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holiday_date: newHolidayDate,
          holiday_name: newHolidayName,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to add holiday")
      }

      const data = await response.json()
      setHolidays([...holidays, data.holiday])
      setNewHolidayDate("")
      setNewHolidayName("")
      setMessage({ type: "success", text: "Holiday added" })
    } catch (err) {
      console.error("[v0] Error adding holiday:", err)
      setMessage({ type: "error", text: "Failed to add holiday" })
    } finally {
      setIsAddingHoliday(false)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    try {
      setIsDeletingHoliday(id)
      setMessage(null)
      const response = await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" })

      if (!response.ok) {
        throw new Error("Failed to delete holiday")
      }

      setHolidays(holidays.filter((h) => h.id !== id))
      setMessage({ type: "success", text: "Holiday deleted" })
    } catch (err) {
      console.error("[v0] Error deleting holiday:", err)
      setMessage({ type: "error", text: "Failed to delete holiday" })
    } finally {
      setIsDeletingHoliday(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Message Alert */}
      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            message.type === "error"
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-green-50 text-green-800 border border-green-200"
          }`}
        >
          {message.type === "error" ? (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      {/* Calendar Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Year Configuration</CardTitle>
          <CardDescription>Set the leave year period and calculation preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Leave Year Start Month</Label>
              <Select
                value={String(config.leave_year_start_month)}
                onValueChange={(v) => setConfig({ ...config, leave_year_start_month: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Leave Year End Month</Label>
              <Select
                value={String(config.leave_year_end_month)}
                onValueChange={(v) => setConfig({ ...config, leave_year_end_month: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="exclude-holidays"
                checked={config.exclude_holidays_in_calculation}
                onCheckedChange={(v) =>
                  setConfig({ ...config, exclude_holidays_in_calculation: Boolean(v) })
                }
              />
              <Label htmlFor="exclude-holidays" className="cursor-pointer">
                Exclude public holidays from leave calculations
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="include-weekends"
                checked={config.include_weekends_in_calculation}
                onCheckedChange={(v) =>
                  setConfig({ ...config, include_weekends_in_calculation: Boolean(v) })
                }
              />
              <Label htmlFor="include-weekends" className="cursor-pointer">
                Include weekends in leave calculations
              </Label>
            </div>
          </div>

          <Button onClick={handleSaveConfig} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Holidays Management */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Public Holidays</CardTitle>
          <CardDescription>Add, edit, or delete custom holidays</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add Holiday Form */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold">Add New Holiday</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="holiday-date">Date (YYYY-MM-DD)</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  placeholder="2024-12-25"
                />
              </div>
              <div>
                <Label htmlFor="holiday-name">Holiday Name</Label>
                <Input
                  id="holiday-name"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="e.g., Christmas Day"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddHoliday} disabled={isAddingHoliday} className="w-full">
                  {isAddingHoliday && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Plus className="mr-2 h-4 w-4" />
                  Add Holiday
                </Button>
              </div>
            </div>
          </div>

          {/* Holidays List */}
          <div className="space-y-2">
            <h3 className="font-semibold">All Holidays ({holidays.length})</h3>
            <div className="border rounded-lg max-h-96 overflow-y-auto">
              {holidays.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No holidays configured</div>
              ) : (
                <div className="divide-y">
                  {holidays.map((holiday) => (
                    <div key={holiday.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="font-medium">{holiday.holiday_name}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(holiday.holiday_date).toLocaleDateString("en-GB", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        {holiday.is_custom && (
                          <span className="inline-block mt-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            Custom
                          </span>
                        )}
                      </div>
                      {holiday.is_custom && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => holiday.id && handleDeleteHoliday(holiday.id)}
                          disabled={isDeletingHoliday === holiday.id}
                        >
                          {isDeletingHoliday === holiday.id && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
