-- ============================================================
-- YESIN Sphere — Migration initiale (specs: « 0001_init »)
-- Tables + Row Level Security (RLS) + policies
-- ============================================================

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- redirects — pilote le QR dynamique (une ligne par slug)
-- ------------------------------------------------------------
create table if not exists public.redirects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  destination text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- scan_events — un enregistrement par scan du QR
-- ------------------------------------------------------------
create table if not exists public.scan_events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  ip_hash     text,            -- IP hachée, jamais l'IP brute
  country     text,
  user_agent  text,
  scanned_at  timestamptz not null default now()
);
create index if not exists scan_events_scanned_at_idx on public.scan_events (scanned_at desc);
create index if not exists scan_events_slug_idx        on public.scan_events (slug);

-- ------------------------------------------------------------
-- sessions — un visiteur (rattaché à un user après l'email)
-- ------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,                                  -- généré côté client
  scan_event_id uuid references public.scan_events(id) on delete set null,
  user_id       uuid references auth.users(id)         on delete set null,
  reals_total   integer not null default 0,
  geo_granted   boolean not null default false,
  lat           double precision,
  lng           double precision,
  city          text,
  country       text,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on public.sessions (user_id);

-- ------------------------------------------------------------
-- intentions — une ligne par réponse Q1 cohérente
-- ------------------------------------------------------------
create table if not exists public.intentions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  dream_text  text not null,
  ai_response text,
  complexity  text,            -- BASIQUE / PROFONDE / CRYPTIQUE
  clarity     text,            -- TROUBLE / NETTE / LIMPIDE
  coherent    boolean not null default true,
  reals       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists intentions_session_id_idx on public.intentions (session_id);

-- ============================================================
-- Row Level Security
-- Principe V1 : le navigateur ne touche JAMAIS la DB directement.
-- Tout passe par les Edge Functions (clé service_role → contourne RLS).
-- On active RLS partout et on n'ouvre que le strict minimum à la clé anon.
-- ============================================================

alter table public.redirects   enable row level security;
alter table public.scan_events enable row level security;
alter table public.sessions    enable row level security;
alter table public.intentions  enable row level security;
-- redirects : LECTURE seule pour anon (le PHP lit la destination du slug).                  
DROP POLICY IF EXISTS "redirects_select_public" ON public.redirects;
-- redirects : LECTURE seule pour anon (le PHP lit la destination du slug).
create policy "redirects_select_public"
  on public.redirects for select
  to anon, authenticated
  using (active = true);

DROP POLICY IF EXISTS "scan_events_insert_public" ON public.scan_events;
-- scan_events : INSERT seul pour anon (le PHP enregistre les scans).
-- Aucune lecture publique : les stats se consultent via service_role / admin.
create policy "scan_events_insert_public"
  on public.scan_events for insert
  to anon, authenticated
  with check (true);

-- sessions & intentions : AUCUNE policy publique (volontaire).
-- RLS activé + zéro policy = totalement verrouillé pour anon/authenticated.
-- Seules les Edge Functions (service_role) y accèdent.
-- NB : le linter Supabase signalera « RLS enabled, no policy » → attendu.

-- ------------------------------------------------------------
-- Exposition à l'API Data : UNIQUEMENT les 2 tables que le PHP touche
-- via la clé anon. À combiner avec « Automatically expose new tables »
-- DÉSACTIVÉ dans Supabase → sessions/intentions restent invisibles à l'API
-- (elles ne sont touchées que par les Edge Functions en service_role).
-- ------------------------------------------------------------
grant select on public.redirects   to anon, authenticated;
grant insert on public.scan_events to anon, authenticated;

-- ------------------------------------------------------------
-- Seed : la redirection par défaut du QR
-- ------------------------------------------------------------
insert into public.redirects (slug, destination)
values ('sphere', 'https://yesin.media/')
on conflict (slug) do nothing;
