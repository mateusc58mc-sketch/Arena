-- database/migrations/000_consolidated.sql
-- SQL consolidado para executar uma unica vez no Supabase (SQL Editor).
-- Seguro para reexecucao: usa "if not exists" e recria policies.

-- ============================================================
-- 1) PROGRESSAO DE PERSONAGEM
-- ============================================================
alter table if exists characters
  add column if not exists race text default 'humano',
  add column if not exists class_evolution text,
  add column if not exists tower_floor integer default 1;

update characters set race = 'humano' where race is null;
update characters set tower_floor = 1 where tower_floor is null;

create index if not exists idx_characters_tower_floor on characters(tower_floor);

-- ============================================================
-- 2) TERRENO FUTURO: MERCADO RMT / LEDGER
-- ============================================================
create table if not exists wallets (
  character_id uuid primary key references characters(id) on delete cascade,
  gold bigint not null default 0,
  premium bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_character_id uuid not null references characters(id),
  buyer_character_id uuid references characters(id),
  item_id uuid not null references inventory(id),
  item_name text not null,
  price bigint not null check (price > 0),
  currency text not null check (currency in ('gold','premium')),
  status text not null check (status in ('active','sold','cancelled','expired')),
  fee_paid bigint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sold_at timestamptz
);

create table if not exists economy_ledger (
  id bigserial primary key,
  idempotency_key text not null unique,
  character_id uuid not null references characters(id),
  kind text not null,
  gold_delta bigint not null default 0,
  premium_delta bigint not null default 0,
  ref_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3) RLS BASICA (OWNER-ONLY) PARA DADOS DO JOGO
-- ============================================================
alter table if exists accounts enable row level security;
alter table if exists characters enable row level security;
alter table if exists inventory enable row level security;

-- ACCOUNTS
drop policy if exists accounts_select_own on accounts;
create policy accounts_select_own on accounts
  for select using (auth_user_id = auth.uid());

-- CHARACTERS
drop policy if exists characters_select_own on characters;
create policy characters_select_own on characters
  for select using (
    exists (
      select 1 from accounts a
      where a.id = characters.account_id
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists characters_insert_own on characters;
create policy characters_insert_own on characters
  for insert with check (
    exists (
      select 1 from accounts a
      where a.id = characters.account_id
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists characters_update_own on characters;
create policy characters_update_own on characters
  for update using (
    exists (
      select 1 from accounts a
      where a.id = characters.account_id
        and a.auth_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from accounts a
      where a.id = characters.account_id
        and a.auth_user_id = auth.uid()
    )
  );

-- INVENTORY
drop policy if exists inventory_select_own on inventory;
create policy inventory_select_own on inventory
  for select using (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = inventory.character_id
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists inventory_insert_own on inventory;
create policy inventory_insert_own on inventory
  for insert with check (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = inventory.character_id
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists inventory_update_own on inventory;
create policy inventory_update_own on inventory
  for update using (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = inventory.character_id
        and a.auth_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = inventory.character_id
        and a.auth_user_id = auth.uid()
    )
  );

drop policy if exists inventory_delete_own on inventory;
create policy inventory_delete_own on inventory
  for delete using (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = inventory.character_id
        and a.auth_user_id = auth.uid()
    )
  );

-- WALLET (basico; RMT futuro pode refinar)
alter table if exists wallets enable row level security;

drop policy if exists wallets_select_own on wallets;
create policy wallets_select_own on wallets
  for select using (
    exists (
      select 1 from characters c
      join accounts a on a.id = c.account_id
      where c.id = wallets.character_id
        and a.auth_user_id = auth.uid()
    )
  );
