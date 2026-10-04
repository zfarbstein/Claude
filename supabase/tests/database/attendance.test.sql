-- Phase 4: QR check-in, admin roster, attendance report, excuses.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'admin@att.test', 'authenticated', 'authenticated', '{"full_name":"Att Admin"}'),
  ('e0000000-0000-0000-0000-000000000002', 'brother@att.test', 'authenticated', 'authenticated', '{"full_name":"Att Brother"}'),
  ('e0000000-0000-0000-0000-000000000003', 'pledge@att.test', 'authenticated', 'authenticated', '{"full_name":"Att Pledge"}'),
  ('e0000000-0000-0000-0000-000000000004', 'new@att.test', 'authenticated', 'authenticated', '{"full_name":"Att New"}');
update public.members set active = false where id::text not like 'e0000000%';
update public.members set status = 'approved', role = 'admin', member_type = 'brother', approved_at = now() - interval '90 days'
  where id = 'e0000000-0000-0000-0000-000000000001';
update public.members set status = 'approved', member_type = 'brother', approved_at = now() - interval '90 days'
  where id = 'e0000000-0000-0000-0000-000000000002';
update public.members set status = 'approved', approved_at = now() - interval '90 days' where id = 'e0000000-0000-0000-0000-000000000003';
-- Joined yesterday: earlier events don't count against them.
update public.members set status = 'approved', member_type = 'brother', approved_at = now() - interval '1 day'
  where id = 'e0000000-0000-0000-0000-000000000004';

insert into calendar.events (id, title, category, starts_at, ends_at, hidden_from_associates) values
  ('f0000000-0000-0000-0000-000000000001', 'Meeting now', 'required', now() - interval '10 minutes', now() + interval '1 hour', false),
  ('f0000000-0000-0000-0000-000000000002', 'Meeting later', 'required', now() + interval '3 days', now() + interval '3 days 1 hour', false),
  ('f0000000-0000-0000-0000-000000000003', 'Last week', 'required', now() - interval '7 days', now() - interval '7 days' + interval '1 hour', false),
  ('f0000000-0000-0000-0000-000000000004', 'Exec only now', 'rush', now() - interval '5 minutes', now() + interval '1 hour', true),
  ('f0000000-0000-0000-0000-000000000005', 'Mixer', 'social', now() + interval '2 days', now() + interval '2 days 2 hours', false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(
  (select code ~ '^\d{6}$' from calendar.checkin_code('f0000000-0000-0000-0000-000000000001')),
  'admins get a 6-digit code while check-in is open'
);
select is(
  (select code from calendar.checkin_code('f0000000-0000-0000-0000-000000000002')),
  null,
  'no code before check-in opens'
);
select set_config('test.code', (select code from calendar.checkin_code('f0000000-0000-0000-0000-000000000001')), true);
select set_config('test.hidden_code', (select code from calendar.checkin_code('f0000000-0000-0000-0000-000000000004')), true);

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select * from calendar.checkin_code('f0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'members cannot see check-in codes'
);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000001', '000000') ->> 'ok'),
  case when current_setting('test.code') = '000000' then 'true' else 'false' end,
  'a wrong code is rejected'
);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000001', current_setting('test.code')) ->> 'ok'),
  'true',
  'the current code checks the member in'
);
select is(
  (select status || '/' || method from calendar.attendance where event_id = 'f0000000-0000-0000-0000-000000000001'),
  'present/qr',
  'checking in marks the member present'
);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000002', current_setting('test.code')) ->> 'message'),
  'Check-in opens 15 minutes before the event starts.',
  'check-in only works during the event window'
);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000003', '123456') ->> 'ok'),
  'false',
  'check-in is closed after the event ends'
);
select throws_ok(
  $$select calendar.set_attendance('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'present')$$,
  '42501', null, 'only admins mark attendance by hand'
);
select throws_ok(
  $$select * from calendar.event_roster('f0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'only admins see the roster'
);

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000004', current_setting('test.hidden_code')) ->> 'message'),
  'That event wasn''t found.',
  'pledges cannot check in to events hidden from them'
);
select is(
  (select count(*)::int from calendar.attendance),
  0,
  'members only see their own attendance'
);
select is(
  (select array_agg(title order by title) from calendar.open_checkins()),
  array['Meeting now'],
  'open check-ins list only events the member can see'
);
select lives_ok(
  $$select calendar.check_in('f0000000-0000-0000-0000-000000000001', '999999'), calendar.check_in('f0000000-0000-0000-0000-000000000001', '999998'),
           calendar.check_in('f0000000-0000-0000-0000-000000000001', '999997'), calendar.check_in('f0000000-0000-0000-0000-000000000001', '999996'),
           calendar.check_in('f0000000-0000-0000-0000-000000000001', '999995'), calendar.check_in('f0000000-0000-0000-0000-000000000001', '999994'),
           calendar.check_in('f0000000-0000-0000-0000-000000000001', '999993'), calendar.check_in('f0000000-0000-0000-0000-000000000001', '999992')$$,
  'wrong codes are recorded'
);
select is(
  (select calendar.check_in('f0000000-0000-0000-0000-000000000001', current_setting('test.code')) ->> 'ok'),
  'false',
  'after 8 wrong codes even the right one is refused for a while'
);

-- Excuses
select throws_ok(
  $$select calendar.submit_excuse('f0000000-0000-0000-0000-000000000005', 'Out of town')$$,
  '22023', null, 'excuses are only for required events'
);
select throws_ok(
  $$select calendar.submit_excuse('f0000000-0000-0000-0000-000000000002', 'Out of town', 'e0000000-0000-0000-0000-000000000002/proof.jpg')$$,
  '22023', null, 'attachments must be in the member''s own folder'
);
select lives_ok(
  $$select calendar.submit_excuse('f0000000-0000-0000-0000-000000000002', 'Lab practical make-up', 'e0000000-0000-0000-0000-000000000003/proof.jpg')$$,
  'members submit an excuse for a required event'
);
select throws_ok(
  $$select calendar.submit_excuse('f0000000-0000-0000-0000-000000000002', 'Again')$$,
  '23505', null, 'one open excuse per event'
);
select throws_ok(
  $$insert into calendar.excuses (event_id, member_id, reason) values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'x')$$,
  '42501', null, 'excuses are only written through submit_excuse'
);
select throws_ok(
  $$select calendar.review_excuse((select id from calendar.excuses limit 1), true)$$,
  '42501', null, 'members cannot approve excuses'
);

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select calendar.set_attendance('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 'present')$$,
  'admins mark attendance by hand'
);
select is(
  (select count(*)::int || '/' || count(*) filter (where member_type = 'associate')::int from calendar.event_roster('f0000000-0000-0000-0000-000000000004')),
  '3/0',
  'the roster of an event hidden from pledges leaves pledges out'
);
select is(
  (select status from calendar.event_roster('f0000000-0000-0000-0000-000000000001') where name = 'Att Brother'),
  'present',
  'the roster shows QR check-ins'
);
select is(
  (select string_agg(c ->> 's', ',' order by c ->> 's')
   from calendar.attendance_report(current_date - 14, current_date, null) as r
   cross join lateral jsonb_array_elements(r -> 'cells') as c
   where c ->> 'e' = 'f0000000-0000-0000-0000-000000000003'),
  'absent,absent,present',
  'past required events count: no record means absent, and members who joined later are left out'
);
select lives_ok(
  $$select calendar.review_excuse((select id from calendar.excuses where event_id = 'f0000000-0000-0000-0000-000000000002'), true, 'Feel better')$$,
  'admins approve an excuse'
);
select is(
  (select status || '/' || method from calendar.attendance
   where event_id = 'f0000000-0000-0000-0000-000000000002' and member_id = 'e0000000-0000-0000-0000-000000000003'),
  'excused/excuse',
  'an approved excuse marks the member excused'
);
select lives_ok(
  $$select calendar.review_excuse((select id from calendar.excuses where event_id = 'f0000000-0000-0000-0000-000000000002'), false)$$,
  'admins can change their mind and deny it'
);
select is(
  (select count(*)::int from calendar.attendance
   where event_id = 'f0000000-0000-0000-0000-000000000002' and member_id = 'e0000000-0000-0000-0000-000000000003'),
  0,
  'denying removes the excused mark'
);
select lives_ok(
  $$select calendar.set_attendance('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', null)$$,
  'admins clear a mark'
);

select * from finish();
rollback;
