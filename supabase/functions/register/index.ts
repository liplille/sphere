// ============================================================
// /functions/v1/register  (Étape 6)
// Création du compte et envoi de l'email narratif via Resend
// ============================================================

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { rateLimitByIp } from "../_shared/ratelimit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "sphere@yesin.media";

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
    if (!(await rateLimitByIp("register", req, 5, 600))) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers,
      });
    }

    const body = await req.json().catch(() => ({}));
    const { token, email } = body;

    if (!token || !email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Email invalide" }), {
        status: 400,
        headers,
      });
    }

    const supabase = serviceClient();

    const { data: session } = await supabase
      .from("sessions")
      .select("id, reals_total")
      .eq("token", token)
      .maybeSingle();
    if (!session)
      return new Response(JSON.stringify({ error: "Session introuvable" }), {
        status: 404,
        headers,
      });

    // CORRECTION ICI : On utilise bien "ai_response" pour correspondre à la BDD
    const { data: intention } = await supabase
      .from("intentions")
      .select("ai_response, complexity, clarity")
      .eq("session_id", session.id)
      .maybeSingle();

    // generateLink crée/retrouve l'utilisateur et nous donne le CODE OTP 6 chiffres
    // (properties.email_otp) SANS envoyer d'email Supabase. On envoie nous-mêmes
    // notre email custom via Resend, en y plaçant le code (pas de lien cliquable).
    //
    // Pourquoi un code et pas un lien : les anti-spam (Gmail/Defender/SafeLinks)
    // pré-cliquent les liens à usage unique et les consomment → « otp_expired ».
    // Un code 6 chiffres ne peut pas être « pré-cliqué ».
    const { data: linkData, error: linkErr } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: email,
      });

    if (linkErr || !linkData?.properties?.email_otp) {
      console.error("Erreur Auth:", linkErr);
      return new Response(JSON.stringify({ error: "Erreur génération code" }), {
        status: 500,
        headers,
      });
    }

    const emailOtp = linkData.properties.email_otp;

    // NB : on NE lie PAS encore session.user_id ici. Le rattachement se fait
    // dans /confirm, APRÈS vérification du code = vraie preuve de possession
    // de l'email. Tant que le code n'est pas saisi, la session reste anonyme.

    if (!RESEND_API_KEY) {
      console.error("Clé RESEND manquante");
      return new Response(
        JSON.stringify({ error: "Configuration email manquante" }),
        { status: 500, headers },
      );
    }

    // CORRECTION ICI : On affiche "intention.ai_response"
    const htmlContent = `
      <div style="font-family: sans-serif; color: #ffffff; background-color: #0a0a0a; padding: 40px; text-align: center;">
        <h1 style="color: #00f3ff; margin-bottom: 20px; font-weight: normal;">Ta sphère t'attend.</h1>
        ${intention?.ai_response ? `<blockquote style="font-size: 18px; font-style: italic; color: #e0e0e0; border-left: 4px solid #00f3ff; padding-left: 20px; margin: 30px auto; max-width: 600px; text-align: left; line-height: 1.5;">"${intention.ai_response}"</blockquote>` : ""}

        <div style="margin: 30px auto; padding: 25px; background-color: #1a1a1a; border-radius: 8px; display: inline-block; text-align: left; border: 1px solid #333;">
          <p style="margin: 8px 0; color: #aaa;">Complexité : <strong style="color: #00f3ff;">${intention?.complexity || "N/A"}</strong></p>
          <p style="margin: 8px 0; color: #aaa;">Clarté : <strong style="color: #00f3ff;">${intention?.clarity || "N/A"}</strong></p>
          <p style="margin: 8px 0; color: #aaa;">Solde : <strong style="color: #00f3ff;">${session.reals_total || 0} REALS</strong></p>
        </div>

        <p style="color: #aaa; margin-top: 30px; margin-bottom: 12px;">Saisis ce code dans ta sphère pour sceller l'alliance :</p>
        <div style="display: inline-block; padding: 18px 32px; background-color: #1a1a1a; border: 1px solid #00f3ff; border-radius: 8px; font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #00f3ff; font-family: monospace;">${emailOtp}</div>

        <p style="color: #aaa; margin-top: 28px; margin-bottom: 10px;">Tu as fermé la page ? Reviens saisir ton code :</p>
<a href="https://yesin.media/?confirm=${encodeURIComponent(email)}&t=${token}" style="display: inline-block; padding: 14px 28px; background-color: transparent; color: #00f3ff; text-decoration: none; font-weight: bold; border: 1px solid #00f3ff; border-radius: 4px; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Revenir à ma sphère</a>        <p style="color: #666; font-size: 13px; margin-top: 24px;">Ce code expire dans 1 heure. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      </div>
    `;

    const resendReq = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: "Ta sphère est prête — confirme ton alliance",
        html: htmlContent,
      }),
    });

    if (!resendReq.ok) {
      const errText = await resendReq.text();
      console.error("Erreur Resend:", errText);
      return new Response(
        JSON.stringify({ error: "Échec de l'envoi de l'email" }),
        { status: 500, headers },
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error("Erreur générale /register:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers,
    });
  }
});
