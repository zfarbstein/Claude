-- =============================================================================
-- Shared identity for every chapter hub app.
--
-- Other apps on the hub reuse public.members and the public.is_* helpers in
-- their own RLS policies. App-specific tables live in their own schema
-- (this app uses `calendar`).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('admin', 'chair', 'member');
create type public.member_type as enum ('brother', 'associate');
create type public.member_status as enum ('pending', 'approved', 'rejected');

create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  email text not null check (char_length(email) <= 320),
  role public.member_role not null default 'member',
  -- New sign-ups default to the most restricted type; admins pick the real one on approval.
  member_type public.member_type not null default 'associate',
  pledge_class text check (char_length(pledge_class) <= 60),
  status public.member_status not null default 'pending',
  active boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_associates_have_member_role check (member_type = 'brother' or role = 'member')
);

comment on table public.members is 'Shared chapter roster. One row per auth user; reused by every hub app.';
comment on column public.members.role is 'Permission level: admin (exec), chair, member.';
comment on column public.members.member_type is 'brother or associate (pledge).';
comment on column public.members.active is 'False for alumni / removed members. Inactive members lose access everywhere.';

create unique index members_email_lower_key on public.members (lower(email));
create index members_status_idx on public.members (status);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers for RLS. SECURITY DEFINER so policies on public.members can call them
-- without recursing into themselves. Wrap calls as (select public.is_admin()) in
-- policies so Postgres evaluates them once per statement.
-- -----------------------------------------------------------------------------
create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = (select auth.uid()) and m.status = 'approved' and m.active
  );
$$;

create function public.is_brother() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = (select auth.uid()) and m.status = 'approved' and m.active and m.member_type = 'brother'
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = (select auth.uid()) and m.status = 'approved' and m.active and m.role = 'admin'
  );
$$;

create function public.is_chair() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.id = (select auth.uid()) and m.status = 'approved' and m.active and m.role = 'chair'
  );
$$;

-- -----------------------------------------------------------------------------
-- Every new auth user gets a pending member row.
-- -----------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 120)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members set email = new.email where id = new.id and new.email is not null;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.members enable row level security;

-- Everyone sees their own row (pending users need it to see their status).
-- Brothers see the approved roster; admins see everyone. Associates see only themselves.
create policy members_select on public.members for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
    or ((select public.is_brother()) and status = 'approved')
  );

create policy members_update_self on public.members for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Members may only edit their own name directly. Everything else goes through
-- public.admin_update_member(), which checks is_admin().
revoke all on public.members from anon;
revoke insert, update, delete, truncate, references, trigger on public.members from authenticated;
grant select on public.members to authenticated;
grant update (name) on public.members to authenticated;

-- -----------------------------------------------------------------------------
-- Admin member management (approval, role, member type, pledge class, active).
-- NULL arguments mean "leave unchanged".
-- -----------------------------------------------------------------------------
create function public.admin_update_member(
  p_member_id uuid,
  p_role public.member_role default null,
  p_member_type public.member_type default null,
  p_status public.member_status default null,
  p_active boolean default null,
  p_pledge_class text default null,
  p_name text default null
) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.members;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change members' using errcode = '42501';
  end if;

  update public.members m set
    member_type = coalesce(p_member_type, m.member_type),
    -- Associates can only hold the plain member role.
    role = case
      when coalesce(p_member_type, m.member_type) = 'associate' then 'member'
      else coalesce(p_role, m.role)
    end,
    status = coalesce(p_status, m.status),
    active = coalesce(p_active, m.active),
    pledge_class = case when p_pledge_class is null then m.pledge_class else nullif(btrim(p_pledge_class), '') end,
    name = coalesce(nullif(btrim(p_name), ''), m.name),
    approved_at = case when p_status = 'approved' and m.status <> 'approved' then now() else m.approved_at end,
    approved_by = case when p_status = 'approved' and m.status <> 'approved' then (select auth.uid()) else m.approved_by end
  where m.id = p_member_id
  returning * into v_row;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.members where role = 'admin' and status = 'approved' and active) then
    raise exception 'The chapter must keep at least one active admin' using errcode = 'P0001';
  end if;

  return v_row;
end $$;

revoke execute on function public.admin_update_member(uuid, public.member_role, public.member_type, public.member_status, boolean, text, text) from public, anon;
grant execute on function public.admin_update_member(uuid, public.member_role, public.member_type, public.member_status, boolean, text, text) to authenticated;
