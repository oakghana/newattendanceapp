"use client"

import { useState, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Plus, Search, Users, UserCheck, UserX, Mail, Building, AlertTriangle, Loader2 } from "lucide-react"
import { useFocusTrap, LiveRegion } from "@/components/ui/accessibility-helpers"
import { SkipLink } from "@/components/ui/skip-link"

interface User {
  user_id: string
  employee_id: string
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone: string
  role: string
  position: string
  is_active: boolean
  hire_date: string
  department_name: string
  department_code: string
  auth_status: string
  last_login: string
  login_method: string
  account_status: string
}

interface Department {
  id: string
  name: string
  code: string
}

interface UserManagementClientProps {
  users: User[]
  departments: Department[]
  currentUserRole: string
}

export default function UserManagementClient({
  users: initialUsers,
  departments,
  currentUserRole,
}: UserManagementClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [retryCount, setRetryCount] = useState(0)
  const [announceMessage, setAnnounceMessage] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const focusTrapRef = useFocusTrap(isDialogOpen)

  const supabase = createClient()

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.employee_id?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesRole = filterRole === "all" || user.role === filterRole
      const matchesStatus = filterStatus === "all" || user.account_status === filterStatus

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, filterRole, filterStatus])

  const validateForm = useCallback(
    (formData: FormData): boolean => {
      const errors: Record<string, string> = {}

      const email = formData.get("email") as string
      const firstName = formData.get("firstName") as string
      const lastName = formData.get("lastName") as string
      const employeeId = formData.get("employeeId") as string

      if (!firstName?.trim()) errors.firstName = "First name is required"
      if (!lastName?.trim()) errors.lastName = "Last name is required"
      if (!email?.trim()) {
        errors.email = "Email is required"
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Please enter a valid email address"
      }
      if (employeeId && users.some((u) => u.employee_id === employeeId)) {
        errors.employeeId = "Employee ID already exists"
      }

      setFormErrors(errors)

      if (Object.keys(errors).length > 0) {
        setAnnounceMessage(
          `Form has ${Object.keys(errors).length} validation errors. Please check the highlighted fields.`,
        )
      }

      return Object.keys(errors).length === 0
    },
    [users],
  )

  const handleCreateUser = async (formData: FormData) => {
    if (!validateForm(formData)) return

    setIsLoading(true)
    setFormErrors({})
    setAnnounceMessage("Creating user, please wait...")

    const attemptCreate = async (attempt: number): Promise<void> => {
      try {
        const { data, error } = await supabase.rpc("create_complete_user", {
          p_email: formData.get("email") as string,
          p_first_name: formData.get("firstName") as string,
          p_last_name: formData.get("lastName") as string,
          p_employee_id: formData.get("employeeId") as string,
          p_role: formData.get("role") as string,
          p_department_id: formData.get("departmentId") as string,
          p_position: formData.get("position") as string,
          p_phone: formData.get("phone") as string,
        })

        if (error) {
          if (error.message.includes("duplicate") || error.code === "23505") {
            throw new Error("A user with this email or employee ID already exists")
          }
          if (error.message.includes("network") && attempt < 3) {
            throw new Error("RETRY")
          }
          throw new Error(error.message || "Failed to create user")
        }

        toast.success("User created successfully! They can now sign up with their email.")
        setAnnounceMessage("User created successfully")
        setIsCreateDialogOpen(false)
        setRetryCount(0)

        window.location.reload()
      } catch (error) {
        if (error instanceof Error && error.message === "RETRY" && attempt < 3) {
          setAnnounceMessage(`Retrying user creation, attempt ${attempt + 1}`)
          setTimeout(() => attemptCreate(attempt + 1), 1000 * attempt)
          return
        }

        console.error("Error creating user:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to create user"
        toast.error(errorMessage)
        setAnnounceMessage(`Error: ${errorMessage}`)
        setRetryCount(attempt)
      }
    }

    await attemptCreate(1)
    setIsLoading(false)
  }

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    const user = users.find((u) => u.user_id === userId)
    const userName = user ? `${user.first_name} ${user.last_name}` : "User"

    // Optimistic update
    setUsers(users.map((user) => (user.user_id === userId ? { ...user, is_active: !currentStatus } : user)))
    setAnnounceMessage(`${!currentStatus ? "Activating" : "Deactivating"} ${userName}...`)

    try {
      const { error } = await supabase.rpc("toggle_user_status", {
        p_user_id: userId,
        p_is_active: !currentStatus,
      })

      if (error) throw error

      const statusText = !currentStatus ? "activated" : "deactivated"
      toast.success(`${userName} ${statusText} successfully`)
      setAnnounceMessage(`${userName} ${statusText} successfully`)
    } catch (error) {
      // Revert optimistic update
      setUsers(users.map((user) => (user.user_id === userId ? { ...user, is_active: currentStatus } : user)))

      console.error("Error toggling user status:", error)
      const errorMsg = "Failed to update user status. Please try again."
      toast.error(errorMsg)
      setAnnounceMessage(`Error: ${errorMsg}`)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Ready":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Ready
          </Badge>
        )
      case "Needs Signup":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            Needs Signup
          </Badge>
        )
      case "Inactive":
        return <Badge variant="destructive">Inactive</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    const colors = {
      admin: "bg-red-100 text-red-800",
      regional_manager: "bg-blue-100 text-blue-800",
      department_head: "bg-green-100 text-green-800",
      staff: "bg-gray-100 text-gray-800",
      nsp: "bg-purple-100 text-purple-800",
      intern: "bg-green-100 text-green-800",
      contract: "bg-orange-100 text-orange-800",
    }
    return (
      <Badge className={colors[role as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {role.replace("_", " ").toUpperCase()}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <LiveRegion message={announceMessage} priority="polite" />

      <SkipLink href="#user-table">Skip to user table</SkipLink>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Unified view of all users - authentication and profiles in one place
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" aria-describedby="create-user-desc">
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-md max-h-[90vh] overflow-y-auto"
            ref={focusTrapRef}
            aria-labelledby="create-user-title"
            aria-describedby="create-user-desc"
          >
            <DialogHeader>
              <DialogTitle id="create-user-title">Create New User</DialogTitle>
              <DialogDescription id="create-user-desc">
                Add a new user to the system. They will need to sign up with their email to activate their account.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    required
                    aria-describedby={formErrors.firstName ? "firstName-error" : undefined}
                    aria-invalid={!!formErrors.firstName}
                    className={formErrors.firstName ? "border-red-500" : ""}
                  />
                  {formErrors.firstName && (
                    <p id="firstName-error" className="text-sm text-red-500 mt-1 flex items-center gap-1" role="alert">
                      <AlertTriangle className="h-3 w-3" />
                      {formErrors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    required
                    aria-describedby={formErrors.lastName ? "lastName-error" : undefined}
                    aria-invalid={!!formErrors.lastName}
                    className={formErrors.lastName ? "border-red-500" : ""}
                  />
                  {formErrors.lastName && (
                    <p id="lastName-error" className="text-sm text-red-500 mt-1 flex items-center gap-1" role="alert">
                      <AlertTriangle className="h-3 w-3" />
                      {formErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  aria-describedby={formErrors.email ? "email-error" : "email-help"}
                  aria-invalid={!!formErrors.email}
                  className={formErrors.email ? "border-red-500" : ""}
                />
                <p id="email-help" className="text-xs text-muted-foreground mt-1">
                  User will receive signup instructions at this email
                </p>
                {formErrors.email && (
                  <p id="email-error" className="text-sm text-red-500 mt-1 flex items-center gap-1" role="alert">
                    <AlertTriangle className="h-3 w-3" />
                    {formErrors.email}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="role">Role</Label>
                <Select name="role" defaultValue="staff">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="department_head">Department Head</SelectItem>
                    <SelectItem value="regional_manager">Regional Manager</SelectItem>
                    <SelectItem value="regional_hr">Regional HR Officer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="nsp">NSP</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    {/* Managing Director and Secretary — only visible to Admin role */}
                    {currentUserRole === "admin" && (
                      <>
                        <SelectItem value="managing_director">Managing Director</SelectItem>
                        <SelectItem value="secretary">Secretary</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* ... existing form fields with similar accessibility enhancements ... */}

              <Button type="submit" className="w-full" disabled={isLoading} aria-describedby="submit-status">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
              {retryCount > 0 && (
                <p id="submit-status" className="text-sm text-orange-600 text-center" role="status">
                  Retried {retryCount} time(s). Please check your connection.
                </p>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter((u) => u.account_status === "Ready").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Signup</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter((u) => u.account_status === "Needs Signup").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administrators</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter((u) => u.role === "admin").length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Users</CardTitle>
        </CardHeader>
        <CardContent>
          <form role="search" aria-label="Filter users">
            <fieldset className="space-y-4">
              <legend className="sr-only">Search and filter options</legend>

              <div className="flex-1">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="search"
                    placeholder="Search by name, email, or employee ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    aria-describedby="search-help"
                  />
                  <p id="search-help" className="sr-only">
                    Search through user names, email addresses, and employee IDs
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="roleFilter">Role</Label>
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger id="roleFilter" aria-describedby="role-help">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="regional_manager">Regional Manager</SelectItem>
                      <SelectItem value="regional_hr">Regional HR Officer</SelectItem>
                      <SelectItem value="department_head">Dept Head</SelectItem>
                      <SelectItem value="it-admin">IT-Admin</SelectItem>
                      <SelectItem value="audit_staff">Audit Staff</SelectItem>
                      <SelectItem value="accounts">Accounts</SelectItem>
                      <SelectItem value="loan_office">Loan Office</SelectItem>
                      <SelectItem value="hr_leave_office">HR Leave Office</SelectItem>
                      <SelectItem value="manager_hr">Manager HR</SelectItem>
                      <SelectItem value="director_hr">Director HR</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="nsp">NSP</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                  <p id="role-help" className="sr-only">
                    Filter users by their role in the system
                  </p>
                </div>

                <div className="flex-1">
                  <Label htmlFor="statusFilter">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger id="statusFilter" aria-describedby="status-help">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Ready">Ready</SelectItem>
                      <SelectItem value="Needs Signup">Needs Signup</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p id="status-help" className="sr-only">
                    Filter users by their account status
                  </p>
                </div>
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          <CardDescription>Complete user information including authentication status and profile data</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile view with enhanced accessibility */}
          <div className="block sm:hidden space-y-4" role="list" aria-label="Users list">
            {filteredUsers.map((user) => (
              <Card key={user.user_id} className="p-4" role="listitem">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{user.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{user.position}</p>
                    </div>
                    {getRoleBadge(user.role)}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="break-all">{user.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Employee ID:</span>
                      <span className="font-medium">{user.employee_id || "N/A"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Department:</span>
                      <span className="font-medium">{user.department_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Status:</span>
                      {getStatusBadge(user.account_status)}
                    </div>
                  </div>
                  <Button
                    variant={user.is_active ? "destructive" : "default"}
                    size="sm"
                    className="w-full"
                    onClick={() => handleToggleStatus(user.user_id, user.is_active)}
                    aria-describedby={`user-${user.user_id}-status`}
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <p id={`user-${user.user_id}-status`} className="sr-only">
                    Current status: {user.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop table with enhanced accessibility */}
          <div className="hidden sm:block overflow-x-auto">
            <Table id="user-table" role="table" aria-label="Users data table">
              <TableHeader>
                <TableRow role="row">
                  <TableHead role="columnheader" scope="col">
                    Name
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Email
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Employee ID
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Role
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Department
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Status
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Auth Status
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Login Method
                  </TableHead>
                  <TableHead role="columnheader" scope="col">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.user_id} role="row">
                    <TableCell role="gridcell">
                      <div>
                        <div className="font-medium">{user.full_name}</div>
                        <div className="text-sm text-muted-foreground">{user.position}</div>
                      </div>
                    </TableCell>
                    <TableCell role="gridcell">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell role="gridcell">{user.employee_id || "N/A"}</TableCell>
                    <TableCell role="gridcell">{getRoleBadge(user.role)}</TableCell>
                    <TableCell role="gridcell">
                      <div>
                        <div className="font-medium">{user.department_name}</div>
                        <div className="text-sm text-muted-foreground">{user.department_code}</div>
                      </div>
                    </TableCell>
                    <TableCell role="gridcell">{getStatusBadge(user.account_status)}</TableCell>
                    <TableCell role="gridcell">
                      <Badge variant={user.auth_status === "Active" ? "default" : "secondary"}>
                        {user.auth_status}
                      </Badge>
                    </TableCell>
                    <TableCell role="gridcell" className="text-sm">
                      {user.login_method}
                    </TableCell>
                    <TableCell role="gridcell">
                      <Button
                        variant={user.is_active ? "destructive" : "default"}
                        size="sm"
                        onClick={() => handleToggleStatus(user.user_id, user.is_active)}
                        aria-label={`${user.is_active ? "Deactivate" : "Activate"} ${user.full_name}`}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8" role="status" aria-live="polite">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <p className="text-muted-foreground">No users found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
