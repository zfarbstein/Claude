-- Run with: npx supabase test db
-- Every check runs inside a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ---------------------------------------------------------------------------
-- Fixtures (inserted as postgres, which bypasses RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local',    'authenticated', 'authenticated', '{"full_name":"Test Admin"}'),
  ('a0000000-0000-0000-0000-000000000002', 'brother2@test.local', 'authenticated', 'authenticated', '{"full_name":"Test Brother Two"}'),
  ('a0000000-0000-0000-0000-000000000003', 'brother@test.local',  'authenticated', 'authenticated', '{"full_name":"Test Brother"}'),
  ('a0000000-0000-0000-0000-000000000004', 'am@test.local',       'authenticated', 'authenticated', '{"full_name":"Test AM"}'),
  ('a0000000-0000-0000-0000-000000000005', 'pending@test.local',  'authenticated', 'authenticated', '{"name":"Test Pending"}'),
  ('a0000000-0000-0000-0000-000000000006', 'inactive@test.local', 'authenticated', 'authenticated', '{}');

select is(
  (select status::text || '/' || member_type::text || '/' || name from public.members where id = 'a0000000-0000-0000-0000-000000000005'),
  'pending/associate/Test Pending',
  'new auth users get a pending, least-privileged member row'
);
select is(
  (select name from public.members where id = 'a0000000-0000-0000-0000-000000000006'),
  'inactive',
  'name falls back to the email local part'
);

update public.members set status = 'approved', role = 'admin', member_type = 'brother' where id = 'a0000000-0000-0000-0000-000000000001';
update public.members set status = 'approved', member_type = 'brother' where id = 'a0000000-0000-0000-0000-000000000002';
update public.members set status = 'approved', member_type = 'brother' where id = 'a0000000-0000-0000-0000-000000000003';
update public.members set status = 'approved', member_type = 'associate' where id = 'a0000000-0000-0000-0000-000000000004';
update public.members set status = 'approved', member_type = 'brother', active = false where id = 'a0000000-0000-0000-0000-000000000006';

insert into calendar.events (id, title, category, starts_at, ends_at, hidden_from_associates, required, rsvp_enabled) values
  ('e0000000-0000-0000-0000-000000000001', 'Fixture Social',   'social',   now() + interval '2 days', now() + interval '2 days 2 hours', false, false, true),
  ('e0000000-0000-0000-0000-000000000002', 'Fixture Rush Plan','rush',     now() + interval '3 days', now() + interval '3 days 1 hour', true,  false, true),
  ('e0000000-0000-0000-0000-000000000003', 'Fixture Chapter',  'required', now() + interval '4 days', now() + interval '4 days 1 hour', false, false, true);

select is(
  (select required::text || '/' || rsvp_enabled::text from calendar.events where id = 'e0000000-0000-0000-0000-000000000003'),
  'true/false',
  'required category forces required and disables RSVPs'
);

insert into calendar.feed_tokens (member_id, token) values
  ('a0000000-0000-0000-0000-000000000004', repeat('a', 48)),
  ('a0000000-0000-0000-0000-000000000003', repeat('b', 48)),
  ('a0000000-0000-0000-0000-000000000006', repeat('c', 48));

-- ---------------------------------------------------------------------------
-- Pending member
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);

select is((select count(*)::int from calendar.events), 0, 'pending members see no events');
select is((select count(*)::int from public.members), 1, 'pending members see only their own member row');
select throws_ok($$select calendar.feed_token()$$, '42501', null, 'pending members cannot get a feed link');

-- ---------------------------------------------------------------------------
-- Associate member
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*)::int from calendar.events where id::text like 'e0000000%'),
  2,
  'associates see non-hidden events'
);
select is_empty(
  $$select 1 from calendar.events where hidden_from_associates$$,
  'associates never see events hidden from AMs'
);
select is((select count(*)::int from public.members), 1, 'associates see only their own member row');
select throws_ok(
  $$insert into calendar.rsvps (event_id, member_id, status) values ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'going')$$,
  '42501', null, 'associates cannot RSVP to hidden events'
);
select lives_ok(
  $$insert into calendar.rsvps (event_id, member_id, status) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'going')$$,
  'members can RSVP to optional events'
);
select throws_ok(
  $$insert into calendar.rsvps (event_id, member_id, status) values ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'going')$$,
  '42501', null, 'nobody can RSVP to required events'
);
select throws_ok(
  $$insert into calendar.rsvps (event_id, member_id, status) values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'going')$$,
  '42501', null, 'members cannot RSVP for someone else'
);
select throws_ok(
  $$insert into calendar.events (title, category, starts_at, ends_at) values ('x', 'social', now(), now() + interval '1 hour')$$,
  '42501', null, 'associates cannot create events'
);

-- ---------------------------------------------------------------------------
-- Brother
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is((select count(*)::int from calendar.events where id::text like 'e0000000%'), 3, 'brothers see every event');
select is_empty($$select 1 from public.members where id = 'a0000000-0000-0000-0000-000000000005'$$, 'brothers do not see pending sign-ups');
select isnt_empty($$select 1 from public.members where id = 'a0000000-0000-0000-0000-000000000004'$$, 'brothers see the approved roster');
select is(
  (select count(*)::int from calendar.rsvps where event_id = 'e0000000-0000-0000-0000-000000000001'),
  1,
  'brothers see other members'' RSVPs'
);
select lives_ok($$update public.members set name = 'Renamed Brother' where id = 'a0000000-0000-0000-0000-000000000003'$$, 'members can rename themselves');
select throws_ok($$update public.members set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003'$$, '42501', null, 'members cannot change their own role');
select throws_ok($$update public.members set status = 'approved' where id = 'a0000000-0000-0000-0000-000000000005'$$, '42501', null, 'members cannot approve anyone');
select throws_ok($$select public.admin_update_member('a0000000-0000-0000-0000-000000000003', 'admin')$$, '42501', null, 'non-admins cannot call admin_update_member');
select throws_ok(
  $$select calendar.create_event('{"title":"Nope","category":"social","start_date":"2027-01-10","start_time":"19:00","end_time":"20:00"}')$$,
  '42501', null, 'brothers cannot create events'
);
select is_empty($$update calendar.events set title = 'hacked' where id = 'e0000000-0000-0000-0000-000000000001' returning id$$, 'brothers cannot edit events');
select throws_ok($$select * from calendar.feed_events(repeat('b', 48))$$, '42501', null, 'feed_events is not callable by members');

-- ---------------------------------------------------------------------------
-- Admin-only event management
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty($$delete from calendar.events where id = 'e0000000-0000-0000-0000-000000000002' returning id$$, 'brothers cannot delete events');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select isnt_empty(
  $$select * from calendar.create_event('{"title":"Admin Social","category":"social","start_date":"2027-01-15","start_time":"21:00","end_time":"01:00"}')$$,
  'admins can create events'
);
select is(
  (select ends_at - starts_at from calendar.events where title = 'Admin Social'),
  interval '4 hours',
  'an end time before the start time rolls over to the next day'
);
select isnt_empty($$update calendar.events set title = 'Social Renamed' where id = 'e0000000-0000-0000-0000-000000000001' returning id$$, 'admins can edit events');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select isnt_empty($$select 1 from public.members where id = 'a0000000-0000-0000-0000-000000000005'$$, 'admins see pending sign-ups');
select is(
  (select status::text || '/' || member_type::text from public.admin_update_member('a0000000-0000-0000-0000-000000000005', p_status => 'approved', p_member_type => 'brother')),
  'approved/brother',
  'admins can approve members'
);
select is(
  (select role::text from public.admin_update_member('a0000000-0000-0000-0000-000000000004', p_role => 'admin')),
  'member',
  'pledges can never be admins'
);

-- DST: weekly Sunday 7 PM across the Nov 1 2026 fall-back stays at 7 PM local.
select is(
  (select count(*)::int from calendar.create_event('{"title":"DST Meeting","category":"required","start_date":"2026-10-25","start_time":"19:00","end_time":"20:00","recurrence":{"freq":"weekly","interval":1,"by_weekday":[0],"count":4}}') e
   where (e.starts_at at time zone 'America/New_York')::time = '19:00' and e.required),
  4,
  'recurring events keep their local time across DST'
);
select is(
  (select count(distinct series_id)::int from calendar.events where title = 'DST Meeting'),
  1,
  'a recurring event shares one series'
);
select is(
  (select count(*)::int from calendar.update_event(
     (select id from calendar.events where title = 'DST Meeting' order by starts_at offset 1 limit 1),
     '{"title":"DST Meeting","category":"required","start_date":"2026-11-01","start_time":"20:00","end_time":"21:00"}',
     'following')),
  3,
  'editing "this and following" updates the rest of the series'
);
select is(
  (select array_agg(to_char(starts_at at time zone 'America/New_York', 'MM-DD HH24:MI') order by starts_at) from calendar.events where title = 'DST Meeting'),
  array['10-25 19:00', '11-01 20:00', '11-08 20:00', '11-15 20:00'],
  'earlier occurrences keep their old time'
);

-- Last admin protection: demote every other admin, then try to demote ourselves.
reset role;
update public.members set role = 'member' where role = 'admin' and id <> 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.admin_update_member('a0000000-0000-0000-0000-000000000001', 'member')$$,
  'P0001', null, 'the last admin cannot be demoted'
);

-- ---------------------------------------------------------------------------
-- Inactive member
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from calendar.events), 0, 'inactive members see no events');

-- ---------------------------------------------------------------------------
-- Recurrence + feed (as postgres)
-- ---------------------------------------------------------------------------
reset role;
select is(
  calendar.expand_recurrence('2027-01-31', 'monthly', 1, null, null, 3),
  array['2027-01-31', '2027-03-31', '2027-05-31']::date[],
  'monthly repeats skip months without that date'
);
select is(
  calendar.expand_recurrence('2027-01-13', 'weekly', 1, array[1, 3], null, 3),
  array['2027-01-13', '2027-01-18', '2027-01-20']::date[],
  'weekly repeats on several weekdays start from the first date'
);
select throws_ok($$select calendar.expand_recurrence('2027-01-13', 'weekly', 1, null, null, null)$$, '22023', null, 'repeats need an end');
select is(
  (select count(*)::int from calendar.feed_events(repeat('a', 48)) where id = 'e0000000-0000-0000-0000-000000000002'),
  0,
  'an associate''s feed leaves out hidden events'
);
select is(
  (select count(*)::int from calendar.feed_events(repeat('b', 48)) where id::text like 'e0000000%'),
  3,
  'a brother''s feed includes every event'
);
select throws_ok($$select * from calendar.feed_events(repeat('c', 48))$$, 'P0002', null, 'feeds stop working for inactive members');

select * from finish();
rollback;
