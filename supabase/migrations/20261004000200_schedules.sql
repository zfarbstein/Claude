-- =============================================================================
-- Phase 2: semesters and member schedules (classes, exams, weekly obligations).
--
-- Members never write these tables directly: everything goes through
-- calendar.save_schedule_step(), which only ever touches the caller's own rows
-- for the current semester. AI and calendar-feed results are shown to the
-- member for confirmation first; only what they confirm reaches these tables.
-- =============================================================================

create table calendar.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index semesters_single_current on calendar.semesters ((true)) where is_current;

-- One row per member per semester; a step is done once its timestamp is set.
create table calendar.schedule_submissions (
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references calendar.semesters (id) on delete cascade,
  classes_done_at timestamptz,
  exams_done_at timestamptz,
  obligations_done_at timestamptz,
  completed boolean generated always as (
    classes_done_at is not null and exams_done_at is not null and obligations_done_at is not null
  ) stored,
  -- Personal Canvas calendar feed (contains a private token): visible to its owner and admins only.
  canvas_feed_url text check (canvas_feed_url is null or canvas_feed_url ~ '^https://'),
  canvas_synced_at timestamptz,
  canvas_sync_error text,
  updated_at timestamptz not null default now(),
  primary key (member_id, semester_id)
);

-- Recurring weekly blocks: classes and weekly obligations (jobs, org meetings, practices).
create table calendar.weekly_blocks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references calendar.semesters (id) on delete cascade,
  kind text not null check (kind in ('class', 'obligation')),
  category text not null default 'school' check (category in ('school', 'personal')),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  label text not null check (char_length(label) between 1 and 120),
  location text check (char_length(location) <= 120),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index weekly_blocks_member_idx on calendar.weekly_blocks (member_id, semester_id);

-- Dated items: exams (block availability), deadlines (don't), one-off obligations.
create table calendar.dated_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references calendar.semesters (id) on delete cascade,
  kind text not null check (kind in ('exam', 'deadline', 'obligation')),
  category text not null check (category in ('exam', 'school', 'personal')),
  title text not null check (char_length(title) between 1 and 160),
  course text check (char_length(course) <= 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  blocks_availability boolean generated always as (kind <> 'deadline') stored,
  source text not null check (source in ('manual', 'ai', 'canvas', 'ics')),
  external_uid text check (char_length(external_uid) <= 300),
  -- Feed items the member removed stay here (hidden) so the daily sync doesn't re-add them.
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index dated_items_member_idx on calendar.dated_items (member_id, semester_id, starts_at);
create unique index dated_items_feed_uid on calendar.dated_items (member_id, semester_id, source, external_uid)
  where external_uid is not null;

-- Original uploads and typed text, with what the parser returned, for admin review.
create table calendar.schedule_uploads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  semester_id uuid not null references calendar.semesters (id) on delete cascade,
  step text not null check (step in ('classes', 'exams', 'obligations')),
  kind text not null check (kind in ('ai', 'ics_file', 'ics_url', 'canvas')),
  text_content text check (char_length(text_content) <= 20000),
  storage_paths text[] not null default '{}',
  source_url text,
  parsed jsonb,
  created_at timestamptz not null default now()
);
create index schedule_uploads_member_idx on calendar.schedule_uploads (member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS: members read their own rows, admins read everyone's. No direct writes.
-- -----------------------------------------------------------------------------
alter table calendar.semesters enable row level security;
alter table calendar.schedule_submissions enable row level security;
alter table calendar.weekly_blocks enable row level security;
alter table calendar.dated_items enable row level security;
alter table calendar.schedule_uploads enable row level security;

create policy semesters_select on calendar.semesters for select to authenticated
  using ((select public.is_member()));
create policy submissions_select on calendar.schedule_submissions for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy weekly_blocks_select on calendar.weekly_blocks for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy dated_items_select on calendar.dated_items for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy uploads_select on calendar.schedule_uploads for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

revoke insert, update, delete, truncate on calendar.semesters, calendar.schedule_submissions,
  calendar.weekly_blocks, calendar.dated_items, calendar.schedule_uploads from authenticated;
revoke all on calendar.semesters, calendar.schedule_submissions, calendar.weekly_blocks,
  calendar.dated_items, calendar.schedule_uploads from anon;

-- -----------------------------------------------------------------------------
-- Storage: originals live under schedule-uploads/<member id>/...
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schedule-uploads', 'schedule-uploads', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'text/calendar', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "schedule uploads: members add to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'schedule-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_member())
  );
create policy "schedule uploads: owner and admins read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'schedule-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- -----------------------------------------------------------------------------
-- Semester management
-- -----------------------------------------------------------------------------
create function calendar.start_semester(p_name text, p_starts_on date, p_ends_on date)
returns calendar.semesters
language plpgsql security definer set search_path = '' as $$
declare
  v_row calendar.semesters;
begin
  if not public.is_admin() then
    raise exception 'Only admins can start a semester' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the semester' using errcode = '22023';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on then
    raise exception 'The semester must end after it starts' using errcode = '22023';
  end if;
  update calendar.semesters set is_current = false where is_current;
  insert into calendar.semesters (name, starts_on, ends_on, is_current, created_by)
  values (btrim(p_name), p_starts_on, p_ends_on, true, (select auth.uid()))
  returning * into v_row;
  return v_row;
end $$;

-- "82 of 100 submitted" for the current semester (approved, active members only).
create function calendar.submission_counts()
returns table (submitted integer, total integer)
language sql stable security definer set search_path = '' as $$
  select
    count(*) filter (where s.completed)::int,
    count(*)::int
  from public.members m
  left join calendar.semesters cur on cur.is_current
  left join calendar.schedule_submissions s on s.member_id = m.id and s.semester_id = cur.id
  where m.status = 'approved' and m.active and public.is_member();
$$;

-- -----------------------------------------------------------------------------
-- Writing schedules
--
-- Block payload: { weekday 0-6, start 'HH:MM', end 'HH:MM', label, location?, category? }
-- Item payload:  { kind, title, course?, date 'YYYY-MM-DD', start?, end?, all_day?,
--                  category?, source?, external_uid?, dismissed? }
-- -----------------------------------------------------------------------------
create function calendar._insert_items(p_member_id uuid, p_semester_id uuid, p_items jsonb, p_kinds text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text := calendar.chapter_timezone();
begin
  insert into calendar.dated_items (
    member_id, semester_id, kind, category, title, course, starts_at, ends_at, all_day,
    source, external_uid, dismissed
  )
  select
    p_member_id,
    p_semester_id,
    i ->> 'kind',
    case
      when i ->> 'kind' = 'exam' then 'exam'
      when i ->> 'category' in ('school', 'personal') then i ->> 'category'
      when i ->> 'kind' = 'deadline' then 'school'
      else 'personal'
    end,
    left(btrim(i ->> 'title'), 160),
    nullif(left(btrim(coalesce(i ->> 'course', '')), 60), ''),
    r.starts_at,
    case
      when (i ->> 'kind') = 'deadline' and nullif(i ->> 'end', '') is null then r.starts_at
      when (i ->> 'kind') = 'exam' and nullif(i ->> 'end', '') is null and not r.all_day then r.starts_at + interval '2 hours'
      else r.ends_at
    end,
    r.all_day,
    coalesce(nullif(i ->> 'source', ''), 'manual'),
    nullif(i ->> 'external_uid', ''),
    coalesce((i ->> 'dismissed')::boolean, false)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  cross join lateral (
    select
      x.starts_at,
      x.ends_at,
      (coalesce((i ->> 'all_day')::boolean, false) or nullif(i ->> 'start', '') is null) as all_day
    from calendar.local_range(
      (i ->> 'date')::date,
      0,
      coalesce(nullif(i ->> 'start', '')::time, '00:00'),
      coalesce(nullif(i ->> 'end', '')::time, nullif(i ->> 'start', '')::time + interval '1 minute', '00:00'),
      coalesce((i ->> 'all_day')::boolean, false) or nullif(i ->> 'start', '') is null,
      v_tz
    ) as x
  ) as r
  where (i ->> 'kind') = any (p_kinds);
end $$;

revoke execute on function calendar._insert_items(uuid, uuid, jsonb, text[]) from public, anon, authenticated;

create function calendar.save_schedule_step(
  p_step text,
  p_blocks jsonb default '[]'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_canvas_url text default null
) returns calendar.schedule_submissions
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_semester calendar.semesters;
  v_kind text;
  v_item_kinds text[];
  v_row calendar.schedule_submissions;
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_semester from calendar.semesters where is_current;
  if not found then
    raise exception 'There is no current semester yet. Ask an admin to start one.' using errcode = 'P0002';
  end if;
  if p_step not in ('classes', 'exams', 'obligations') then
    raise exception 'Unknown step' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid schedule' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_blocks, '[]'::jsonb)) > 80 or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 400 then
    raise exception 'That is more items than a schedule can hold' using errcode = '22023';
  end if;
  if p_canvas_url is not null and p_canvas_url <> '' and p_canvas_url !~ '^https://[^/\s]+/feeds/calendars/[^\s]+$' then
    raise exception 'That doesn''t look like a Canvas calendar feed link' using errcode = '22023';
  end if;

  v_kind := case p_step when 'classes' then 'class' when 'obligations' then 'obligation' end;
  v_item_kinds := case p_step when 'exams' then array['exam', 'deadline'] when 'obligations' then array['obligation'] else array[]::text[] end;

  if v_kind is not null then
    delete from calendar.weekly_blocks
    where member_id = v_uid and semester_id = v_semester.id and kind = v_kind;
    insert into calendar.weekly_blocks (member_id, semester_id, kind, category, weekday, start_time, end_time, label, location)
    select
      v_uid,
      v_semester.id,
      v_kind,
      case when v_kind = 'class' then 'school' when b ->> 'category' = 'school' then 'school' else 'personal' end,
      (b ->> 'weekday')::smallint,
      (b ->> 'start')::time,
      (b ->> 'end')::time,
      left(btrim(b ->> 'label'), 120),
      nullif(left(btrim(coalesce(b ->> 'location', '')), 120), '')
    from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b;
  end if;

  if cardinality(v_item_kinds) > 0 then
    delete from calendar.dated_items
    where member_id = v_uid and semester_id = v_semester.id and kind = any (v_item_kinds);
    perform calendar._insert_items(v_uid, v_semester.id, p_items, v_item_kinds);
  end if;

  insert into calendar.schedule_submissions (member_id, semester_id) values (v_uid, v_semester.id)
    on conflict (member_id, semester_id) do nothing;
  update calendar.schedule_submissions s set
    classes_done_at = case when p_step = 'classes' then now() else s.classes_done_at end,
    exams_done_at = case when p_step = 'exams' then now() else s.exams_done_at end,
    obligations_done_at = case when p_step = 'obligations' then now() else s.obligations_done_at end,
    canvas_feed_url = case when p_step = 'exams' then nullif(btrim(coalesce(p_canvas_url, '')), '') else s.canvas_feed_url end,
    canvas_synced_at = case when p_step = 'exams' and nullif(btrim(coalesce(p_canvas_url, '')), '') is not null then now() else s.canvas_synced_at end,
    canvas_sync_error = case when p_step = 'exams' then null else s.canvas_sync_error end,
    updated_at = now()
  where s.member_id = v_uid and s.semester_id = v_semester.id
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function calendar.save_schedule_step(text, jsonb, jsonb, text) from public, anon;

-- Daily Canvas re-sync (service role only): update items by feed UID, keep the member's
-- exam/deadline choice and removals, drop items that left the feed.
create function calendar.apply_feed_sync(p_member_id uuid, p_semester_id uuid, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text := calendar.chapter_timezone();
  v_uids text[] := array(select x ->> 'external_uid' from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x);
  v_new integer;
begin
  update calendar.dated_items d set
    title = left(btrim(i ->> 'title'), 160),
    course = nullif(left(btrim(coalesce(i ->> 'course', '')), 60), ''),
    starts_at = r.starts_at,
    ends_at = greatest(r.starts_at, case
      when d.kind = 'deadline' and nullif(i ->> 'end', '') is null then r.starts_at
      when d.kind = 'exam' and nullif(i ->> 'end', '') is null and not r.all_day then r.starts_at + interval '2 hours'
      else r.ends_at end),
    all_day = r.all_day
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
  cross join lateral (
    select x.starts_at, x.ends_at,
      (coalesce((i ->> 'all_day')::boolean, false) or nullif(i ->> 'start', '') is null) as all_day
    from calendar.local_range(
      (i ->> 'date')::date, 0,
      coalesce(nullif(i ->> 'start', '')::time, '00:00'),
      coalesce(nullif(i ->> 'end', '')::time, nullif(i ->> 'start', '')::time + interval '1 minute', '00:00'),
      coalesce((i ->> 'all_day')::boolean, false) or nullif(i ->> 'start', '') is null,
      v_tz) as x
  ) as r
  where d.member_id = p_member_id and d.semester_id = p_semester_id and d.source = 'canvas'
    and d.external_uid = i ->> 'external_uid';

  with fresh as (
    select i from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
    where not exists (
      select 1 from calendar.dated_items d
      where d.member_id = p_member_id and d.semester_id = p_semester_id and d.source = 'canvas'
        and d.external_uid = i ->> 'external_uid'
    )
  )
  select count(*) into v_new from fresh;

  perform calendar._insert_items(
    p_member_id, p_semester_id,
    coalesce((
      select jsonb_agg(i || '{"source":"canvas"}'::jsonb)
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i
      where not exists (
        select 1 from calendar.dated_items d
        where d.member_id = p_member_id and d.semester_id = p_semester_id and d.source = 'canvas'
          and d.external_uid = i ->> 'external_uid'
      )
    ), '[]'::jsonb),
    array['exam', 'deadline']
  );

  delete from calendar.dated_items d
  where d.member_id = p_member_id and d.semester_id = p_semester_id and d.source = 'canvas'
    and not (d.external_uid = any (v_uids));

  update calendar.schedule_submissions
  set canvas_synced_at = now(), canvas_sync_error = null, updated_at = now()
  where member_id = p_member_id and semester_id = p_semester_id;
  return v_new;
end $$;

revoke execute on function calendar.apply_feed_sync(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function calendar.apply_feed_sync(uuid, uuid, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Daily Canvas sync. The job reads the project URL and a shared secret from Vault
-- (see README "Canvas sync"); until those exist it simply fails quietly each day.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-canvas-feeds',
  '17 10 * * *', -- 6:17 AM Eastern (10:17 UTC during daylight time)
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-canvas',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
