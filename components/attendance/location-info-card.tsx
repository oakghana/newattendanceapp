"use client"

import { MapPin, Navigation, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface LocationInfoCardProps {
  assignedLocation?: string
  currentDistance?: number
  gpsAccuracy?: number
}

export function LocationInfoCard({ assignedLocation, currentDistance, gpsAccuracy }: LocationInfoCardProps) {
  const DISPLAY_DISTANCE = 50 // Distance requirement shown to users
  const isWithinRange = currentDistance !== undefined && currentDistance <= DISPLAY_DISTANCE
  const hasGoodAccuracy = gpsAccuracy !== undefined && gpsAccuracy <= 100

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-green-600" />
          Location Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-white p-3 border border-green-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Check-in Requirement</span>
            <span className="text-sm font-bold text-green-600">{DISPLAY_DISTANCE} meters</span>
          </div>
          <p className="text-xs text-gray-600">You must be within {DISPLAY_DISTANCE} meters of your assigned location</p>
        </div>

        {assignedLocation && (
          <div className="rounded-md bg-white p-3 border border-green-100">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Your Location</span>
            </div>
            <p className="text-sm text-gray-900 font-medium">{assignedLocation}</p>
            {currentDistance !== undefined && (
              <p className={`text-xs mt-1 ${isWithinRange ? "text-green-600" : "text-amber-600"}`}>
                Current distance: {Math.round(currentDistance)}m {isWithinRange ? "✓" : "(too far)"}
              </p>
            )}
          </div>
        )}

        {gpsAccuracy !== undefined && !hasGoodAccuracy && (
          <Alert variant="destructive" className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              GPS accuracy is low ({Math.round(gpsAccuracy)}m). For best results, use the QR code scanner.
            </AlertDescription>
          </Alert>
        )}

        <div className="pt-2 border-t border-green-100">
          <p className="text-xs text-gray-600 text-center">
            Having GPS issues? Use the <strong>QR Code Scanner</strong> for instant check-in
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
