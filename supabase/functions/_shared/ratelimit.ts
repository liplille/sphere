// ============================================================
// ratelimit.ts — Limiteur de débit partagé (DB-backed, atomique).
// Fail-open : si le limiteur lui-même échoue, on n'empêche pas l'usage
// légitime (le plafond de dépenses Anthropic reste le filet ultime).
// ============================================================

import { serviceClient } from "./client.ts";

// IP du client : Supabase la place dans x-forwarded-for (1ère valeur).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

// Hash non réversible (on ne stocke jamais l'IP en clair).
export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// Appel bas niveau. true = autorisé, false = limite atteinte.
export async function rpcRateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rate_limit rpc error:", error);
      return true; // fail-open
    }
    return data === true;
  } catch (e) {
    console.error("rate_limit failed:", e);
    return true; // fail-open
  }
}

// Pratique : limite par IP, préfixée par endpoint.
export async function rateLimitByIp(prefix: string, req: Request, max: number, windowSeconds: number): Promise<boolean> {
  const h = await hashIp(clientIp(req));
  return rpcRateLimit(`${prefix}-ip:${h}`, max, windowSeconds);
}
