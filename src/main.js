// ============================================================
// main.js — Point d'entrée Vite.
// L'ordre des imports = l'ordre d'exécution : config pose window.SUPABASE_*,
// api pose window.API, hud pose window.HUD, puis sphere démarre le moteur.
// ============================================================

import "./config.js";
import "./api.js";
import "./hud.js";
import "./sphere.js";
