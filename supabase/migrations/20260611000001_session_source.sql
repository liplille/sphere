-- ============================================================
-- 0005 — Attribution des scans QR
-- sessions.source = slug du support physique (voiture, carte, flyer…)
-- transmis par la destination du redirect /go/ via ?src=<slug>.
-- Gravé par /sync à la création de la session uniquement, jamais
-- modifié ensuite (premier touchpoint gagnant).
-- Pas de GRANT à ajouter : service_role a déjà ALL sur sessions (0002),
-- anon/authenticated restent volontairement sans accès.
-- Idempotent : ré-exécutable sans risque.
-- ============================================================

alter table public.sessions add column if not exists source text;
