import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Alert, Button, TextField } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import type { HubApp } from '../../lib/types'
import { notificationKeys, useHubApps } from '../../notifications/api'

const EMPTY = { name: '', url: '', icon: '📅' }

/** The chapter hub's app list, shown in every app's header "Apps" menu. */
export default function AdminApps() {
  const apps = useHubApps()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<HubApp | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = (app: HubApp | null) => {
    setEditing(app)
    setForm(app ? { name: app.name, url: app.url, icon: app.icon } : EMPTY)
    setError(null)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const row = { name: form.name.trim(), url: form.url.trim(), icon: form.icon.trim() || '📅' }
    if (!row.name) return setError('Name the app.')
    if (!/^(https:\/\/|\/)/.test(row.url)) return setError('The link must start with https://')
    setBusy(true)
    const { error } = editing
      ? await supabase.from('hub_apps').update(row).eq('id', editing.id)
      : await supabase.from('hub_apps').insert({ ...row, sort_order: (apps.data?.length ?? 0) + 1 })
    setBusy(false)
    if (error) return setError(error.message)
    toast(editing ? 'App updated' : 'App added')
    start(null)
    void qc.invalidateQueries({ queryKey: notificationKeys.apps })
  }

  const remove = async (app: HubApp) => {
    const { error } = await supabase.from('hub_apps').delete().eq('id', app.id)
    if (error) return toast(error.message, 'error')
    toast(`${app.name} removed`)
    void qc.invalidateQueries({ queryKey: notificationKeys.apps })
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <p className="text-slate-700">
        Apps in the chapter hub. Everyone sees this list in the <strong>Apps</strong> menu at the top of every hub app (it appears once there are at least two).
      </p>
      {apps.isError && <Alert>{apps.error.message}</Alert>}
      <ul className="flex flex-col gap-2">
        {apps.data?.map((app) => (
          <li key={app.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <span aria-hidden className="text-2xl">
              {/^https?:\/\//.test(app.icon) ? '🖼️' : app.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{app.name}</span>
              <span className="block truncate text-sm text-slate-600">{app.url}</span>
            </span>
            <button type="button" aria-label={`Edit ${app.name}`} onClick={() => start(app)} className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
              <Pencil aria-hidden className="size-5" />
            </button>
            <button type="button" aria-label={`Remove ${app.name}`} onClick={() => void remove(app)} className="flex size-11 items-center justify-center rounded-full text-red-700 hover:bg-red-50">
              <Trash2 aria-hidden className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200" noValidate>
        <h2 className="text-lg font-bold">{editing ? `Edit ${editing.name}` : 'Add an app'}</h2>
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} placeholder="Dues" />
        <TextField label="Link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://dues.yourchapter.org" inputMode="url" />
        <TextField label="Icon" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} hint="An emoji, or an https:// image link" />
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          {editing && (
            <Button variant="secondary" className="flex-1" onClick={() => start(null)}>
              Cancel
            </Button>
          )}
          <Button type="submit" className="flex-1" busy={busy}>
            {editing ? 'Save' : 'Add app'}
          </Button>
        </div>
      </form>
    </main>
  )
}
