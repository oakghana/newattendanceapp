import { describe, expect, it } from "vitest"
import { calculateDarkPixelBounds, isolateSignatureInk } from "../lib/process-signature-image"
import { getSignatureHologramText } from "../lib/signature-hologram"

describe("signature hologram text", () => {
  it("uses the transport-only watermark on transport requests", () => {
    expect(getSignatureHologramText("transport")).toBe("QCCTRANSPORT")
  })

  it("uses the general intranet watermark on all other signatures", () => {
    expect(getSignatureHologramText("general")).toBe("QCCINTRANET")
    expect(getSignatureHologramText()).toBe("QCCINTRANET")
  })

  it("computes dark-pixel bounds without overflowing large signature scans", () => {
    const largePixels = Array.from({ length: 250000 }, (_, index) => ({
      x: index % 500,
      y: Math.floor(index / 500),
    }))

    const bounds = calculateDarkPixelBounds(largePixels)

    expect(bounds.minX).toBe(0)
    expect(bounds.minY).toBe(0)
    expect(bounds.maxX).toBe(499)
    expect(bounds.maxY).toBe(499)
  })

  it("removes dark scanned paper and strengthens signature ink", () => {
    const width = 80
    const height = 40
    const source = new Uint8ClampedArray(width * height * 4)

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const shade = 72 + Math.floor((pixel % width) / 8)
      source[pixel * 4] = shade
      source[pixel * 4 + 1] = shade
      source[pixel * 4 + 2] = shade
      source[pixel * 4 + 3] = 255
    }
    for (let x = 22; x <= 58; x += 1) {
      const index = (20 * width + x) * 4
      source[index] = 18
      source[index + 1] = 18
      source[index + 2] = 18
    }

    const result = isolateSignatureInk(source, width, height)
    const backgroundIndex = (5 * width + 5) * 4
    const signatureIndex = (20 * width + 40) * 4

    expect(result.pixels[backgroundIndex]).toBe(255)
    expect(result.pixels[signatureIndex]).toBeLessThan(50)
    expect(result.bounds).toMatchObject({ minX: 22, maxX: 58 })
  })

  it("removes dark frame edges without shifting the signature bounds", () => {
    const width = 120
    const height = 60
    const source = new Uint8ClampedArray(width * height * 4)

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      source[pixel * 4] = 190
      source[pixel * 4 + 1] = 190
      source[pixel * 4 + 2] = 190
      source[pixel * 4 + 3] = 255
    }
    for (let x = 4; x < width - 4; x += 1) {
      const index = (4 * width + x) * 4
      source[index] = 15
      source[index + 1] = 15
      source[index + 2] = 15
    }
    for (let y = 4; y < height - 4; y += 1) {
      const index = (y * width + (width - 5)) * 4
      source[index] = 15
      source[index + 1] = 15
      source[index + 2] = 15
    }
    for (let x = 42; x <= 78; x += 1) {
      const y = 30 + Math.round(Math.sin(x / 4) * 5)
      const index = (y * width + x) * 4
      source[index] = 20
      source[index + 1] = 20
      source[index + 2] = 20
    }

    const result = isolateSignatureInk(source, width, height)

    expect(result.bounds?.minX).toBeGreaterThanOrEqual(40)
    expect(result.bounds?.maxX).toBeLessThanOrEqual(80)
    expect(result.bounds?.minY).toBeGreaterThan(20)
  })

  it("removes an internal L-shaped scan frame and keeps only handwriting", () => {
    const width = 140
    const height = 80
    const source = new Uint8ClampedArray(width * height * 4)

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      source[pixel * 4] = 205
      source[pixel * 4 + 1] = 205
      source[pixel * 4 + 2] = 205
      source[pixel * 4 + 3] = 255
    }
    for (let x = 72; x <= 122; x += 1) {
      const index = (14 * width + x) * 4
      source[index] = 10
      source[index + 1] = 10
      source[index + 2] = 10
    }
    for (let y = 14; y <= 68; y += 1) {
      const index = (y * width + 122) * 4
      source[index] = 10
      source[index + 1] = 10
      source[index + 2] = 10
    }
    for (let x = 25; x <= 64; x += 1) {
      const y = 43 + Math.round(Math.sin(x / 3) * 8)
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const index = ((y + offsetY) * width + x) * 4
        source[index] = 15
        source[index + 1] = 15
        source[index + 2] = 15
      }
    }
    for (let y = 62; y <= 64; y += 1) {
      for (let x = 105; x <= 107; x += 1) {
        const index = (y * width + x) * 4
        source[index] = 25
        source[index + 1] = 25
        source[index + 2] = 25
      }
    }

    const result = isolateSignatureInk(source, width, height)
    const strayNoiseIndex = (63 * width + 106) * 4

    expect(result.bounds?.minX).toBeGreaterThanOrEqual(23)
    expect(result.bounds?.maxX).toBeLessThanOrEqual(66)
    expect(result.bounds?.maxY).toBeLessThan(55)
    expect(result.pixels[strayNoiseIndex]).toBe(255)
  })
})
