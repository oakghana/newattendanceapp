"use client"

import type React from "react"
import { createContext, useContext, useState, useCallback } from "react"
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Notification {
  id: string
  type: "success" | "error" | "warning" | "info"
  title?: string
  message: string
  field?: string
  duration?: number
  persistent?: boolean
}

interface NotificationOptions {
  duration?: number
  persistent?: boolean
}

interface NotificationContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, "id">) => void
  removeNotification: (id: string) => void
  clearAll: () => void
  showFieldError: (field: string, message: string) => void
  showSuccess: (message: string, title?: string, options?: NotificationOptions) => void
  showError: (message: string, title?: string, options?: NotificationOptions) => void
  showWarning: (message: string, title?: string, options?: NotificationOptions) => void
  showInfo: (message: string, title?: string, options?: NotificationOptions) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}

export const useNotification = useNotifications

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? (notification.type === "error" ? 8000 : 5000),
    }

    setNotifications((prev) => [...prev, newNotification])

    // Auto-remove notification after duration (unless persistent)
    if (!notification.persistent && newNotification.duration) {
      setTimeout(() => {
        removeNotification(id)
      }, newNotification.duration)
    }
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const showFieldError = useCallback(
    (field: string, message: string) => {
      addNotification({
        type: "error",
        message,
        field,
        title: "Validation Error",
      })
    },
    [addNotification],
  )

  const showSuccess = useCallback(
    (message: string, title?: string, options?: NotificationOptions) => {
      addNotification({
        type: "success",
        message,
        title: title || "Success",
        ...options,
      })
    },
    [addNotification],
  )

  const showError = useCallback(
    (message: string, title?: string, options?: NotificationOptions) => {
      addNotification({
        type: "error",
        message,
        title: title || "Error",
        ...options,
      })
    },
    [addNotification],
  )

  const showWarning = useCallback(
    (message: string, title?: string, options?: NotificationOptions) => {
      addNotification({
        type: "warning",
        message,
        title: title || "Warning",
        ...options,
      })
    },
    [addNotification],
  )

  const showInfo = useCallback(
    (message: string, title?: string, options?: NotificationOptions) => {
      addNotification({
        type: "info",
        message,
        title: title || "Information",
        ...options,
      })
    },
    [addNotification],
  )

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        clearAll,
        showFieldError,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}
    >
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  )
}

function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  )
}

function NotificationItem({
  notification,
  onRemove,
}: {
  notification: Notification
  onRemove: () => void
}) {
  const getIcon = () => {
    switch (notification.type) {
      case "success":
        return <CheckCircle className="h-5 w-5" />
      case "error":
        return <AlertCircle className="h-5 w-5" />
      case "warning":
        return <AlertTriangle className="h-5 w-5" />
      case "info":
        return <Info className="h-5 w-5" />
    }
  }

  const getColorClasses = () => {
    switch (notification.type) {
      case "success":
        return "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
      case "error":
        return "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
      case "warning":
        return "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200"
      case "info":
        return "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
    }
  }

  const getIconColorClasses = () => {
    switch (notification.type) {
      case "success":
        return "text-green-600 dark:text-green-400"
      case "error":
        return "text-red-600 dark:text-red-400"
      case "warning":
        return "text-amber-600 dark:text-amber-400"
      case "info":
        return "text-green-600 dark:text-green-400"
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border p-4 shadow-lg backdrop-blur-sm animate-in slide-in-from-left-full duration-300",
        getColorClasses(),
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex-shrink-0", getIconColorClasses())}>{getIcon()}</div>
        <div className="flex-1 min-w-0">
          {notification.title && (
            <h4 className="text-sm font-semibold mb-1">
              {notification.title}
              {notification.field && (
                <span className="ml-2 text-xs font-normal opacity-75">({notification.field})</span>
              )}
            </h4>
          )}
          <p className="text-sm leading-relaxed">{notification.message}</p>
        </div>
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
