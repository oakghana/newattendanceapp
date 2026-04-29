export const metadata = {
  title: "QCC Electronic Attendance | Quality Control Company Limited",
  description: "Quality Control Company Limited Electronic Attendance System - Intranet Portal",
  manifest: "/manifest.json",
  applicationName: "QCC Attendance",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QCC Attendance",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/images/qcc-logo.png", sizes: "32x32", type: "image/png" },
      { url: "/images/qcc-logo.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: "/images/qcc-logo.png",
    shortcut: "/favicon.ico",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-config": "/browserconfig.xml",
    "msapplication-TileColor": "#ea580c",
    "msapplication-tap-highlight": "no",
  },
  generator: "v0.app",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#ea580c",
  colorScheme: "light dark",
  interactiveWidget: "resizes-content",
}
