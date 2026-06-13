-- ============================================================
-- YESIN Sphere — Nouveaux champs de réponse de Sphère
-- Le prompt renvoie désormais message + spark + next + emotion
-- (en plus de complexity / clarity / reals). On historise ces
-- trois nouveaux champs dans intentions.
--   - ai_response  : reçoit le "message" (cœur de la réponse) — inchangé
--   - spark        : l'étincelle de réflexion
--   - next_question: la question de relance personnalisée
--   - emotion      : l'émotion dominante détectée (mot court, minuscules)
-- ============================================================

alter table public.intentions add column if not exists spark         text;
alter table public.intentions add column if not exists next_question text;
alter table public.intentions add column if not exists emotion       text;
