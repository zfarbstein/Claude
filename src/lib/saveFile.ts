interface DownloadsApi {
  save(request: { filename: string; data: Blob }): Promise<{ status: string }>
}

/** Hands a generated file to the person. Returns false if they declined (demo preview only). */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (import.meta.env.VITE_DEMO) {
    // The in-Claude preview can't start downloads itself; the page asks the viewer instead.
    const downloads = (await window.claude?.use('downloads').catch(() => null)) as DownloadsApi | null
    if (!downloads) throw new Error('Downloads aren’t available in this preview.')
    try {
      await downloads.save({ filename, data: blob })
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') return false
      throw new Error((e as { message?: string }).message ?? 'Download failed.')
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return true
}
