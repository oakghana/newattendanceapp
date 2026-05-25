"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, AlertTriangle } from "lucide-react"
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
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [mode, setMode] = useState<"draw" | "upload">("draw")

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
      const payload: any = {
        signature_data: signatureData || undefined,
      }

      if (uploadedImage) {
        const reader = new FileReader()
        reader.onload = async (e) => {
          payload.signature_data = e.target?.result as string
          
          const res = await fetch("/api/user/hr-signature-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })

          if (!res.ok) throw new Error("Failed to save signature")

          toast({
            title: "Signature saved",
            description: "Your signature has been saved and will appear on all payment advice memos",
          })
          setSignatureData(null)
          setUploadedImage(null)
          onOpenChange(false)
          onSignatureSaved()
        }
        reader.readAsDataURL(uploadedImage)
      } else {
        const res = await fetch("/api/user/hr-signature-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error("Failed to save signature")

        toast({
          title: "Signature saved",
          description: "Your signature has been saved and will appear on all payment advice memos",
        })
        setSignatureData(null)
        setUploadedImage(null)
        onOpenChange(false)
        onSignatureSaved()
      }
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
              onSignatureChange={setSignatureData}
              onClear={() => setSignatureData(null)}
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
      </DialogContent>
    </Dialog>
  )
}
