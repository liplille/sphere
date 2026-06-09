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

Trois cibles de déploiement distinctes : **n0c** (le site + le PHP), **Supabase** (les Edge Functions + la DB, déployées via le CLI Supabase, jamais sur n0c), et les **API externes** (Claude, Resend) appelées depuis les Edge Functions.

---

## 2. Structure des fichiers

```
yesin-sphere/
│
├── README.md
├── .gitignore
├── .env.example                  ← template des clés (commité, sans valeurs)
├── .env.local                    ← clés réelles EN LOCAL (GITIGNORÉ)
│
├── public/                       ← contenu uploadé dans public_html/ sur n0c
│   ├── index.html                ← la sphère (HTML allégé)
│   ├── confirm.html              ← page de confirmation après clic email
│   ├── go/
│   │   └── index.php             ← QR redirect + log scan + alerte
│   └── assets/
│       ├── css/
│       │   └── sphere.css        ← styles extraits du HTML
│       └── js/
│           ├── config.js         ← Supabase URL + anon key (PUBLIC — ok)
│           ├── sphere.js         ← moteur 3D Three.js
│           ├── hud.js            ← logique HUD (reals, filaments, ancrage)
│           └── api.js            ← appels fetch vers les Edge Functions
│
└── supabase/                     ← déployé via `supabase` CLI (PAS sur n0c)
    ├── config.toml
    ├── migrations/
    │   └── 0001_init.sql         ← tables + RLS + policies
    └── functions/
        ├── _shared/
        │   ├── cors.ts           ← headers CORS (origine yesin.media)
        │   ├── client.ts         ← client Supabase service_role
        │   └── prompt.ts         ← le prompt Claude
        ├── intention/index.ts    ← POST /functions/v1/intention
        ├── geo/index.ts          ← POST /functions/v1/geo
        ├── reals/index.ts        ← POST /functions/v1/reals
        └── register/index.ts     ← POST /functions/v1/register
```

### Côté n0c (rappel cPanel)

Le dossier des secrets PHP doit vivre **hors** de la racine web pour ne jamais être accessible par URL :

```
/home/TON_USER/
├── public_html/          ← = yesin.media (= le contenu de public/)
│   ├── index.html
│   ├── go/index.php
│   └── assets/...
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
| lat           | float8             | nullable — position précise           |
| lng           | float8             | nullable                              |
| city          | text               | nullable (pour l'admin)               |
| country       | text               | nullable                              |
| created_at    | timestamptz        |                                       |

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

Le compte utilisateur est géré par `auth.users` (Supabase Auth). Pas besoin de table `users` séparée pour la V1.

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

### Étape 6 — Compte + Email personnalisé (M6)

**Livrables :** Edge Function `/register` (signUp + `generateLink` + Resend custom) · template email (réponse IA + badges complexité/clarté + total REALS + CTA) · `confirm.html` · branchement du formulaire email · email Supabase auto désactivé.
**Test :** saisir un email → recevoir l'email personnalisé contenant sa réponse Q1 → cliquer le CTA → `confirm.html` OK ; HUD passe `CONNECTÉ AU RÉSEAU`.

### Étape 7 — QR dynamique + tracking + alerte (M1 + M2)

**Livrables :** `go/index.php` (log `scan_events` + alerte Resend + 302 redirect) · `secrets.php` branché · QR code généré pointant sur `yesin.media/go` · (option) page dashboard scans.
**Test :** visiter `/go` → atterrissage sur la sphère + ligne dans `scan_events` + email d'alerte reçu.

### Étape 8 — Durcissement & déploiement final

**Livrables :** CORS verrouillé (origine `yesin.media`) · vérif RLS complète · rate limiting basique sur les Edge Functions · upload final sur n0c · test end-to-end mobile.
**Test :** parcours complet du scan QR jusqu'à l'email reçu, sur mobile réel.

---

## 7. Comment lancer chaque étape

Pour démarrer une étape dans une nouvelle session sans tout réexpliquer, colle ce gabarit (en y joignant ce fichier + le `chance.html` à jour) :

> « On reprend le projet YESIN Sphere (specs en pièce jointe). On attaque **l'Étape N — [titre]**. Voici l'état actuel : [ce qui est déjà fait / fichiers existants]. Code-moi les livrables de cette étape uniquement. »

Garde toujours à jour, entre les sessions : le `chance.html`, les fichiers déjà créés, et les clés/IDs obtenus (URL Supabase, etc. — sans jamais coller de clé secrète dans le chat).
