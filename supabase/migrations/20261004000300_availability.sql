-- =============================================================================
-- Phase 3: night availability and the member directory.
--
-- A member's night (calendar.settings night_start..night_end, chapter time) is
--   busy     if they marked it unavailable, or a class, weekly obligation, exam or
--            one-off obligation from their current-semester schedule overlaps it;
--   unknown  if they haven't finished this semester's schedule (or the night is
--            outside the semester) and didn't mark it;
--   free     otherwise.
-- Nobody can mark themselves out of a night with a required chapter event; they
-- submit an excuse instead.
-- =============================================================================

alter table calendar.settings add constraint settings_night_window check (night_start <> night_end);

create table calendar.night_marks (
  member_id uuid not null references public.members (id) on delete cascade,
  night date not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  primary key (member_id, night)
);
create index night_marks_night_idx on calendar.night_marks (night);

alter table calendar.night_marks enable row level security;
create policy night_marks_select on calendar.night_marks for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete, truncate on calendar.night_marks from authenticated;
revoke all on calendar.night_marks from anon;

-- -----------------------------------------------------------------------------
-- Statuses for every approved, active member (or just p_member) on each night in
-- [p_start, p_end]. Internal: the public wrappers below decide who sees what.
-- reasons: [{ kind: mark|class|obligation|exam, label, start 'HH24:MI', end }]
-- -----------------------------------------------------------------------------
create function calendar._night_statuses(p_start date, p_end date, p_member uuid default null)
returns table (night date, member_id uuid, status text, reasons jsonb)
language sql stable security definer set search_path = '' as $$
  with cfg as (
    select s.night_start, s.night_end, s.timezone as tz from calendar.settings s
  ),
  sem as (
    select x.id, x.starts_on, x.ends_on from calendar.semesters x where x.is_current
  ),
  nights as (
    select g::date as night, w.starts_at, w.ends_at
    from cfg
    cross join generate_series(p_start, least(p_end, p_start + 62), interval '1 day') as g
    cross join lateral calendar.local_range(g::date, 0, cfg.night_start, cfg.night_end, false, cfg.tz) as w
  ),
  people as (
    select m.id,
      exists (
        select 1 from calendar.schedule_submissions s join sem on s.semester_id = sem.id
        where s.member_id = m.id and s.completed
      ) as submitted
    from public.members m
    where m.status = 'approved' and m.active and (p_member is null or m.id = p_member)
  )
  select
    n.night,
    p.id,
    case
      when mk.member_id is not null or jsonb_array_length(busy.reasons) > 0 then 'busy'
      when not p.submitted or sem.id is null or n.night not between sem.starts_on and sem.ends_on then 'unknown'
      else 'free'
    end,
    case when mk.member_id is not null
      then jsonb_build_array(jsonb_build_object('kind', 'mark', 'label', mk.reason))
      else '[]'::jsonb
    end || busy.reasons
  from nights n
  cross join people p
  left join sem on true
  left join calendar.night_marks mk on mk.member_id = p.id and mk.night = n.night
  cross join lateral (
    select coalesce(jsonb_agg(x.r order by x.at), '[]'::jsonb) as reasons
    from (
      -- Weekly classes and obligations on the night's date (or the next morning, for late windows).
      select
        jsonb_build_object('kind', b.kind, 'label', b.label,
          'start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI')) as r,
        (d.d + b.start_time) at time zone cfg.tz as at
      from cfg
      cross join sem
      cross join lateral (values (n.night), (n.night + 1)) as d(d)
      join calendar.weekly_blocks b
        on b.member_id = p.id and b.semester_id = sem.id and b.weekday = extract(dow from d.d)::int
      where d.d between sem.starts_on and sem.ends_on
        and (d.d + b.start_time) at time zone cfg.tz < n.ends_at
        and (d.d + b.end_time) at time zone cfg.tz > n.starts_at
      union all
      -- Exams and one-off obligations (deadlines never block).
      select
        jsonb_build_object('kind', i.kind,
          'label', case when i.course is not null and position(i.course in i.title) = 0 then i.course || ' ' || i.title else i.title end,
          'start', case when i.all_day then null else to_char(i.starts_at at time zone cfg.tz, 'HH24:MI') end,
          'end', case when i.all_day then null else to_char(i.ends_at at time zone cfg.tz, 'HH24:MI') end),
        i.starts_at
      from cfg
      cross join sem
      join calendar.dated_items i on i.member_id = p.id and i.semester_id = sem.id
      where i.blocks_availability and not i.dismissed
        and i.starts_at < n.ends_at and i.ends_at > n.starts_at
    ) as x
  ) as busy;
$$;

revoke execute on function calendar._night_statuses(date, date, uuid) from public, anon, authenticated;

-- First required chapter event overlapping the night that the caller can see.
create function calendar._required_event_on_night(p_night date)
returns calendar.events
language sql stable security definer set search_path = '' as $$
  select e.*
  from calendar.settings s
  cross join lateral calendar.local_range(p_night, 0, s.night_start, s.night_end, false, s.timezone) as w
  join calendar.events e on e.starts_at < w.ends_at and e.ends_at > w.starts_at
  where e.required and (not e.hidden_from_associates or public.is_brother())
  order by e.starts_at
  limit 1;
$$;

revoke execute on function calendar._required_event_on_night(date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Heatmap: counts per night. Brothers and admins only; pledges see their own nights.
-- -----------------------------------------------------------------------------
create function calendar.night_summary(p_start date, p_end date)
returns table (night date, free integer, busy integer, unknown integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_brother() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select
    s.night,
    (count(*) filter (where s.status = 'free'))::int,
    (count(*) filter (where s.status = 'busy'))::int,
    (count(*) filter (where s.status = 'unknown'))::int,
    count(*)::int
  from calendar._night_statuses(p_start, p_end) as s
  group by s.night
  order by s.night;
end $$;

-- Everyone's status on one night, with names and reasons. Admins only.
create function calendar.night_detail(p_night date)
returns table (member_id uuid, name text, member_type public.member_type, status text, reasons jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select s.member_id, m.name, m.member_type, s.status, s.reasons
  from calendar._night_statuses(p_night, p_night) as s
  join public.members m on m.id = s.member_id
  order by m.name;
end $$;

-- One member's nights. Members get their own with reasons; admins get anyone's with
-- reasons; brothers get other members' free/busy only. Pledges only their own.
create function calendar.member_nights(p_member uuid, p_start date, p_end date)
returns table (
  night date, status text, reasons jsonb, marked boolean, mark_reason text,
  required_event_id uuid, required_event_title text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_full boolean := p_member = (select auth.uid()) or public.is_admin();
begin
  if not public.is_member() or not (v_full or public.is_brother()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select
    s.night,
    s.status,
    case when v_full then s.reasons else '[]'::jsonb end,
    mk.member_id is not null,
    case when v_full then mk.reason end,
    req.id,
    req.title
  from calendar._night_statuses(p_start, p_end, p_member) as s
  left join calendar.night_marks mk on mk.member_id = s.member_id and mk.night = s.night
  left join lateral calendar._required_event_on_night(s.night) as req on true
  order by s.night;
end $$;

-- Mark (or clear) yourself as unavailable for a night.
create function calendar.set_night_mark(p_night date, p_unavailable boolean, p_reason text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_today date := (now() at time zone calendar.chapter_timezone())::date;
  v_required calendar.events;
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_night is null or p_night < v_today then
    raise exception 'That night has already passed' using errcode = '22023';
  end if;
  if p_night > v_today + 366 then
    raise exception 'Pick a night within the next year' using errcode = '22023';
  end if;
  if char_length(coalesce(p_reason, '')) > 120 then
    raise exception 'Keep the reason under 120 characters' using errcode = '22023';
  end if;

  if not coalesce(p_unavailable, false) then
    delete from calendar.night_marks where member_id = v_uid and night = p_night;
    return;
  end if;

  v_required := calendar._required_event_on_night(p_night);
  if v_required.id is not null then
    raise exception 'There''s a required chapter event that night (%). Submit an excuse instead.', v_required.title
      using errcode = 'P0001', hint = 'required_event:' || v_required.id;
  end if;

  insert into calendar.night_marks (member_id, night, reason)
  values (v_uid, p_night, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (member_id, night) do update set reason = excluded.reason, created_at = now();
end $$;

revoke execute on function calendar.night_summary(date, date) from public, anon;
revoke execute on function calendar.night_detail(date) from public, anon;
revoke execute on function calendar.member_nights(uuid, date, date) from public, anon;
revoke execute on function calendar.set_night_mark(date, boolean, text) from public, anon;

-- -----------------------------------------------------------------------------
-- Members tab: a member's weekly schedule and upcoming busy items.
-- The member and admins see details; other brothers see busy times only.
-- -----------------------------------------------------------------------------
create function calendar.member_schedule(p_member uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_full boolean := p_member = (select auth.uid()) or public.is_admin();
  v_sem calendar.semesters;
begin
  if not public.is_member() or not (v_full or public.is_brother()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.id = p_member and m.status = 'approved') then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  select * into v_sem from calendar.semesters where is_current;

  return jsonb_build_object(
    'semester', case when v_sem.id is null then null else
      jsonb_build_object('id', v_sem.id, 'name', v_sem.name, 'starts_on', v_sem.starts_on, 'ends_on', v_sem.ends_on) end,
    'submitted', coalesce((
      select s.completed from calendar.schedule_submissions s
      where s.member_id = p_member and s.semester_id = v_sem.id
    ), false),
    'detailed', v_full,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', b.weekday,
        'start', to_char(b.start_time, 'HH24:MI'),
        'end', to_char(b.end_time, 'HH24:MI'),
        'kind', case when v_full then b.kind end,
        'category', case when v_full then b.category end,
        'label', case when v_full then b.label end,
        'location', case when v_full then b.location end
      ) order by b.weekday, b.start_time)
      from calendar.weekly_blocks b
      where b.member_id = p_member and b.semester_id = v_sem.id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_at', i.starts_at,
        'ends_at', i.ends_at,
        'all_day', i.all_day,
        'kind', case when v_full then i.kind end,
        'title', case when v_full then i.title end,
        'course', case when v_full then i.course end
      ) order by i.starts_at)
      from calendar.dated_items i
      where i.member_id = p_member and i.semester_id = v_sem.id
        and i.blocks_availability and not i.dismissed
        and i.ends_at >= now() - interval '1 day'
    ), '[]'::jsonb)
  );
end $$;

revoke execute on function calendar.member_schedule(uuid) from public, anon;
