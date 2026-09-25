"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HeartHandshake, PhoneCall, UserRoundCog } from "lucide-react"

interface AssignmentRequiredModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string | null
  description?: string | null
  contactRole?: string | null
}

/**
 * Warm, human decline shown when a staff member can't submit a leave or loan
 * request because their profile isn't yet linked to a Department/HOD or
 * Regional HR/Manager. Points them to the IT Department to get linked, with
 * a quick way to call the IT Manager for help.
 */
export function AssignmentRequiredModal({
  open,
  onOpenChange,
  title,
  description,
  contactRole,
}: AssignmentRequiredModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-w-md">
        <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-6 pb-8 pt-7">
          <DialogHeader className="items-center space-y-3 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/40 backdrop-blur-sm"
              aria-hidden="true"
            >
              <UserRoundCog className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-white">
              {title || "Hold On Small!"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-amber-50">
              {description ||
                "Chale, we checked and your account isn't linked to a Department/HOD yet, so we can't send this request forward for approval right now."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="mb-3 text-sm font-semibold text-foreground">Here&apos;s what to do next</p>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
                  <UserRoundCog className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </span>
                <span className="text-sm leading-relaxed text-foreground/80">
                  Kindly ask the <strong className="font-semibold text-foreground">IT Department</strong> to link
                  your profile first.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20">
                  <PhoneCall className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </span>
                <span className="text-sm leading-relaxed text-foreground/80">
                  Or call the <strong className="font-semibold text-foreground">{contactRole || "IT Manager"}</strong>{" "}
                  for assistance — they&apos;ll sort you out swiftly!
                </span>
              </li>
            </ul>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Once you&apos;re linked, come back and submit — no stress!
          </p>
        </div>

        <DialogFooter className="flex justify-center px-6 pb-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full gap-2 bg-amber-500 shadow-sm hover:bg-amber-600 sm:w-auto"
          >
            <HeartHandshake className="h-4 w-4" />
            Okay, Medaase!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
