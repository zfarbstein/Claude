-- Phase 3: night availability, night marks and the member directory.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'admin@avail.test', 'authenticated', 'authenticated', '{"full_name":"Avail Admin"}'),
  ('d0000000-0000-0000-0000-000000000002', 'brother@avail.test', 'authenticated', 'authenticated', '{"full_name":"Avail Brother"}'),
  ('d0000000-0000-0000-0000-000000000003', 'pledge@avail.test', 'authenticated', 'authenticated', '{"full_name":"Avail Pledge"}'),
  ('d0000000-0000-0000-0000-000000000004', 'late@avail.test', 'authenticated', 'authenticated', '{"full_name":"Avail Late"}');
-- Only this test's people count.
update public.members set active = false where id::text not like 'd0000000%';
update public.members set status = 'approved', role = 'admin', member_type = 'brother' where id = 'd0000000-0000-0000-0000-000000000001';
update public.members set status = 'approved', member_type = 'brother' where id in ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004');
update public.members set status = 'approved' where id = 'd0000000-0000-0000-0000-000000000003';
update calendar.settings set night_start = '19:00', night_end = '23:00';

update calendar.semesters set is_current = false;
insert into calendar.semesters (id, name, starts_on, ends_on, is_current)
values ('c1000000-0000-0000-0000-000000000001', 'Test', current_date - 30, current_date + 60, true);
-- Admin, brother and pledge finished their schedules; "late" didn't.
insert into calendar.schedule_submissions (member_id, semester_id, classes_done_at, exams_done_at, obligations_done_at)
select id, 'c1000000-0000-0000-0000-000000000001', now(), now(), now() from public.members
where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');

-- The brother has a weekly obligation 20:00-21:00 on the weekday 3 days from now, plus a deadline 4 days out.
insert into calendar.weekly_blocks (member_id, semester_id, kind, category, weekday, start_time, end_time, label)
values ('d0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'obligation', 'personal',
  extract(dow from current_date + 3)::int, '20:00', '21:00', 'Shift at Publix');
insert into calendar.dated_items (member_id, semester_id, kind, category, title, course, starts_at, ends_at, source)
values ('d0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'deadline', 'school', 'Project due', 'COP3502',
  ((current_date + 4) + time '21:00') at time zone 'America/New_York', ((current_date + 4) + time '21:00') at time zone 'America/New_York', 'manual');
-- A required event on the night 6 days out.
insert into calendar.events (title, category, starts_at, ends_at)
values ('Required test meeting', 'required',
  ((current_date + 6) + time '19:00') at time zone 'America/New_York', ((current_date + 6) + time '20:00') at time zone 'America/New_York');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select status || '/' || (reasons -> 0 ->> 'label') from calendar.member_nights('d0000000-0000-0000-0000-000000000002', current_date + 3, current_date + 3)),
  'busy/Shift at Publix',
  'a weekly obligation inside the night window makes the night busy'
);
select is(
  (select status from calendar.member_nights('d0000000-0000-0000-0000-000000000002', current_date + 4, current_date + 4)),
  'free',
  'deadlines never block a night'
);
select lives_ok(
  $$select calendar.set_night_mark(current_date + 1, true, 'Family dinner')$$,
  'members mark themselves unavailable'
);
select is(
  (select status || '/' || marked::text || '/' || mark_reason from calendar.member_nights('d0000000-0000-0000-0000-000000000002', current_date + 1, current_date + 1)),
  'busy/true/Family dinner',
  'a marked night is busy with the reason'
);
select throws_ok(
  $$select calendar.set_night_mark(current_date - 1, true, null)$$,
  '22023', null, 'past nights cannot be marked'
);
select throws_ok(
  $$select calendar.set_night_mark(current_date + 6, true, 'Busy')$$,
  'P0001', null, 'nobody can mark out of a night with a required chapter event'
);
select is(
  (select required_event_title from calendar.member_nights('d0000000-0000-0000-0000-000000000002', current_date + 6, current_date + 6)),
  'Required test meeting',
  'the night shows the required event so the app can link to the excuse form'
);
select throws_ok(
  $$insert into calendar.night_marks (member_id, night) values ('d0000000-0000-0000-0000-000000000002', current_date + 2)$$,
  '42501', null, 'night marks are only written through set_night_mark'
);
select is(
  (select free || '/' || busy || '/' || unknown || '/' || total from calendar.night_summary(current_date + 1, current_date + 1)),
  '2/1/1/4',
  'the summary counts free, busy and unknown (no schedule) members'
);
select is(
  (select reasons::text || '/' || coalesce(mark_reason, 'none') from calendar.member_nights('d0000000-0000-0000-0000-000000000001', current_date + 1, current_date + 1)),
  '[]/none',
  'brothers see other members'' nights without details'
);
select throws_ok(
  $$select * from calendar.night_detail(current_date + 1)$$,
  '42501', null, 'only admins see names and reasons for a night'
);

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select string_agg(name || ':' || status, ',' order by name) from calendar.night_detail(current_date + 1)),
  'Avail Admin:free,Avail Brother:busy,Avail Late:unknown,Avail Pledge:free',
  'admins see everyone''s status for a night'
);
select is(
  (select reasons -> 0 ->> 'label' from calendar.night_detail(current_date + 1) where name = 'Avail Brother'),
  'Family dinner',
  'admins see the reason'
);
select is(
  (select calendar.member_schedule('d0000000-0000-0000-0000-000000000002') -> 'blocks' -> 0 ->> 'label'),
  'Shift at Publix',
  'admins see schedule details'
);

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is(
  (select (b ->> 'label') is null and (b ->> 'start') = '20:00' from (select calendar.member_schedule('d0000000-0000-0000-0000-000000000002') -> 'blocks' -> 0 as b) x),
  true,
  'brothers see another member''s busy times without names'
);

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from calendar.night_summary(current_date, current_date + 7)$$,
  '42501', null, 'pledges cannot see the chapter heatmap'
);
select throws_ok(
  $$select calendar.member_schedule('d0000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'pledges cannot see other members'' schedules'
);
select is(
  (select count(*)::int from calendar.member_nights('d0000000-0000-0000-0000-000000000003', current_date, current_date + 6)),
  7,
  'pledges see their own nights'
);
select is((select count(*)::int from calendar.night_marks), 0, 'pledges cannot read other members'' marks');

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select calendar.set_night_mark(current_date + 1, false)$$, 'members clear a mark');
select is(
  (select status from calendar.member_nights('d0000000-0000-0000-0000-000000000002', current_date + 1, current_date + 1)),
  'free',
  'a cleared night is free again'
);

select * from finish();
rollback;
