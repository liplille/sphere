// ============================================================
// api.js — Couche d'accès au backend (window.API).
// Étape 3 : submitIntention réel.  Étape 4 : saveGeo réel.
// addReals / register restent en MOCK (Étapes 5-6).
// ============================================================

const SESSION_TOKEN =
  (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
  String(Date.now()) + "-" + Math.random().toString(16).slice(2);

function fnHeaders() {
  return {
    "content-type": "application/json",
    apikey: window.SUPABASE_ANON_KEY,
    authorization: "Bearer " + window.SUPABASE_ANON_KEY,
  };
}

window.API = {
  token: SESSION_TOKEN,

  // Q1 -> { coherent, response, complexity, clarity, reals } | { coherent:false, error:true }
  async submitIntention(text) {
    try {
      const res = await fetch(window.FN_BASE + "/intention", {
        method: "POST",
        headers: fnHeaders(),
        body: JSON.stringify({ token: SESSION_TOKEN, dream: text }),
      });
      if (!res.ok) {
        console.error("intention HTTP", res.status, await res.text());
        return { coherent: false, error: true };
      }
      const data = await res.json();
      if (data.error) return { coherent: false, error: true };
      return data;
    } catch (e) {
      console.error("intention fetch failed:", e);
      return { coherent: false, error: true };
    }
  },

  // Ancrage -> persiste lat/lng + adresse en base, +10 REALS une fois
  async saveGeo(lat, lng) {
    try {
      const res = await fetch(window.FN_BASE + "/geo", {
        method: "POST",
        headers: fnHeaders(),
        body: JSON.stringify({ token: SESSION_TOKEN, lat, lng }),
      });
      if (!res.ok) {
        console.error("geo HTTP", res.status);
        return { ok: false };
      }
      return await res.json();
    } catch (e) {
      console.error("geo fetch failed:", e);
      return { ok: false };
    }
  },

  // +10 REALS d'exploration (Q2) — Appel réel
  async addReals(n) {
    try {
      const res = await fetch(window.FN_BASE + "/reals", {
        method: "POST",
        headers: fnHeaders(),
        body: JSON.stringify({ token: SESSION_TOKEN, amount: n }),
      });
      if (!res.ok) {
        console.error("Erreur HTTP /reals:", res.status);
        return { ok: false };
      }
      return await res.json();
    } catch (e) {
      console.error("Erreur réseau /reals:", e);
      return { ok: false };
    }
  },

  // Création de compte — MOCK (Étape 6)
  async register(email) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, email };
  },
};
