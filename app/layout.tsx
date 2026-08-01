import type React from "react"
import "./globals.css"
import { metadata, viewport } from "./metadata"
import RootLayoutClient from "./root-layout-client"

export { metadata, viewport }

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="stylesheet" href="/print-styles.css" media="print" />
      </head>
      <body className="font-sans">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  )
}
