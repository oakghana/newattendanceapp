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
    <html lang="en" className="antialiased" data-scroll-behavior="smooth">
      <head>
        <meta name="format-detection" content="telephone=no,date=no,email=no,address=no" />
        <link rel="preconnect" href="https://vgtajtqxgczhjboatvol.supabase.co" />
        <link rel="dns-prefetch" href="https://vgtajtqxgczhjboatvol.supabase.co" />
        <link rel="stylesheet" href="/print-styles.css" media="print" />
      </head>
      <body className="font-sans">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  )
}
