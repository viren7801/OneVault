alter table public.notes
  add column if not exists tags text[] not null default '{}',
  add column if not exists favorite boolean not null default false,
  add column if not exists archived boolean not null default false,
  add column if not exists trashed boolean not null default false,
  add column if not exists trashed_at timestamptz null,
  add column if not exists reminder_at timestamptz null,
  add column if not exists history jsonb not null default '[]'::jsonb;

create table if not exists public.password_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_version integer not null default 1,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.password_vaults enable row level security;

drop policy if exists password_vaults_primary_owner on public.password_vaults;
create policy password_vaults_primary_owner
  on public.password_vaults
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists password_vaults_prevent_bulk_delete on public.password_vaults;
create trigger password_vaults_prevent_bulk_delete
before delete on public.password_vaults
for each statement execute function public.prevent_bulk_delete();

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index if not exists notes_user_folder_idx
  on public.notes (user_id, folder);

create index if not exists notes_user_flags_idx
  on public.notes (user_id, favorite, archived, trashed);

create index if not exists notes_user_reminder_idx
  on public.notes (user_id, reminder_at)
  where reminder_at is not null and trashed = false;
