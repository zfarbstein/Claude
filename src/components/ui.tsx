import { LoaderCircle } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cx } from '../lib/cx'

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cx('animate-spin', className ?? 'size-5')} />
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  busy?: boolean
  block?: boolean
}

export function Button({ variant = 'primary', busy, block, className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-400',
    secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-500',
    danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-400',
    ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-500',
  }[variant]
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed',
        styles,
        block && 'w-full',
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
}

function FieldShell({ id, label, hint, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass =
  'min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/30 disabled:bg-slate-100'

export function TextField({ label, hint, error, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cx(inputClass, className)}
        {...rest}
      />
    </FieldShell>
  )
}

export function TextArea({ label, hint, error, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea id={id} aria-invalid={!!error || undefined} className={cx(inputClass, 'min-h-24 py-2')} {...rest} />
    </FieldShell>
  )
}

export function Select({ label, hint, error, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select id={id} aria-invalid={!!error || undefined} className={inputClass} {...rest}>
        {children}
      </select>
    </FieldShell>
  )
}

export function Checkbox({
  label,
  description,
  ...rest
}: { label: string; description?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId()
  return (
    <div className="flex min-h-12 items-start gap-3 py-1">
      <input id={id} type="checkbox" className="mt-0.5 size-6 shrink-0 accent-brand-700" {...rest} />
      <label htmlFor={id} className="text-base text-slate-900">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-sm text-slate-600">{description}</span>}
      </label>
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-green-50 text-green-800 ring-green-200',
    info: 'bg-brand-50 text-brand-900 ring-brand-100',
  }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-xl p-3 text-sm ring-1', styles)}>
      {children}
    </div>
  )
}

export function Badge({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span
      style={style}
      className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', className ?? 'bg-slate-100 text-slate-800')}
    >
      {children}
    </span>
  )
}

export function FullScreenMessage({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="max-w-sm text-slate-700">{children}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </main>
  )
}
