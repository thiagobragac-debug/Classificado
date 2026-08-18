create table if not exists public.webhook_events (
  id text primary key,
  gateway text not null,
  event_type text not null,
  created_at timestamp with time zone default now()
);

-- Enable RLS and grant service role access
alter table public.webhook_events enable row level security;
