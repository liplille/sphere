// ============================================================
// /functions/v1/confirm  (Étape 8 — bug otp_expired)
// Vérifie le CODE OTP 6 chiffres saisi par l'utilisateur, rattache la
// session au compte (user_id) et renvoie le payload de synchro HUD.
//
// Remplace l'ancien flux « lien magique » consommé par les anti-spam.
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

    // Le projet Supabase peut émettre des codes de 6 à 8 chiffres selon la
    // config Auth (otp_length). On accepte la plage au lieu d'imposer 6.
    if (!token || !email || !email.includes("@") || !/^\d{6,8}$/.test(code)) {
      return new Response(JSON.stringify({ ok: false, error: "Entrée invalide" }), {
        status: 400,
        headers,
      });
    }

    const supabase = serviceClient();

    // Vérifie le code OTP. Le code provenant de generateLink({type:"magiclink"})
    // se vérifie selon les versions avec le type "email" ou "magiclink" — on
    // tente les deux pour être robuste. Un type qui ne correspond pas renvoie
    // une erreur SANS consommer le bon jeton (GoTrue cherche dans la mauvaise
    // colonne), donc l'ordre n'invalide pas le code.
    let user = null;
    const attempts: string[] = [];
    for (const type of ["email", "magiclink"] as const) {
      const { data, error } = await supabase.auth.verifyOtp({
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
      // Logge la raison exacte (visible via `supabase functions logs confirm`).
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

    // Indicateurs du dernier rêve + nombre de filaments.
    const { data: intentions, count } = await supabase
      .from("intentions")
      .select("complexity, clarity", { count: "exact" })
      .eq("session_id", session.id)
      .order("created_at", { ascending: false });

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
