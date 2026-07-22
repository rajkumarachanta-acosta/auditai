create table if not exists profile (
  id int primary key default 1,
  target_titles text[] default '{}',
  skills text[] default '{}',
  years_experience int,
  seniority text,
  locations text[] default '{}',
  remote_only boolean default false,
  visa_sponsorship_needed boolean default false,
  visa_from_country text,
  visa_to_countries text[] default '{}',
  salary_floor int,
  salary_currency text default 'USD',
  excluded_companies text[] default '{}',
  excluded_keywords text[] default '{}',
  resume_text text,
  updated_at timestamptz default now(),
  constraint singleton check (id = 1)
);

create table if not exists target_companies (
  id serial primary key,
  ats text not null,          -- 'greenhouse' | 'lever' | 'workday'
  token text not null,        -- board token / company slug
  workday_dc text,            -- workday only: e.g. 'wd5'
  workday_site text,          -- workday only: e.g. 'External'
  display_name text,
  enabled boolean default true,
  created_at timestamptz default now(),
  unique (ats, token, workday_site)
);

create table if not exists jobs (
  id text primary key,
  source text not null,
  external_id text not null,
  title text not null,
  company text not null,
  location text,
  remote boolean default false,
  country text,
  visa_sponsorship boolean,
  url text not null,
  description text,
  salary_text text,
  posted_at timestamptz,
  collected_at timestamptz default now(),
  match_score int,
  match_reason text,
  status text default 'new',
  status_updated_at timestamptz,
  notes text
);

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_match_score on jobs(match_score desc nulls last);
create index if not exists idx_jobs_posted_at on jobs(posted_at desc nulls last);

create table if not exists digest_log (
  id serial primary key,
  sent_at timestamptz default now(),
  job_count int
);

insert into profile (id) values (1) on conflict (id) do nothing;
