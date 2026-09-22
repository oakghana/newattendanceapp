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
import { HeartHandshake, PhoneCall } from "lucide-react"

// Head office switchboard number, also used on the printed memo footer.
const QCC_IT_SUPPORT_TEL = "+233571461114"

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
      <DialogContent className="border-amber-200 bg-gradient-to-b from-amber-50 to-background sm:max-w-md">
        <DialogHeader className="items-center space-y-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">🙏🏾</div>
          <DialogTitle className="text-lg font-semibold text-amber-900">{title || "Hold On Small!"}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-foreground/80">
            {description ||
              "Chale, we checked and your account isn't linked to a Department/HOD yet, so we can't send this request forward for approval right now."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Here's what to do next 👇🏾</p>
          <ul className="list-none space-y-1.5">
            <li className="flex gap-2">
              <span>🏢</span>
              <span>
                Kindly ask the <strong>IT Department</strong> to link your profile first.
              </span>
            </li>
            <li className="flex gap-2">
              <span>📞</span>
              <span>
                Or call the <strong>{contactRole || "IT Manager"}</strong> for assistance — they'll sort you out
                swiftly!
              </span>
            </li>
          </ul>
          <p className="pt-1 text-xs text-amber-700">Once you're linked, come back and submit — no stress! 😊</p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            asChild
            variant="outline"
            className="w-full gap-2 border-amber-300 text-amber-800 hover:bg-amber-100 sm:w-auto"
          >
            <a href={`tel:${QCC_IT_SUPPORT_TEL}`}>
              <PhoneCall className="h-4 w-4" />
              Call IT Manager
            </a>
          </Button>
          <Button onClick={() => onOpenChange(false)} className="w-full gap-2 sm:w-auto">
            <HeartHandshake className="h-4 w-4" />
            Okay, Medaase!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
