"use client"

/** Convert a scanned signature into a tightly cropped transparent PNG. */
export function processSignatureImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Unable to read the signature image."))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error("Unable to decode the signature image."))
      image.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) return reject(new Error("Your browser cannot process this image."))
        context.drawImage(image, 0, 0)

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const pixels = imageData.data
        let minX = canvas.width
        let minY = canvas.height
        let maxX = -1
        let maxY = -1

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]
          const alpha = pixels[index + 3]
          const darkness = 255 - Math.max(red, green, blue)
          // Remove white paper while retaining anti-aliased ink edges.
          if (alpha > 0 && darkness > 18) {
            const pixel = index / 4
            const x = pixel % canvas.width
            const y = Math.floor(pixel / canvas.width)
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
            pixels[index + 3] = Math.min(255, Math.round(darkness * 1.8))
          } else {
            pixels[index + 3] = 0
          }
        }

        if (maxX < 0 || maxY < 0) return reject(new Error("No visible signature was detected. Use a darker, clearer scan."))
        context.putImageData(imageData, 0, 0)

        const padding = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.04))
        const cropX = Math.max(0, minX - padding)
        const cropY = Math.max(0, minY - padding)
        const cropRight = Math.min(canvas.width, maxX + padding + 1)
        const cropBottom = Math.min(canvas.height, maxY + padding + 1)
        const cropped = document.createElement("canvas")
        cropped.width = cropRight - cropX
        cropped.height = cropBottom - cropY
        cropped.getContext("2d")?.drawImage(canvas, cropX, cropY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
        resolve(cropped.toDataURL("image/png"))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
