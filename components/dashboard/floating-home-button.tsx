"use client"

import { useState, useEffect, useCallback, memo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

export const FloatingHomeButton = memo(function FloatingHomeButton() {
  const pathname = usePathname()
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  // Memoized scroll handler for better performance
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY
    
    // Show scroll-to-top button when scrolled down
    setShowScrollTop(currentScrollY > 300)
    
    // Hide buttons when scrolling down quickly, show when scrolling up
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      setIsVisible(false)
    } else {
      setIsVisible(true)
    }
    
    setLastScrollY(currentScrollY)
  }, [lastScrollY])

  useEffect(() => {
    // Throttled scroll listener for performance
    let ticking = false
    const scrollListener = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", scrollListener, { passive: true })
    return () => window.removeEventListener("scroll", scrollListener)
  }, [handleScroll])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  // Don't show on home/overview page
  const isHomePage = pathname === "/dashboard" || pathname === "/dashboard/overview"

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 hidden flex-col gap-3 transition-all duration-300 lg:flex",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"
      )}
    >
      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="flex items-center justify-center w-12 h-12 bg-muted/90 backdrop-blur-xl text-foreground rounded-full shadow-lg border border-border/50 hover:bg-muted hover:scale-110 transition-all duration-200 touch-manipulation"
          aria-label="Scroll to top"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* Home button - always visible on non-home pages */}
      {!isHomePage && (
        <Link
          href="/dashboard/overview"
          prefetch={true}
          className="flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-xl hover:bg-primary/90 hover:scale-110 transition-all duration-200 touch-manipulation ring-4 ring-primary/20"
          aria-label="Go to Dashboard Home"
        >
          <Home className="w-6 h-6" />
        </Link>
      )}
    </div>
  )
})
