create type public.app_role as enum ('admin','standard');

create table public.dcus (
  id text primary key,
  name text not null,
  site text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.dcus to authenticated;
grant all on public.dcus to service_role;
alter table public.dcus enable row level security;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  assigned_dcu_id text references public.dcus(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.can_access_dcu(_dcu_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin')
     or exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.enabled and p.assigned_dcu_id = _dcu_id
     )
$$;

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  meter_serial text not null,
  normalized_serial text not null unique,
  dcu_id text not null references public.dcus(id) on delete restrict,
  box_id text not null,
  scan_date_time timestamptz not null default now(),
  status text not null default 'assigned',
  notes text not null default '',
  session_id text,
  bulk_carton boolean not null default false,
  sheets_exported_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index scans_dcu_box_idx on public.scans (dcu_id, box_id);
grant select, insert, update, delete on public.scans to authenticated;
grant all on public.scans to service_role;
alter table public.scans enable row level security;

create table public.app_settings (
  id integer primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);
grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

create policy "dcus_select_authenticated" on public.dcus for select to authenticated using (true);
create policy "dcus_admin_insert" on public.dcus for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "dcus_admin_update" on public.dcus for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "dcus_admin_delete" on public.dcus for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "profiles_select_self_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "profiles_admin_update" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "profiles_admin_delete" on public.profiles for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "user_roles_select_self_or_admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create policy "scans_select_scoped" on public.scans for select to authenticated using (public.can_access_dcu(dcu_id));
create policy "scans_insert_scoped" on public.scans for insert to authenticated with check (public.can_access_dcu(dcu_id) and created_by = auth.uid());
create policy "scans_admin_update" on public.scans for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "scans_admin_delete" on public.scans for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "app_settings_select_authenticated" on public.app_settings for select to authenticated using (true);
create policy "app_settings_admin_insert" on public.app_settings for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "app_settings_admin_update" on public.app_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_role public.app_role;
  v_dcu text;
begin
  v_username := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1));
  v_dcu := nullif(new.raw_user_meta_data->>'assigned_dcu_id','');
  if exists (select 1 from public.user_roles where role = 'admin') then
    v_role := coalesce(nullif(new.raw_user_meta_data->>'role','')::public.app_role, 'standard');
  else
    v_role := 'admin';
  end if;

  insert into public.profiles (id, username, assigned_dcu_id, enabled)
  values (new.id, v_username, case when v_role = 'admin' then null else v_dcu end, true)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, v_role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.dcus (id, name, site) values
  ('Wuese','Wuese','Wuese'),
  ('Lobi','Lobi','Lobi'),
  ('Utonkon','Utonkon','Utonkon'),
  ('Uduo','Uduo','Uduo'),
  ('Orakamu','Orakamu','Orakamu'),
  ('Adabu','Adabu','Adabu'),
  ('Udeni','Udeni','Udeni'),
  ('Assakio','Assakio','Assakio'),
  ('Ajio Shangev-Ya','Ajio Shangev-Ya','Ajio Shangev-Ya'),
  ('Azara Maisamri','Azara Maisamri','Azara Maisamri'),
  ('Saminaka','Saminaka','Saminaka'),
  ('Betse','Betse','Betse')
on conflict (id) do nothing;

insert into public.app_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;