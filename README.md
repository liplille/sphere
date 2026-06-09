# YESIN Sphere

Expérience immersive (sphère 3D) : capture d'intention, IA (Claude), géolocalisation, création de compte. Entrée via un QR code dynamique.

Specs complètes et roadmap : `yesin-sphere-specs.md`. Ce README couvre la mise en route (**Étapes 0 et 1**).

## Structure

```
public/        -> uploadé dans public_html/ sur n0c (yesin.media)
  index.html        (placeholder — refactor Étape 2)
  confirm.html      (placeholder — Étape 6)
  go/index.php      (placeholder — Étape 7)
  assets/css|js     (config.js prêt ; le reste placeholder)
supabase/      -> déployé via le CLI Supabase (PAS sur n0c)
  migrations/20250608000001_init.sql   <- LA migration (Étape 1)
  functions/_shared (cors.ts, client.ts prêts ; prompt.ts placeholder)
  functions/{intention,geo,reals,register} (stubs 501)
.env.example / .env.local / .gitignore / secrets.php.example
```

---

## Étape 0 — Fondations (à faire une fois)

Ces actions passent par TES comptes : à réaliser toi-même. **Aucune clé secrète ne doit aller dans git ni dans le navigateur.**

### 1. Comptes & clés
- **Supabase** : crée un projet sur supabase.com → *Project Settings > API* → note `Project URL`, `anon public`, `service_role`.
  - À la création : définis un **mot de passe** (Generate + sauvegarde-le), région **Europe**, garde **Enable Data API** coché, **décoche** « Automatically expose new tables » (la migration expose explicitement les 2 seules tables nécessaires).
- **Anthropic** : console.anthropic.com → *API Keys* → crée une clé.
- **Resend** : resend.com → *API Keys* → crée une clé. Puis *Domains* → ajoute et vérifie `yesin.media` (pour envoyer depuis `sphere@yesin.media`).

### 2. Variables locales
Copie `.env.example` en `.env.local` (ou édite le `.env.local` fourni) et remplis les valeurs.
Reporte **uniquement** `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `public/assets/js/config.js`.

### 3. Supabase CLI
```bash
npm i -g supabase                  # ou: brew install supabase/tap/supabase
supabase login
cd yesin-sphere
supabase init                      # génère supabase/config.toml (garde mes fichiers)
supabase link --project-ref <REF>  # <REF> = l'ID du projet (dans l'URL du dashboard)
```

### 4. Secrets des Edge Functions
Supabase injecte déjà `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` dans les fonctions. Tu n'ajoutes que les clés externes :
```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  RESEND_API_KEY=re_... \
  RESEND_FROM=sphere@yesin.media \
  ADMIN_ALERT_EMAIL=ton@email.com
```

### 5. Secrets PHP (n0c) — pour l'Étape 7, à préparer maintenant
Renomme `secrets.php.example` en `secrets.php`, remplis-le, et place-le **hors** de `public_html` (ex : `/home/TON_USER/private/secrets.php`). Ne le commite pas.

---

## Étape 1 — Base de données

La migration `supabase/migrations/20250608000001_init.sql` crée les 4 tables + le RLS + un seed.
```bash
supabase db push     # applique la migration au projet lié
```

### Vérification
- **Table Editor** : tu dois voir `redirects` (1 ligne `sphere`), `scan_events`, `sessions`, `intentions`.
- **SQL Editor** (tu y es admin, donc tu vois tout — c'est normal) :
  - `select * from redirects;` → la ligne seedée.
  - Le verrou RLS s'applique à la clé **anon**, pas à l'admin. Pour le tester vraiment côté anon : depuis le client plus tard, ou via un appel REST avec la clé anon, `sessions`/`intentions` doivent renvoyer 0 ligne, tandis que `redirects` (SELECT) et `scan_events` (INSERT) répondent.

---

## Sécurité — rappel permanent
- Aucune clé secrète dans `public/`. Le navigateur n'a que l'URL + la clé anon.
- L'appel à Claude passe **toujours** par l'Edge Function `/intention` (jamais en direct depuis le JS).
- RLS activé partout ; seules les Edge Functions (service_role) écrivent dans `sessions` / `intentions`.

## Suite
- **Étape 2** : intégrer le `chance.html` dans `public/` (CSS/JS découpés) + micro-ajustements UI.
- **Étape 3** : Edge Function `/intention` + prompt Claude + cohérence.
