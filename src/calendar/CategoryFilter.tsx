import { Check } from 'lucide-react'
import type { Category } from '../lib/types'
import { textColorOn } from '../lib/categories'

/** Legend + per-category visibility toggles. */
export function CategoryFilter({
  categories,
  hidden,
  onChange,
}: {
  categories: Category[]
  hidden: string[]
  onChange: (hidden: string[]) => void
}) {
  const toggle = (key: string) => onChange(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key])
  return (
    <div role="group" aria-label="Show categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {categories.map((c) => {
        const on = !hidden.includes(c.key)
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(c.key)}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-bold tracking-wide uppercase"
            style={
              on
                ? { backgroundColor: c.color, borderColor: c.color, color: textColorOn(c.color) }
                : { backgroundColor: '#fff', borderColor: c.color, color: '#334155' }
            }
          >
            {on ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
            )}
            {c.label}
          </button>
        )
      })}
    </div>
  )
}
