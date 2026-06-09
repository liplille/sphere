// Headers CORS partagés — n'autorise que les origines listées.
// Importé par chaque Edge Function (Étape 3+).

const ALLOWED_ORIGINS = [
  "https://yesin.media",
  // "http://localhost:5500", // ← décommente pour le dev local (Live Server, etc.)
];

export function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Gère le préflight OPTIONS. Renvoie une Response si c'est un préflight, sinon null.
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
  }
  return null;
}
