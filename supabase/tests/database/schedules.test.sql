-- Phase 2: semesters, schedule submission, Canvas sync, upload storage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-000000000001', 'admin@sched.test', 'authenticated', 'authenticated', '{}'),
  ('b0000000-0000-0000-0000-000000000002', 'brother@sched.test', 'authenticated', 'authenticated', '{}'),
  ('b0000000-0000-0000-0000-000000000003', 'pledge@sched.test', 'authenticated', 'authenticated', '{}');
update public.members set status = 'approved', role = 'admin', member_type = 'brother' where id = 'b0000000-0000-0000-0000-000000000001';
update public.members set status = 'approved', member_type = 'brother' where id = 'b0000000-0000-0000-0000-000000000002';
update public.members set status = 'approved' where id = 'b0000000-0000-0000-0000-000000000003';

update calendar.semesters set is_current = false;
insert into calendar.semesters (id, name, starts_on, ends_on, is_current)
values ('c0000000-0000-0000-0000-000000000001', 'Test Fall', '2026-08-24', '2026-12-18', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select classes_done_at is not null and not completed from calendar.save_schedule_step('classes',
    '[{"weekday":1,"start":"10:40","end":"11:30","label":"COP3502 Lecture","location":"CSE A101"},
      {"weekday":3,"start":"10:40","end":"11:30","label":"COP3502 Lecture"}]')),
  true,
  'saving classes marks that step done'
);
select is((select count(*)::int from calendar.weekly_blocks where kind = 'class'), 2, 'members see their own classes');
select is(
  (select classes_done_at is not null from calendar.save_schedule_step('classes', '[{"weekday":1,"start":"09:35","end":"10:25","label":"MAC2312"}]')),
  true,
  'saving a step again replaces its rows'
);
select is((select count(*)::int from calendar.weekly_blocks where kind = 'class'), 1, 'old classes are replaced');
select throws_ok(
  $$select calendar.save_schedule_step('classes', '[{"weekday":1,"start":"11:30","end":"10:40","label":"Backwards"}]')$$,
  '23514', null, 'blocks must end after they start'
);
select throws_ok(
  $$select calendar.save_schedule_step('exams', '[]', '[]', 'https://example.com/not-a-feed')$$,
  '22023', null, 'only Canvas feed links are stored'
);

select lives_ok(
  $$select calendar.save_schedule_step('exams', '[]',
    '[{"kind":"exam","title":"Exam 2","course":"COP3502","date":"2026-10-21","start":"20:20","end":null,"source":"canvas","external_uid":"e1"},
      {"kind":"deadline","title":"Project 3","course":"COP3502","date":"2026-10-27","start":"23:59","end":null,"source":"canvas","external_uid":"a7"},
      {"kind":"exam","title":"Final","course":"MAC2312","date":"2026-12-10","start":null,"end":null,"source":"canvas","external_uid":"e2","dismissed":true}]',
    'https://ufl.instructure.com/feeds/calendars/user_abc123.ics')$$,
  'members save exams from Canvas'
);
select is(
  (select to_char(starts_at at time zone 'America/New_York', 'MM-DD HH24:MI') || ' to ' || to_char(ends_at at time zone 'America/New_York', 'HH24:MI')
   from calendar.dated_items where title = 'Exam 2'),
  '10-21 20:20 to 22:20',
  'an exam without an end time blocks two hours'
);
select is(
  (select (ends_at = starts_at and not blocks_availability) from calendar.dated_items where title = 'Project 3'),
  true,
  'deadlines are a moment and never block availability'
);
select is(
  (select all_day::text || '/' || dismissed::text from calendar.dated_items where title = 'Final'),
  'true/true',
  'items without a time are all day, and dismissed feed items are kept hidden'
);
select is(
  (select completed from calendar.save_schedule_step('obligations',
    '[{"weekday":4,"start":"18:00","end":"22:00","label":"Shift at Publix","category":"personal"}]',
    '[{"kind":"obligation","title":"Career fair","date":"2026-10-15","start":"10:00","end":"12:00","category":"school"}]')),
  true,
  'the submission is complete after all three steps'
);
select throws_ok(
  $$insert into calendar.weekly_blocks (member_id, semester_id, kind, weekday, start_time, end_time, label)
    values ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'class', 1, '08:00', '09:00', 'x')$$,
  '42501', null, 'members cannot write schedule tables directly'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('schedule-uploads', 'b0000000-0000-0000-0000-000000000002/c/one.jpg')$$,
  'members upload into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('schedule-uploads', 'b0000000-0000-0000-0000-000000000003/c/one.jpg')$$,
  '42501', null, 'members cannot upload into someone else''s folder'
);
select throws_ok($$select calendar.start_semester('Spring 2027', '2027-01-12', '2027-05-07')$$, '42501', null, 'only admins start semesters');

-- Another member cannot see these rows; an admin can.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty($$select 1 from calendar.weekly_blocks where member_id = 'b0000000-0000-0000-0000-000000000002'$$, 'members cannot see each other''s schedules');
select is_empty($$select 1 from calendar.schedule_submissions where member_id = 'b0000000-0000-0000-0000-000000000002'$$, 'or each other''s Canvas links');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select isnt_empty($$select 1 from calendar.weekly_blocks where member_id = 'b0000000-0000-0000-0000-000000000002'$$, 'admins see every schedule');
select ok(
  (select submitted >= 1 and total >= 3 from calendar.submission_counts()),
  'admins get submission counts'
);

-- Daily Canvas sync keeps the member's choices.
reset role;
select is(
  calendar.apply_feed_sync('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
    '[{"kind":"exam","title":"Exam 2","course":"COP3502","date":"2026-10-22","start":"19:00","end":"21:00","external_uid":"e1"},
      {"kind":"exam","title":"Final","course":"MAC2312","date":"2026-12-10","start":null,"end":null,"external_uid":"e2"},
      {"kind":"exam","title":"Exam 3","course":"COP3502","date":"2026-11-18","start":"20:20","end":"22:10","external_uid":"e3"}]'),
  1,
  'the sync adds new feed items'
);
select is(
  (select string_agg(title || ':' || to_char(starts_at at time zone 'America/New_York', 'MM-DD HH24:MI') || ':' || dismissed::text, ', ' order by title)
   from calendar.dated_items where member_id = 'b0000000-0000-0000-0000-000000000002' and source = 'canvas'),
  'Exam 2:10-22 19:00:false, Exam 3:11-18 20:20:false, Final:12-10 00:00:true',
  'the sync updates times, keeps removed items hidden, and drops items that left the feed'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select name from calendar.start_semester('Spring 2027', '2027-01-12', '2027-05-07')),
  'Spring 2027',
  'admins start a new semester, which everyone then re-submits for'
);

select * from finish();
rollback;
