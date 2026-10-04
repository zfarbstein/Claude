-- Local development seed. NEVER run against production.
-- 21 fake members across every role/type. Password for all: Password123
do $$
declare
  v_people jsonb := '[
    {"email":"president@example.com","name":"Alex Rivera","role":"admin","type":"brother","class":"Alpha Beta","status":"approved"},
    {"email":"secretary@example.com","name":"Jordan Lee","role":"admin","type":"brother","class":"Alpha Gamma","status":"approved"},
    {"email":"social@example.com","name":"Sam Patel","role":"chair","type":"brother","class":"Alpha Gamma","status":"approved","chair":["social"]},
    {"email":"philanthropy@example.com","name":"Chris Nguyen","role":"chair","type":"brother","class":"Alpha Delta","status":"approved","chair":["philanthropy"]},
    {"email":"rush@example.com","name":"Taylor Brooks","role":"chair","type":"brother","class":"Alpha Delta","status":"approved","chair":["rush"]},
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
    insert into calendar.chair_categories (member_id, category)
    select v_id, c from jsonb_array_elements_text(coalesce(p -> 'chair', '[]')) as c;
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
