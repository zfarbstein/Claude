export function isIos(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS 13+ reports itself as desktop Safari.
  return /Macintosh/i.test(ua) && maxTouchPoints > 1
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}
