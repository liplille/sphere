# YESIN Sphere — Spécifications techniques & roadmap

Document de référence du projet. À garder ouvert et à suivre étape par étape.
Chaque étape de la roadmap est conçue pour être lancée seule dans une session dédiée.

---

## 1. Stack technique

| Couche                       | Techno                            | Où                |
| ---------------------------- | --------------------------------- | ----------------- |
| Frontend (la sphère)         | HTML · Tailwind · Three.js        | yesin.media (n0c) |
| Redirect QR + log scan       | PHP                               | yesin.media (n0c) |
| API (IA, compte, reals, geo) | Supabase Edge Functions (Deno/TS) | Supabase cloud    |
| Base de données              | Supabase PostgreSQL               | Supabase cloud    |
| Authentification             | Supabase Auth                     | Supabase cloud    |
| IA                           | Claude API (Sonnet)               | API Anthropic     |
| Email                        | Resend                            | API Resend        |

Trois cibles de déploiement distinctes : **n0c** (le site + le PHP), **Supabase** (les Edge Functions + la DB), et les **API externes** (Claude, Resend) appelées depuis les Edge Functions.

**Déploiement automatisé (CI/CD)** : un `git push` sur `main` déclenche GitHub Actions —
- `.github/workflows/deploy-site.yml` : build Vite (`npm run build`) puis upload du dossier `dist/` vers n0c en FTPS. Les fichiers JS/CSS sont hashés (`main-a3f2b1.js`) : le cache navigateur est invalidé automatiquement à chaque déploiement.
- `.github/workflows/deploy-functions.yml` : `supabase functions deploy` si `supabase/functions/**` ou `config.toml` a changé. Les migrations SQL restent manuelles (`supabase db push`).

Secrets GitHub requis (Settings → Secrets and variables → Actions) : `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` (compte FTP n0c dont la racine est le web root), `SUPABASE_ACCESS_TOKEN`.

Dev local : `npm install` puis `npm run dev` (port 5173, autorisé dans `cors.ts`).

---

## 2. Structure des fichiers

```
yesin-sphere/
│
├── README.md
├── .gitignore
├── .env.local                    ← clés réelles EN LOCAL (GITIGNORÉ)
├── package.json                  ← Vite + Three.js (npm)
├── vite.config.js                ← build multi-pages (index + confirm)
│
├── index.html                    ← la sphère (entrée Vite)
├── confirm.html                  ← page de repli (lien email)
│
├── src/                          ← bundlé par Vite (noms hashés en sortie)
│   ├── main.js                   ← point d'entrée : importe les 4 modules
│   ├── config.js                 ← Supabase URL + anon key (PUBLIC — ok)
│   ├── api.js                    ← appels fetch vers les Edge Functions
│   ├── hud.js                    ← logique HUD (reals, filaments, ancrage)
│   ├── sphere.js                 ← moteur 3D Three.js
│   └── sphere.css                ← styles
│
├── public/                       ← copié TEL QUEL dans dist/ par Vite
│   ├── favicon.svg
│   └── go/
│       └── index.php             ← QR redirect + log scan + alerte
│
├── dist/                         ← sortie de build (GITIGNORÉ) → web root n0c
│
├── .github/workflows/            ← CI/CD (voir §1)
│
└── supabase/                     ← déployé via `supabase` CLI (PAS sur n0c)
    ├── config.toml               ← verify_jwt=false pour TOUTES les fonctions
    ├── migrations/               ← SQL séquentiel horodaté (jamais ré-éditer)
    │   ├── …0001_init.sql        ← tables redirects/scan_events/sessions/intentions + RLS
    │   ├── …0002_grants.sql      ← GRANT explicites à service_role (auto-expose OFF)
    │   ├── …0003_ratelimit.sql   ← table rate_limits + RPC check_rate_limit()
    │   └── …0004_geo.sql         ← sessions.address (lat/lng/city/country déjà en 0001)
    └── functions/
        ├── _shared/
        │   ├── cors.ts           ← headers CORS (origine yesin.media)
        │   ├── client.ts         ← client Supabase service_role
        │   ├── ratelimit.ts      ← limiteur partagé (DB-backed, fail-open)
        │   └── prompt.ts         ← le prompt Claude
        ├── intention/index.ts    ← POST /functions/v1/intention (Claude, rate-limité)
        ├── geo/index.ts          ← POST /functions/v1/geo (reverse-geocoding Nominatim)
        ├── reals/index.ts        ← POST /functions/v1/reals (+10 exploration, rate-limité)
        ├── register/index.ts     ← POST /functions/v1/register (génère + email le code OTP)
        ├── confirm/index.ts      ← POST /functions/v1/confirm (vérifie le code OTP, rate-limité)
        └── sync/index.ts         ← POST /functions/v1/sync (resynchro cross-device, rate-limité)
```

> **Token de session côté client** : généré par le navigateur et **persisté en
> `localStorage`** (`sphere_session_token`, voir `api.js`). Toutes les données
> réelles (reals, filaments, indicateurs, état connecté) viennent du serveur via
> `/sync` — le client ne fait jamais autorité sur les valeurs.

### Côté n0c (rappel cPanel)

Le dossier des secrets PHP doit vivre **hors** de la racine web pour ne jamais être accessible par URL :

```
/home/TON_USER/
├── public_html/          ← = yesin.media (= le contenu de dist/, déployé par CI)
│   ├── index.html
│   ├── go/index.php
│   └── assets/main-<hash>.js|css
└── private/              ← AU-DESSUS de public_html, inaccessible par URL
    └── secrets.php       ← clé Resend + clé Supabase pour le PHP
```

Le PHP lit ses secrets via un chemin remontant d'un cran : `require __DIR__ . '/../../private/secrets.php';` (à ajuster selon la profondeur réelle).

---

## 3. Sécurité

### 3.1 Règle d'or

**Aucune clé secrète ne doit jamais se trouver dans le navigateur.** Tout ce qui est dans le HTML/JS est lisible par n'importe qui via « voir le code source ». Conséquence directe : l'appel à Claude passe **obligatoirement** par l'Edge Function `/intention`. Appeler Claude directement depuis le navigateur exposerait la clé API → vol immédiat → facture qui explose.

### 3.2 Inventaire des clés

| Clé                         | Sensibilité                 | Rôle                                            |
| --------------------------- | --------------------------- | ----------------------------------------------- |
| `SUPABASE_URL`              | Publique                    | URL du projet                                   |
| `SUPABASE_ANON_KEY`         | Publique (protégée par RLS) | Lecture/écriture limitée depuis le client       |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRÈTE**                 | Accès total, contourne RLS — serveur uniquement |
| `ANTHROPIC_API_KEY`         | **SECRÈTE**                 | Appels Claude                                   |
| `RESEND_API_KEY`            | **SECRÈTE**                 | Envoi d'emails                                  |

### 3.3 Où stocker quoi

- **Client (`config.js`)** : uniquement `SUPABASE_URL` + `SUPABASE_ANON_KEY`. Rien d'autre.
- **Edge Functions** : toutes les clés secrètes, posées via le CLI :
  ```
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-... RESEND_API_KEY=re_... SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```
  Elles sont ensuite lues dans le code via `Deno.env.get("ANTHROPIC_API_KEY")`.
- **PHP sur n0c (`secrets.php`)** : la clé Resend + une clé Supabase, dans le fichier hors `public_html`.
- **Local (`.env.local`)** : toutes les clés pour le dev, **gitignoré**.

### 3.4 `.gitignore` minimal

```
.env
.env.local
private/
*.key
node_modules/
.DS_Store
```

### 3.5 `.env.example` (template à commiter)

```
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=             # public → config.js
SUPABASE_SERVICE_ROLE_KEY=     # SECRET → Edge Functions only

# Claude
ANTHROPIC_API_KEY=             # SECRET

# Resend
RESEND_API_KEY=                # SECRET
RESEND_FROM=sphere@yesin.media
ADMIN_ALERT_EMAIL=ton@email.com
```

### 3.6 RLS (Row Level Security)

Le mécanisme de sécurité central de Supabase. **Activé sur toutes les tables.** Avec RLS, la clé anon ne peut faire que ce que les policies autorisent explicitement. Principe retenu pour la V1 :

- Les écritures sensibles (intentions, register, reals, geo) passent par les Edge Functions qui utilisent la `service_role` et valident l'input → le client n'écrit pas directement dans ces tables.
- `scan_events` : INSERT autorisé (depuis le PHP), SELECT interdit au public.

### 3.7 CORS

Les Edge Functions configurées (dans `_shared/cors.ts`) pour n'accepter que l'origine `https://yesin.media`. Toute requête venant d'ailleurs est rejetée.

---

## 4. Schéma de base de données

### `redirects`

Pilote le QR dynamique. Une ligne par slug.

| Colonne     | Type        | Note                                      |
| ----------- | ----------- | ----------------------------------------- |
| id          | uuid PK     |                                           |
| slug        | text unique | ex. `sphere`                              |
| destination | text        | URL cible (modifiable sans toucher au QR) |
| active      | bool        |                                           |
| created_at  | timestamptz |                                           |

### `scan_events`

Un enregistrement par scan du QR.

| Colonne    | Type        | Note                        |
| ---------- | ----------- | --------------------------- |
| id         | uuid PK     |                             |
| slug       | text        |                             |
| ip_hash    | text        | IP hachée (pas l'IP brute)  |
| country    | text        | déduit côté PHP si possible |
| user_agent | text        |                             |
| scanned_at | timestamptz |                             |

### `sessions`

Une session = un visiteur (avant compte). Rattachée à un user après l'email.

| Colonne       | Type               | Note                                  |
| ------------- | ------------------ | ------------------------------------- |
| id            | uuid PK            |                                       |
| token         | text unique        | généré côté client, stocké en mémoire |
| scan_event_id | uuid FK            | nullable                              |
| user_id       | uuid FK auth.users | nullable (rempli au register)         |
| reals_total   | int                | total cumulé                          |
| geo_granted   | bool               | position partagée ?                   |
| lat           | float8             | nullable — position précise (serveur) |
| lng           | float8             | nullable (serveur)                    |
| city          | text               | nullable (pour l'admin)               |
| country       | text               | nullable                              |
| address       | text               | nullable — adresse complète (mig 0004)|
| created_at    | timestamptz        |                                       |

> ⚠️ `lat/lng/city/country/address` sont **réservées au serveur**. `/sync` et
> `/confirm` ne renvoient **jamais** ces champs au navigateur — seul le booléen
> `anchored` (= `geo_granted`) sort.

### `intentions`

Une ligne par réponse Q1 cohérente.

| Colonne     | Type        | Note                                                          |
| ----------- | ----------- | ------------------------------------------------------------- |
| id          | uuid PK     |                                                               |
| session_id  | uuid FK     |                                                               |
| dream_text  | text        | l'input utilisateur                                           |
| ai_response | text        | réponse Claude                                                |
| complexity  | text        | BASIQUE / PROFONDE / CRYPTIQUE                                |
| clarity     | text        | TROUBLE / NETTE / LIMPIDE                                     |
| coherent    | bool        | toujours true ici (les incohérentes ne sont pas sauvegardées) |
| reals       | int         | reals attribués pour cette intention                          |
| created_at  | timestamptz |                                                               |

### `rate_limits` (migration 0003)

Limiteur de débit partagé (fenêtre fixe atomique). Touché uniquement par `service_role` via la RPC `check_rate_limit(bucket, max, window_seconds)`.

| Colonne      | Type        | Note                              |
| ------------ | ----------- | --------------------------------- |
| bucket       | text PK     | ex. `intention-ip:<hash>`         |
| window_start | timestamptz | début de la fenêtre courante      |
| count        | int         | nombre de hits dans la fenêtre    |

Le compte utilisateur est géré par `auth.users` (Supabase Auth). Pas besoin de table `users` séparée pour la V1.

### Synchronisation cross-device (`/sync`, hors-roadmap initiale)

`sessions.user_id` est rempli lors de la **confirmation du code OTP** (`/confirm`). À partir de là, `/sync` peut retrouver la session :
- **via le token de session** (`localStorage`) — rafraîchissement de page sur le même appareil ;
- **via le JWT** issu d'une vérification OTP — reprise sur un autre appareil.

Champs renvoyés (strict minimum) : `reals, filaments, anchored, registered, complexity, clarity, token`.

---

## 5. Ajustements de comportement

### 5.1 Filaments

- Compteur HUD `MÉMOIRE` (bottom-right). **Démarre à 0** (« 0 FILAMENT »).
- À chaque réponse Q1 **cohérente** : **+1** (→ « 1 FILAMENT »).
- Cohérence avec la 3D : le code active déjà `filaments[0]` au submit (il passe en cyan). Donc le compteur et l'activation visuelle d'un filament vont de pair.
- Évolutif : chaque future intention sauvegardée = +1 filament (compteur + activation du filament suivant).

### 5.2 REALS

Deux logiques distinctes à ne pas confondre :

**a) Le socle réel (`reals_total`, en DB)** — augmente par événements fixes :

| Source               | Montant | Déclencheur                                |
| -------------------- | ------- | ------------------------------------------ |
| Richesse du texte Q1 | ~40–80  | calculé par Claude (longueur + profondeur) |
| Réponse cohérente    | +10     | `coherent: true` (ajouté côté backend)     |
| Géolocalisation      | +10     | position partagée (une seule fois)         |
| Exploration Q2       | +10     | 2e touche de sphère                        |

**b) La fluctuation d'affichage** — pour l'effet « vivant » :

- La valeur **affichée** = `reals_total` + un aléa entre **−5 et +5**, rafraîchi périodiquement (comme la fluctuation au repos déjà présente, mais en ±5 au lieu de ±1).
- Quand un événement réel ajoute des REALS, `reals_total` monte et l'animation `reward-anim` se déclenche.

### 5.3 Ancrage / géolocalisation

- **Proposition principale** : un bouton « Ancrer (+10 REALS) » apparaît dans la vue réponse, après l'affichage du texte IA (l'utilisateur est dans le bon état émotionnel).
- **Accès permanent** : l'élément HUD `ANCRAGE` (top-left) est **cliquable à tout moment**. Un clic déclenche la géolocalisation, où qu'on en soit dans le parcours.
- **Comportement** :
  - Premier ancrage → +10 REALS (une seule fois) + animation + position précise enregistrée en DB (`lat`, `lng`, `city`, `country`, `geo_granted = true`).
  - Clics suivants → mise à jour silencieuse de la position, **pas** de nouveau bonus REALS.
  - Si refusé → on ne ré-insiste pas ; le HUD reste à l'état non ancré.
- **Wording HUD** (l'interface n'affiche jamais la position précise, juste l'état) :
  - Non ancré : `ANCRAGE : LIBRE` (avec un indice visuel discret qu'il est tappable)
  - Ancré : `ANCRAGE : ANCRÉ` (en surbrillance cyan, comme le point réseau connecté)

### 5.4 Cohérence Q1 (rappel)

Claude évalue dans le même appel. JSON retourné :

```json
{ "coherent": true,  "response": "...", "complexity": "PROFONDE", "clarity": "NETTE", "reals": 60 }
{ "coherent": false, "response": null,  "complexity": null,       "clarity": null,     "reals": null }
```

Si `coherent: false` : pas de save, pas de décrément d'explorations, pas de switch de vue. Message doux dans le formulaire (« La sphère n'a pas capté d'intention réelle… Parle-nous de ce que tu veux vraiment créer. »), l'input se vide et reprend le focus.

---

## 6. Roadmap — étapes séquentielles

Chaque étape est autonome et testable. Recommandé : une étape = une session.

> **État réel (le dépôt fait foi, ce tableau est tenu à jour) :**
> Étapes **0 → 8 faites et déployées**. Ajout hors-roadmap : fonction **`/sync`**
> (resynchro cross-device). Le flux email de l'Étape 6 a été **remplacé** à
> l'Étape 8 : plus de lien magique (bug `otp_expired` dû au pré-clic anti-spam),
> mais un **code OTP (6 à 8 chiffres selon la config Auth)** saisi dans la sphère
> puis vérifié par `/confirm`.

### Étape 0 — Fondations (setup + sécurité)

**Livrables :** projet Supabase créé (URL + anon + service_role récupérées) · compte Resend (clé) · clé API Claude · structure de dossiers · `.gitignore` + `.env.example` + `.env.local` · `supabase secrets set …` · `secrets.php` posé hors `public_html`.
**Test :** `supabase functions list` répond ; les secrets sont listés ; aucune clé secrète dans `public/`.

### Étape 1 — Base de données

**Livrables :** migration `0001_init.sql` (tables `redirects`, `scan_events`, `sessions`, `intentions`) · RLS activé · policies.
**Test :** insérer une ligne de test via le SQL editor ; vérifier qu'une policy bloque bien une lecture non autorisée et autorise les écritures prévues.

### Étape 2 — Refactor frontend (découpe du HTML)

**Livrables :** CSS extrait → `sphere.css` · JS extrait → `sphere.js` / `hud.js` / `api.js` · `config.js` (anon key) · micro-ajustements UI **en mock** (filaments 0→1, REALS ±5, `ANCRAGE` cliquable) sans branchement backend.
**Test :** le site tourne en local, la sphère s'affiche, le HUD réagit en mode démo.

### Étape 3 — Cœur : Intention + Claude + Cohérence (M3 + M4)

**Livrables :** `prompt.ts` (cohérence + indicateurs + reals) · Edge Function `/intention` · `api.js → submitIntention()` · branchement du submit Q1 (réponse réelle OU message d'incohérence) · HUD mis à jour (complexité, clarté, reals, +1 filament si cohérent).
**Test :** un vrai rêve → réponse IA + indicateurs + filament à 1 ; « asdfgh » → message d'incohérence, explorations intactes, rien en DB.

### Étape 4 — Géolocalisation

**Livrables :** Edge Function `/geo` · bouton « Ancrer (+10 REALS) » + `ANCRAGE` HUD cliquable · +10 REALS (une fois) + animation + `ANCRÉ` · position précise en DB.
**Test :** clic Ancrer → permission → +10 + `ANCRÉ` ; re-clic → position mise à jour, pas de double bonus ; refus → état non ancré conservé.

### Étape 5 — REALS exploration (M5)

**Livrables :** Edge Function `/reals` (ou logique intégrée) · +10 sur la 2e touche · persistance `sessions.reals_total`.
**Test :** 2e touche → +10 + animation ; le total en DB correspond à l'affichage (hors fluctuation ±5).

### Étape 6 — Compte + Email personnalisé (M6) ✅ — flux révisé en Étape 8

**Livrables :** Edge Function `/register` (`generateLink` + Resend custom) · template email (réponse IA + badges complexité/clarté + total REALS) · branchement du formulaire email · email Supabase auto désactivé.
**⚠️ Le CTA « lien magique » a été remplacé par un code OTP (voir Étape 8c).** `/register` envoie désormais `properties.email_otp` au lieu de `action_link`, et ne rattache plus `user_id` (déplacé dans `/confirm`). L'email contient aussi un lien `?confirm=<email>` pour reprendre la saisie si la page a été fermée.
**Test :** saisir un email → recevoir le code → le saisir dans la sphère → HUD passe `CONNECTÉ AU RÉSEAU`.

### Étape 7 — QR dynamique + tracking + alerte (M1 + M2) ✅

**Livrables :** `go/index.php` (lit `redirects` en clé anon · log `scan_events` avec IP hachée · alerte Resend admin · 302 redirect) · `secrets.php` à placer **hors web root** (`/home/USER/private/secrets.php`, chargé via `require __DIR__.'/../../private/secrets.php'`) · QR code pointant sur `https://yesin.media/go`.
**Test :** visiter `/go` → atterrissage sur la sphère + ligne dans `scan_events` + email d'alerte reçu.

### Étape 8 — Durcissement & déploiement final ✅

**Livrables :** CORS verrouillé (origine `yesin.media`, déjà en place dans `cors.ts`) · vérif RLS complète · rate limiting sur **toutes** les Edge Functions (ajout sur `/sync`) · `/sync` & `/confirm` ne renvoient aucune donnée géo sensible · **fix `otp_expired`** (code OTP + `/confirm` + reprise via lien email/localStorage) · test end-to-end mobile.
**Test :** parcours complet du scan QR jusqu'à la confirmation du compte par code OTP, sur mobile réel.

---

## 7. Comment lancer chaque étape

Pour démarrer une étape dans une nouvelle session sans tout réexpliquer, colle ce gabarit (en y joignant ce fichier + le `chance.html` à jour) :

> « On reprend le projet YESIN Sphere (specs en pièce jointe). On attaque **l'Étape N — [titre]**. Voici l'état actuel : [ce qui est déjà fait / fichiers existants]. Code-moi les livrables de cette étape uniquement. »

Garde toujours à jour, entre les sessions : le `chance.html`, les fichiers déjà créés, et les clés/IDs obtenus (URL Supabase, etc. — sans jamais coller de clé secrète dans le chat).
