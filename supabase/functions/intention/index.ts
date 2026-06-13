// ============================================================
// /functions/v1/intention  (Étape 3 + protection rate limiting)
// ============================================================
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";
import { SYSTEM_PROMPT } from "../_shared/prompt.ts";
import { rpcRateLimit, rateLimitByIp } from "../_shared/ratelimit.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const COHERENCE_BONUS = 10;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const headers = { ...corsHeaders(req.headers.get("origin")), "content-type": "application/json" };
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405, headers);

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const dreamRaw = typeof body.dream === "string" ? body.dream : "";
    const dream = dreamRaw.trim().slice(0, 2000);
    if (!token || !dream) return json({ error: "Requête invalide" }, 400, headers);

    // Protection de l'endpoint payant (Claude) :
    // - par session (serré) : boucles / double-clics d'un même visiteur
    // - par IP (généreux) : scripté, sans pénaliser les grappes (NAT mobile, wifi d'événement)
    const okToken = await rpcRateLimit("intention-token:" + token, 8, 600);
    const okIp = await rateLimitByIp("intention", req, 40, 600);
    if (!okToken || !okIp) return json({ error: "rate_limited" }, 429, headers);

    // Session : lookup ou création avant l'appel Claude
    // (nécessaire pour historiser aussi les intentions KO)
    const supabase = serviceClient();
    let session = null;
    {
      const { data } = await supabase.from("sessions").select("id, reals_total").eq("token", token).maybeSingle();
      session = data;
    }
    if (!session) {
      const { data, error } = await supabase.from("sessions").insert({ token }).select("id, reals_total").single();
      if (error) throw error;
      session = data;
    }

    // 1) Appel Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 900, system: SYSTEM_PROMPT, messages: [{ role: "user", content: dream }] }),
    });
    if (!claudeRes.ok) {
      console.error("Claude API error:", claudeRes.status, await claudeRes.text());
      return json({ error: "Erreur IA" }, 502, headers);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content || [])
      .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

    let parsed;
    try { parsed = JSON.parse(stripFences(rawText)); }
    catch (_e) { console.error("JSON illisible de Claude:", rawText); return json({ error: "Réponse IA illisible" }, 502, headers); }

    // Intention KO : on l'historise pour les stats, sans récompense
    if (!parsed.coherent) {
      await supabase.from("intentions").insert({
        session_id: session.id, dream_text: dream, coherent: false, reals: 0,
      });
      return json({ coherent: false }, 200, headers);
    }

    const result = {
      coherent: true,
      message: String(parsed.message ?? ""),
      spark: String(parsed.spark ?? ""),
      next: String(parsed.next ?? ""),
      emotion: String(parsed.emotion ?? "").toLowerCase().slice(0, 40),
      complexity: normalize(parsed.complexity, ["BASIQUE", "PROFONDE", "CRYPTIQUE"], "BASIQUE"),
      clarity: normalize(parsed.clarity, ["TROUBLE", "NETTE", "LIMPIDE"], "TROUBLE"),
      reals: clampReals(parsed.reals) + COHERENCE_BONUS,
    };

    const { error: insErr } = await supabase.from("intentions").insert({
      session_id: session.id, dream_text: dream, ai_response: result.message,
      spark: result.spark, next_question: result.next, emotion: result.emotion,
      complexity: result.complexity, clarity: result.clarity, coherent: true, reals: result.reals,
    });
    if (insErr) throw insErr;

    const newTotal = (session.reals_total || 0) + result.reals;
    await supabase.from("sessions").update({ reals_total: newTotal }).eq("id", session.id);

    return json(result, 200, headers);
  } catch (err) {
    console.error("Erreur /intention:", err);
    return json({ error: "Erreur serveur" }, 500, headers);
  }
});

function json(p, s, h) { return new Response(JSON.stringify(p), { status: s, headers: h }); }
function stripFences(t) { return t.replace(/```json/gi, "").replace(/```/g, "").trim(); }
function clampReals(v) { const n = Math.round(Number(v)); if (!Number.isFinite(n)) return 40; return Math.max(10, Math.min(120, n)); }
function normalize(v, allowed, fallback) { const s = String(v ?? "").toUpperCase(); return allowed.includes(s) ? s : fallback; }
