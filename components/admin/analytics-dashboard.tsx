"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  MapPin,
  AlertTriangle,
  Target,
  Activity,
  BarChart3,
  PieChartIcon,
  LineChartIcon,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
} from "lucide-react"

interface AnalyticsData {
  attendanceRate: number
  totalEmployees: number
  activeLocations: number
  avgWorkHours: number
  trends: {
    daily: Array<{ date: string; present: number; absent: number; late: number }>
    weekly: Array<{ week: string; attendance: number; productivity: number }>
    monthly: Array<{ month: string; rate: number; hours: number }>
  }
  departmentStats: Array<{
    name: string
    attendance: number
    employees: number
    avgHours: number
    color: string
  }>
  locationStats: Array<{
    name: string
    checkins: number
    utilization: number
    peakHours: string
  }>
  predictions: {
    nextWeekAttendance: number
    riskEmployees: number
    peakDays: string[]
  }
}

const COLORS = ["#e97444", "#f39c12", "#3498db", "#2ecc71", "#9b59b6", "#e74c3c", "#1abc9c", "#34495e"]

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState("30d")
  const [activeTab, setActiveTab] = useState("overview")

  // Department table sort + filter
  const [deptSearch, setDeptSearch] = useState("")
  const [deptSortKey, setDeptSortKey] = useState<"name" | "attendance" | "employees" | "avgHours">("attendance")
  const [deptSortDir, setDeptSortDir] = useState<"asc" | "desc">("desc")

  // Location table sort + filter
  const [locSearch, setLocSearch] = useState("")
  const [locSortKey, setLocSortKey] = useState<"name" | "checkins" | "utilization" | "peakHours">("checkins")
  const [locSortDir, setLocSortDir] = useState<"asc" | "desc">("desc")

  const toggleDeptSort = (key: typeof deptSortKey) => {
    if (deptSortKey === key) setDeptSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setDeptSortKey(key); setDeptSortDir("asc") }
  }

  const toggleLocSort = (key: typeof locSortKey) => {
    if (locSortKey === key) setLocSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setLocSortKey(key); setLocSortDir("asc") }
  }

  const sortIcon = (active: boolean, dir: "asc" | "desc") => {
    if (!active) return <ArrowUpDown className="h-3 w-3 text-gray-400 inline ml-1" />
    return dir === "asc"
      ? <ArrowUp className="h-3 w-3 text-blue-500 inline ml-1" />
      : <ArrowDown className="h-3 w-3 text-blue-500 inline ml-1" />
  }

  const filteredDepts = useMemo(() => {
    if (!data) return []
    let rows = [...data.departmentStats]
    if (deptSearch.trim()) {
      const q = deptSearch.trim().toLowerCase()
      rows = rows.filter((d) => d.name.toLowerCase().includes(q))
    }
    rows.sort((a, b) => {
      let va: any = a[deptSortKey]
      let vb: any = b[deptSortKey]
      if (typeof va === "string") return deptSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      return deptSortDir === "asc" ? va - vb : vb - va
    })
    return rows
  }, [data, deptSearch, deptSortKey, deptSortDir])

  const filteredLocs = useMemo(() => {
    if (!data) return []
    let rows = [...data.locationStats]
    if (locSearch.trim()) {
      const q = locSearch.trim().toLowerCase()
      rows = rows.filter((l) => l.name.toLowerCase().includes(q))
    }
    rows.sort((a, b) => {
      let va: any = a[locSortKey]
      let vb: any = b[locSortKey]
      if (typeof va === "string") return locSortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      return locSortDir === "asc" ? va - vb : vb - va
    })
    return rows
  }, [data, locSearch, locSortKey, locSortDir])

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/analytics?range=${timeRange}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch analytics")
      }

      setData(result)
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to fetch analytics")
    } finally {
      setLoading(false)
    }
  }

  const kpiCards = useMemo(() => {
    if (!data) return []

    return [
      {
        title: "Attendance Rate",
        value: `${data.attendanceRate.toFixed(1)}%`,
        change: data.attendanceRate > 85 ? 2.5 : -1.2,
        icon: Users,
        color: "text-white",
        bgColor: "bg-white/20",
        cardBg: data.attendanceRate > 85 ? "bg-emerald-600" : "bg-red-600",
        label: data.attendanceRate > 85 ? "On Track" : "Needs Attention",
      },
      {
        title: "Active Employees",
        value: data.totalEmployees.toString(),
        change: 5.2,
        icon: Activity,
        color: "text-white",
        bgColor: "bg-white/20",
        cardBg: "bg-blue-600",
        label: "Total staff",
      },
      {
        title: "Avg Work Hours",
        value: `${data.avgWorkHours.toFixed(1)}h`,
        change: data.avgWorkHours > 8 ? 1.8 : -0.5,
        icon: Clock,
        color: "text-white",
        bgColor: "bg-white/20",
        cardBg: data.avgWorkHours > 8 ? "bg-indigo-600" : "bg-orange-600",
        label: "Per employee",
      },
      {
        title: "Active Locations",
        value: data.activeLocations.toString(),
        change: 0,
        icon: MapPin,
        color: "text-white",
        bgColor: "bg-white/20",
        cardBg: "bg-teal-600",
        label: "Monitored sites",
      },
    ]
  }, [data])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-300">Showing data for the selected period:</p>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-36 h-9 bg-white/90 dark:bg-slate-800 border-gray-200 dark:border-slate-600 shadow-sm text-sm text-slate-800 dark:text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="1y">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, index) => (
          <div key={index} className={`relative overflow-hidden rounded-xl p-4 sm:p-5 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${kpi.cardBg}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${kpi.bgColor}`}>
                  <kpi.icon className="h-5 w-5 text-white" />
                </div>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  kpi.change > 0 ? "bg-white/20" : kpi.change < 0 ? "bg-black/20" : "bg-white/10"
                }`}>
                  {kpi.change > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : kpi.change < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  <span>{kpi.change !== 0 ? `${kpi.change > 0 ? "+" : ""}${kpi.change}%` : "stable"}</span>
                </div>
              </div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">{kpi.title}</p>
              <p className="text-2xl sm:text-3xl font-bold mt-0.5">{kpi.value}</p>
              <p className="text-white/60 text-xs mt-1">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Predictive Insights */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 p-4 sm:p-6 shadow-xl ring-1 ring-cyan-500/25">
        <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-300/10 rounded-full -translate-y-16 translate-x-16 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-cyan-400/20 rounded-xl ring-1 ring-cyan-300/30">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Predictive Insights</h3>
              <p className="text-cyan-100/80 text-xs">AI-powered predictions and recommendations</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-cyan-200/20">
              <div className="text-3xl font-bold text-white mb-1">{data.predictions.nextWeekAttendance}%</div>
              <div className="text-sm text-cyan-100/80">Predicted Next Week</div>
            </div>
            <div className="text-center p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-cyan-200/20">
              <div className="text-3xl font-bold text-orange-300 mb-1">{data.predictions.riskEmployees}</div>
              <div className="text-sm text-cyan-100/80">At-Risk Employees</div>
            </div>
            <div className="text-center p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-cyan-200/20">
              <div className="text-sm font-bold text-green-300 mb-2">Peak Days</div>
              <div className="text-xs text-cyan-100/80">{data.predictions.peakDays.join(", ")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto bg-slate-100 dark:bg-slate-800/80">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <LineChartIcon className="h-4 w-4" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <PieChartIcon className="h-4 w-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-4 w-4" />
            Locations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Daily Attendance Trend</CardTitle>
                <CardDescription>Last 30 days attendance pattern</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={data.trends.daily}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="present" stackId="1" stroke="#e97444" fill="#e97444" />
                    <Area type="monotone" dataKey="late" stackId="1" stroke="#f39c12" fill="#f39c12" />
                    <Area type="monotone" dataKey="absent" stackId="1" stroke="#e74c3c" fill="#e74c3c" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Weekly Performance</CardTitle>
                <CardDescription>Attendance vs productivity correlation</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.trends.weekly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="attendance" stroke="#e97444" strokeWidth={2} />
                    <Line type="monotone" dataKey="productivity" stroke="#3498db" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>Long-term attendance and work hours analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.trends.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="rate" fill="#e97444" name="Attendance Rate %" />
                  <Line yAxisId="right" type="monotone" dataKey="hours" stroke="#3498db" name="Avg Hours" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Department Distribution</CardTitle>
                <CardDescription>Attendance rates by department</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.departmentStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, attendance }) => `${name}: ${attendance}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="attendance"
                    >
                      {data.departmentStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Department Performance</CardTitle>
                <CardDescription>Detailed metrics by department</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3 relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-slate-400" />
                  <Input
                    value={deptSearch}
                    onChange={(e) => setDeptSearch(e.target.value)}
                    placeholder="Filter departments…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {([
                          { key: "name", label: "Department" },
                          { key: "employees", label: "Staff" },
                          { key: "attendance", label: "Attendance %" },
                          { key: "avgHours", label: "Avg Hours" },
                        ] as const).map(({ key, label }) => (
                          <th
                            key={key}
                            className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-slate-300 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-nowrap"
                            onClick={() => toggleDeptSort(key)}
                          >
                            {label}
                            {sortIcon(deptSortKey === key, deptSortDir)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDepts.map((dept, index) => (
                        <tr key={dept.name} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="font-medium">{dept.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300">{dept.employees}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Progress value={dept.attendance} className="h-1.5 w-16" />
                              <span className={`font-medium ${dept.attendance >= 85 ? "text-emerald-600" : dept.attendance >= 70 ? "text-amber-600" : "text-red-600"}`}>
                                {dept.attendance}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-slate-300">{dept.avgHours}h</td>
                        </tr>
                      ))}
                      {filteredDepts.length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-400 dark:text-slate-400 text-sm">No departments match your filter</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
          <Card className="shadow-sm border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Location Statistics</CardTitle>
              <CardDescription>Check-in counts and utilization by location</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-slate-400" />
                <Input
                  value={locSearch}
                  onChange={(e) => setLocSearch(e.target.value)}
                  placeholder="Filter locations…"
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {([
                        { key: "name", label: "Location" },
                        { key: "checkins", label: "Check-ins" },
                        { key: "utilization", label: "Utilization %" },
                        { key: "peakHours", label: "Peak Hours" },
                      ] as const).map(({ key, label }) => (
                        <th
                          key={key}
                          className="py-2 px-3 text-left font-semibold text-gray-600 dark:text-slate-300 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-slate-800 whitespace-nowrap"
                          onClick={() => toggleLocSort(key)}
                        >
                          {label}
                          {sortIcon(locSortKey === key, locSortDir)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLocs.map((location) => (
                      <tr key={location.name} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="py-2.5 px-3 font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary flex-shrink-0" />{location.name}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 dark:text-slate-200 font-semibold">{location.checkins}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Progress value={location.utilization} className="h-1.5 w-20" />
                            <span className={`font-medium ${location.utilization >= 80 ? "text-emerald-600" : location.utilization >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {location.utilization}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="secondary" className="text-xs">{location.peakHours}</Badge>
                        </td>
                      </tr>
                    ))}
                    {filteredLocs.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-gray-400 dark:text-slate-400 text-sm">No locations match your filter</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
