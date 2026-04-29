"use client"

import { memo, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LogIn, MapPin, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { LocationData } from "@/lib/geolocation"

interface OptimizedCheckInProps {
  isLoading: boolean
  isProcessing: boolean
  userLocation: LocationData | null
  locationValidation: {
    isValid: boolean
    message: string
  }
  onCheckIn: () => void
  error?: string | null
  success?: string | null
  locationName?: string | null
  distance?: number | null
}

const CheckInButton = memo(({ isLoading, isProcessing, onCheckIn }: Pick<OptimizedCheckInProps, "isLoading" | "isProcessing" | "onCheckIn">) => (
  <Button
    onClick={onCheckIn}
    disabled={isLoading || isProcessing}
    size="lg"
    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg h-12 sm:h-14 font-semibold text-base sm:text-lg transition-all active:scale-95 sm:active:scale-100"
  >
    {isLoading || isProcessing ? (
      <>
        <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
        Processing...
      </>
    ) : (
      <>
        <LogIn className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
        Check In
      </>
    )}
  </Button>
))
CheckInButton.displayName = "CheckInButton"

const LocationStatus = memo(({ userLocation, distance, locationName, locationValidation }: Omit<OptimizedCheckInProps, "isLoading" | "isProcessing" | "onCheckIn" | "error" | "success">) => {
  const statusColor = useMemo(() => {
    if (!locationValidation.isValid) return "bg-destructive/10 text-destructive"
    return "bg-green-500/10 text-green-600"
  }, [locationValidation.isValid])

  return (
    <div className={`p-3 sm:p-4 rounded-lg border ${statusColor}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <MapPin className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm sm:text-base truncate">{locationName || "Detecting location..."}</p>
          {distance !== null && userLocation && (
            <p className="text-xs opacity-75 leading-tight">
              Distance: {distance.toFixed(0)}m • Accuracy: {userLocation.accuracy?.toFixed(0)}m
            </p>
          )}
        </div>
        <Badge variant={locationValidation.isValid ? "default" : "destructive"} className="flex-shrink-0">
          {locationValidation.isValid ? "Valid" : "Invalid"}
        </Badge>
      </div>
      {locationValidation.message && <p className="text-xs mt-2 opacity-75">{locationValidation.message}</p>}
    </div>
  )
})
LocationStatus.displayName = "LocationStatus"

const ErrorAlert = memo(({ error }: { error: string | null | undefined }) => {
  if (!error) return null
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
})
ErrorAlert.displayName = "ErrorAlert"

const SuccessAlert = memo(({ success }: { success: string | null | undefined }) => {
  if (!success) return null
  return (
    <Alert className="bg-green-50 text-green-900 border-green-200">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>{success}</AlertDescription>
    </Alert>
  )
})
SuccessAlert.displayName = "SuccessAlert"

export const OptimizedCheckInCard = memo(function OptimizedCheckInCard({
  isLoading,
  isProcessing,
  userLocation,
  locationValidation,
  onCheckIn,
  error,
  success,
  locationName,
  distance,
}: OptimizedCheckInProps) {
  const isReady = useMemo(() => userLocation && locationValidation.isValid, [userLocation, locationValidation.isValid])

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-card to-card/50">
      <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <LogIn className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
          Check In
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Verify your location and record your attendance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
        <ErrorAlert error={error} />
        <SuccessAlert success={success} />
        <LocationStatus userLocation={userLocation} distance={distance} locationName={locationName} locationValidation={locationValidation} />
        <CheckInButton isLoading={isLoading} isProcessing={isProcessing} onCheckIn={onCheckIn} />
        {!isReady && <p className="text-center text-xs sm:text-sm text-muted-foreground">Waiting for location verification...</p>}
      </CardContent>
    </Card>
  )
})
