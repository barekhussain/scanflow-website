-- ScanFlow — Supabase setup (safe to re-run any time)
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run.
-- If you already ran an older version of this script and hit an error,
-- just run this version — it cleans up first, then rebuilds fresh.
-- (Safe because no real restaurant/user data exists yet.)

-- 0. Clean slate ---------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists profiles cascade;
drop table if exists restaurants cascade;
drop type if exists user_role cascade;

create extension if not exists pgcrypto;

-- 1. Role enum ---------------------------------------------------------
create type user_role as enum ('admin', 'owner', 'waiter');

-- 2. Restaurants table (one row per restaurant you onboard) ------------
create table restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,        -- e.g. 'brahmaputra-kitchen'
  city        text default 'Bongaigaon',
  plan        text default 'starter',      -- starter | growth | chain
  status      text default 'active',       -- active | trial | suspended
  created_at  timestamptz default now()
);

-- 3. Profiles table (one row per login, linked to Supabase auth.users) -
create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  role           user_role not null default 'waiter',
  full_name      text,
  restaurant_id  uuid references restaurants(id) on delete set null,
  created_at     timestamptz default now()
);

-- 4. Row-level security --------------------------------------------------
alter table profiles enable row level security;
alter table restaurants enable row level security;

-- Every logged-in user can read their own profile row (needed for login
-- redirect logic in auth.js).
create policy "read own profile"
  on profiles for select
  using (auth.uid() = id);

-- Owners/waiters can read their own restaurant's row.
create policy "read own restaurant"
  on restaurants for select
  using (
    id = (select restaurant_id from profiles where id = auth.uid())
  );

-- 5. Auto-create a profile row whenever someone new signs up -----------
-- New users default to role 'waiter' with no restaurant — promote them
-- manually (see step 6) or from the owner/admin dashboard once built.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'waiter', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Create YOUR master admin account -----------------------------------
-- Do this by hand, once. Never expose an admin sign-up form publicly.
--
--   a) Supabase Dashboard → Authentication → Users → Add user
--      Email: barekhussain87@gmail.com (or whichever email you want to
--      log in with) · set a password · Auto Confirm User: ON
--
--   b) Copy that user's UUID from the Users table, then run:
--
--        update profiles set role = 'admin' where id = 'PASTE-UUID-HERE';
--
--   That's it — logging in with that email/password on login.html will
--   now land on admin.html.

-- 7. Creating owner and waiter logins (for later) ------------------------
-- Until the admin/owner dashboards exist, create these the same way as
-- step 6: add the user in the Supabase dashboard, then run:
--
--   update profiles set role = 'owner', restaurant_id = 'RESTAURANT-UUID'
--   where id = 'PASTE-UUID-HERE';
--
-- (use role = 'waiter' for waiter accounts). Once the real dashboards are
-- built, this will happen through a secure server-side function instead —
-- see the note about the service_role key in auth.js.
