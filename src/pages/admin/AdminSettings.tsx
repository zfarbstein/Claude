import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { calendarKeys, useCategories } from '../../calendar/api'
import { useToast } from '../../components/Toast'
import { Alert, Button, Checkbox, Select, TextField } from '../../components/ui'
import { contrastRatio } from '../../lib/categories'
import { cal } from '../../lib/supabase'
import type { Category, Settings } from '../../lib/types'
import { settingsKey, useSettings } from '../../lib/useSettings'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AdminSettings() {
  const settings = useSettings()
  const categories = useCategories()
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-4">
      {settings.isError && <Alert>{settings.error.message}</Alert>}
      {settings.data && <SettingsForm key={settings.data.updated_at} settings={settings.data} />}
      {categories.data && <CategoryColors categories={categories.data} />}
    </main>
  )
}

function SettingsForm({ settings }: { settings: Settings }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    night_start: settings.night_start.slice(0, 5),
    night_end: settings.night_end.slice(0, 5),
    secretary_email: settings.secretary_email ?? '',
    excuses_enabled: settings.excuses_enabled,
    excuse_attachment_required: settings.excuse_attachment_required,
    reminders_enabled: settings.reminders_enabled,
    weekly_reminder_enabled: settings.weekly_reminder_enabled,
    weekly_reminder_dow: settings.weekly_reminder_dow,
    weekly_reminder_time: settings.weekly_reminder_time.slice(0, 5),
    email_fallback: settings.email_fallback,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.night_start === form.night_end) return setError('The night must end at a different time than it starts.')
    const email = form.secretary_email.trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('Enter a valid secretary email.')
    setBusy(true)
    const { error } = await cal
      .from('settings')
      .update({ ...form, secretary_email: email || null })
      .eq('id', true)
    setBusy(false)
    if (error) return setError(error.message)
    toast('Settings saved')
    void qc.invalidateQueries({ queryKey: settingsKey })
    void qc.invalidateQueries({ queryKey: ['availability'] })
  }

  return (
    <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5" noValidate>
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="nights-title">
        <h2 id="nights-title" className="text-lg font-bold">
          Availability nights
        </h2>
        <p className="text-sm text-slate-700">Members count as busy on a night if anything on their schedule overlaps these hours.</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Night starts" type="time" value={form.night_start} onChange={(e) => set('night_start', e.target.value)} />
          <TextField label="Night ends" type="time" value={form.night_end} onChange={(e) => set('night_end', e.target.value)} hint="Can be after midnight" />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="excuse-title">
        <h2 id="excuse-title" className="text-lg font-bold">
          Excuses
        </h2>
        <TextField
          label="Secretary email"
          type="email"
          value={form.secretary_email}
          onChange={(e) => set('secretary_email', e.target.value)}
          hint="Gets an email for every new excuse."
        />
        <Checkbox label="Members can submit excuses" checked={form.excuses_enabled} onChange={(e) => set('excuses_enabled', e.target.checked)} />
        <Checkbox
          label="Require proof"
          description="Members must attach a screenshot, photo or PDF."
          checked={form.excuse_attachment_required}
          onChange={(e) => set('excuse_attachment_required', e.target.checked)}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="remind-title">
        <h2 id="remind-title" className="text-lg font-bold">
          Notifications
        </h2>
        <Checkbox
          label="Event reminders"
          description="24 hours and 1 hour before required events and events members said they're going to."
          checked={form.reminders_enabled}
          onChange={(e) => set('reminders_enabled', e.target.checked)}
        />
        <Checkbox
          label="Weekly “mark your nights” reminder"
          checked={form.weekly_reminder_enabled}
          onChange={(e) => set('weekly_reminder_enabled', e.target.checked)}
        />
        {form.weekly_reminder_enabled && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Day" value={form.weekly_reminder_dow} onChange={(e) => set('weekly_reminder_dow', Number(e.target.value))}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
            <TextField label="Time" type="time" value={form.weekly_reminder_time} onChange={(e) => set('weekly_reminder_time', e.target.value)} />
          </div>
        )}
        <Checkbox
          label="Email members without push notifications"
          checked={form.email_fallback}
          onChange={(e) => set('email_fallback', e.target.checked)}
        />
      </section>

      {error && <Alert>{error}</Alert>}
      <Button type="submit" busy={busy}>
        Save settings
      </Button>
    </form>
  )
}

function CategoryColors({ categories }: { categories: Category[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [colors, setColors] = useState(() => Object.fromEntries(categories.map((c) => [c.key, c.color.toUpperCase()])))
  const [busy, setBusy] = useState(false)
  const changed = categories.filter((c) => colors[c.key] !== c.color.toUpperCase())
  const unreadable = categories.filter((c) => contrastRatio(colors[c.key], '#FFFFFF') < 4.5)

  const save = async () => {
    setBusy(true)
    for (const c of changed) {
      const { error } = await cal.from('categories').update({ color: colors[c.key] }).eq('key', c.key)
      if (error) {
        setBusy(false)
        return toast(error.message, 'error')
      }
    }
    setBusy(false)
    toast('Colors saved')
    void qc.invalidateQueries({ queryKey: calendarKeys.categories })
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="colors-title">
      <h2 id="colors-title" className="text-lg font-bold">
        Category colors
      </h2>
      <p className="text-sm text-slate-700">White text has to stay readable on every color.</p>
      <ul className="flex flex-col gap-2">
        {categories.map((c) => {
          const ratio = contrastRatio(colors[c.key], '#FFFFFF')
          return (
            <li key={c.key} className="flex items-center gap-3">
              <input
                type="color"
                aria-label={`${c.label} color`}
                value={colors[c.key]}
                onChange={(e) => setColors((all) => ({ ...all, [c.key]: e.target.value.toUpperCase() }))}
                className="size-11 shrink-0 cursor-pointer rounded-lg border border-slate-300"
              />
              <span className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors[c.key] }}>
                {c.label}
              </span>
              <span className={ratio < 4.5 ? 'text-xs font-bold text-red-700' : 'text-xs text-slate-600'}>{ratio.toFixed(1)}:1</span>
            </li>
          )
        })}
      </ul>
      {unreadable.length > 0 && <Alert>Too light for white text: {unreadable.map((c) => c.label).join(', ')}. Pick a darker color.</Alert>}
      <Button variant="secondary" busy={busy} disabled={changed.length === 0 || unreadable.length > 0} onClick={() => void save()}>
        Save colors
      </Button>
    </section>
  )
}
