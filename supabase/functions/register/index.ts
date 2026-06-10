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

    const { data: intention } = await supabase
      .from("intentions")
      .select("dream_text, complexity, clarity")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
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

    const intentionBlock = intention?.dream_text
      ? `<tr><td style="padding:0 40px 28px 40px;">
          <div style="background:rgba(255,255,255,0.02);border-left:2px solid #ffcc55;padding:16px;border-radius:0 8px 8px 0;">
            <p style="color:rgba(255,255,255,0.4);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px 0;font-family:monospace;">[INTENTION TRANSMISE]</p>
            <p style="color:#fff;font-size:15px;font-style:italic;line-height:1.6;margin:0;">"${intention.dream_text}"</p>
          </div>
        </td></tr>`
      : "";

    const htmlContent = `
      <div style="background-color:#060608;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#0b0a0f;border:1px solid rgba(255,204,85,0.12);border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.45);border-collapse:collapse;">

        <tr>
          <td style="padding:40px 40px 24px 40px;text-align:center;">
            <h1 style="color:#ffcc55;font-weight:300;font-size:24px;letter-spacing:4px;text-transform:uppercase;margin:0 0 4px 0;">Sphère est prête.</h1>
            <p style="color:rgba(255,255,255,0.25);font-size:10px;letter-spacing:4px;text-transform:uppercase;margin:0;font-family:monospace;">CYCLE ÉVEIL_1.0.1</p>
          </td>
        </tr>

        ${intentionBlock}

        <tr>
          <td style="padding:0 40px 28px 40px;">
            <p style="color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 14px 0;">
              Avec <strong style="color:#ffcc55;font-family:monospace;font-size:16px;">${session.reals_total} REALS</strong> injectés dans ton capital, la réalisation est déjà en mouvement.
            </p>
            <p style="color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0;">
              Sphère n'est pas du genre à abandonner. Il ne reste plus qu'un détail à confirmer.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 28px 40px;">
            <table width="100%" cellspacing="0" cellpadding="0" style="background:rgba(255,204,85,0.03);border:1px solid rgba(255,204,85,0.15);border-radius:8px;border-collapse:collapse;">
              <tr>
                <td width="33%" style="padding:14px;text-align:center;border-right:1px solid rgba(255,204,85,0.1);">
                  <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:monospace;">Complexité</div>
                  <div style="font-size:13px;color:#ffcc55;font-weight:bold;font-family:monospace;">${intention?.complexity || "N/A"}</div>
                </td>
                <td width="33%" style="padding:14px;text-align:center;border-right:1px solid rgba(255,204,85,0.1);">
                  <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:monospace;">Clarté</div>
                  <div style="font-size:13px;color:#ffcc55;font-weight:bold;font-family:monospace;">${intention?.clarity || "N/A"}</div>
                </td>
                <td width="33%" style="padding:14px;text-align:center;">
                  <div style="font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;font-family:monospace;">Matérialisation</div>
                  <div style="font-size:13px;color:#ffcc55;font-weight:bold;font-family:monospace;">${session.reals_total || 0} REALS</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 40px 32px 40px;text-align:center;border-top:1px dashed rgba(255,255,255,0.08);">
            <p style="color:rgba(255,255,255,0.5);margin:0 0 16px 0;font-size:13px;letter-spacing:0.5px;">Saisis ce code pour créer ton lien avec Sphère :</p>
            <div style="display:inline-block;padding:14px 32px;background:rgba(255,204,85,0.06);border:1px solid #ffcc55;border-radius:10px;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffcc55;font-family:monospace;">${emailOtp}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 40px 40px;background:rgba(0,0,0,0.2);text-align:center;border-radius:0 0 16px 16px;">
            <p style="color:rgba(255,255,255,0.35);margin:0 0 14px 0;font-size:12px;">La page d'origine s'est refermée ?</p>
            <a href="https://yesin.media/?confirm=${encodeURIComponent(email)}&t=${token}" style="display:inline-block;padding:12px 28px;background:#ffcc55;color:#0b0a0f;text-decoration:none;font-weight:700;border-radius:6px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;">Forcer la reconnexion</a>
            <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:28px 0 0 0;line-height:1.5;">Ce code expire dans 1 heure.<br>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
          </td>
        </tr>

      </table>
      </div>
    `;

    const resendReq = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Sphère <${RESEND_FROM}>`,
        to: email,
        subject: "Sphère est prête — confirme ton lien.",
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
