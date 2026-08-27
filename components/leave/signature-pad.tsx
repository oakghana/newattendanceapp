"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

interface SignaturePadProps {
  value?: string | null
  onChange: (dataUrl: string | null) => void
}

export function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hologram] = useState("QCC-LOANLEAVE-APP")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const cssWidth = canvas.clientWidth || 420
    const cssHeight = 140
    canvas.width = Math.floor(cssWidth * ratio)
    canvas.height = Math.floor(cssHeight * ratio)

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    if (value) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, cssWidth, cssHeight)
        drawHologramOverlay(ctx, cssWidth, cssHeight, hologram)
      }
      img.src = value
    } else {
      drawHologramOverlay(ctx, cssWidth, cssHeight, hologram)
    }
  }, [value, hologram])

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    drawingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const { x, y } = getPoint(event)
    lastPointRef.current = { x, y }
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (!drawingRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const { x, y } = getPoint(event)
    const prev = lastPointRef.current || { x, y }

    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111827"
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(x, y)
    ctx.stroke()

    lastPointRef.current = { x, y }
  }

  const endDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (!drawingRef.current) return

    drawingRef.current = false
    lastPointRef.current = null

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    drawHologramOverlay(ctx, canvas.clientWidth || 420, 140, hologram)
    onChange(canvas.toDataURL("image/png"))
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.clientWidth || 420, 140)
    drawHologramOverlay(ctx, canvas.clientWidth || 420, 140, hologram)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Hologram: {hologram}</div>
      <canvas
        ref={canvasRef}
        className="h-[140px] w-full rounded border bg-white touch-none"
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerCancel={endDraw}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span />
        <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
          Clear Signature
        </Button>
      </div>
    </div>
  )
}

function drawHologramOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, hologram: string) {
  ctx.save()
  // Keep the hologram visibly embedded in every signature to deter reuse while preserving the signer’s mark.
  ctx.globalAlpha = 0.22
  ctx.fillStyle = "#0284c7"
  ctx.font = "bold 15px monospace"
  ctx.translate(width * 0.62, height * 0.72)
  ctx.rotate((-18 * Math.PI) / 180)
  ctx.fillText(hologram, 0, 0)
  ctx.restore()
}
