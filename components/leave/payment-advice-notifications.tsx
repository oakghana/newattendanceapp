import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Bell, CheckCircle2, AlertCircle, Calendar } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface PaymentAdviceNotification {
  id: string
  user_id: string
  notification_type: string
  title: string
  message: string
  related_month: string
  staff_category: string
  memo_id?: string
  is_read: boolean
  created_at: string
}

interface PaymentAdviceNotificationsProps {
  userId: string
}

export function PaymentAdviceNotifications({ userId }: PaymentAdviceNotificationsProps) {
  const [notifications, setNotifications] = useState<PaymentAdviceNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/leave/payment-advice-notification?userId=${encodeURIComponent(userId)}`)
        
        if (response.ok) {
          const data = await response.json()
          setNotifications(data.notifications || [])
        }
      } catch (err) {
        console.error("[v0] Error fetching payment advice notifications:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotifications()
  }, [userId])

  if (isLoading) {
    return (
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-slate-600">Loading notifications...</span>
        </CardContent>
      </Card>
    )
  }

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => {
        const monthDate = new Date(notification.related_month + "-01")
        const formattedMonth = format(monthDate, "MMMM yyyy")

        return (
          <Alert key={notification.id} className="border-green-200 bg-green-50/50">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <AlertTitle className="text-green-900 flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  {notification.title}
                </AlertTitle>
                <AlertDescription className="text-green-800 mt-1">
                  <p>{notification.message}</p>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="font-medium">{formattedMonth}</span>
                    <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 border-green-300">
                      {notification.staff_category} Staff
                    </Badge>
                    <span className="text-xs text-green-700 ml-auto">
                      {format(new Date(notification.created_at), "MMM dd, yyyy")}
                    </span>
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )
      })}
    </div>
  )
}
