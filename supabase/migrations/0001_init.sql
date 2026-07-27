-- MoveMan Survey — initial schema.
--
-- Multi-tenant from the start: every survey belongs to a removals company, and
-- row-level security means a surveyor can only ever see their own company's
-- work. Surveys contain the inside of customers' homes, so this is not a
-- feature to bolt on later.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- companies

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per signed-in user, tying them to their company.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null default '',
  role text not null default 'surveyor' check (role in ('surveyor', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_idx on public.profiles (company_id);

-- ------------------------------------------------------------------ surveys

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  reference text not null unique,
  capture_token text not null unique,

  client_name text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  origin_address text not null default '',
  destination_address text not null default '',
  move_date date,

  status text not null default 'awaiting_video'
    check (status in ('awaiting_video', 'video_received', 'analysing', 'analysed', 'quoted', 'failed')),

  -- Access, journey and the inventory are documents, not relations: they are
  -- always read and written whole, and the estimate is derived from them.
  origin jsonb not null default '{}'::jsonb,
  destination jsonb not null default '{}'::jsonb,
  journey jsonb not null default '{}'::jsonb,
  packing_day_before boolean not null default false,
  rooms jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,

  transcript text not null default '',
  analysis_summary text not null default '',
  analysis_flags jsonb not null default '[]'::jsonb,
  analysis_model text,
  analysed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveys_company_idx on public.surveys (company_id, created_at desc);
create index if not exists surveys_token_idx on public.surveys (capture_token);

-- ------------------------------------------------------------------- videos

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  duration_sec double precision,
  mode text not null default 'upload' check (mode in ('upload', 'recorded', 'live')),
  complete boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists videos_survey_idx on public.videos (survey_id, created_at);

-- -------------------------------------------------------- row-level security

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.surveys enable row level security;
alter table public.videos enable row level security;

-- The company of the calling user. Marked stable and security definer so the
-- policies below can call it without recursing back through RLS on profiles.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

drop policy if exists "read own company" on public.companies;
create policy "read own company" on public.companies
  for select using (id = public.current_company_id());

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Surveys are visible to everyone in the owning company, and to nobody else.
-- The public capture link does not go through these policies: it is served by
-- the service role, having proved possession of the survey's capture token.
drop policy if exists "read company surveys" on public.surveys;
create policy "read company surveys" on public.surveys
  for select using (company_id = public.current_company_id());

drop policy if exists "create company surveys" on public.surveys;
create policy "create company surveys" on public.surveys
  for insert with check (company_id = public.current_company_id());

drop policy if exists "update company surveys" on public.surveys;
create policy "update company surveys" on public.surveys
  for update using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "delete company surveys" on public.surveys;
create policy "delete company surveys" on public.surveys
  for delete using (company_id = public.current_company_id());

drop policy if exists "read company videos" on public.videos;
create policy "read company videos" on public.videos
  for select using (
    exists (
      select 1 from public.surveys s
      where s.id = videos.survey_id and s.company_id = public.current_company_id()
    )
  );

drop policy if exists "delete company videos" on public.videos;
create policy "delete company videos" on public.videos
  for delete using (
    exists (
      select 1 from public.surveys s
      where s.id = videos.survey_id and s.company_id = public.current_company_id()
    )
  );

-- Videos are written by the capture endpoint, which has no session and uses
-- the service role, so there is deliberately no insert or update policy here.

-- ------------------------------------------------------------ updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists surveys_touch_updated_at on public.surveys;
create trigger surveys_touch_updated_at
  before update on public.surveys
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------- new sign-ups

-- Give every new user a profile row so current_company_id() has something to
-- read. An admin then assigns the company.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
