-- =============================================================================
-- Calendar app: categories, events (with recurring series), RSVPs, .ics feeds.
-- Everything app-specific lives in the `calendar` schema so other hub apps can
-- share auth + public.members without name collisions.
-- =============================================================================

create schema if not exists calendar;

grant usage on schema calendar to anon, authenticated, service_role;
alter default privileges in schema calendar grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema calendar grant all on tables to service_role;
alter default privileges in schema calendar grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema calendar revoke execute on functions from public;
alter default privileges in schema calendar grant execute on functions to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Settings (single row)
-- -----------------------------------------------------------------------------
create table calendar.settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/New_York',
  night_start time not null default '19:00',
  night_end time not null default '23:00',
  secretary_email text check (secretary_email is null or secretary_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);
insert into calendar.settings default values;

create trigger settings_set_updated_at before update on calendar.settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Categories (fixed keys; admins may recolor later)
-- -----------------------------------------------------------------------------
create table calendar.categories (
  key text primary key check (key ~ '^[a-z_]{2,32}$'),
  label text not null check (char_length(label) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order smallint not null default 0
);

-- Every color passes WCAG AA (>= 4.5:1) with white text. See src/lib/categories.test.ts.
insert into calendar.categories (key, label, color, sort_order) values
  ('social',       'Socials',                         '#7C3AED', 1),
  ('philanthropy', 'Philanthropy',                    '#BE185D', 2),
  ('rush',         'Rush',                            '#C2410C', 3),
  ('required',     'Required Chapter Event',          '#1D4ED8', 4),
  ('exam',         'Exams',                           '#A16207', 5),
  ('school',       'School/Involvement Obligations',  '#0F766E', 6),
  ('personal',     'Personal',                        '#4B5563', 7);

-- Which categories each chair manages.
create table calendar.chair_categories (
  member_id uuid not null references public.members (id) on delete cascade,
  category text not null references calendar.categories (key) on update cascade on delete cascade,
  primary key (member_id, category)
);

create function calendar.can_manage_category(p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1
    from public.members m
    join calendar.chair_categories c on c.member_id = m.id
    where m.id = (select auth.uid())
      and m.status = 'approved' and m.active and m.role = 'chair'
      and c.category = p_category
  );
$$;

-- -----------------------------------------------------------------------------
-- Events. A recurring event is stored as one row per occurrence that share a
-- series_id, so RSVPs / attendance / reminders always point at a concrete row.
-- -----------------------------------------------------------------------------
create table calendar.event_series (
  id uuid primary key default gen_random_uuid(),
  freq text not null check (freq in ('daily', 'weekly', 'monthly')),
  "interval" smallint not null default 1 check ("interval" between 1 and 12),
  by_weekday smallint[] check (by_weekday <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  until_date date,
  occurrence_count smallint check (occurrence_count between 1 and 200),
  created_by uuid default auth.uid() references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  check (until_date is not null or occurrence_count is not null)
);

create table calendar.events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references calendar.event_series (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null references calendar.categories (key) on update cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (char_length(location) <= 200),
  description text check (char_length(description) <= 4000),
  required boolean not null default false,
  hidden_from_associates boolean not null default false,
  rsvp_enabled boolean not null default true,
  created_by uuid default auth.uid() references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '14 days')
);

create index events_starts_at_idx on calendar.events (starts_at);
create index events_ends_at_idx on calendar.events (ends_at);
create index events_series_idx on calendar.events (series_id, starts_at);

create function calendar.normalize_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.location := nullif(btrim(new.location), '');
  new.description := nullif(btrim(new.description), '');
  if new.category = 'required' then
    new.required := true;
  end if;
  -- Required events are not optional, so there is nothing to RSVP to.
  if new.required then
    new.rsvp_enabled := false;
  end if;
  return new;
end $$;

create trigger events_normalize before insert or update on calendar.events
  for each row execute function calendar.normalize_event();
create trigger events_set_updated_at before update on calendar.events
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RSVPs (non-required events only)
-- -----------------------------------------------------------------------------
create table calendar.rsvps (
  event_id uuid not null references calendar.events (id) on delete cascade,
  member_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'not_going')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index rsvps_member_idx on calendar.rsvps (member_id);

create trigger rsvps_set_updated_at before update on calendar.rsvps
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Per-member secret token for the .ics subscription feed
-- -----------------------------------------------------------------------------
create table calendar.feed_tokens (
  member_id uuid primary key references public.members (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table calendar.settings enable row level security;
alter table calendar.categories enable row level security;
alter table calendar.chair_categories enable row level security;
alter table calendar.event_series enable row level security;
alter table calendar.events enable row level security;
alter table calendar.rsvps enable row level security;
alter table calendar.feed_tokens enable row level security;

create policy settings_select on calendar.settings for select to authenticated
  using ((select public.is_member()));
create policy settings_update on calendar.settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy categories_select on calendar.categories for select to authenticated
  using (true);
create policy categories_update on calendar.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy chair_categories_select on calendar.chair_categories for select to authenticated
  using ((select public.is_member()));
create policy chair_categories_insert on calendar.chair_categories for insert to authenticated
  with check ((select public.is_admin()));
create policy chair_categories_delete on calendar.chair_categories for delete to authenticated
  using ((select public.is_admin()));

create policy event_series_select on calendar.event_series for select to authenticated
  using ((select public.is_member()));
create policy event_series_insert on calendar.event_series for insert to authenticated
  with check ((select public.is_admin()) or (select public.is_chair()));
create policy event_series_delete on calendar.event_series for delete to authenticated
  using ((select public.is_admin()) or (select public.is_chair()));

-- Associates never see events flagged hidden_from_associates (rush/pledge planning).
create policy events_select on calendar.events for select to authenticated
  using ((select public.is_member()) and (not hidden_from_associates or (select public.is_brother())));
create policy events_insert on calendar.events for insert to authenticated
  with check (calendar.can_manage_category(category));
create policy events_update on calendar.events for update to authenticated
  using (calendar.can_manage_category(category))
  with check (calendar.can_manage_category(category));
create policy events_delete on calendar.events for delete to authenticated
  using (calendar.can_manage_category(category));

-- Brothers see everyone's RSVPs; associates only their own.
create policy rsvps_select on calendar.rsvps for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_brother()));
-- The events subquery runs under the caller's RLS, so associates cannot RSVP to hidden events.
create policy rsvps_insert on calendar.rsvps for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.is_member())
    and exists (
      select 1 from calendar.events e
      where e.id = event_id and not e.required and e.rsvp_enabled and e.ends_at > now()
    )
  );
create policy rsvps_update on calendar.rsvps for update to authenticated
  using (member_id = (select auth.uid()))
  with check (
    member_id = (select auth.uid())
    and exists (
      select 1 from calendar.events e
      where e.id = event_id and not e.required and e.rsvp_enabled and e.ends_at > now()
    )
  );
create policy rsvps_delete on calendar.rsvps for delete to authenticated
  using (member_id = (select auth.uid()));

-- feed_tokens: no policies; only reachable through calendar.feed_token().
revoke all on calendar.feed_tokens from anon, authenticated;
revoke all on calendar.settings, calendar.categories, calendar.chair_categories, calendar.event_series,
  calendar.events, calendar.rsvps from anon;

-- -----------------------------------------------------------------------------
-- Time helpers. All local dates/times are in calendar.settings.timezone
-- (America/New_York), so DST is handled by Postgres.
-- -----------------------------------------------------------------------------
create function calendar.chapter_timezone() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.timezone from calendar.settings s), 'America/New_York');
$$;

create function calendar.local_range(
  p_date date, p_span_days int, p_start time, p_end time, p_all_day boolean, p_tz text,
  out starts_at timestamptz, out ends_at timestamptz
)
language plpgsql stable set search_path = '' as $$
begin
  if p_all_day then
    starts_at := p_date::timestamp at time zone p_tz;
    ends_at := (p_date + p_span_days + 1)::timestamp at time zone p_tz;
  else
    starts_at := (p_date + p_start) at time zone p_tz;
    ends_at := ((p_date + p_span_days) + p_end) at time zone p_tz;
    -- "9 PM - 1 AM" on one date means the event ends after midnight.
    if ends_at <= starts_at then
      ends_at := ((p_date + p_span_days + 1) + p_end) at time zone p_tz;
    end if;
  end if;
end $$;

-- Dates of a repeating event. Capped at 200 occurrences / 2 years.
create function calendar.expand_recurrence(
  p_start date, p_freq text, p_interval int, p_by_weekday int[], p_until date, p_count int
) returns date[]
language plpgsql immutable set search_path = '' as $$
declare
  v_limit date;
  v_max int;
  v_result date[] := '{}';
  v_d date;
  v_week_start date;
  v_days int[];
  v_wd int;
  v_k int := 0;
begin
  if p_freq is null or p_freq not in ('daily', 'weekly', 'monthly') then
    raise exception 'Repeat must be daily, weekly or monthly' using errcode = '22023';
  end if;
  if p_interval is null or p_interval < 1 or p_interval > 12 then
    raise exception 'Repeat interval must be between 1 and 12' using errcode = '22023';
  end if;
  if p_until is null and p_count is null then
    raise exception 'A repeating event needs an end date or a number of times' using errcode = '22023';
  end if;
  if p_until is not null and p_until < p_start then
    raise exception 'The repeat end date is before the first event' using errcode = '22023';
  end if;
  if p_count is not null and (p_count < 1 or p_count > 200) then
    raise exception 'A repeating event can happen at most 200 times' using errcode = '22023';
  end if;

  v_limit := least(coalesce(p_until, p_start + 730), p_start + 730);
  v_max := least(coalesce(p_count, 200), 200);

  if p_freq = 'daily' then
    v_d := p_start;
    while v_d <= v_limit and cardinality(v_result) < v_max loop
      v_result := v_result || v_d;
      v_d := v_d + p_interval;
    end loop;
  elsif p_freq = 'weekly' then
    select coalesce(array_agg(distinct x order by x), array[extract(dow from p_start)::int])
      into v_days
      from unnest(p_by_weekday) as x
      where x between 0 and 6;
    v_week_start := p_start - extract(dow from p_start)::int;
    <<weeks>>
    loop
      foreach v_wd in array v_days loop
        v_d := v_week_start + v_wd;
        exit weeks when v_d > v_limit or cardinality(v_result) >= v_max;
        if v_d >= p_start then
          v_result := v_result || v_d;
        end if;
      end loop;
      v_week_start := v_week_start + 7 * p_interval;
    end loop;
  else
    loop
      v_d := (p_start + make_interval(months => v_k * p_interval))::date;
      exit when v_d > v_limit or cardinality(v_result) >= v_max;
      -- Skip months without this day (e.g. the 31st), like Google Calendar.
      if extract(day from v_d) = extract(day from p_start) then
        v_result := v_result || v_d;
      end if;
      v_k := v_k + 1;
    end loop;
  end if;

  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Event write API. SECURITY INVOKER: the caller's RLS decides what they may write.
--
-- Payload (local chapter time):
--   title, category, start_date 'YYYY-MM-DD', end_date (optional, multi-day),
--   start_time 'HH:MM', end_time 'HH:MM', all_day, location, description,
--   required, hidden_from_associates, rsvp_enabled,
--   recurrence: null | { freq, interval, by_weekday: int[], until: 'YYYY-MM-DD', count }
-- -----------------------------------------------------------------------------
create function calendar.create_event(p jsonb) returns setof calendar.events
language plpgsql security invoker set search_path = '' as $$
declare
  v_tz text := calendar.chapter_timezone();
  v_all_day boolean := coalesce((p ->> 'all_day')::boolean, false);
  v_start_date date := nullif(p ->> 'start_date', '')::date;
  v_end_date date := coalesce(nullif(p ->> 'end_date', '')::date, nullif(p ->> 'start_date', '')::date);
  v_start_time time := coalesce(nullif(p ->> 'start_time', '')::time, '00:00');
  v_end_time time := coalesce(nullif(p ->> 'end_time', '')::time, '00:00');
  v_rec jsonb := nullif(p -> 'recurrence', 'null'::jsonb);
  v_by_weekday int[];
  v_series uuid;
  v_dates date[];
begin
  if v_start_date is null then
    raise exception 'Pick a date' using errcode = '22023';
  end if;
  if v_end_date < v_start_date then
    raise exception 'The end date is before the start date' using errcode = '22023';
  end if;

  if v_rec is null then
    v_dates := array[v_start_date];
  else
    select array_agg(x::int) into v_by_weekday
      from jsonb_array_elements_text(coalesce(v_rec -> 'by_weekday', '[]'::jsonb)) as x;
    v_dates := calendar.expand_recurrence(
      v_start_date,
      v_rec ->> 'freq',
      coalesce(nullif(v_rec ->> 'interval', '')::int, 1),
      v_by_weekday,
      nullif(v_rec ->> 'until', '')::date,
      nullif(v_rec ->> 'count', '')::int
    );
    if cardinality(v_dates) = 0 then
      raise exception 'That repeat rule does not produce any dates' using errcode = '22023';
    end if;
    insert into calendar.event_series (freq, "interval", by_weekday, until_date, occurrence_count)
    values (
      v_rec ->> 'freq',
      coalesce(nullif(v_rec ->> 'interval', '')::int, 1),
      v_by_weekday::smallint[],
      nullif(v_rec ->> 'until', '')::date,
      nullif(v_rec ->> 'count', '')::int
    )
    returning id into v_series;
  end if;

  return query
  insert into calendar.events (
    series_id, title, category, starts_at, ends_at, all_day, location, description,
    required, hidden_from_associates, rsvp_enabled
  )
  select
    v_series,
    p ->> 'title',
    p ->> 'category',
    r.starts_at,
    r.ends_at,
    v_all_day,
    p ->> 'location',
    p ->> 'description',
    coalesce((p ->> 'required')::boolean, false),
    coalesce((p ->> 'hidden_from_associates')::boolean, false),
    coalesce((p ->> 'rsvp_enabled')::boolean, true)
  from unnest(v_dates) as d
  cross join lateral calendar.local_range(d, v_end_date - v_start_date, v_start_time, v_end_time, v_all_day, v_tz) as r
  returning *;
end $$;

-- p_scope: 'single' = only this occurrence; 'following' = this and later occurrences in the series.
-- For 'following', each occurrence keeps its own date, shifted by however many days the
-- edited occurrence moved, and takes the new times/details.
create function calendar.update_event(p_id uuid, p jsonb, p_scope text default 'single')
returns setof calendar.events
language plpgsql security invoker set search_path = '' as $$
declare
  v_tz text := calendar.chapter_timezone();
  v_event calendar.events;
  v_all_day boolean := coalesce((p ->> 'all_day')::boolean, false);
  v_start_date date := nullif(p ->> 'start_date', '')::date;
  v_end_date date := coalesce(nullif(p ->> 'end_date', '')::date, nullif(p ->> 'start_date', '')::date);
  v_start_time time := coalesce(nullif(p ->> 'start_time', '')::time, '00:00');
  v_end_time time := coalesce(nullif(p ->> 'end_time', '')::time, '00:00');
  v_shift int;
begin
  if p_scope not in ('single', 'following') then
    raise exception 'Unknown edit scope' using errcode = '22023';
  end if;
  if v_start_date is null then
    raise exception 'Pick a date' using errcode = '22023';
  end if;
  if v_end_date < v_start_date then
    raise exception 'The end date is before the start date' using errcode = '22023';
  end if;

  select * into v_event from calendar.events e where e.id = p_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  v_shift := v_start_date - (v_event.starts_at at time zone v_tz)::date;

  return query
  with targets as (
    select e.id, (e.starts_at at time zone v_tz)::date + v_shift as d
    from calendar.events e
    where e.id = p_id
       or (p_scope = 'following' and e.series_id = v_event.series_id and e.starts_at >= v_event.starts_at)
  )
  update calendar.events e set
    title = p ->> 'title',
    category = p ->> 'category',
    location = p ->> 'location',
    description = p ->> 'description',
    required = coalesce((p ->> 'required')::boolean, false),
    hidden_from_associates = coalesce((p ->> 'hidden_from_associates')::boolean, false),
    rsvp_enabled = coalesce((p ->> 'rsvp_enabled')::boolean, true),
    all_day = v_all_day,
    starts_at = r.starts_at,
    ends_at = r.ends_at
  from targets t
  cross join lateral calendar.local_range(t.d, v_end_date - v_start_date, v_start_time, v_end_time, v_all_day, v_tz) as r
  where e.id = t.id
  returning e.*;

  if not found then
    raise exception 'You can''t edit this event' using errcode = '42501';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- .ics feed
-- -----------------------------------------------------------------------------
create function calendar.feed_token(p_rotate boolean default false) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_token text;
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_rotate then
    delete from calendar.feed_tokens where member_id = (select auth.uid());
  end if;
  insert into calendar.feed_tokens (member_id) values ((select auth.uid()))
    on conflict (member_id) do nothing;
  select t.token into v_token from calendar.feed_tokens t where t.member_id = (select auth.uid());
  return v_token;
end $$;

-- Events visible to the token's owner, from 60 days ago to ~13 months ahead.
-- Raises P0002 for unknown/revoked tokens or members who lost access.
-- Only the ics-feed Edge Function (service role) may call this.
create function calendar.feed_events(p_token text)
returns table (
  id uuid, title text, category text, category_label text, starts_at timestamptz,
  ends_at timestamptz, all_day boolean, location text, description text, required boolean,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_type public.member_type;
begin
  select m.member_type into v_type
  from calendar.feed_tokens t
  join public.members m on m.id = t.member_id and m.status = 'approved' and m.active
  where t.token = p_token;
  if not found then
    raise exception 'Unknown feed token' using errcode = 'P0002';
  end if;

  return query
  select e.id, e.title, e.category, c.label, e.starts_at, e.ends_at, e.all_day, e.location,
         e.description, e.required, e.updated_at
  from calendar.events e
  join calendar.categories c on c.key = e.category
  where (v_type = 'brother' or not e.hidden_from_associates)
    and e.ends_at > now() - interval '60 days'
    and e.starts_at < now() + interval '400 days'
  order by e.starts_at;
end $$;

revoke execute on function calendar.feed_events(text) from public, anon, authenticated;
grant execute on function calendar.feed_events(text) to service_role;
revoke execute on function calendar.feed_token(boolean) from public, anon;
