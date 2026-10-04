-- =============================================================================
-- Phase 5: notifications (Web Push with email fallback), admin settings, and the
-- hub "Apps" menu.
--
-- Every notification is a row in calendar.notifications. The send-notifications
-- Edge Function (pg_cron every 5 minutes, or right away when an admin sends one)
-- queues automatic reminders, claims due rows, writes each recipient's in-app
-- inbox row, sends Web Push, and emails members who have no working push device.
-- =============================================================================

alter table calendar.settings
  add column reminders_enabled boolean not null default true,
  add column weekly_reminder_enabled boolean not null default true,
  add column weekly_reminder_dow smallint not null default 0 check (weekly_reminder_dow between 0 and 6),
  add column weekly_reminder_time time not null default '18:00',
  add column email_fallback boolean not null default true;

-- -----------------------------------------------------------------------------
-- Push subscriptions (one per device/browser)
-- -----------------------------------------------------------------------------
create table calendar.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count smallint not null default 0
);
create index push_subscriptions_member_idx on calendar.push_subscriptions (member_id);

-- -----------------------------------------------------------------------------
-- Notifications and each member's inbox
-- -----------------------------------------------------------------------------
create table calendar.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('manual', 'nudge', 'reminder', 'weekly', 'excuse')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 300),
  url text not null default '/' check (url ~ '^/' and char_length(url) <= 300),
  audience text not null check (audience in ('everyone', 'brothers', 'pledges', 'members', 'unsubmitted')),
  member_ids uuid[] not null default '{}',
  event_id uuid references calendar.events (id) on delete cascade,
  send_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'canceled', 'failed')),
  dedupe_key text unique,
  claimed_at timestamptz,
  sent_at timestamptz,
  recipients integer,
  pushed integer,
  emailed integer,
  error text,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);
create index notifications_due_idx on calendar.notifications (send_at) where status in ('scheduled', 'sending');
create index notifications_created_idx on calendar.notifications (created_at desc);

create table calendar.notification_inbox (
  notification_id uuid not null references calendar.notifications (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  pushed boolean not null default false,
  emailed boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (notification_id, member_id)
);
create index notification_inbox_member_idx on calendar.notification_inbox (member_id, created_at desc);

alter table calendar.push_subscriptions enable row level security;
alter table calendar.notifications enable row level security;
alter table calendar.notification_inbox enable row level security;

create policy push_subscriptions_select on calendar.push_subscriptions for select to authenticated
  using (member_id = (select auth.uid()));
-- Members read the notifications in their own inbox; admins read them all.
create policy notifications_select on calendar.notifications for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from calendar.notification_inbox i
      where i.notification_id = notifications.id and i.member_id = (select auth.uid())
    )
  );
create policy inbox_select on calendar.notification_inbox for select to authenticated
  using (member_id = (select auth.uid()));

revoke insert, update, delete, truncate on calendar.push_subscriptions, calendar.notifications,
  calendar.notification_inbox from authenticated;
revoke all on calendar.push_subscriptions, calendar.notifications, calendar.notification_inbox from anon;

-- -----------------------------------------------------------------------------
-- Member-facing RPCs
-- -----------------------------------------------------------------------------
create function calendar.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- A device belongs to whoever signed in on it last.
  insert into calendar.push_subscriptions (member_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, failure_count = 0, created_at = now();
end $$;

create function calendar.delete_push_subscription(p_endpoint text)
returns void
language sql volatile security definer set search_path = '' as $$
  delete from calendar.push_subscriptions where endpoint = p_endpoint and member_id = (select auth.uid());
$$;

create function calendar.mark_inbox_read(p_notification_ids uuid[] default null)
returns void
language sql volatile security definer set search_path = '' as $$
  update calendar.notification_inbox set read_at = now()
  where member_id = (select auth.uid()) and read_at is null
    and (p_notification_ids is null or notification_id = any (p_notification_ids));
$$;

-- -----------------------------------------------------------------------------
-- Admin RPCs
-- -----------------------------------------------------------------------------
create function calendar.send_notification(
  p_title text,
  p_body text,
  p_audience text,
  p_member_ids uuid[] default '{}',
  p_send_at timestamptz default null,
  p_url text default '/'
) returns calendar.notifications
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row calendar.notifications;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send notifications' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Add a title (up to 80 characters)' using errcode = '22023';
  end if;
  if char_length(coalesce(p_body, '')) > 300 then
    raise exception 'Keep the message under 300 characters' using errcode = '22023';
  end if;
  if p_audience is null or p_audience not in ('everyone', 'brothers', 'pledges', 'members', 'unsubmitted') then
    raise exception 'Pick who gets it' using errcode = '22023';
  end if;
  if p_audience = 'members' and cardinality(coalesce(p_member_ids, '{}')) = 0 then
    raise exception 'Pick at least one member' using errcode = '22023';
  end if;
  if p_send_at is not null and (p_send_at < now() - interval '5 minutes' or p_send_at > now() + interval '1 year') then
    raise exception 'Pick a time in the next year' using errcode = '22023';
  end if;
  insert into calendar.notifications (kind, title, body, url, audience, member_ids, send_at, created_by)
  values (
    case when p_audience = 'unsubmitted' then 'nudge' else 'manual' end,
    btrim(p_title),
    btrim(coalesce(p_body, '')),
    case when coalesce(p_url, '') ~ '^/' then p_url else '/' end,
    p_audience,
    case when p_audience = 'members' then p_member_ids else '{}' end,
    coalesce(p_send_at, now()),
    (select auth.uid())
  )
  returning * into v_row;
  return v_row;
end $$;

create function calendar.cancel_notification(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel notifications' using errcode = '42501';
  end if;
  update calendar.notifications set status = 'canceled' where id = p_id and status = 'scheduled';
  if not found then
    raise exception 'Only scheduled notifications can be canceled' using errcode = '22023';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Sender (service role only)
-- -----------------------------------------------------------------------------

-- Who gets a notification. Event reminders skip members who can't see the event or
-- have an approved excuse for it.
create function calendar.notification_recipients(p_notification_id uuid)
returns table (member_id uuid, name text, email text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.email
  from calendar.notifications n
  join public.members m on m.status = 'approved' and m.active
  left join calendar.events e on e.id = n.event_id
  where n.id = p_notification_id
    and case n.audience
      when 'everyone' then true
      when 'brothers' then m.member_type = 'brother'
      when 'pledges' then m.member_type = 'associate'
      when 'members' then m.id = any (n.member_ids)
      when 'unsubmitted' then not exists (
        select 1 from calendar.schedule_submissions s
        join calendar.semesters sem on sem.id = s.semester_id and sem.is_current
        where s.member_id = m.id and s.completed
      )
      else false
    end
    and (e.id is null or m.member_type = 'brother' or not e.hidden_from_associates)
    and (e.id is null or not exists (
      select 1 from calendar.excuses x where x.event_id = e.id and x.member_id = m.id and x.status = 'approved'
    ));
$$;

-- Adds automatic reminders that are due: 24 hours and 1 hour before required events and
-- events members RSVP'd going/maybe to, plus the weekly "mark your nights" reminder.
create function calendar.queue_due_notifications()
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_settings calendar.settings;
  v_local timestamp;
  v_count integer := 0;
  v_n integer;
begin
  select * into v_settings from calendar.settings;
  v_local := now() at time zone v_settings.timezone;

  if v_settings.reminders_enabled then
    insert into calendar.notifications (kind, title, body, url, audience, member_ids, event_id, send_at, dedupe_key)
    select
      'reminder',
      left(e.title, 80),
      case w.label when '24h' then 'Tomorrow at ' else 'Starts at ' end
        || to_char(e.starts_at at time zone v_settings.timezone, 'FMHH12:MI AM')
        || coalesce(' · ' || e.location, ''),
      '/?event=' || e.id,
      case when not e.required then 'members' when e.hidden_from_associates then 'brothers' else 'everyone' end,
      case when e.required then '{}'::uuid[] else array(
        select r.member_id from calendar.rsvps r where r.event_id = e.id and r.status in ('going', 'maybe')
      ) end,
      e.id,
      now(),
      'event:' || e.id || ':' || w.label
    from calendar.events e
    cross join (values ('24h', interval '23 hours', interval '24 hours'), ('1h', interval '0 hours', interval '1 hour')) as w(label, lo, hi)
    where not e.all_day
      and e.starts_at > now() + w.lo
      and e.starts_at <= now() + w.hi
      and (e.required or exists (select 1 from calendar.rsvps r where r.event_id = e.id and r.status in ('going', 'maybe')))
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if v_settings.weekly_reminder_enabled
    and extract(dow from v_local)::int = v_settings.weekly_reminder_dow
    and v_local >= v_local::date + v_settings.weekly_reminder_time
    and v_local < v_local::date + v_settings.weekly_reminder_time + interval '2 hours'
  then
    insert into calendar.notifications (kind, title, body, url, audience, send_at, dedupe_key)
    values (
      'weekly',
      'Mark the nights you can''t make',
      'Take a few seconds to mark the nights you''re busy this week so planners know who''s free.',
      '/?view=availability',
      'everyone',
      now(),
      'weekly:' || v_local::date
    )
    on conflict (dedupe_key) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;
  return v_count;
end $$;

-- Takes up to p_limit due notifications for sending. Rows stuck in "sending" for 10
-- minutes (a crashed run) are taken again; inbox rows are idempotent.
create function calendar.claim_due_notifications(p_limit integer default 20)
returns setof calendar.notifications
language sql volatile security definer set search_path = '' as $$
  update calendar.notifications n set status = 'sending', claimed_at = now()
  where n.id in (
    select x.id from calendar.notifications x
    where x.send_at <= now()
      and (x.status = 'scheduled' or (x.status = 'sending' and x.claimed_at < now() - interval '10 minutes'))
    order by x.send_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
$$;

revoke execute on function calendar.notification_recipients(uuid) from public, anon, authenticated;
revoke execute on function calendar.queue_due_notifications() from public, anon, authenticated;
revoke execute on function calendar.claim_due_notifications(integer) from public, anon, authenticated;
grant execute on function calendar.notification_recipients(uuid) to service_role;
grant execute on function calendar.queue_due_notifications() to service_role;
grant execute on function calendar.claim_due_notifications(integer) to service_role;
revoke execute on function calendar.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function calendar.delete_push_subscription(text) from public, anon;
revoke execute on function calendar.mark_inbox_read(uuid[]) from public, anon;
revoke execute on function calendar.send_notification(text, text, text, uuid[], timestamptz, text) from public, anon;
revoke execute on function calendar.cancel_notification(uuid) from public, anon;

-- Tell members when an excuse is decided.
create function calendar.notify_excuse_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
begin
  if new.status is distinct from old.status and new.status in ('approved', 'denied') then
    select e.title into v_title from calendar.events e where e.id = new.event_id;
    insert into calendar.notifications (kind, title, body, url, audience, member_ids, send_at, dedupe_key)
    values (
      'excuse',
      case when new.status = 'approved' then 'Excuse approved' else 'Excuse denied' end,
      left(coalesce(v_title, 'Your event') || coalesce(': ' || new.review_note, ''), 300),
      '/excuse',
      'members',
      array[new.member_id],
      now(),
      'excuse:' || new.id || ':' || new.status || ':' || floor(extract(epoch from now()))::bigint
    )
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;

create trigger excuses_notify_review after update of status on calendar.excuses
  for each row execute function calendar.notify_excuse_review();

-- -----------------------------------------------------------------------------
-- Hub apps (shared by every app in the hub; shown in the header "Apps" menu)
-- -----------------------------------------------------------------------------
create table public.hub_apps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  url text not null check (url ~ '^(https://|/)' and char_length(url) <= 300),
  icon text not null default '📅' check (char_length(icon) between 1 and 300),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.hub_apps is 'Apps in the chapter hub, listed in every app''s header menu.';

alter table public.hub_apps enable row level security;
create policy hub_apps_select on public.hub_apps for select to authenticated
  using ((select public.is_member()));
create policy hub_apps_insert on public.hub_apps for insert to authenticated
  with check ((select public.is_admin()));
create policy hub_apps_update on public.hub_apps for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy hub_apps_delete on public.hub_apps for delete to authenticated
  using ((select public.is_admin()));
revoke all on public.hub_apps from anon;
grant select, insert, update, delete on public.hub_apps to authenticated;

insert into public.hub_apps (name, url, icon, sort_order) values ('Calendar', '/', '📅', 0);

-- -----------------------------------------------------------------------------
-- Every 5 minutes: reminders and scheduled notifications (see README "Notifications").
-- -----------------------------------------------------------------------------
select cron.schedule(
  'send-notifications',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
