"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { SignaturePad } from "@/components/leave/signature-pad"
import { useToast } from "@/hooks/use-toast"

interface SignatureRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hrName: string
  onSignatureSaved: () => void
  onSkip?: () => void
}

export function SignatureRequiredDialog({
  open,
  onOpenChange,
  hrName,
  onSignatureSaved,
  onSkip,
}: SignatureRequiredDialogProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [existingSignature, setExistingSignature] = useState<string | null>(null)
  const [mode, setMode] = useState<"draw" | "upload">("draw")

  // Auto-fetch existing signature when dialog opens
  useEffect(() => {
    if (open) {
      fetchExistingSignature()
    }
  }, [open])

  const fetchExistingSignature = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/user/signature-save", { method: "GET" })
      if (res.ok) {
        const data = await res.json()
        if (data.signature?.signature_data_url) {
          setExistingSignature(data.signature.signature_data_url)
        }
      }
    } catch (err) {
      console.error("[v0] Error fetching existing signature:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // If user has existing signature, auto-proceed (smart feature)
  useEffect(() => {
    if (existingSignature && open) {
      console.log("[v0] Smart signature feature: Found saved signature, auto-approving without dialog")
      // Auto-proceed with existing signature without showing dialog
      setTimeout(() => {
        handleUseExistingSignature()
      }, 500)
    }
  }, [existingSignature, open])

  const handleUseExistingSignature = () => {
    toast({
      title: "Using your saved signature",
      description: "Your existing signature will be used for this approval.",
    })
    onOpenChange(false)
    onSignatureSaved()
  }

  const handleSaveSignature = async () => {
    if (!signatureData && !uploadedImage) {
      toast({
        title: "No signature provided",
        description: "Please draw or upload a signature before saving",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      let finalSignatureData = signatureData

      // If uploaded image, convert to data URL first
      if (uploadedImage && !finalSignatureData) {
        finalSignatureData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(new Error("Failed to read image"))
          reader.readAsDataURL(uploadedImage)
        })
      }

      if (!finalSignatureData) {
        throw new Error("No signature data to save")
      }

      // Use the working signature-save endpoint that uploads to Vercel Blob
      const payload = {
        signature_data_url: finalSignatureData,
      }

      const res = await fetch("/api/user/signature-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save signature")
      }

      toast({
        title: "Signature saved",
        description: "Your signature has been saved and will appear on all payment advice memos",
      })
      setSignatureData(null)
      setUploadedImage(null)
      setExistingSignature(data.signature?.signature_data_url || null)
      onOpenChange(false)
      onSignatureSaved()
    } catch (error) {
      console.error("[v0] Error saving signature:", error)
      toast({
        title: "Error saving signature",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setUploadedImage(e.target.files[0])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Your Signature</DialogTitle>
          <DialogDescription>
            Your signature is required on all payment advice memos. Add it now to proceed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Checking for saved signature...</span>
          </div>
        ) : existingSignature ? (
          // Show existing signature with option to use or update
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                You have a saved signature. You can use it or create a new one.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg p-4 bg-gray-50">
              <p className="text-sm text-gray-600 mb-2">Your saved signature:</p>
              <img 
                src={existingSignature} 
                alt="Your saved signature" 
                className="max-h-24 mx-auto border rounded bg-white p-2"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setExistingSignature(null)}
              >
                Create New
              </Button>
              <Button
                onClick={handleUseExistingSignature}
                className="bg-green-600 hover:bg-green-700"
              >
                Use This Signature
              </Button>
            </div>
          </div>
        ) : (
          // Show signature creation UI
          <>
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Payment advice memos will not display professionally without your signature. Please add it now.
              </AlertDescription>
            </Alert>

            <Tabs value={mode} onValueChange={(v) => setMode(v as "draw" | "upload")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="draw">Draw</TabsTrigger>
                <TabsTrigger value="upload">Upload</TabsTrigger>
              </TabsList>

              <TabsContent value="draw" className="mt-4">
                <SignaturePad
                  onChange={setSignatureData}
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <div className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadChange}
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                  />
                  {uploadedImage && (
                    <p className="text-sm text-slate-600">
                      Selected: {uploadedImage.name}
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 justify-end pt-4">
              {onSkip && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false)
                    onSkip()
                  }}
                >
                  Skip for now
                </Button>
              )}
              <Button
                onClick={handleSaveSignature}
                disabled={isSaving || (!signatureData && !uploadedImage)}
                className="min-w-[100px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Signature"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
