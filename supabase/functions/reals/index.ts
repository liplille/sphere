// ============================================================
// /functions/v1/reals  (Étape 5)
// Ajoute des REALS à la session suite à la seconde touche de sphère.
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
    // Protection IP généreuse (anti-spam de requêtes)
    if (!(await rateLimitByIp("reals", req, 20, 600))) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers,
      });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    // Sécurité backend : on plafonne volontairement l'ajout à 10 par requête.
    const amount = Math.min(10, Math.max(0, Number(body.amount) || 0));

    if (!token || amount === 0) {
      return new Response(JSON.stringify({ error: "Requête invalide" }), {
        status: 400,
        headers,
      });
    }

    const supabase = serviceClient();

    // 1. Récupérer la session existante
    const { data: session, error: selErr } = await supabase
      .from("sessions")
      .select("id, reals_total")
      .eq("token", token)
      .maybeSingle();

    if (selErr || !session) {
      return new Response(JSON.stringify({ error: "Session introuvable" }), {
        status: 404,
        headers,
      });
    }

    // 2. Calculer le nouveau total
    const newTotal = (session.reals_total || 0) + amount;

    // 3. Mettre à jour
    const { error: upErr } = await supabase
      .from("sessions")
      .update({ reals_total: newTotal })
      .eq("id", session.id);

    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ ok: true, added: amount, reals_total: newTotal }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("Erreur /reals:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers,
    });
  }
});
