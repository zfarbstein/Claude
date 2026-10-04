import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useCategories } from '../../calendar/api'
import { PageHeader } from '../../components/AppLayout'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Alert, Badge, Button, Checkbox, Select, TextField } from '../../components/ui'
import { cx } from '../../lib/cx'
import { DEFAULT_CATEGORIES } from '../../lib/categories'
import { ROLE_LABELS, TYPE_LABELS } from '../../lib/permissions'
import { cal, supabase } from '../../lib/supabase'
import type { Member, MemberRole, MemberStatus, MemberType } from '../../lib/types'

type Tab = 'pending' | 'active' | 'inactive'

const adminKeys = { members: ['admin', 'members'] as const }

function useRoster() {
  return useQuery({
    queryKey: adminKeys.members,
    queryFn: async () => {
      const [m, c] = await Promise.all([
        supabase.from('members').select('*').order('name'),
        cal.from('chair_categories').select('member_id,category'),
      ])
      if (m.error) throw new Error(m.error.message)
      if (c.error) throw new Error(c.error.message)
      const chairs = new Map<string, string[]>()
      for (const row of c.data) chairs.set(row.member_id, [...(chairs.get(row.member_id) ?? []), row.category])
      return { members: m.data, chairs }
    },
  })
}

export default function AdminMembers() {
  const roster = useRoster()
  const qc = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Member | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const all = roster.data?.members ?? []
    return {
      pending: all.filter((m) => m.status === 'pending' && m.active),
      active: all.filter((m) => m.status === 'approved' && m.active),
      inactive: all.filter((m) => m.status === 'rejected' || !m.active),
    }
  }, [roster.data])

  const q = query.trim().toLowerCase()
  const list = groups[tab].filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))

  const decide = async (m: Member, status: MemberStatus, memberType?: MemberType) => {
    setBusyId(m.id)
    const { error } = await supabase.rpc('admin_update_member', {
      p_member_id: m.id,
      p_status: status,
      p_member_type: memberType,
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
    <div>
      <PageHeader title="Members" />
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
                    <Button busy={busyId === m.id} onClick={() => void decide(m, 'approved', 'associate')}>
                      Approve as AM
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
                    <Badge>{m.member_type === 'brother' ? 'Brother' : 'AM'}</Badge>
                    {m.role !== 'member' && <Badge className="bg-brand-50 text-brand-900">{ROLE_LABELS[m.role]}</Badge>}
                    {m.status === 'rejected' && <Badge className="bg-red-100 text-red-900">Rejected</Badge>}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>
      <MemberEditor
        member={editing}
        chairCategories={editing ? (roster.data?.chairs.get(editing.id) ?? []) : []}
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: adminKeys.members })}
      />
    </div>
  )
}

function MemberEditor({
  member,
  chairCategories,
  onClose,
  onSaved,
}: {
  member: Member | null
  chairCategories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Sheet open={!!member} onClose={onClose} title={member?.name || member?.email || ''}>
      {member && <MemberEditorBody key={member.id} member={member} chairCategories={chairCategories} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  )
}

function MemberEditorBody({
  member,
  chairCategories,
  onClose,
  onSaved,
}: {
  member: Member
  chairCategories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { member: me, refreshMember } = useAuth()
  const toast = useToast()
  const categories = useCategories().data ?? DEFAULT_CATEGORIES
  const [name, setName] = useState(member.name)
  const [memberType, setMemberType] = useState<MemberType>(member.member_type)
  const [role, setRole] = useState<MemberRole>(member.role)
  const [status, setStatus] = useState<MemberStatus>(member.status)
  const [active, setActive] = useState(member.active)
  const [pledgeClass, setPledgeClass] = useState(member.pledge_class ?? '')
  const [chairs, setChairs] = useState<string[]>(chairCategories)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    const effectiveRole = memberType === 'associate' ? 'member' : role
    const { error } = await supabase.rpc('admin_update_member', {
      p_member_id: member.id,
      p_name: name,
      p_member_type: memberType,
      p_role: effectiveRole,
      p_status: status,
      p_active: active,
      p_pledge_class: pledgeClass,
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    const wanted = effectiveRole === 'chair' ? chairs : []
    const toAdd = wanted.filter((c) => !chairCategories.includes(c))
    const toRemove = chairCategories.filter((c) => !wanted.includes(c))
    const results = await Promise.all([
      toAdd.length ? cal.from('chair_categories').insert(toAdd.map((category) => ({ member_id: member.id, category }))) : null,
      toRemove.length ? cal.from('chair_categories').delete().eq('member_id', member.id).in('category', toRemove) : null,
    ])
    setBusy(false)
    const failed = results.find((r) => r?.error)
    if (failed?.error) {
      setError(failed.error.message)
      return
    }
    toast('Member updated')
    onSaved()
    if (member.id === me?.id) void refreshMember()
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm break-all text-slate-700">{member.email}</p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <Select label="Member type" value={memberType} onChange={(e) => setMemberType(e.target.value as MemberType)}>
        <option value="brother">{TYPE_LABELS.brother}</option>
        <option value="associate">{TYPE_LABELS.associate}</option>
      </Select>
      <Select
        label="Role"
        value={memberType === 'associate' ? 'member' : role}
        disabled={memberType === 'associate'}
        hint={memberType === 'associate' ? 'Associate Members can only have the Member role.' : undefined}
        onChange={(e) => setRole(e.target.value as MemberRole)}
      >
        <option value="member">Member</option>
        <option value="chair">Chair (manages events in chosen categories)</option>
        <option value="admin">Admin (exec: full access)</option>
      </Select>
      {role === 'chair' && memberType === 'brother' && (
        <fieldset className="flex flex-col rounded-xl bg-slate-50 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Chair of</legend>
          {categories.map((c) => (
            <Checkbox
              key={c.key}
              label={c.label}
              checked={chairs.includes(c.key)}
              onChange={(e) => setChairs(e.target.checked ? [...chairs, c.key] : chairs.filter((k) => k !== c.key))}
            />
          ))}
        </fieldset>
      )}
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
