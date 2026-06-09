-- ============================================================
-- 0002 — Privilèges service_role
-- « Automatically expose new tables » étant désactivé, les nouvelles tables
-- ne reçoivent AUCUN grant automatique — y compris pour service_role.
-- Les Edge Functions tournent en service_role et ont besoin d'un accès complet.
-- (anon/authenticated restent volontairement sans accès à sessions/intentions.)
-- Idempotent : ré-exécutable sans risque.
-- ============================================================

grant all on public.redirects   to service_role;
grant all on public.scan_events to service_role;
grant all on public.sessions    to service_role;
grant all on public.intentions  to service_role;
