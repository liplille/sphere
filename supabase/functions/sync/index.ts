// ============================================================
// /functions/v1/sync
// Récupère les stats de l'utilisateur pour synchroniser les appareils
// ============================================================

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { rateLimitByIp } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const headers = {
    ...corsHeaders(req.headers.get("origin")),
    "content-type": "application/json",
  };
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405,
      headers,
    });

  try {
    // Rate limit généreux : /sync est appelé à chaque chargement de page.
    // 60 requêtes / 60 s par IP — n'entrave jamais un usage normal, mais
    // coupe le bouclage abusif (lecture DB en rafale).
    if (!(await rateLimitByIp("sync", req, 60, 60))) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers,
      });
    }

    const supabase = serviceClient();

    // On extrait le jeton d'authentification s'il provient de l'email
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    const body = await req.json().catch(() => ({}));
    const reqToken = body.token;

    let session = null;

    // Cas 1 : L'utilisateur arrive via le lien de l'email (Cross-device)
    if (jwt && jwt.length > 50) {
      const {
        data: { user },
      } = await supabase.auth.getUser(jwt);
      if (user) {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        session = data;
      }
    }

    // Cas 2 : Simple rafraîchissement de page (On utilise la session locale)
    if (!session && reqToken) {
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("token", reqToken)
        .maybeSingle();
      session = data;
    }

    if (!session) {
      // On renvoie un statut 200 pour ne pas alerter la console du navigateur
      return new Response(
        JSON.stringify({ ok: false, error: "Session introuvable" }),
        { status: 200, headers },
      );
    }

    // Compte les rêves cohérents (filaments) + indicateurs du dernier.
    // Les intentions KO sont historisées en base mais exclues de l'affichage.
    // Colonnes réduites : pas besoin de remonter les dream_text complets ici.
    const { data: intentions, count } = await supabase
      .from("intentions")
      .select("complexity, clarity", { count: "exact" })
      .eq("session_id", session.id)
      .eq("coherent", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastIntention =
      intentions && intentions.length > 0 ? intentions[0] : null;

    // ⚠️ FILTRE DE SORTIE — ne JAMAIS exposer de données sensibles au client.
    // On renvoie uniquement le strict nécessaire à l'affichage HUD :
    //   reals, filaments, anchored (booléen), registered (booléen), indicateurs.
    // Les champs lat/lng/city/country/address de `sessions` restent côté serveur
    // et ne doivent JAMAIS être ajoutés ici (RGPD + vie privée).
    return new Response(
      JSON.stringify({
        ok: true,
        token: session.token,
        reals: session.reals_total,
        filaments: count || 0,
        anchored: session.geo_granted,
        registered: session.user_id !== null,
        complexity: lastIntention?.complexity || "EN ATTENTE",
        clarity: lastIntention?.clarity || "EN ATTENTE",
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("Erreur /sync:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers,
    });
  }
});
