// Demo build only: the demo has no service worker, so there is never an update to offer.
export function useRegisterSW(_options?: unknown) {
  return {
    needRefresh: [false, () => undefined] as const,
    offlineReady: [false, () => undefined] as const,
    updateServiceWorker: async (_reload?: boolean) => undefined,
  }
}
