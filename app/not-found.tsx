"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Compass, Home, LogIn } from "lucide-react"

import { Button } from "@/components/ui/button"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Unable to determine the current session")
  }
  return response.json()
}

export default function NotFound() {
  const router = useRouter()
  const { data, isLoading } = useSWR("/api/auth/current-user", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const isAuthenticated = data?.success === true && Boolean(data.user)
  const destination = isAuthenticated ? "/dashboard" : "/"
  const destinationLabel = isAuthenticated ? "Return to dashboard" : "Go to sign in"
  const DestinationIcon = isAuthenticated ? Home : LogIn

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <Link href={destination} className="mb-12 transition-opacity hover:opacity-80" aria-label="Return to home">
          <Image src="/images/qcc-logo.png" alt="QCC Electronic Attendance" width={72} height={72} className="rounded-full" priority />
        </Link>

        <div className="mb-8 flex size-24 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <Compass className="size-11" aria-hidden="true" />
        </div>

        <p className="mb-3 font-mono text-sm font-semibold uppercase tracking-[0.28em] text-primary">Error 404</p>
        <h1 className="max-w-xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">This page is not on the attendance map.</h1>
        <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
          The address may be incorrect, or the page may have moved. No worries — we can get you back to where you need to be.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:max-w-none sm:justify-center">
          <Button asChild size="lg" className="sm:min-w-48">
            <Link href={destination}>
              <DestinationIcon data-icon="inline-start" />
              {isLoading ? "Choose a destination" : destinationLabel}
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="sm:min-w-36" onClick={() => router.back()}>
            <ArrowLeft data-icon="inline-start" />
            Go back
          </Button>
        </div>

        <p className="mt-12 text-sm text-muted-foreground">QCC Electronic Attendance App</p>
      </div>
    </main>
  )
}
