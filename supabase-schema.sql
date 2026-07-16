create table if not exists public.app_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "public read app state" on public.app_state;
create policy "public read app state"
on public.app_state
for select
to anon
using (true);

drop policy if exists "public insert app state" on public.app_state;
create policy "public insert app state"
on public.app_state
for insert
to anon
with check (true);

drop policy if exists "public update app state" on public.app_state;
create policy "public update app state"
on public.app_state
for update
to anon
using (true)
with check (true);
