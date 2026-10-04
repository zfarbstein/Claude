import { useCallback, useState } from 'react'

/** useState persisted to localStorage (per device). Falls back to memory in private mode. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // ignore quota / private mode
      }
    },
    [key],
  )
  return [value, set]
}
