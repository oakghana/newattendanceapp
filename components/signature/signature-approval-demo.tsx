"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  CheckCircle2, 
  Clock, 
  FileText, 
  Pen, 
  Shield, 
  Sparkles, 
  User,
  Download,
  Eye,
  AlertCircle,
  ArrowRight,
  Loader2,
  BadgeCheck,
  FileSignature
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface SignerInfo {
  id: string
  name: string
  position: string
  role: string
  email?: string
}

interface SignatureData {
  id?: string
  signature_data_url: string
  signature_image_url?: string
  workflow_domain?: string
  created_at?: string
  updated_at?: string
}

interface DemoMemo {
  id: string
  type: "payment" | "loan" | "leave" | "deferment"
  title: string
  recipient: string
  department: string
  amount?: string
  period?: string
  status: "pending" | "signing" | "signed"
  signedAt?: string
}

export function SignatureApprovalDemo() {
  const { toast } = useToast()
  const [step, setStep] = useState<"intro" | "check" | "preview" | "signing" | "complete">("intro")
  const [isLoading, setIsLoading] = useState(false)
  const [signerInfo, setSignerInfo] = useState<SignerInfo | null>(null)
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [selectedMemo, setSelectedMemo] = useState<DemoMemo | null>(null)
  const [showMemoPreview, setShowMemoPreview] = useState(false)
  const [demoMemos, setDemoMemos] = useState<DemoMemo[]>([
    {
      id: "demo-1",
      type: "payment",
      title: "Annual Leave Payment Advice",
      recipient: "John Mensah",
      department: "Operations",
      amount: "GHS 4,500.00",
      period: "June 1 - June 14, 2026",
      status: "pending"
    },
    {
      id: "demo-2",
      type: "loan",
      title: "Staff Loan Approval",
      recipient: "Sarah Owusu",
      department: "Finance",
      amount: "GHS 15,000.00",
      period: "12 months repayment",
      status: "pending"
    },
    {
      id: "demo-3",
      type: "leave",
      title: "Leave Application Memo",
      recipient: "Emmanuel Adjei",
      department: "IT",
      period: "July 1 - July 10, 2026",
      status: "pending"
    }
  ])

  // Check for saved signature on component mount
  const checkSavedSignature = async () => {
    setIsLoading(true)
    setStep("check")
    
    try {
      const res = await fetch("/api/signature/auto-populate")
      const data = await res.json()
      
      await new Promise(resolve => setTimeout(resolve, 1500)) // Dramatic pause
      
      if (data.success && data.hasSignature) {
        setSignerInfo(data.signer)
        setSignatureData(data.signature)
        setHasSignature(true)
        toast({
          title: "Signature Found",
          description: "Your saved signature is ready to use for approvals",
        })
      } else {
        setHasSignature(false)
        if (data.signer) {
          setSignerInfo(data.signer)
        }
      }
    } catch (err) {
      console.error("[v0] Error checking signature:", err)
      setHasSignature(false)
    } finally {
      setIsLoading(false)
      setStep("preview")
    }
  }

  // Simulate signing a memo with auto-populated signature
  const signMemo = async (memo: DemoMemo) => {
    if (!signatureData?.signature_data_url) {
      toast({
        title: "Signature Required",
        description: "Please save your signature in Profile > Signature first",
        variant: "destructive"
      })
      return
    }

    setSelectedMemo(memo)
    setStep("signing")

    // Update memo status to signing
    setDemoMemos(prev => prev.map(m => 
      m.id === memo.id ? { ...m, status: "signing" as const } : m
    ))

    // Simulate signing process
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Update memo status to signed
    setDemoMemos(prev => prev.map(m => 
      m.id === memo.id 
        ? { ...m, status: "signed" as const, signedAt: new Date().toISOString() } 
        : m
    ))

    setStep("complete")
    
    toast({
      title: "Document Signed Successfully",
      description: `${memo.title} has been signed with your auto-populated signature`,
    })
  }

  // Reset demo
  const resetDemo = () => {
    setStep("intro")
    setSelectedMemo(null)
    setDemoMemos(prev => prev.map(m => ({ ...m, status: "pending" as const, signedAt: undefined })))
  }

  const signedCount = demoMemos.filter(m => m.status === "signed").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            Auto-Populated Signatures
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            HR Signature Approval Demo
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Experience how your saved signature automatically populates when approving payment memos, 
            loan applications, and leave requests. No need to re-draw or upload each time.
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2 md:gap-4"
        >
          {["Check Signature", "Preview Documents", "Sign & Approve"].map((label, index) => {
            const stepIndex = index + 1
            const isActive = 
              (stepIndex === 1 && (step === "intro" || step === "check")) ||
              (stepIndex === 2 && step === "preview") ||
              (stepIndex === 3 && (step === "signing" || step === "complete"))
            const isCompleted = 
              (stepIndex === 1 && step !== "intro" && step !== "check") ||
              (stepIndex === 2 && (step === "signing" || step === "complete")) ||
              (stepIndex === 3 && step === "complete")
            
            return (
              <div key={label} className="flex items-center gap-2 md:gap-4">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium transition-all ${
                  isCompleted 
                    ? "bg-primary text-primary-foreground" 
                    : isActive 
                      ? "bg-primary/20 text-primary border border-primary/30" 
                      : "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <span className="w-4 text-center">{stepIndex}</span>
                  )}
                  <span className="hidden md:inline">{label}</span>
                </div>
                {index < 2 && (
                  <ArrowRight className={`h-4 w-4 ${isCompleted ? "text-primary" : "text-muted-foreground/40"}`} />
                )}
              </div>
            )
          })}
        </motion.div>

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {/* Intro Step */}
          {step === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center gap-6"
            >
              <Card className="w-full max-w-lg border-2 border-dashed border-primary/30 bg-primary/5">
                <CardContent className="flex flex-col items-center gap-4 p-8">
                  <div className="rounded-full bg-primary/10 p-4">
                    <FileSignature className="h-10 w-10 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Ready to Start the Demo?
                  </h2>
                  <p className="text-center text-muted-foreground">
                    We will check if you have a saved signature, then show you how it 
                    automatically appears when approving documents.
                  </p>
                  <Button 
                    size="lg" 
                    className="mt-4 gap-2"
                    onClick={checkSavedSignature}
                  >
                    Start Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                {[
                  { icon: Shield, title: "Secure", desc: "Signatures stored safely in your profile" },
                  { icon: Sparkles, title: "Automatic", desc: "Auto-populates on all documents" },
                  { icon: Clock, title: "Fast", desc: "Sign documents in one click" },
                ].map((feature, i) => (
                  <Card key={i} className="border-border/50 bg-card/50">
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <feature.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground">{feature.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* Checking Signature Step */}
          {step === "check" && (
            <motion.div
              key="check"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6"
            >
              <Card className="w-full max-w-lg">
                <CardContent className="flex flex-col items-center gap-4 p-8">
                  <div className="relative">
                    <div className="rounded-full bg-primary/10 p-4">
                      <User className="h-10 w-10 text-primary" />
                    </div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute -inset-2 rounded-full border-2 border-dashed border-primary/30"
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Checking Your Profile...
                  </h2>
                  <p className="text-center text-muted-foreground">
                    Looking for your saved signature in the system
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching signature data...
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Preview Documents Step */}
          {step === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Signature Status Card */}
              <Card className={`border-2 ${hasSignature ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {hasSignature ? (
                        <div className="rounded-full bg-primary/20 p-3">
                          <BadgeCheck className="h-8 w-8 text-primary" />
                        </div>
                      ) : (
                        <div className="rounded-full bg-destructive/20 p-3">
                          <AlertCircle className="h-8 w-8 text-destructive" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {hasSignature ? "Signature Ready" : "No Signature Found"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {hasSignature 
                            ? `Signed as ${signerInfo?.name || "HR Executive"} - ${signerInfo?.position || "HR"}`
                            : "Please save your signature in Profile > Signature first"
                          }
                        </p>
                      </div>
                    </div>
                    
                    {hasSignature && signatureData?.signature_data_url && (
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg border-2 border-primary/20 bg-white p-2">
                          <img 
                            src={signatureData.signature_data_url} 
                            alt="Your signature" 
                            className="h-12 w-auto max-w-[150px] object-contain"
                          />
                        </div>
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Auto-populate enabled
                        </Badge>
                      </div>
                    )}
                    
                    {!hasSignature && (
                      <Button 
                        variant="outline" 
                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => window.open("/profile?tab=signature", "_blank")}
                      >
                        <Pen className="mr-2 h-4 w-4" />
                        Save Signature
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Documents Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-foreground">
                    Documents Awaiting Approval
                  </h2>
                  <Badge variant="outline" className="gap-1">
                    {signedCount}/{demoMemos.length} Signed
                  </Badge>
                </div>

                <div className="grid gap-4">
                  {demoMemos.map((memo, index) => (
                    <motion.div
                      key={memo.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className={`transition-all hover:shadow-md ${
                        memo.status === "signed" 
                          ? "border-primary/30 bg-primary/5" 
                          : memo.status === "signing"
                            ? "border-accent/50 bg-accent/5"
                            : "border-border"
                      }`}>
                        <CardContent className="p-4 md:p-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className={`rounded-lg p-2.5 ${
                                memo.type === "payment" 
                                  ? "bg-green-100 text-green-700" 
                                  : memo.type === "loan"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-blue-100 text-blue-700"
                              }`}>
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-foreground">
                                    {memo.title}
                                  </h3>
                                  <Badge variant={
                                    memo.status === "signed" 
                                      ? "default" 
                                      : memo.status === "signing"
                                        ? "secondary"
                                        : "outline"
                                  } className="text-xs">
                                    {memo.status === "signed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                                    {memo.status === "signing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                    {memo.status.charAt(0).toUpperCase() + memo.status.slice(1)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium">{memo.recipient}</span> - {memo.department}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {memo.amount && (
                                    <span className="rounded bg-muted px-2 py-0.5">{memo.amount}</span>
                                  )}
                                  {memo.period && (
                                    <span className="rounded bg-muted px-2 py-0.5">{memo.period}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedMemo(memo)
                                  setShowMemoPreview(true)
                                }}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                Preview
                              </Button>
                              
                              {memo.status === "pending" && (
                                <Button 
                                  size="sm"
                                  disabled={!hasSignature}
                                  onClick={() => signMemo(memo)}
                                >
                                  <Pen className="mr-1.5 h-3.5 w-3.5" />
                                  Sign & Approve
                                </Button>
                              )}
                              
                              {memo.status === "signed" && (
                                <Button variant="secondary" size="sm">
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  Download PDF
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Show signature after signed */}
                          {memo.status === "signed" && signatureData?.signature_data_url && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-4 pt-4 border-t border-primary/20"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="bg-white rounded border border-primary/20 p-1.5">
                                    <img 
                                      src={signatureData.signature_data_url} 
                                      alt="Applied signature" 
                                      className="h-8 w-auto max-w-[100px] object-contain"
                                    />
                                  </div>
                                  <div className="text-xs">
                                    <p className="font-medium text-foreground">{signerInfo?.name}</p>
                                    <p className="text-muted-foreground">{signerInfo?.position}</p>
                                  </div>
                                </div>
                                <Badge variant="default" className="bg-primary/90 text-xs">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Auto-populated
                                </Badge>
                              </div>
                            </motion.div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Reset Button */}
              {signedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center pt-4"
                >
                  <Button variant="outline" onClick={resetDemo}>
                    Reset Demo
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Signing Animation Step */}
          {step === "signing" && selectedMemo && (
            <motion.div
              key="signing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6"
            >
              <Card className="w-full max-w-lg border-2 border-accent/30 bg-accent/5">
                <CardContent className="flex flex-col items-center gap-6 p-8">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="relative"
                  >
                    <div className="rounded-full bg-accent/20 p-6">
                      <Pen className="h-12 w-12 text-accent" />
                    </div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 rounded-full border-4 border-dashed border-accent/30"
                    />
                  </motion.div>
                  
                  <h2 className="text-xl font-semibold text-foreground">
                    Applying Your Signature...
                  </h2>
                  <p className="text-center text-muted-foreground">
                    Auto-populating your saved signature on the document
                  </p>
                  
                  {signatureData?.signature_data_url && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border-2 border-accent/30 bg-white p-3"
                    >
                      <img 
                        src={signatureData.signature_data_url} 
                        alt="Your signature being applied" 
                        className="h-16 w-auto max-w-[200px] object-contain"
                      />
                    </motion.div>
                  )}
                  
                  <div className="flex items-center gap-2 text-sm text-accent">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing approval...
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Complete Step */}
          {step === "complete" && selectedMemo && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-6"
            >
              <Card className="w-full max-w-lg border-2 border-primary/30 bg-primary/5">
                <CardContent className="flex flex-col items-center gap-6 p-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="rounded-full bg-primary/20 p-6"
                  >
                    <CheckCircle2 className="h-12 w-12 text-primary" />
                  </motion.div>
                  
                  <h2 className="text-xl font-semibold text-foreground">
                    Document Signed Successfully
                  </h2>
                  
                  <div className="text-center space-y-2">
                    <p className="font-medium text-foreground">{selectedMemo.title}</p>
                    <p className="text-sm text-muted-foreground">
                      for {selectedMemo.recipient}
                    </p>
                  </div>
                  
                  {signatureData?.signature_data_url && (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground">Applied Signature</p>
                      <div className="rounded-lg border-2 border-primary/20 bg-white p-3">
                        <img 
                          src={signatureData.signature_data_url} 
                          alt="Applied signature" 
                          className="h-14 w-auto max-w-[180px] object-contain mx-auto"
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {signerInfo?.name} - {signerInfo?.position}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => setStep("preview")}>
                      View All Documents
                    </Button>
                    <Button onClick={resetDemo}>
                      Reset Demo
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Success Notification */}
              <Alert className="max-w-lg border-primary/30 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary">How Auto-Population Works</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Your signature was fetched from your profile and automatically applied to the document. 
                  This same signature will be used for all future approvals - no need to re-draw or upload each time.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Memo Preview Dialog */}
        <Dialog open={showMemoPreview} onOpenChange={setShowMemoPreview}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedMemo?.title}</DialogTitle>
              <DialogDescription>
                Preview of the memo document
              </DialogDescription>
            </DialogHeader>
            
            {selectedMemo && (
              <div className="space-y-4">
                {/* Mock Memo Preview */}
                <div className="rounded-lg border bg-white p-6 space-y-4 font-serif text-sm">
                  <div className="text-center border-b pb-4">
                    <h3 className="text-lg font-bold uppercase">QCC Ghana Limited</h3>
                    <p className="text-xs text-muted-foreground">Internal Memorandum</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="font-bold">TO:</span> Accounts Department</div>
                    <div><span className="font-bold">DATE:</span> {new Date().toLocaleDateString()}</div>
                    <div><span className="font-bold">FROM:</span> HR Department</div>
                    <div><span className="font-bold">REF:</span> {selectedMemo.type.toUpperCase()}/2026/001</div>
                  </div>
                  
                  <div className="border-t border-b py-2">
                    <p className="font-bold text-center">{selectedMemo.title.toUpperCase()}</p>
                  </div>
                  
                  <p>
                    This is to confirm that <strong>{selectedMemo.recipient}</strong> from the{" "}
                    <strong>{selectedMemo.department}</strong> department is entitled to the following:
                  </p>
                  
                  {selectedMemo.amount && (
                    <p>Amount: <strong>{selectedMemo.amount}</strong></p>
                  )}
                  {selectedMemo.period && (
                    <p>Period: <strong>{selectedMemo.period}</strong></p>
                  )}
                  
                  <p>Kindly process accordingly.</p>
                  
                  {/* Signature Area */}
                  <div className="pt-8 space-y-1">
                    {selectedMemo.status === "signed" && signatureData?.signature_data_url ? (
                      <div className="inline-block">
                        <img 
                          src={signatureData.signature_data_url} 
                          alt="Signature" 
                          className="h-12 w-auto max-w-[150px] object-contain"
                        />
                        <div className="border-t border-foreground/30 pt-1">
                          <p className="font-bold">{signerInfo?.name}</p>
                          <p className="text-xs text-muted-foreground">{signerInfo?.position}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="inline-block">
                        <div className="h-12 w-32 border-b-2 border-dashed border-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground pt-1">Signature pending...</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowMemoPreview(false)}>
                    Close
                  </Button>
                  {selectedMemo.status === "pending" && hasSignature && (
                    <Button onClick={() => {
                      setShowMemoPreview(false)
                      signMemo(selectedMemo)
                    }}>
                      <Pen className="mr-1.5 h-4 w-4" />
                      Sign Now
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
