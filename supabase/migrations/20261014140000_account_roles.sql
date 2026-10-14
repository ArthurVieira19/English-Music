-- Account types: admin, teacher, user.
--
-- `is_admin` stays the permission flag everything already checks (is_admin(), the songs
-- policies, the create-member function): it now means "has full control", which is true for
-- both admin and teacher. `role` says which of the two it is, and the check below keeps the
-- two columns from ever disagreeing.
-- Players cannot change either column (they only have UPDATE on display_name).

alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('admin', 'teacher', 'user'));

-- Existing admins keep their access.
update public.profiles set role = 'admin' where is_admin and role = 'user';

alter table public.profiles drop constraint if exists profiles_role_matches_is_admin;
alter table public.profiles
  add constraint profiles_role_matches_is_admin
  check ((role in ('admin', 'teacher')) = is_admin);
