// ============================================================
// /functions/v1/sync
// Récupère les stats de l'utilisateur pour synchroniser les appareils
// ============================================================

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";

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

    // On compte le nombre de rêves et on récupère le dernier pour les indicateurs
    const { data: intentions, count } = await supabase
      .from("intentions")
      .select("*", { count: "exact" })
      .eq("session_id", session.id)
      .order("created_at", { ascending: false });

    const lastIntention =
      intentions && intentions.length > 0 ? intentions[0] : null;

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
