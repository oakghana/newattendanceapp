"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function IndependenceDayFlyer() {
  const [isOpen, setIsOpen] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    // Show flyer on page load
    const timer = setTimeout(() => {
      setIsOpen(true)
    }, 300)

    return () => clearTimeout(timer)
  }, [])

  if (!isClient) return null

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-in fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in scale-in-95">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
              aria-label="Close flyer"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>

            {/* Flyer Content */}
            <div
              className="min-h-96 flex flex-col items-center justify-center px-6 py-12 text-center relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #007A5E 0%, #005a47 50%, #003d33 100%)",
              }}
            >
              {/* Decorative top border with Ghana flag colors */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#CE1126] via-[#FCD116] to-[#007A5E]" />

              {/* Title */}
              <div className="mb-8">
                <p className="text-yellow-300 text-xs sm:text-sm font-bold tracking-widest mb-2">
                  QCC ELECTRONIC ATTENDANCE
                </p>
              </div>

              {/* Ghana Flag Heart */}
              <div className="mb-8 relative">
                <div
                  className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl shadow-2xl border-4 border-white/20 flex items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(to bottom, #CE1126 0%, #CE1126 33%, #FCD116 33%, #FCD116 66%, #007A5E 66%, #007A5E 100%)",
                  }}
                >
                  {/* Black Star - Fixed to be pure black, not gold */}
                  <div className="text-6xl sm:text-7xl font-black leading-none" style={{ color: "#000000" }}>
                    ★
                  </div>
                </div>
              </div>

              {/* Main Message */}
              <div className="mb-6 space-y-2">
                <h2 className="text-white text-2xl sm:text-4xl font-black tracking-wide">HAPPY</h2>
                <p className="text-yellow-300 text-3xl sm:text-5xl font-black tracking-wide">69TH</p>
                <h3 className="text-white text-2xl sm:text-4xl font-black tracking-wide">INDEPENDENCE DAY</h3>
              </div>

              {/* Tagline */}
              <div className="space-y-2 mb-6">
                <p className="text-white text-sm sm:text-base font-semibold">BUILDING PROSPERITY</p>
                <p className="text-yellow-300 text-xs sm:text-sm font-bold">QUALITY CONTROL COMPANY LTD.</p>
              </div>

              {/* Website */}
              <p className="text-white text-xs sm:text-sm font-medium">www.qccgh.com</p>

              {/* Decorative bottom border */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#007A5E] via-[#FCD116] to-[#CE1126]" />
            </div>

            {/* Footer with action buttons */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
              <Button
                onClick={() => setIsOpen(false)}
                className="w-full sm:w-auto bg-[#007A5E] hover:bg-[#005a47] text-white"
              >
                Celebrate & Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
