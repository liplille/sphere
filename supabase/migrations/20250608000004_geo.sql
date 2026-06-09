-- ============================================================
-- 0004 — Géolocalisation : adresse complète
-- (lat, lng, city, country, geo_granted existent déjà depuis 0001)
-- ============================================================

alter table public.sessions add column if not exists address text;
