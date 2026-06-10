// ============================================================
// /functions/v1/confirm  (Étape 8 — bug otp_expired)
// Vérifie le CODE OTP 6 chiffres saisi par l'utilisateur, rattache la
// session au compte (user_id) et renvoie le payload de synchro HUD.
//
// Remplace l'ancien flux « lien magique » consommé par les anti-spam.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { rateLimitByIp } from "../_shared/ratelimit.ts";

// Client à clé ANON/publishable pour les opérations Auth (verifyOtp).
// verifyOtp NE doit PAS passer par le client service_role (rôle inadapté).
function authClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    "";
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
    // Anti-brute-force : un code 6 chiffres = 1M combinaisons. On plafonne
    // les tentatives par IP (10 / 10 min) en plus de la limite Auth native.
    if (!(await rateLimitByIp("confirm", req, 10, 600))) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers,
      });
    }

    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body.token;
    const email: string | undefined = body.email;
    const code: string = String(body.code || "").trim();

    if (!token || !email || !email.includes("@") || !/^\d{6}$/.test(code)) {
      return new Response(JSON.stringify({ ok: false, error: "Entrée invalide" }), {
        status: 400,
        headers,
      });
    }

    const supabase = serviceClient();

    // Vérifie le code OTP. Le type attendu par verifyOtp dépend de l'état du
    // compte :
    //   - "email"    → code OTP d'un utilisateur déjà confirmé (login)
    //   - "magiclink"→ variante lien magique
    //   - "signup"   → utilisateur créé mais JAMAIS confirmé (cas fréquent ici :
    //                  comptes laissés non confirmés à l'époque du lien magique
    //                  cassé par otp_expired). C'est ce type qui débloque.
    // Un type qui ne correspond pas renvoie une erreur SANS consommer le bon
    // jeton (GoTrue cherche dans la mauvaise colonne), donc l'ordre est sûr.
    const auth = authClient();
    let user = null;
    const attempts: string[] = [];
    for (const type of ["email", "magiclink", "signup"] as const) {
      const { data, error } = await auth.auth.verifyOtp({
        email,
        token: code,
        type,
      });
      if (!error && data?.user) {
        user = data.user;
        break;
      }
      attempts.push(`${type}: ${error?.message || "no user"}`);
    }

    if (!user) {
      // Détail des tentatives dans les logs serveur uniquement —
      // jamais dans la réponse (pas d'info interne exposée au client).
      console.error("verifyOtp échec —", { email, codeLen: code.length, attempts });
      return new Response(
        JSON.stringify({ ok: false, error: "Code invalide ou expiré" }),
        { status: 401, headers },
      );
    }

    // Rattache la session courante au compte vérifié.
    const { data: session } = await supabase
      .from("sessions")
      .select("id, token, reals_total, geo_granted")
      .eq("token", token)
      .maybeSingle();

    if (!session) {
      return new Response(
        JSON.stringify({ ok: false, error: "Session introuvable" }),
        { status: 404, headers },
      );
    }

    await supabase
      .from("sessions")
      .update({ user_id: user.id })
      .eq("id", session.id);

    // Indicateurs du dernier rêve cohérent + nombre de filaments
    // (les intentions KO historisées sont exclues, comme dans /sync).
    const { data: intentions, count } = await supabase
      .from("intentions")
      .select("complexity, clarity", { count: "exact" })
      .eq("session_id", session.id)
      .eq("coherent", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const last = intentions && intentions.length > 0 ? intentions[0] : null;

    // ⚠️ Même filtre de sortie que /sync : aucune donnée géo sensible.
    return new Response(
      JSON.stringify({
        ok: true,
        token: session.token,
        reals: session.reals_total,
        filaments: count || 0,
        anchored: session.geo_granted,
        registered: true,
        complexity: last?.complexity || "EN ATTENTE",
        clarity: last?.clarity || "EN ATTENTE",
      }),
      { status: 200, headers },
    );
  } catch (err) {
    console.error("Erreur /confirm:", err);
    return new Response(JSON.stringify({ ok: false, error: "Erreur serveur" }), {
      status: 500,
      headers,
    });
  }
});
