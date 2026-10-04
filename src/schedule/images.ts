/** Shrinks a photo/screenshot to a JPEG (max 2000px on the long side) and strips its metadata. */
export async function toJpeg(file: File, maxSide = 2000): Promise<Blob> {
  const source = await decode(file)
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t process photos.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t process that photo.'))), 'image/jpeg', 0.85),
  )
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } catch {
      throw new Error('That photo format isn’t supported. Take a screenshot (PNG or JPEG) instead.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
