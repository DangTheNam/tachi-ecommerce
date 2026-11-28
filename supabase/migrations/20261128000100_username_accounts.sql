create table public.username_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,24}$'),
  auth_email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.username_accounts enable row level security;

revoke all on table public.username_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.username_accounts to service_role;
