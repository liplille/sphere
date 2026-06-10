// ============================================================
// Config PUBLIQUE — chargée dans le navigateur.
// Ne contient QUE l'URL Supabase et la clé anon (publique, protégée par RLS).
// AUCUNE clé secrète ici (Claude, Resend, service_role) — jamais.
// ============================================================

// À remplir avec tes valeurs (Supabase > Project Settings > API)
window.SUPABASE_URL = "https://rmrlpqklrblvweuxqisb.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_NzrRg67CaYnCbca9BZ5iTQ_VhzhtgXi";

// URL de base des Edge Functions (dérivée automatiquement)
window.FN_BASE = window.SUPABASE_URL + "/functions/v1";
