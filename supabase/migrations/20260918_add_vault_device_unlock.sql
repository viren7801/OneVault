alter table public.password_vaults
  add column if not exists biometric_credential_id text null,
  add column if not exists biometric_prf_salt text null,
  add column if not exists biometric_iv text null,
  add column if not exists biometric_ciphertext text null;

create table if not exists public.notes_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_version integer not null default 1,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  biometric_credential_id text null,
  biometric_prf_salt text null,
  biometric_iv text null,
  biometric_ciphertext text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes_vaults enable row level security;

drop policy if exists notes_vaults_primary_owner on public.notes_vaults;
create policy notes_vaults_primary_owner
  on public.notes_vaults
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists notes_vaults_prevent_bulk_delete on public.notes_vaults;
create trigger notes_vaults_prevent_bulk_delete
before delete on public.notes_vaults
for each statement execute function public.prevent_bulk_delete();