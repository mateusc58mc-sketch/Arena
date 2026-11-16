-- database/migrations/001_market_core.sql
-- ESQUELETO FUTURO (NAO EXECUTAR AINDA).
-- Terreno para RMT: escrow de itens, moedas, ledger imutável.

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
  kind text not null, -- 'hunt_reward','market_buy','market_sell','refine', etc.
  gold_delta bigint not null default 0,
  premium_delta bigint not null default 0,
  ref_id uuid,
  created_at timestamptz not null default now()
);

-- RLS deve ser adicionada por conta/character antes de abrir RMT.
