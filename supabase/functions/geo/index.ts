// ============================================================
// /functions/v1/geo  (Étape 4)
// Reçoit { token, lat, lng }, reverse-geocode (Nominatim, gratuit),
// enregistre la position précise + l'adresse en base, +10 REALS une fois.
// ============================================================

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { rateLimitByIp } from "../_shared/ratelimit.ts";

const GEO_BONUS = 10;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const headers = { ...corsHeaders(req.headers.get("origin")), "content-type": "application/json" };
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405, headers);

  try {
    // Rate limit généreux (appel non payant, mais on protège Nominatim + la base).
    if (!(await rateLimitByIp("geo", req, 30, 600))) {
      return json({ error: "rate_limited" }, 429, headers);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: "Requête invalide" }, 400, headers);
    }

    // Reverse geocoding (Nominatim exige un User-Agent). Échec non bloquant.
    let city = null, country = null, address = null;
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "YesinSphere/1.0 (https://yesin.media)" } },
      );
      if (r.ok) {
        const g = await r.json();
        address = g.display_name ?? null;
        const a = g.address || {};
        city = a.city || a.town || a.village || a.municipality || a.county || null;
        country = a.country_code ? String(a.country_code).toUpperCase() : null;
      }
    } catch (e) {
      console.error("reverse geocode failed:", e);
    }

    const supabase = serviceClient();

    // session : récupère ou crée
    let session = null;
    {
      const { data } = await supabase
        .from("sessions")
        .select("id, reals_total, geo_granted")
        .eq("token", token)
        .maybeSingle();
      session = data;
    }
    if (!session) {
      const { data, error } = await supabase
        .from("sessions")
        .insert({ token })
        .select("id, reals_total, geo_granted")
        .single();
      if (error) throw error;
      session = data;
    }

    const firstTime = !session.geo_granted;
    const newTotal = (session.reals_total || 0) + (firstTime ? GEO_BONUS : 0);

    const { error: upErr } = await supabase
      .from("sessions")
      .update({ lat, lng, city, country, address, geo_granted: true, reals_total: newTotal })
      .eq("id", session.id);
    if (upErr) throw upErr;

    return json(
      { ok: true, city, country, reals_total: newTotal, awarded: firstTime ? GEO_BONUS : 0 },
      200,
      headers,
    );
  } catch (err) {
    console.error("Erreur /geo:", err);
    return json({ error: "Erreur serveur" }, 500, headers);
  }
});

function json(p, s, h) {
  return new Response(JSON.stringify(p), { status: s, headers: h });
}
