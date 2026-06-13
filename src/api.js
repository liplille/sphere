// ============================================================
// api.js — Couche d'accès au backend (window.API).
// ============================================================

let SESSION_TOKEN = localStorage.getItem("sphere_session_token");
if (!SESSION_TOKEN) {
  SESSION_TOKEN =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  localStorage.setItem("sphere_session_token", SESSION_TOKEN);
}

function fnHeaders() {
  return {
    "content-type": "application/json",
    apikey: window.SUPABASE_ANON_KEY,
    authorization: "Bearer " + window.SUPABASE_ANON_KEY,
  };
}

window.API = {
  token: SESSION_TOKEN,

  // Permet d'adopter la session d'un autre appareil
  setToken(t) {
    SESSION_TOKEN = t;
    this.token = t;
    localStorage.setItem("sphere_session_token", t);
  },

  // Synchronisation au chargement / retour d'email.
  // `source` (optionnel) : slug d'attribution QR (?src=) — gravé par /sync
  // uniquement à la création de la session, ignoré ensuite.
  async syncData(jwt = null, source = null) {
    const headers = fnHeaders();
    if (jwt) headers["authorization"] = "Bearer " + jwt;

    try {
      const res = await fetch(window.FN_BASE + "/sync", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ token: SESSION_TOKEN, source: source || undefined }),
      });
      if (!res.ok) return { ok: false };
      return await res.json();
    } catch (e) {
      return { ok: false };
    }
  },

  // Q1 -> { coherent, message, spark, next, emotion, complexity, clarity, reals } | { coherent:false, error:true }
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

  // +10 REALS d'exploration (Q2)
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

  // Étape 6 - Inscription (Q3) : déclenche l'envoi du code 6 chiffres par email
  async registerAccount(email) {
    try {
      const res = await fetch(window.FN_BASE + "/register", {
        method: "POST",
        headers: fnHeaders(),
        body: JSON.stringify({ token: SESSION_TOKEN, email: email }),
      });
      if (!res.ok) {
        console.error("Erreur HTTP /register:", res.status);
        return { ok: false };
      }
      return await res.json();
    } catch (e) {
      console.error("Erreur réseau /register:", e);
      return { ok: false };
    }
  },

  // Étape 8 - Vérifie le code OTP saisi → rattache la session au compte.
  // Renvoie le même payload que syncData (reals, filaments, anchored, ...).
  async confirmCode(email, code) {
    try {
      const res = await fetch(window.FN_BASE + "/confirm", {
        method: "POST",
        headers: fnHeaders(),
        body: JSON.stringify({
          token: SESSION_TOKEN,
          email: email,
          code: code,
        }),
      });
      if (
        !res.ok &&
        res.status !== 401 &&
        res.status !== 400 &&
        res.status !== 404
      ) {
        console.error("Erreur HTTP /confirm:", res.status);
        return { ok: false };
      }
      return await res.json();
    } catch (e) {
      console.error("Erreur réseau /confirm:", e);
      return { ok: false };
    }
  },
};
