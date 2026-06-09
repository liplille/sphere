// ============================================================
// hud.js — Logique d'affichage du HUD (window.HUD).
// ============================================================

window.HUD = (function () {
  const $ = (id) => document.getElementById(id);

  const elReals = $("hud-potential");
  const elComplexity = $("hud-complexity");
  const elClarity = $("hud-clarity");
  const elFilaments = $("hud-filaments");
  const elLocation = $("hud-location");
  const elState = $("hud-state");
  const networkDot = $("network-dot");
  const networkText = $("network-text");
  const elMessaging = $("hud-messaging");
  const dreamInput = $("dream-input");

  let realsBase = 12;
  let filaments = 0;
  let anchored = false;

  const clarityColor = (cl) =>
    cl === "LIMPIDE" ? "#00f3ff" : cl === "NETTE" ? "#aee4ff" : "rgba(255, 255, 255, 0.7)";

  function renderReals() {
    const shown = Math.max(0, realsBase + (Math.floor(Math.random() * 11) - 5));
    elReals.innerText = shown + " REALS";
  }
  function reward() {
    elReals.classList.remove("reward-anim");
    void elReals.offsetWidth;
    elReals.classList.add("reward-anim");
  }
  function setReals(v) { realsBase = v; renderReals(); reward(); }
  function addReals(n) { realsBase += n; renderReals(); reward(); }
  function setIndicators(c, cl) {
    elComplexity.innerText = c;
    elClarity.innerText = cl;
    elClarity.style.color = clarityColor(cl);
  }
  function incFilaments() {
    filaments += 1;
    elFilaments.innerText = filaments + (filaments > 1 ? " FILAMENTS" : " FILAMENT");
  }
  function setState(t, color) { elState.innerHTML = t; elState.style.color = color || ""; }
  function setStateColor(color) { elState.style.color = color || ""; }
  function setOnline() {
    networkDot.classList.remove("offline");
    networkText.innerText = "CONNECTÉ AU RÉSEAU";
    networkText.style.color = "";
  }
  function activateMessaging() { elMessaging.innerText = "ACTIVE"; elMessaging.style.color = "#00f3ff"; }

  // Ancrage cliquable à tout moment : position HAUTE PRÉCISION envoyée au backend.
  function initAncrage(onAnchor) {
    if (!elLocation) return;
    const trigger = elLocation.closest(".hud-data") || elLocation;
    trigger.style.pointerEvents = "auto";
    trigger.style.cursor = "pointer";
    trigger.title = "Ancrer ta sphère";
    trigger.addEventListener("click", () => {
      if (!("geolocation" in navigator)) return;
      elLocation.innerText = "DÉTECTION…";
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          elLocation.innerText = "ANCRÉ";
          elLocation.style.color = "#00f3ff";
          // Persiste la position précise + l'adresse en base (Étape 4).
          try {
            if (window.API && window.API.saveGeo) await window.API.saveGeo(latitude, longitude);
          } catch (e) {
            console.error("saveGeo:", e);
          }
          if (!anchored) {
            anchored = true;
            addReals(10); // +10 REALS une seule fois
            if (typeof onAnchor === "function") onAnchor();
          }
        },
        () => { elLocation.innerText = "LIBRE"; }, // refus : retour à l'état initial
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  // Fluctuation au repos
  setInterval(() => {
    if (!dreamInput || dreamInput.value.trim().length === 0) renderReals();
  }, 4000);

  // Aperçu pendant la frappe (cosmétique ; le submit fait foi)
  if (dreamInput) {
    dreamInput.addEventListener("input", (e) => {
      const length = e.target.value.trim().length;
      if (length === 0) {
        elComplexity.innerText = "EN ATTENTE";
        elClarity.innerText = "EN ATTENTE";
        elClarity.style.color = "";
        renderReals();
        return;
      }
      let c, cl, r;
      if (length < 15) { c = "BASIQUE"; cl = "TROUBLE"; r = realsBase + 12; }
      else if (length < 40) { c = "PROFONDE"; cl = "NETTE"; r = realsBase + 48; }
      else { c = "CRYPTIQUE"; cl = "LIMPIDE"; r = realsBase + Math.floor(length * 1.5) + 50; }
      elComplexity.innerText = c;
      elClarity.innerText = cl;
      elClarity.style.color = clarityColor(cl);
      elReals.innerText = r + " REALS";
    });
  }

  if (elFilaments) elFilaments.innerText = "0 FILAMENT";
  renderReals();

  return {
    setReals, addReals, setIndicators, incFilaments, setState, setStateColor,
    setOnline, activateMessaging, initAncrage, isAnchored: () => anchored,
  };
})();
