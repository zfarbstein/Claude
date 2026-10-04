import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Alert, Badge, Button, Checkbox, Select, TextField } from '../../components/ui'
import { cx } from '../../lib/cx'
import { ACCESS_LABELS, accessFields, accessOf, type Access } from '../../lib/permissions'
import { supabase } from '../../lib/supabase'
import type { Member, MemberStatus } from '../../lib/types'

type Tab = 'pending' | 'active' | 'inactive'

const adminKeys = { members: ['admin', 'members'] as const }

const ACCESS_HELP: Record<Access, string> = {
  admin: 'Exec: everything, including members, events and settings.',
  brother: 'Sees the full calendar, availability and the member list.',
  pledge: 'Sees only events visible to pledges, their own schedule and attendance.',
}

export default function AdminMembers() {
  const qc = useQueryClient()
  const toast = useToast()
  const roster = useQuery({
    queryKey: adminKeys.members,
    queryFn: async () => {
      const { data, error } = await supabase.from('members').select('*').order('name')
      if (error) throw new Error(error.message)
      return data
    },
  })
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Member | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const all = roster.data ?? []
    return {
      pending: all.filter((m) => m.status === 'pending' && m.active),
      active: all.filter((m) => m.status === 'approved' && m.active),
      inactive: all.filter((m) => m.status === 'rejected' || !m.active),
    }
  }, [roster.data])

  const q = query.trim().toLowerCase()
  const list = groups[tab].filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))

  const decide = async (m: Member, status: MemberStatus, access?: Access) => {
    setBusyId(m.id)
    const fields = access ? accessFields(access) : undefined
    const { error } = await supabase.rpc('admin_update_member', {
      p_member_id: m.id,
      p_status: status,
      p_member_type: fields?.member_type,
      p_role: fields?.role,
    })
    setBusyId(null)
    if (error) return toast(error.message, 'error')
    toast(status === 'approved' ? `${m.name || m.email} approved` : `${m.name || m.email} rejected`)
    void qc.invalidateQueries({ queryKey: adminKeys.members })
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: `Pending (${groups.pending.length})` },
    { key: 'active', label: `Members (${groups.active.length})` },
    { key: 'inactive', label: `Inactive (${groups.inactive.length})` },
  ]

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
      <div role="tablist" aria-label="Member lists" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx('min-h-11 rounded-lg px-1 text-sm font-bold', tab === t.key ? 'bg-white text-brand-700 shadow' : 'text-slate-700')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <span className="sr-only">Search members</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-10 text-base"
        />
      </label>

      {roster.isError && <Alert>{(roster.error as Error).message}</Alert>}
      {roster.isPending && <p className="text-slate-600">Loading…</p>}
      {!roster.isPending && list.length === 0 && (
        <p className="text-slate-600">{tab === 'pending' ? 'No one is waiting for approval.' : 'No members here.'}</p>
      )}

      <ul className="flex flex-col gap-2">
        {list.map((m) => (
          <li key={m.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            {tab === 'pending' ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-bold">{m.name || '(no name)'}</p>
                  <p className="text-sm break-all text-slate-700">{m.email}</p>
                  <p className="text-xs text-slate-600">Signed up {new Date(m.created_at).toLocaleDateString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button busy={busyId === m.id} onClick={() => void decide(m, 'approved', 'brother')}>
                    Approve as Brother
                  </Button>
                  <Button busy={busyId === m.id} onClick={() => void decide(m, 'approved', 'pledge')}>
                    Approve as Pledge
                  </Button>
                  <Button variant="secondary" className="col-span-2 text-red-700" busy={busyId === m.id} onClick={() => void decide(m, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setEditing(m)}>
                <span className="min-w-0">
                  <span className="block font-bold">{m.name || '(no name)'}</span>
                  <span className="block truncate text-sm text-slate-700">{m.email}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={accessOf(m) === 'admin' ? 'bg-brand-50 text-brand-900' : undefined}>{ACCESS_LABELS[accessOf(m)]}</Badge>
                  {m.status === 'rejected' && <Badge className="bg-red-100 text-red-900">Rejected</Badge>}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name || editing?.email || ''}>
        {editing && (
          <MemberEditor
            key={editing.id}
            member={editing}
            onClose={() => setEditing(null)}
            onSaved={() => void qc.invalidateQueries({ queryKey: adminKeys.members })}
          />
        )}
      </Sheet>
    </main>
  )
}

function MemberEditor({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const { member: me, refreshMember } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(member.name)
  const [access, setAccess] = useState<Access>(accessOf(member))
  const [status, setStatus] = useState<MemberStatus>(member.status)
  const [active, setActive] = useState(member.active)
  const [pledgeClass, setPledgeClass] = useState(member.pledge_class ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    const fields = accessFields(access)
    const { error } = await supabase.rpc('admin_update_member', {
      p_member_id: member.id,
      p_name: name,
      p_member_type: fields.member_type,
      p_role: fields.role,
      p_status: status,
      p_active: active,
      p_pledge_class: pledgeClass,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast('Member updated')
    onSaved()
    if (member.id === me?.id) void refreshMember()
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm break-all text-slate-700">{member.email}</p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <Select label="Access" value={access} hint={ACCESS_HELP[access]} onChange={(e) => setAccess(e.target.value as Access)}>
        <option value="admin">Admin</option>
        <option value="brother">Brother</option>
        <option value="pledge">Pledge</option>
      </Select>
      <TextField label="Pledge class" value={pledgeClass} onChange={(e) => setPledgeClass(e.target.value)} maxLength={60} />
      <Select label="Approval" value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)}>
        <option value="approved">Approved</option>
        <option value="pending">Pending</option>
        <option value="rejected">Rejected</option>
      </Select>
      <Checkbox
        label="Active"
        description="Turn off for alumni or removed members. Inactive members lose access to every chapter app."
        checked={active}
        onChange={(e) => setActive(e.target.checked)}
      />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button className="flex-1" busy={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  )
}
