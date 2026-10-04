import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Bottom sheet on phones, centered dialog on wider screens. Native <dialog> gives focus trapping and Esc. */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-white p-0 text-slate-900 shadow-2xl sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[85dvh]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 id={titleId} className="pt-2 text-lg font-bold leading-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-12 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
            >
              <X aria-hidden className="size-6" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && <div className="border-t border-slate-200 px-4 pt-3 pb-safe-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
