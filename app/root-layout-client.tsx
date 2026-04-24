"use client"

import type React from "react"
import { NotificationProvider } from "@/components/ui/notification-system"
import { TimeBasedThemeProvider } from "@/components/theme/time-based-theme-provider"
import { PWAComponents } from "./pwa-components"
import { Toaster as AppToaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TimeBasedThemeProvider>
      <NotificationProvider>{children}</NotificationProvider>
      <PWAComponents />
      <AppToaster />
      <SonnerToaster richColors closeButton position="top-right" />
    </TimeBasedThemeProvider>
  )
}
