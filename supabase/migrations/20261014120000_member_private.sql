-- Data an admin collects when registering a player (birth date, e-mail used for the account).
-- Kept out of `profiles` on purpose: profiles are readable by every signed-in player,
-- this table is readable by admins only. Rows are written by the `create-member` Edge Function
-- (service role), so there are no insert/update/delete policies for anyone else.

create table if not exists public.member_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date not null check (birth_date >= date '1900-01-01'),
  email text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.member_private enable row level security;

drop policy if exists "admins read member_private" on public.member_private;
create policy "admins read member_private"
  on public.member_private
  for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.member_private from anon;
revoke insert, update, delete, truncate, references, trigger on public.member_private from authenticated;
