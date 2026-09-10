"use client"

import { getSignatureHologramText } from "./signature-hologram"

export function calculateDarkPixelBounds(darkPixels: Array<{ x: number; y: number }>) {
  const initial = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  return darkPixels.reduce((bounds, point) => {
    bounds.minX = Math.min(bounds.minX, point.x)
    bounds.minY = Math.min(bounds.minY, point.y)
    bounds.maxX = Math.max(bounds.maxX, point.x)
    bounds.maxY = Math.max(bounds.maxY, point.y)
    return bounds
  }, initial)
}

export function isolateSignatureInk(source: Uint8ClampedArray, width: number, height: number) {
  const luminance = new Uint8Array(width * height)
  const integralWidth = width + 1
  const integral = new Float64Array(integralWidth * (height + 1))

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x
      const sourceIndex = pixelIndex * 4
      const value = Math.round(
        (source[sourceIndex] * 299 + source[sourceIndex + 1] * 587 + source[sourceIndex + 2] * 114) / 1000
      )
      luminance[pixelIndex] = value
      rowSum += value
      integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] + rowSum
    }
  }

  const radius = Math.max(8, Math.min(36, Math.round(Math.min(width, height) / 24)))
  const ignoredEdge = Math.max(2, Math.round(Math.min(width, height) * 0.015))
  const inkStrength = new Uint8Array(width * height)

  for (let y = ignoredEdge; y < height - ignoredEdge; y += 1) {
    for (let x = ignoredEdge; x < width - ignoredEdge; x += 1) {
      const left = Math.max(0, x - radius)
      const top = Math.max(0, y - radius)
      const right = Math.min(width - 1, x + radius)
      const bottom = Math.min(height - 1, y + radius)
      const area = (right - left + 1) * (bottom - top + 1)
      const sum =
        integral[(bottom + 1) * integralWidth + right + 1] -
        integral[top * integralWidth + right + 1] -
        integral[(bottom + 1) * integralWidth + left] +
        integral[top * integralWidth + left]
      const difference = sum / area - luminance[y * width + x]

      if (difference >= 9) {
        inkStrength[y * width + x] = Math.min(255, Math.round(difference))
      }
    }
  }

  const visited = new Uint8Array(width * height)
  const borderZone = Math.max(ignoredEdge, radius)
  const minimumComponentSize = Math.max(3, Math.round(width * height * 0.000002))
  const retainedComponents: Array<{
    pixels: number[]
    minX: number
    minY: number
    maxX: number
    maxY: number
  }> = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x
      if (inkStrength[startIndex] === 0 || visited[startIndex]) continue

      const stack = [startIndex]
      const component: number[] = []
      let minX = x
      let minY = y
      let maxX = x
      let maxY = y

      while (stack.length > 0) {
        const pixelIndex = stack.pop()!
        if (visited[pixelIndex] || inkStrength[pixelIndex] === 0) continue
        visited[pixelIndex] = 1
        component.push(pixelIndex)

        const pixelX = pixelIndex % width
        const pixelY = Math.floor(pixelIndex / width)
        minX = Math.min(minX, pixelX)
        minY = Math.min(minY, pixelY)
        maxX = Math.max(maxX, pixelX)
        maxY = Math.max(maxY, pixelY)

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue
            const nextX = pixelX + offsetX
            const nextY = pixelY + offsetY
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue
            const nextIndex = nextY * width + nextX
            if (!visited[nextIndex] && inkStrength[nextIndex] > 0) stack.push(nextIndex)
          }
        }
      }

      const nearEdge = minX <= borderZone || minY <= borderZone || maxX >= width - borderZone || maxY >= height - borderZone
      const isLargeEdgeArtifact = nearEdge && (maxX - minX > width * 0.12 || maxY - minY > height * 0.12)
      const rowCounts = new Map<number, number>()
      const columnCounts = new Map<number, number>()
      let boundingEdgePixels = 0

      component.forEach((pixelIndex) => {
        const pixelX = pixelIndex % width
        const pixelY = Math.floor(pixelIndex / width)
        rowCounts.set(pixelY, (rowCounts.get(pixelY) ?? 0) + 1)
        columnCounts.set(pixelX, (columnCounts.get(pixelX) ?? 0) + 1)
        if (pixelX <= minX + 1 || pixelX >= maxX - 1 || pixelY <= minY + 1 || pixelY >= maxY - 1) {
          boundingEdgePixels += 1
        }
      })

      const longestRow = Math.max(0, ...rowCounts.values())
      const longestColumn = Math.max(0, ...columnCounts.values())
      const straightLineConcentration = Math.max(longestRow, longestColumn) / component.length
      const boundingEdgeConcentration = boundingEdgePixels / component.length
      const componentWidth = maxX - minX + 1
      const componentHeight = maxY - minY + 1
      const spansBothDirections = componentWidth > width * 0.06 && componentHeight > height * 0.12
      const isFrameLike = spansBothDirections && (straightLineConcentration > 0.22 || boundingEdgeConcentration > 0.42)

      if (component.length < minimumComponentSize || isLargeEdgeArtifact || isFrameLike) {
        component.forEach((pixelIndex) => {
          inkStrength[pixelIndex] = 0
        })
      } else {
        retainedComponents.push({ pixels: component, minX, minY, maxX, maxY })
      }
    }
  }

  const dominantComponent = retainedComponents.reduce<(typeof retainedComponents)[number] | null>(
    (largest, component) => (!largest || component.pixels.length > largest.pixels.length ? component : largest),
    null
  )

  if (dominantComponent) {
    const nearbyLeft = Math.max(0, dominantComponent.minX - width * 0.2)
    const nearbyRight = Math.min(width - 1, dominantComponent.maxX + width * 0.2)
    const nearbyTop = Math.max(0, dominantComponent.minY - height * 0.25)
    const nearbyBottom = Math.min(height - 1, dominantComponent.maxY + height * 0.25)
    const meaningfulSize = Math.max(minimumComponentSize, Math.round(dominantComponent.pixels.length * 0.08))

    retainedComponents.forEach((component) => {
      const isNearby =
        component.maxX >= nearbyLeft &&
        component.minX <= nearbyRight &&
        component.maxY >= nearbyTop &&
        component.minY <= nearbyBottom
      if (component.pixels.length < meaningfulSize && !isNearby) {
        component.pixels.forEach((pixelIndex) => {
          inkStrength[pixelIndex] = 0
        })
      }
    })
  }

  const output = new Uint8ClampedArray(source.length)
  output.fill(255)
  const inkPixels: Array<{ x: number; y: number }> = []

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const strength = inkStrength[y * width + x]
      if (strength === 0) continue

      const inkValue = Math.max(0, Math.min(48, 58 - strength * 2))
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const outputX = x + offsetX
          const outputY = y + offsetY
          const outputIndex = (outputY * width + outputX) * 4
          output[outputIndex] = Math.min(output[outputIndex], inkValue)
          output[outputIndex + 1] = Math.min(output[outputIndex + 1], inkValue)
          output[outputIndex + 2] = Math.min(output[outputIndex + 2], inkValue)
          output[outputIndex + 3] = 255
        }
      }
      inkPixels.push({ x, y })
    }
  }

  return { pixels: output, bounds: inkPixels.length > 0 ? calculateDarkPixelBounds(inkPixels) : null }
}

/**
 * Normalize a scanned signature into a crisp, high-contrast image on a white
 * background so it can sit cleanly under a hologram watermark without the dark
 * scan border showing through.
 */
export function processSignatureImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Unable to read the signature image."))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error("Unable to decode the signature image."))
      image.onload = () => {
        const canvas = document.createElement("canvas")
        const maxDimension = 2000
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) return reject(new Error("Your browser cannot process this image."))

        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const { width, height } = canvas
        const isolated = isolateSignatureInk(imageData.data, width, height)

        if (!isolated.bounds) {
          return reject(new Error("No visible signature was detected. Use a darker, clearer scan."))
        }
        const { minX, minY, maxX, maxY } = isolated.bounds
        const padding = Math.max(12, Math.round(Math.max(maxX - minX, maxY - minY) * 0.08))
        const cropX = Math.max(0, minX - padding)
        const cropY = Math.max(0, minY - padding)
        const cropRight = Math.min(width, maxX + padding + 1)
        const cropBottom = Math.min(height, maxY + padding + 1)

        context.putImageData(new ImageData(isolated.pixels, width, height), 0, 0)

        const targetCanvas = document.createElement("canvas")
        targetCanvas.width = Math.max(1, cropRight - cropX)
        targetCanvas.height = Math.max(1, cropBottom - cropY)
        const targetContext = targetCanvas.getContext("2d")
        if (!targetContext) return reject(new Error("Your browser cannot process this image."))

        targetContext.fillStyle = "#ffffff"
        targetContext.fillRect(0, 0, targetCanvas.width, targetCanvas.height)
        targetContext.drawImage(canvas, cropX, cropY, targetCanvas.width, targetCanvas.height, 0, 0, targetCanvas.width, targetCanvas.height)

        const cleanCanvas = document.createElement("canvas")
        cleanCanvas.width = 720
        cleanCanvas.height = 240
        const cleanContext = cleanCanvas.getContext("2d")
        if (!cleanContext) return reject(new Error("Your browser cannot process this image."))

        cleanContext.fillStyle = "#ffffff"
        cleanContext.fillRect(0, 0, cleanCanvas.width, cleanCanvas.height)
        const fitScale = Math.min(640 / targetCanvas.width, 170 / targetCanvas.height)
        const drawWidth = Math.max(1, Math.round(targetCanvas.width * fitScale))
        const drawHeight = Math.max(1, Math.round(targetCanvas.height * fitScale))
        const drawX = Math.round((cleanCanvas.width - drawWidth) / 2)
        const drawY = Math.round((cleanCanvas.height - drawHeight) / 2)
        cleanContext.drawImage(targetCanvas, drawX, drawY, drawWidth, drawHeight)

        cleanContext.save()
        cleanContext.globalAlpha = 0.52
        cleanContext.fillStyle = "#0f766e"
        cleanContext.font = "bold 30px monospace"
        cleanContext.textAlign = "center"
        cleanContext.textBaseline = "middle"
        cleanContext.translate(cleanCanvas.width * 0.52, cleanCanvas.height * 0.64)
        cleanContext.rotate((-14 * Math.PI) / 180)
        cleanContext.fillText(getSignatureHologramText("general"), 0, 0)
        cleanContext.restore()
        resolve(cleanCanvas.toDataURL("image/png"))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
