
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SignaturePad } from "@/components/leave/signature-pad"
import { useToast } from "@/hooks/use-toast"

interface HRSignatureSaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  hrName: string
  onSignatureSaved?: () => void
}

export function HRSignatureSaveDialog({
  open,
  onOpenChange,
  userId,
  hrName,
  onSignatureSaved
}: HRSignatureSaveDialogProps) {
  const { toast } = useToast()
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw")
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveSignature = async () => {
    if (!signatureDataUrl) {
      toast({
        title: "Error",
        description: "Please draw or upload a signature first",
        variant: "destructive"
      })
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/user/hr-signature-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          signatureDataUrl
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to save signature")
      }

      console.log("[v0] Signature saved successfully")
      toast({
        title: "Success",
        description: "Your signature has been saved and will appear in future memos"
      })

      setSignatureDataUrl(null)
      onOpenChange(false)
      onSignatureSaved?.()
    } catch (error) {
      console.error("[v0] Error saving signature:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save signature",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Your Signature</DialogTitle>
          <DialogDescription>
            {hrName}, please save your signature. This will be used in all payment advice memos you approve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode selection */}
          <div className="flex gap-2">
            <button
              onClick={() => setSignatureMode("draw")}
              className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
                signatureMode === "draw" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Draw
            </button>
            <button
              onClick={() => setSignatureMode("upload")}
              className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${
                signatureMode === "upload" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Upload
            </button>
          </div>

          {/* Draw mode */}
          {signatureMode === "draw" && (
            <div className="space-y-2">
              <Label>Draw your signature below</Label>
              <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
              {signatureDataUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSignatureDataUrl(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          )}

          {/* Upload mode */}
          {signatureMode === "upload" && (
            <div className="space-y-2">
              <Label>Upload signature image (PNG, JPG, etc.)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      setSignatureDataUrl(event.target?.result as string)
                    }
                    reader.readAsDataURL(file)
                  }
                }}
                className="cursor-pointer"
              />
              {signatureDataUrl && (
                <div className="mt-3 p-3 bg-gray-50 border rounded">
                  <img src={signatureDataUrl} alt="Signature preview" className="max-h-20 max-w-full" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSignatureDataUrl(null)}
                    className="mt-2"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {signatureDataUrl && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-700 font-medium mb-2">Preview:</p>
              <div className="bg-white p-2 border rounded">
                <img src={signatureDataUrl} alt="Signature preview" className="max-h-16 max-w-full" />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSignature}
            disabled={isSaving || !signatureDataUrl}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? "Saving..." : "Save Signature"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
