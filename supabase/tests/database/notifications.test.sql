-- Phase 5: push subscriptions, notifications, reminders, inbox, hub apps.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'admin@note.test', 'authenticated', 'authenticated', '{"full_name":"Note Admin"}'),
  ('a1000000-0000-0000-0000-000000000002', 'brother@note.test', 'authenticated', 'authenticated', '{"full_name":"Note Brother"}'),
  ('a1000000-0000-0000-0000-000000000003', 'pledge@note.test', 'authenticated', 'authenticated', '{"full_name":"Note Pledge"}');
update public.members set active = false where id::text not like 'a1000000%';
update public.members set status = 'approved', role = 'admin', member_type = 'brother' where id = 'a1000000-0000-0000-0000-000000000001';
update public.members set status = 'approved', member_type = 'brother' where id = 'a1000000-0000-0000-0000-000000000002';
update public.members set status = 'approved' where id = 'a1000000-0000-0000-0000-000000000003';
update calendar.semesters set is_current = false;
insert into calendar.semesters (id, name, starts_on, ends_on, is_current)
values ('c2000000-0000-0000-0000-000000000001', 'Test', current_date - 30, current_date + 60, true);
insert into calendar.schedule_submissions (member_id, semester_id, classes_done_at, exams_done_at, obligations_done_at)
values ('a1000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', now(), now(), now());

-- Clear anything the seed queued, and turn reminders on with the weekly one due right now.
delete from calendar.notifications;
update calendar.settings set reminders_enabled = true, weekly_reminder_enabled = true,
  weekly_reminder_dow = extract(dow from now() at time zone 'America/New_York')::int,
  weekly_reminder_time = ((now() at time zone 'America/New_York') - interval '1 minute')::time;
-- Edge case: if it's just past midnight the reminder time above wraps to yesterday; skip it then.
update calendar.settings set weekly_reminder_enabled = false
where (now() at time zone 'America/New_York')::time < '00:01';

insert into calendar.events (id, title, category, starts_at, ends_at, location, hidden_from_associates) values
  ('f1000000-0000-0000-0000-000000000001', 'Chapter soon', 'required', now() + interval '30 minutes', now() + interval '90 minutes', 'Chapter House', false),
  ('f1000000-0000-0000-0000-000000000002', 'Chapter tomorrow', 'required', now() + interval '23 hours 30 minutes', now() + interval '25 hours', null, false),
  ('f1000000-0000-0000-0000-000000000003', 'Chapter later today', 'required', now() + interval '5 hours', now() + interval '6 hours', null, false),
  ('f1000000-0000-0000-0000-000000000004', 'Exec soon', 'required', now() + interval '40 minutes', now() + interval '2 hours', null, true),
  ('f1000000-0000-0000-0000-000000000005', 'Mixer soon', 'social', now() + interval '45 minutes', now() + interval '3 hours', null, false);
insert into calendar.rsvps (event_id, member_id, status) values
  ('f1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 'going'),
  ('f1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'not_going');
insert into calendar.excuses (event_id, member_id, reason, status) values
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'Sick', 'approved');

set local role service_role;
select ok(calendar.queue_due_notifications() >= 5, 'due reminders are queued');
select is(calendar.queue_due_notifications(), 0, 'reminders are queued once');
select is(
  (select array_agg(dedupe_key order by dedupe_key) from calendar.notifications where kind = 'reminder'),
  array[
    'event:f1000000-0000-0000-0000-000000000001:1h',
    'event:f1000000-0000-0000-0000-000000000002:24h',
    'event:f1000000-0000-0000-0000-000000000004:1h',
    'event:f1000000-0000-0000-0000-000000000005:1h'
  ],
  '1-hour and 24-hour reminders for required and RSVP''d events, nothing for events 5 hours out'
);
select is(
  (select body from calendar.notifications where dedupe_key like 'event:f1000000-0000-0000-0000-000000000001:%'),
  'Starts at ' || to_char((now() + interval '30 minutes') at time zone 'America/New_York', 'FMHH12:MI AM') || ' · Chapter House',
  'reminders say when and where'
);
select is(
  (select count(*)::int from calendar.notifications where kind = 'weekly'),
  case when (now() at time zone 'America/New_York')::time < '00:01' then 0 else 1 end,
  'the weekly "mark your nights" reminder is queued at the set day and time'
);
select is(
  (select array_agg(r.name order by r.name) from calendar.notifications n
   cross join lateral calendar.notification_recipients(n.id) r where n.dedupe_key like 'event:f1000000-0000-0000-0000-000000000001:%'),
  array['Note Admin', 'Note Brother'],
  'required event reminders skip members with an approved excuse'
);
select is(
  (select array_agg(r.name order by r.name) from calendar.notifications n
   cross join lateral calendar.notification_recipients(n.id) r where n.dedupe_key like 'event:f1000000-0000-0000-0000-000000000004:%'),
  array['Note Admin', 'Note Brother'],
  'reminders for events hidden from pledges skip pledges'
);
select is(
  (select array_agg(r.name order by r.name) from calendar.notifications n
   cross join lateral calendar.notification_recipients(n.id) r where n.dedupe_key like 'event:f1000000-0000-0000-0000-000000000005:%'),
  array['Note Pledge'],
  'RSVP reminders only go to members going or maybe'
);
select is(
  (select count(*)::int from calendar.claim_due_notifications(50)),
  (select count(*)::int from calendar.notifications where send_at <= now()),
  'the sender claims every due notification'
);
select is((select count(*)::int from calendar.claim_due_notifications(50)), 0, 'claimed notifications are not claimed twice');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select calendar.save_push_subscription('https://push.example.com/abc', 'BPkey', 'authkey', 'Test browser')$$,
  'members save a push subscription'
);
select lives_ok(
  $$select calendar.save_push_subscription('https://push.example.com/abc', 'BPkey2', 'authkey2', 'Test browser')$$,
  'saving the same device again updates it'
);
select is((select p256dh from calendar.push_subscriptions), 'BPkey2', 'members see their own devices');
select throws_ok(
  $$select calendar.send_notification('Hi', 'There', 'everyone')$$,
  '42501', null, 'only admins send notifications'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from calendar.push_subscriptions), 0, 'members cannot see other members'' devices');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select calendar.send_notification('Hi', 'There', 'members', '{}')$$,
  '22023', null, 'sending to specific members needs at least one'
);
select is(
  (select kind || '/' || status from calendar.send_notification('Finish your schedule', 'Takes 5 minutes', 'unsubmitted')),
  'nudge/scheduled',
  'nudging members without a schedule'
);
select set_config('test.later', (select id::text from calendar.send_notification('Formal tickets', 'On sale Monday', 'brothers', '{}', now() + interval '2 days')), true);
select lives_ok($$select calendar.cancel_notification(current_setting('test.later')::uuid)$$, 'admins cancel a scheduled notification');
select throws_ok(
  $$select calendar.cancel_notification(current_setting('test.later')::uuid)$$,
  '22023', null, 'only scheduled notifications can be canceled'
);

reset role;
set local role service_role;
select is(
  (select array_agg(r.name order by r.name) from calendar.notifications n
   cross join lateral calendar.notification_recipients(n.id) r where n.kind = 'nudge'),
  array['Note Admin', 'Note Pledge'],
  'nudges go to members who haven''t submitted this semester''s schedule'
);
insert into calendar.notification_inbox (notification_id, member_id)
select id, 'a1000000-0000-0000-0000-000000000002' from calendar.notifications where kind = 'weekly' or dedupe_key like 'event:f1000000-0000-0000-0000-000000000001:%';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from calendar.notifications),
  (select count(*)::int from calendar.notification_inbox),
  'members see only notifications in their inbox'
);
select lives_ok($$select calendar.mark_inbox_read()$$, 'members mark their inbox read');
select is((select count(*)::int from calendar.notification_inbox where read_at is null), 0, 'everything is read');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select calendar.review_excuse((select id from calendar.excuses where member_id = 'a1000000-0000-0000-0000-000000000003'), false, 'Need a doctor''s note')$$,
  'admins review an excuse'
);
select is(
  (select title || ': ' || body from calendar.notifications where kind = 'excuse'),
  'Excuse denied: Chapter soon: Need a doctor''s note',
  'the member is told the decision'
);
select lives_ok(
  $$insert into public.hub_apps (name, url, icon) values ('Dues', 'https://dues.example.com', '💵')$$,
  'admins add hub apps'
);

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select ok((select count(*) from public.hub_apps) >= 2, 'members see the hub apps');
select throws_ok(
  $$insert into public.hub_apps (name, url) values ('Nope', 'https://nope.example.com')$$,
  '42501', null, 'only admins add hub apps'
);

select * from finish();
rollback;
