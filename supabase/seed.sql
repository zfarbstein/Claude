-- Local development seed. NEVER run against production.
-- 21 fake members across every role/type. Password for all: Password123
do $$
declare
  v_people jsonb := '[
    {"email":"president@example.com","name":"Alex Rivera","role":"admin","type":"brother","class":"Alpha Beta","status":"approved"},
    {"email":"secretary@example.com","name":"Jordan Lee","role":"admin","type":"brother","class":"Alpha Gamma","status":"approved"},
    {"email":"social@example.com","name":"Sam Patel","role":"member","type":"brother","class":"Alpha Gamma","status":"approved"},
    {"email":"philanthropy@example.com","name":"Chris Nguyen","role":"member","type":"brother","class":"Alpha Delta","status":"approved"},
    {"email":"rush@example.com","name":"Taylor Brooks","role":"member","type":"brother","class":"Alpha Delta","status":"approved"},
    {"email":"brother1@example.com","name":"Marcus Johnson","role":"member","type":"brother","class":"Alpha Beta","status":"approved"},
    {"email":"brother2@example.com","name":"Ethan Kim","role":"member","type":"brother","class":"Alpha Beta","status":"approved"},
    {"email":"brother3@example.com","name":"Diego Hernandez","role":"member","type":"brother","class":"Alpha Gamma","status":"approved"},
    {"email":"brother4@example.com","name":"Noah Williams","role":"member","type":"brother","class":"Alpha Gamma","status":"approved"},
    {"email":"brother5@example.com","name":"Liam O''Connor","role":"member","type":"brother","class":"Alpha Delta","status":"approved"},
    {"email":"brother6@example.com","name":"Ben Carter","role":"member","type":"brother","class":"Alpha Delta","status":"approved"},
    {"email":"brother7@example.com","name":"Omar Haddad","role":"member","type":"brother","class":"Alpha Epsilon","status":"approved"},
    {"email":"brother8@example.com","name":"Ryan Murphy","role":"member","type":"brother","class":"Alpha Epsilon","status":"approved"},
    {"email":"brother9@example.com","name":"Jake Thompson","role":"member","type":"brother","class":"Alpha Epsilon","status":"approved"},
    {"email":"am1@example.com","name":"Luke Garcia","role":"member","type":"associate","class":"Alpha Zeta","status":"approved"},
    {"email":"am2@example.com","name":"Owen Davis","role":"member","type":"associate","class":"Alpha Zeta","status":"approved"},
    {"email":"am3@example.com","name":"Mason Wright","role":"member","type":"associate","class":"Alpha Zeta","status":"approved"},
    {"email":"am4@example.com","name":"Caleb Scott","role":"member","type":"associate","class":"Alpha Zeta","status":"approved"},
    {"email":"am5@example.com","name":"Henry Adams","role":"member","type":"associate","class":"Alpha Zeta","status":"approved"},
    {"email":"pending1@example.com","name":"Pat Newcomer","role":"member","type":"associate","class":null,"status":"pending"},
    {"email":"pending2@example.com","name":"Robin Signup","role":"member","type":"associate","class":null,"status":"pending"}
  ]';
  p jsonb;
  v_id uuid;
begin
  for p in select * from jsonb_array_elements(v_people) loop
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p ->> 'email',
      extensions.crypt('Password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p ->> 'name'), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', p ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    );
    update public.members set
      role = (p ->> 'role')::public.member_role,
      member_type = (p ->> 'type')::public.member_type,
      status = (p ->> 'status')::public.member_status,
      pledge_class = p ->> 'class',
      approved_at = case when p ->> 'status' = 'approved' then now() end
    where id = v_id;
  end loop;
end $$;

-- Sample events around "today" so the calendar is never empty locally.
do $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_sunday date := v_today + ((7 - extract(dow from v_today)::int) % 7);
  v_saturday date := v_today + ((6 - extract(dow from v_today)::int + 7) % 7);
begin
  perform calendar.create_event(jsonb_build_object(
    'title', 'Chapter Meeting', 'category', 'required', 'start_date', v_sunday,
    'start_time', '19:00', 'end_time', '20:30', 'location', 'Chapter House',
    'description', 'Business attire.',
    'recurrence', jsonb_build_object('freq', 'weekly', 'interval', 1, 'by_weekday', jsonb_build_array(0), 'count', 12)
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Fall Formal', 'category', 'social', 'start_date', v_saturday + 14,
    'start_time', '20:00', 'end_time', '00:30', 'location', 'Hilton UF Conference Center',
    'description', 'Dates welcome. Buses leave the house at 7:30 PM.'
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Mixer', 'category', 'social', 'start_date', v_saturday,
    'start_time', '21:00', 'end_time', '23:59', 'location', 'Chapter House'
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Dance Marathon fundraiser', 'category', 'philanthropy', 'start_date', v_today + 3,
    'start_time', '11:00', 'end_time', '15:00', 'location', 'Turlington Plaza'
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Rush planning (exec + chairs)', 'category', 'rush', 'start_date', v_today + 2,
    'start_time', '18:00', 'end_time', '19:00', 'location', 'Library West, room 211',
    'hidden_from_associates', true
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Big/Little reveal prep', 'category', 'social', 'start_date', v_today + 5,
    'start_time', '20:00', 'end_time', '21:00', 'hidden_from_associates', true
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Career fair', 'category', 'school', 'start_date', v_today + 8,
    'all_day', true, 'location', 'Reitz Union'
  ));
  perform calendar.create_event(jsonb_build_object(
    'title', 'Spring kickoff', 'category', 'required', 'start_date', '2027-01-10',
    'start_time', '18:00', 'end_time', '19:30', 'location', 'Chapter House'
  ));
end $$;

-- Current semester (relative to today) and completed schedules for most demo members.
-- Left without a schedule on purpose: brother2, brother9 and am5 (they see the setup wizard).
do $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_sem uuid;
  m record;
  n int := 0;
  v_tz text := 'America/New_York';
begin
  insert into calendar.semesters (name, starts_on, ends_on, is_current)
  values (
    case when extract(month from v_today) between 8 and 12 then 'Fall ' when extract(month from v_today) <= 5 then 'Spring ' else 'Summer ' end
      || extract(year from v_today)::text,
    v_today - 45, v_today + 75, true
  )
  returning id into v_sem;

  for m in
    select id, email from public.members
    where status = 'approved' and email not in ('brother2@example.com', 'brother9@example.com', 'am5@example.com')
    order by email
  loop
    n := n + 1;
    insert into calendar.weekly_blocks (member_id, semester_id, kind, category, weekday, start_time, end_time, label, location)
    select m.id, v_sem, 'class', 'school', d, t.s, t.e, t.label, t.loc
    from (values
      ('09:35'::time, '10:25'::time, 'MAC2312 Lecture', 'LIT 109', array[1, 3, 5]),
      ('11:45'::time, '12:35'::time, 'COP3502 Lecture', 'CSE A101', array[1, 3, 5]),
      ('13:55'::time, '14:45'::time, 'ECO2023 Lecture', 'MAT 18', array[2, 4]),
      ('15:00'::time, '16:55'::time, 'CHM2045L Lab', 'JHH 130', array[3])
    ) as t(s, e, label, loc, days)
    cross join lateral unnest(t.days) as d
    where (n + array_position(array['MAC2312 Lecture', 'COP3502 Lecture', 'ECO2023 Lecture', 'CHM2045L Lab'], t.label)) % 3 <> 0;

    if n % 3 = 0 then
      insert into calendar.weekly_blocks (member_id, semester_id, kind, category, weekday, start_time, end_time, label, location)
      values (m.id, v_sem, 'obligation', 'personal', 4, '18:00', '22:00', 'Shift at Publix', 'Publix on 13th St');
    elsif n % 3 = 1 then
      insert into calendar.weekly_blocks (member_id, semester_id, kind, category, weekday, start_time, end_time, label, location)
      values (m.id, v_sem, 'obligation', 'school', 2, '19:00', '20:30', 'Club soccer practice', 'Graham Field');
    end if;

    insert into calendar.dated_items (member_id, semester_id, kind, category, title, course, starts_at, ends_at, source)
    values
      (m.id, v_sem, 'exam', 'exam', 'Exam 2', 'COP3502',
        ((v_today + 4 + n % 3) + time '20:20') at time zone v_tz, ((v_today + 4 + n % 3) + time '22:10') at time zone v_tz, 'manual'),
      (m.id, v_sem, 'exam', 'exam', 'Midterm', 'MAC2312',
        ((v_today + 10 + n % 4) + time '20:20') at time zone v_tz, ((v_today + 10 + n % 4) + time '22:10') at time zone v_tz, 'manual'),
      (m.id, v_sem, 'deadline', 'school', 'Project 3 due', 'COP3502',
        ((v_today + 6) + time '23:59') at time zone v_tz, ((v_today + 6) + time '23:59') at time zone v_tz, 'manual');

    insert into calendar.schedule_submissions (member_id, semester_id, classes_done_at, exams_done_at, obligations_done_at)
    values (m.id, v_sem, now(), now(), now());
  end loop;
end $$;
