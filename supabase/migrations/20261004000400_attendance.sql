-- =============================================================================
-- Phase 4: attendance (rotating QR check-in + admin roster) and excuses.
--
-- Check-in codes are 6 digits derived from a per-event secret and the current
-- 30-second window (HMAC-SHA256), so a screenshot of the QR code stops working
-- within a minute. Members can only check in from 15 minutes before an event
-- starts until it ends. Admins can always mark anyone Present/Absent/Excused.
-- =============================================================================

alter table calendar.settings
  add column excuses_enabled boolean not null default true,
  add column excuse_attachment_required boolean not null default false;

create table calendar.attendance (
  event_id uuid not null references calendar.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'excused')),
  method text not null check (method in ('qr', 'manual', 'excuse')),
  marked_by uuid references public.members (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index attendance_member_idx on calendar.attendance (member_id);

create table calendar.checkin_secrets (
  event_id uuid primary key references calendar.events (id) on delete cascade,
  secret bytea not null default extensions.gen_random_bytes(32)
);

-- Wrong codes, to stop guessing. Rows older than an hour are cleaned up on insert.
create table calendar.checkin_failures (
  member_id uuid not null references public.members (id) on delete cascade,
  event_id uuid not null references calendar.events (id) on delete cascade,
  at timestamptz not null default now()
);
create index checkin_failures_idx on calendar.checkin_failures (member_id, event_id, at);

create table calendar.excuses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  attachment_path text check (char_length(attachment_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  review_note text check (char_length(review_note) <= 300),
  reviewed_by uuid references public.members (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open (pending or approved) excuse per member per event; a denied one can be resubmitted.
create unique index excuses_one_open on calendar.excuses (event_id, member_id) where status <> 'denied';
create index excuses_status_idx on calendar.excuses (status, created_at desc);
create index excuses_member_idx on calendar.excuses (member_id, created_at desc);

alter table calendar.attendance enable row level security;
alter table calendar.checkin_secrets enable row level security;
alter table calendar.checkin_failures enable row level security;
alter table calendar.excuses enable row level security;

create policy attendance_select on calendar.attendance for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy excuses_select on calendar.excuses for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

revoke insert, update, delete, truncate on calendar.attendance, calendar.excuses from authenticated;
revoke all on calendar.checkin_secrets, calendar.checkin_failures from authenticated;
revoke all on calendar.attendance, calendar.excuses, calendar.checkin_secrets, calendar.checkin_failures from anon;

-- -----------------------------------------------------------------------------
-- Excuse attachments: excuse-attachments/<member id>/<file>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('excuse-attachments', 'excuse-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "excuse attachments: members add to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'excuse-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  );
create policy "excuse attachments: owner and admins read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'excuse-attachments'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- -----------------------------------------------------------------------------
-- Check-in codes
-- -----------------------------------------------------------------------------
create function calendar._checkin_code(p_secret bytea, p_window bigint) returns text
language sql immutable set search_path = '' as $$
  select lpad((
    ('x' || lpad(encode(substring(extensions.hmac(convert_to(p_window::text, 'UTF8'), p_secret, 'sha256') from 1 for 6), 'hex'), 16, '0'))::bit(64)::bigint
    % 1000000
  )::text, 6, '0');
$$;
revoke execute on function calendar._checkin_code(bytea, bigint) from public, anon, authenticated;

create function calendar._checkin_window() returns bigint
language sql stable set search_path = '' as $$
  select floor(extract(epoch from now()) / 30)::bigint;
$$;

-- The code to show at the door right now (admins only). code is null outside the check-in window.
create function calendar.checkin_code(p_event_id uuid)
returns table (code text, expires_at timestamptz, opens_at timestamptz, closes_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event calendar.events;
  v_secret bytea;
  v_window bigint := calendar._checkin_window();
begin
  if not public.is_admin() then
    raise exception 'Only admins can show check-in codes' using errcode = '42501';
  end if;
  select * into v_event from calendar.events e where e.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  insert into calendar.checkin_secrets (event_id) values (p_event_id) on conflict do nothing;
  select s.secret into v_secret from calendar.checkin_secrets s where s.event_id = p_event_id;
  return query select
    case when now() between v_event.starts_at - interval '15 minutes' and v_event.ends_at
      then calendar._checkin_code(v_secret, v_window) end,
    to_timestamp((v_window + 1) * 30),
    v_event.starts_at - interval '15 minutes',
    v_event.ends_at;
end $$;

-- Members check themselves in with the code from the QR (current or previous window).
-- Returns { ok, message, title } instead of raising so failed tries are recorded.
create function calendar.check_in(p_event_id uuid, p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_event calendar.events;
  v_secret bytea;
  v_window bigint := calendar._checkin_window();
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_event from calendar.events e
  where e.id = p_event_id and (not e.hidden_from_associates or public.is_brother());
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That event wasn''t found.');
  end if;
  if now() < v_event.starts_at - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'title', v_event.title, 'message', 'Check-in opens 15 minutes before the event starts.');
  end if;
  if now() > v_event.ends_at then
    return jsonb_build_object('ok', false, 'title', v_event.title, 'message', 'Check-in for this event has closed. Ask an officer to mark you present.');
  end if;
  if (select count(*) from calendar.checkin_failures f
      where f.member_id = v_uid and f.event_id = p_event_id and f.at > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'title', v_event.title, 'message', 'Too many wrong codes. Wait a few minutes or ask an officer to mark you present.');
  end if;

  select s.secret into v_secret from calendar.checkin_secrets s where s.event_id = p_event_id;
  if v_secret is null or v_code not in (calendar._checkin_code(v_secret, v_window), calendar._checkin_code(v_secret, v_window - 1)) then
    delete from calendar.checkin_failures f where f.at < now() - interval '1 hour';
    insert into calendar.checkin_failures (member_id, event_id) values (v_uid, p_event_id);
    return jsonb_build_object('ok', false, 'title', v_event.title, 'message', 'That code expired or is wrong. Scan the code at the door again.');
  end if;

  insert into calendar.attendance (event_id, member_id, status, method, marked_by)
  values (p_event_id, v_uid, 'present', 'qr', v_uid)
  on conflict (event_id, member_id) do update
    set status = 'present', method = 'qr', marked_by = v_uid, marked_at = now();
  return jsonb_build_object('ok', true, 'title', v_event.title, 'message', 'You''re checked in.');
end $$;

-- Events the caller can check in to right now (for the manual-code screen).
create function calendar.open_checkins()
returns setof calendar.events
language sql stable security definer set search_path = '' as $$
  select e.* from calendar.events e
  where public.is_member()
    and (not e.hidden_from_associates or public.is_brother())
    and now() between e.starts_at - interval '15 minutes' and e.ends_at
    and not e.all_day
  order by e.starts_at;
$$;

-- -----------------------------------------------------------------------------
-- Admin roster and dashboard
-- -----------------------------------------------------------------------------
create function calendar.set_attendance(p_event_id uuid, p_member_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can take attendance' using errcode = '42501';
  end if;
  if not exists (select 1 from calendar.events e where e.id = p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if p_status is null then
    delete from calendar.attendance where event_id = p_event_id and member_id = p_member_id;
    return;
  end if;
  if p_status not in ('present', 'absent', 'excused') then
    raise exception 'Status must be present, absent or excused' using errcode = '22023';
  end if;
  insert into calendar.attendance (event_id, member_id, status, method, marked_by)
  values (p_event_id, p_member_id, p_status, 'manual', (select auth.uid()))
  on conflict (event_id, member_id) do update
    set status = excluded.status, method = 'manual', marked_by = excluded.marked_by, marked_at = now();
end $$;

-- Everyone expected at an event (members who can see it), with their status.
create function calendar.event_roster(p_event_id uuid)
returns table (
  member_id uuid, name text, member_type public.member_type, pledge_class text,
  status text, method text, marked_at timestamptz, excuse_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see the roster' using errcode = '42501';
  end if;
  return query
  select m.id, m.name, m.member_type, m.pledge_class, a.status, a.method, a.marked_at, ex.status
  from calendar.events e
  join public.members m on m.status = 'approved'
  left join calendar.attendance a on a.event_id = e.id and a.member_id = m.id
  left join lateral (
    select x.status from calendar.excuses x
    where x.event_id = e.id and x.member_id = m.id
    order by x.created_at desc limit 1
  ) as ex on true
  where e.id = p_event_id
    and (m.active or a.member_id is not null)
    and (m.member_type = 'brother' or not e.hidden_from_associates)
  order by m.name;
end $$;

-- Members x events for the dashboard. Past events count when they're required or someone
-- took attendance. Members with no record at a counted past event are absent, unless they
-- joined after it. cells: [{ e: event id, m: member id, s: status, r: recorded }]
create function calendar.attendance_report(p_from date, p_to date, p_categories text[] default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := calendar.chapter_timezone();
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can see attendance' using errcode = '42501';
  end if;
  with ev as (
    select e.* from calendar.events e
    where e.starts_at >= (p_from::timestamp at time zone v_tz)
      and e.starts_at < ((p_to + 1)::timestamp at time zone v_tz)
      and e.starts_at <= now()
      and (p_categories is null or cardinality(p_categories) = 0 or e.category = any (p_categories))
      and (e.required or exists (select 1 from calendar.attendance a where a.event_id = e.id))
  ),
  mem as (
    select m.id, m.name, m.member_type, m.pledge_class, coalesce(m.approved_at, m.created_at) as joined_at
    from public.members m
    where m.status = 'approved' and m.active
  ),
  cells as (
    select ev.id as event_id, mem.id as member_id,
      coalesce(a.status, case when ev.ends_at <= now() then 'absent' end) as status,
      a.status is not null as recorded
    from ev
    cross join mem
    left join calendar.attendance a on a.event_id = ev.id and a.member_id = mem.id
    where (mem.member_type = 'brother' or not ev.hidden_from_associates)
      and (a.status is not null or mem.joined_at <= ev.starts_at)
  )
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'category', ev.category,
        'starts_at', ev.starts_at, 'ends_at', ev.ends_at, 'required', ev.required) order by ev.starts_at)
      from ev), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', mem.id, 'name', mem.name, 'member_type', mem.member_type,
        'pledge_class', mem.pledge_class) order by mem.name)
      from mem), '[]'::jsonb),
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object('e', c.event_id, 'm', c.member_id, 's', c.status, 'r', c.recorded))
      from cells c where c.status is not null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Excuses
-- -----------------------------------------------------------------------------
create function calendar.submit_excuse(p_event_id uuid, p_reason text, p_attachment_path text default null)
returns calendar.excuses
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_settings calendar.settings;
  v_event calendar.events;
  v_path text := nullif(btrim(coalesce(p_attachment_path, '')), '');
  v_row calendar.excuses;
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_settings from calendar.settings;
  if not v_settings.excuses_enabled then
    raise exception 'Excuses are turned off right now. Talk to the secretary.' using errcode = 'P0001';
  end if;
  select * into v_event from calendar.events e
  where e.id = p_event_id and (not e.hidden_from_associates or public.is_brother());
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if not v_event.required then
    raise exception 'Excuses are only for required chapter events' using errcode = '22023';
  end if;
  if v_event.ends_at < now() - interval '7 days' then
    raise exception 'It''s too late to submit an excuse for this event' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why you can''t make it' using errcode = '22023';
  end if;
  if char_length(p_reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters' using errcode = '22023';
  end if;
  if v_path is not null and split_part(v_path, '/', 1) <> v_uid::text then
    raise exception 'Invalid attachment' using errcode = '22023';
  end if;
  if v_settings.excuse_attachment_required and v_path is null then
    raise exception 'Attach proof (a screenshot, photo or PDF) to submit an excuse' using errcode = '22023';
  end if;
  if exists (select 1 from calendar.excuses x where x.event_id = p_event_id and x.member_id = v_uid and x.status <> 'denied') then
    raise exception 'You already submitted an excuse for this event' using errcode = '23505';
  end if;

  insert into calendar.excuses (event_id, member_id, reason, attachment_path)
  values (p_event_id, v_uid, btrim(p_reason), v_path)
  returning * into v_row;
  return v_row;
end $$;

-- Approving marks the member Excused (unless they showed up anyway); denying undoes that.
create function calendar.review_excuse(p_excuse_id uuid, p_approve boolean, p_note text default null)
returns calendar.excuses
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row calendar.excuses;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review excuses' using errcode = '42501';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters' using errcode = '22023';
  end if;
  update calendar.excuses set
    status = case when p_approve then 'approved' else 'denied' end,
    review_note = nullif(btrim(coalesce(p_note, '')), ''),
    reviewed_by = v_uid,
    reviewed_at = now()
  where id = p_excuse_id
  returning * into v_row;
  if not found then
    raise exception 'Excuse not found' using errcode = 'P0002';
  end if;

  if p_approve then
    insert into calendar.attendance (event_id, member_id, status, method, marked_by)
    values (v_row.event_id, v_row.member_id, 'excused', 'excuse', v_uid)
    on conflict (event_id, member_id) do update
      set status = 'excused', method = 'excuse', marked_by = excluded.marked_by, marked_at = now()
      where calendar.attendance.status <> 'present';
  else
    delete from calendar.attendance a
    where a.event_id = v_row.event_id and a.member_id = v_row.member_id and a.method = 'excuse';
  end if;
  return v_row;
end $$;

revoke execute on function calendar._checkin_window() from public, anon;
revoke execute on function calendar.checkin_code(uuid) from public, anon;
revoke execute on function calendar.check_in(uuid, text) from public, anon;
revoke execute on function calendar.open_checkins() from public, anon;
revoke execute on function calendar.set_attendance(uuid, uuid, text) from public, anon;
revoke execute on function calendar.event_roster(uuid) from public, anon;
revoke execute on function calendar.attendance_report(date, date, text[]) from public, anon;
revoke execute on function calendar.submit_excuse(uuid, text, text) from public, anon;
revoke execute on function calendar.review_excuse(uuid, boolean, text) from public, anon;
