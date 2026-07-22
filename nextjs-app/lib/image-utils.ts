/**
 * Utility functions for handling client-side image compression and watermarking
 * Adapted from the original anunciar.js logic
 */

export const MAX_IMAGE_SIZE = 1280
export const JPEG_QUALITY = 0.82

export async function compressAndWatermarkImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calculate aspect ratio and resize if needed
        if (width > height && width > MAX_IMAGE_SIZE) {
          height = Math.round((height * MAX_IMAGE_SIZE) / width)
          width = MAX_IMAGE_SIZE
        } else if (height > width && height > MAX_IMAGE_SIZE) {
          width = Math.round((width * MAX_IMAGE_SIZE) / height)
          height = MAX_IMAGE_SIZE
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return reject(new Error('Failed to get canvas context'))
        }

        // Fill background for transparency
        if (file.type !== 'image/png') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
        }

        // Draw image
        ctx.drawImage(img, 0, 0, width, height)

        // Draw Watermark
        const wmText = "Tauze Class"
        const wmSize = Math.max(14, Math.floor(width * 0.035))
        ctx.font = `800 ${wmSize}px 'Sora', sans-serif`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        
        // Shadow/glow for visibility
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1
        
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        const pad = Math.max(10, Math.floor(width * 0.02))
        ctx.fillText(wmText, width - pad, height - pad)

        // Reset shadow
        ctx.shadowColor = 'transparent'

        // Export to Blob
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const quality = outputType === 'image/jpeg' ? JPEG_QUALITY : undefined

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas to Blob conversion failed'))
          },
          outputType,
          quality
        )
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}
