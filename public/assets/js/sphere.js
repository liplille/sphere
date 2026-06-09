import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const placeholders = [
  "Ex : Voyager au bout du monde…",
  "Ex : Acheter le dernier iPhone…",
  "Ex : Trouver un appartement…",
  "Ex : Lancer mon activité en freelance…",
];
let pi = 0;
setInterval(() => {
  pi = (pi + 1) % placeholders.length;
  document.getElementById("dream-input").placeholder = placeholders[pi];
}, 2500);

/* ============================================================
         1. CONFIGURATION & DÉTECTION DE L'APPAREIL
         ============================================================ */
const isMobile = window.innerWidth <= 768;
const pixelRatio = Math.min(window.devicePixelRatio, 2);

/* ============================================================
         2. ÉTAT DE L'APPLICATION (machine à états)
         ============================================================ */
let appStep = 0;
let isUiBlocking = false;

/* ============================================================
         3. RÉFÉRENCES DU DOM
         ============================================================ */
// Intro
const introUi = document.getElementById("intro-ui");

// Modal « Rêve »
const modalDream = document.getElementById("modal-dream");
const dreamFormView = document.getElementById("dream-form-view");
const dreamResponseView = document.getElementById("dream-response-view");
const dreamInput = document.getElementById("dream-input");
const iaResponse = document.getElementById("ia-response");

// Toast + Modal « Email »
const toastExploration = document.getElementById("toast-exploration");
const modalEmail = document.getElementById("modal-email");
const emailFormView = document.getElementById("email-form-view");
const emailSuccessView = document.getElementById("email-success-view");
const emailInput = document.getElementById("email-input");

// HUD — toute la logique d'affichage (reals, complexité, clarté,
// filaments, ancrage, réseau) vit dans hud.js (window.HUD).
// Ici on ne garde que le compteur d'explorations, piloté par la machine à états.
const exploreCount = document.getElementById("explore-count");
/* ============================================================
  3.5. SYNCHRONISATION SERVEUR (Cross-device & Refresh)
============================================================ */
async function bootSync() {
  const hash = window.location.hash;
  let jwt = null;

  // Si on vient de cliquer sur le lien de l'email
  if (hash.includes("access_token=")) {
    const params = new URLSearchParams(hash.substring(1));
    jwt = params.get("access_token");
    window.history.replaceState(null, null, window.location.pathname); // Nettoie l'URL
  }

  // On interroge le serveur
  const data = await window.API.syncData(jwt);

  if (data && data.ok) {
    // 1. On adopte le token de l'appareil d'origine
    window.API.setToken(data.token);

    // 2. Restaure l'affichage (REALS, Filaments, Ancrage, Indicateurs)
    HUD.setReals(data.reals);
    HUD.setFilaments(data.filaments);
    if (data.anchored) HUD.setAnchored();
    if (data.complexity && data.clarity) {
      HUD.setIndicators(data.complexity, data.clarity);
    }

    // 3. Rétablit l'état Connecté si l'utilisateur a déjà donné son email
    if (data.registered) {
      appStep = 4; // L'UI bloque la demande d'email
      introUi.style.opacity = "0";
      exploreCount.innerText = "0"; // <-- CORRECTION : Cache les 3 explorations
      setTimeout(() => HUD.setOnline(), 200);

      // Petit toast de bienvenue si on arrive PILE via un lien email valide
      if (jwt) {
        setTimeout(() => {
          toastExploration.innerHTML =
            "<strong style='color:#00f3ff'>Alliance confirmée.</strong><br>Ta sphère a synchronisé tes données.";
          toastExploration.classList.add("active");
          setTimeout(() => toastExploration.classList.remove("active"), 4000);
        }, 1000);
      }
    }
  }
}

// Lancement immédiat au chargement, puis reprise éventuelle d'une
// confirmation OTP en attente (si l'utilisateur avait fermé la page).
bootSync().then(resumePendingConfirmation);
/* ============================================================
         4. MOTEUR 3D (scène, caméra, rendu, contrôles)
         ============================================================ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  50,
  innerWidth / innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({
  antialias: !isMobile,
  alpha: true,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(pixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.enablePan = false;
camera.position.z = isMobile ? 11 : 10.5;

/* ============================================================
         5. TEXTURES PROCÉDURALES
         ============================================================ */
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,220,130,0.9)");
  grad.addColorStop(0.5, "rgba(255,170,60,0.35)");
  grad.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

function makeSoftTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,210,120,0.5)");
  grad.addColorStop(0.35, "rgba(255,180,80,0.22)");
  grad.addColorStop(0.7, "rgba(255,160,60,0.06)");
  grad.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const softTex = makeSoftTexture();

function makeRingTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, "rgba(180,225,255,0)");
  grad.addColorStop(0.45, "rgba(180,225,255,0)");
  grad.addColorStop(0.52, "rgba(200,235,255,0.25)");
  grad.addColorStop(0.58, "rgba(180,225,255,0)");
  grad.addColorStop(0.72, "rgba(180,225,255,0)");
  grad.addColorStop(0.78, "rgba(200,235,255,0.95)");
  grad.addColorStop(0.84, "rgba(180,225,255,0)");
  grad.addColorStop(1.0, "rgba(180,225,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const ringTex = makeRingTexture();

/* ============================================================
         6. SPHÈRE (nuage de points)
         ============================================================ */
const SPHERE_R = 4;
const shellSegments = isMobile ? 40 : 80;
const shellGeometry = new THREE.SphereGeometry(
  SPHERE_R,
  shellSegments,
  shellSegments,
);
const vertexCount = shellGeometry.attributes.position.count;
const shellColors = new Float32Array(vertexCount * 3);
const baseColor = new THREE.Color(0xfff0d0);
for (let i = 0; i < vertexCount; i++) {
  shellColors[i * 3] = baseColor.r;
  shellColors[i * 3 + 1] = baseColor.g;
  shellColors[i * 3 + 2] = baseColor.b;
}
shellGeometry.setAttribute("color", new THREE.BufferAttribute(shellColors, 3));
const shellMaterial = new THREE.PointsMaterial({
  size: 0.02,
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
});
const outerShell = new THREE.Points(shellGeometry, shellMaterial);
scene.add(outerShell);
outerShell.rotation.z = 0.4;

const hitColliderGeo = new THREE.SphereGeometry(SPHERE_R, 16, 16);
const hitColliderMat = new THREE.MeshBasicMaterial({ visible: false });
const hitCollider = new THREE.Mesh(hitColliderGeo, hitColliderMat);
outerShell.add(hitCollider);

/* ============================================================
         7. PÔLES
         ============================================================ */
const POLE = 4;
const north = new THREE.Object3D();
north.position.y = POLE;
const south = new THREE.Object3D();
south.position.y = -POLE;
outerShell.add(north, south);
const poleSprites = [];
[north, south].forEach((p) => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softTex,
      color: 0xffcc55,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.set(1.8, 1.8, 1);
  p.add(s);
  poleSprites.push(s);
});

/* ============================================================
         8. FILAMENTS
         ============================================================ */
const filamentGroup = new THREE.Group();
outerShell.add(filamentGroup);
const NB_FILAMENTS = isMobile ? 5 : 7;
const FIL_SEGMENTS = isMobile ? 60 : 90;
const filaments = [];
function makeFilamentCurve(seed) {
  const points = [],
    segments = isMobile ? 40 : 60;
  const phase = seed * Math.PI * 2,
    twist = 1.5 + Math.random() * 2.5,
    radiusMax = 1.0 + Math.random() * 1.4,
    dir = Math.random() > 0.5 ? 1 : -1;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      y = POLE - t * POLE * 2,
      bulge = Math.sin(t * Math.PI) * radiusMax,
      angle = phase + dir * t * Math.PI * twist;
    points.push(
      new THREE.Vector3(Math.cos(angle) * bulge, y, Math.sin(angle) * bulge),
    );
  }
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = 100;
  curve.getLengths();
  return curve;
}
for (let f = 0; f < NB_FILAMENTS; f++) {
  const curve = makeFilamentCurve((f + 0.5) / NB_FILAMENTS);
  const pts = curve.getPoints(FIL_SEGMENTS);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const col = new THREE.Color().setHSL(0.1 + Math.random() * 0.04, 1.0, 0.55);
  const mat = new THREE.LineBasicMaterial({
    color: col.clone(),
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  filamentGroup.add(line);
  const aliveIdle = f < 2;
  filaments.push({
    line,
    baseCurve: curve,
    baseColor: col.clone(),
    flickerPhase: Math.random() * 10,
    aliveIdle,
    wake: 0,
    wakeAge: -1,
  });
}

/* ============================================================
         9. ÉTINCELLES
         ============================================================ */
const NB_SPARKS = isMobile ? 26 : 46;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(NB_SPARKS * 3);
const sparkAlpha = new Float32Array(NB_SPARKS);
const sparkSize = new Float32Array(NB_SPARKS);
const sparkData = [];
function seedSpark(i, stagger) {
  const fi = Math.floor(Math.random() * filaments.length);
  sparkData[i] = {
    fi,
    t: 0,
    speed: 0.004 + Math.random() * 0.006,
    delay: stagger ? Math.random() * 4 : 0,
    alive: false,
  };
}
for (let i = 0; i < NB_SPARKS; i++) {
  seedSpark(i, true);
  sparkPos[i * 3] = 0;
  sparkPos[i * 3 + 1] = POLE;
  sparkPos[i * 3 + 2] = 0;
  sparkAlpha[i] = 0;
  sparkSize[i] = 0;
}
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute("aAlpha", new THREE.BufferAttribute(sparkAlpha, 1));
sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(sparkSize, 1));

const sparkMat = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: glowTex },
    uColor: { value: new THREE.Color(0xffd866) },
    uPixel: { value: pixelRatio },
  },
  vertexShader: `
          attribute float aAlpha; attribute float aSize; varying float vAlpha; uniform float uPixel;
          void main(){
            vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixel * 300.0 / max(0.001, -mv.z); gl_Position = projectionMatrix * mv;
          }
        `,
  fragmentShader: `
          uniform sampler2D uMap; uniform vec3 uColor; varying float vAlpha;
          void main(){
            vec4 tex = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, 1.0) * tex * vAlpha;
          }
        `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
filamentGroup.add(sparks);
const _sparkP = new THREE.Vector3();
let idleSpawnTimer = 1.0;

/* ============================================================
         10. MOT « futur. »
         ============================================================ */
function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 512;
  canvas.height = 256;
  ctx.font = "700 110px Inter, Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,200,80,0.7)";
  ctx.shadowBlur = 25;
  ctx.fillText(text, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(4, 2, 1);
  return sprite;
}
const futurSprite = makeTextSprite("futur.");
futurSprite.position.set(0.55, -0.35, 1.0);
futurSprite.scale.set(0.7, 0.35, 1);
outerShell.add(futurSprite);

/* ============================================================
         11. RÉSEAU NEURONAL (ARCS)
         ============================================================ */
const neuralGroup = new THREE.Group();
outerShell.add(neuralGroup);
const NEURAL_MAX = isMobile ? 12 : 22;
const ARC_SEGMENTS = isMobile ? 25 : 40;
const arcPool = [];
for (let i = 0; i < NEURAL_MAX; i++) {
  const positions = new Float32Array(ARC_SEGMENTS * 3);
  const colors = new Float32Array(ARC_SEGMENTS * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const m = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(g, m);
  line.visible = false;
  neuralGroup.add(line);
  arcPool.push({
    line,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    age: 0,
    life: 0,
    active: false,
    node: null,
  });
}
const nodeMat = new THREE.SpriteMaterial({
  map: glowTex,
  color: 0x9fdcff,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function spawnArc(fromLocal) {
  const slot = arcPool.find((a) => !a.active);
  if (!slot) return;
  slot.start.copy(fromLocal).normalize().multiplyScalar(SPHERE_R);
  const randDir = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  const endDir = slot.start
    .clone()
    .normalize()
    .lerp(randDir, 0.45 + Math.random() * 0.4)
    .normalize();
  slot.end.copy(endDir.multiplyScalar(SPHERE_R));
  slot.age = 0;
  slot.life = 0.6 + Math.random() * 0.7;
  slot.active = true;
  slot.line.visible = true;
  if (!slot.node) {
    slot.node = new THREE.Sprite(nodeMat.clone());
    slot.node.scale.set(0.001, 0.001, 1);
    neuralGroup.add(slot.node);
  }
  slot.node.visible = true;
}

const _p = new THREE.Vector3();
function slerpOnSphere(a, b, t, out) {
  const dot = Math.min(1, Math.max(-1, a.dot(b) / (SPHERE_R * SPHERE_R)));
  const omega = Math.acos(dot);
  if (omega < 1e-4) {
    out.copy(a);
    return;
  }
  const so = Math.sin(omega);
  const s1 = Math.sin((1 - t) * omega) / so,
    s2 = Math.sin(t * omega) / so;
  out.set(a.x * s1 + b.x * s2, a.y * s1 + b.y * s2, a.z * s1 + b.z * s2);
  out.normalize().multiplyScalar(SPHERE_R);
}

const neonColor = new THREE.Color(0xaee4ff);
const dimColor = new THREE.Color(0x1a3a55);
function updateArcs(dt) {
  for (const a of arcPool) {
    if (!a.active) continue;
    a.age += dt;
    const prog = a.age / a.life;
    if (prog >= 1.3) {
      a.active = false;
      a.line.visible = false;
      if (a.node) a.node.visible = false;
      continue;
    }
    const pos = a.line.geometry.attributes.position.array;
    const col = a.line.geometry.attributes.color.array;
    for (let s = 0; s < ARC_SEGMENTS; s++) {
      const t = s / (ARC_SEGMENTS - 1);
      slerpOnSphere(a.start, a.end, t, _p);
      pos[s * 3] = _p.x;
      pos[s * 3 + 1] = _p.y;
      pos[s * 3 + 2] = _p.z;
      const d = Math.abs(t - prog);
      const lit = Math.exp(-d * d * 60);
      col[s * 3] = dimColor.r + (neonColor.r - dimColor.r) * lit;
      col[s * 3 + 1] = dimColor.g + (neonColor.g - dimColor.g) * lit;
      col[s * 3 + 2] = dimColor.b + (neonColor.b - dimColor.b) * lit;
    }
    a.line.geometry.attributes.position.needsUpdate = true;
    a.line.geometry.attributes.color.needsUpdate = true;
    a.line.material.opacity = Math.min(1, prog < 1 ? 1 : (1.3 - prog) / 0.3);
    if (a.node) {
      slerpOnSphere(a.start, a.end, Math.min(1, prog), _p);
      a.node.position.copy(_p);
      const sc = 0.15 * Math.exp(-Math.pow(prog - 0.5, 2) * 4);
      a.node.scale.set(sc, sc, 1);
    }
  }
}

/* ============================================================
         12. RAYCAST & CURSEUR
         ============================================================ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
const hitLocal = new THREE.Vector3();
let hasHit = false;

const cursorGlow = document.createElement("div");
cursorGlow.style.cssText = `position:absolute; width:90px; height:90px; pointer-events:none; z-index:5;
        transform:translate(-50%,-50%); border-radius:50%; opacity:0; transition:opacity .25s;
        background:radial-gradient(circle, rgba(150,210,255,0.4) 0%, rgba(120,180,255,0.12) 40%, transparent 70%);`;
if (!isMobile) document.body.appendChild(cursorGlow);

function updatePointer(e) {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  if (!isMobile) {
    cursorGlow.style.left = e.clientX + "px";
    cursorGlow.style.top = e.clientY + "px";
  }
  pointerInside = true;
}
renderer.domElement.addEventListener("pointermove", updatePointer);
renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
});

const tmpInverse = new THREE.Matrix4();
function raycastSphere() {
  if (!pointerInside) return false;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(hitCollider, false);
  if (hit.length > 0) {
    tmpInverse.copy(outerShell.matrixWorld).invert();
    hitLocal.copy(hit[0].point).applyMatrix4(tmpInverse);
    return true;
  }
  return false;
}

// Suivi du « press » pour distinguer un clic franc d'un glissement.
let downX = 0,
  downY = 0,
  downT = 0;
renderer.domElement.addEventListener("pointerdown", (e) => {
  ensureAudio();
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});

/* ============================================================
         13. INTERACTION & MACHINE À ÉTATS
         ============================================================ */
renderer.domElement.addEventListener("pointerup", (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  const dur = performance.now() - downT;

  if (moved < 6 && dur < 400) {
    updatePointer(e);
    outerShell.updateMatrixWorld();

    if (raycastSphere() && !isUiBlocking) {
      ensureAudio();
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) spawnArc(hitLocal);
      playClick();
      playZap();
      addMark(hitLocal);
      wakeCore(hitLocal);
      triggerNextStep();
    }
  }
});

function triggerNextStep() {
  if (appStep === 0) {
    introUi.style.opacity = "0";
    isUiBlocking = true;
    setTimeout(() => {
      modalDream.classList.add("active");
      exploreCount.innerText = "2";
      appStep = 1;
    }, 1200);
  } else if (appStep === 2) {
    isUiBlocking = true;

    // On persiste l'exploration silencieusement en base de données
    API.addReals(10).catch(console.error);

    // +10 REALS pour l'exploration (Q2) — géré par le HUD (socle + animation).
    HUD.addReals(10);

    // 4. Mise à jour du Toast pour valoriser la découverte
    toastExploration.innerHTML =
      "Extraction de potentiel réussie.<br><strong style='color:#00f3ff'>+10 REALS découverts dans la sphère.</strong>";

    setTimeout(() => {
      toastExploration.classList.add("active");
      exploreCount.innerText = "1";

      // Déclenche l'éveil visuel intense de la sphère pour marquer le coup
      playWake();

      setTimeout(() => {
        toastExploration.classList.remove("active");
        isUiBlocking = false;
      }, 4000);
      appStep = 3;
    }, 400); // Petit délai pour laisser l'animation du HUD respirer avant le toast
  } else if (appStep === 3) {
    isUiBlocking = true;
    setTimeout(() => {
      exploreCount.innerText = "0";
      modalEmail.classList.add("active");
    }, 1200);
  }
}

/* ============================================================
         14. ACTIONS DES FORMULAIRES
         ============================================================ */
document
  .getElementById("btn-submit-dream")
  .addEventListener("click", async () => {
    const val = dreamInput.value.trim();
    if (!val) return;

    hideCoherenceError();
    dreamFormView.style.display = "none";
    dreamResponseView.style.display = "block";
    iaResponse.innerHTML =
      '<div class="loader"><div></div><div></div><div></div></div>';

    // Appel mock en Étape 2 ; remplacé par un vrai fetch à l'Étape 3.
    const res = await API.submitIntention(val);

    // Erreur serveur/réseau : retour au formulaire avec un message dédié,
    // sans vider le texte (l'utilisateur peut réessayer tel quel).
    if (res.error) {
      dreamResponseView.style.display = "none";
      dreamFormView.style.display = "block";
      showSphereError();
      return;
    }

    // Réponse incohérente : on invalide et on revient au formulaire,
    // sans consommer d'exploration ni créer de filament.
    if (!res.coherent) {
      dreamResponseView.style.display = "none";
      dreamFormView.style.display = "block";
      showCoherenceError();
      return;
    }

    // Réponse cohérente : texte IA + indicateurs + reals + filament.
    iaResponse.innerHTML = res.response;
    HUD.setIndicators(res.complexity, res.clarity);
    HUD.setReals(res.reals);
    HUD.incFilaments();
    if (filaments.length > 0) {
      filaments[0].baseColor.setHex(0x00f3ff);
      filaments[0].aliveIdle = true;
    }
  });

document.getElementById("btn-close-dream").addEventListener("click", () => {
  modalDream.classList.remove("active");
  isUiBlocking = false;
  appStep = 2;
});

document
  .getElementById("btn-submit-email")
  .addEventListener("click", async () => {
    const emailVal = emailInput.value.trim();
    if (!emailVal) return;

    // Affiche un loader pendant que le serveur travaille
    emailFormView.style.display = "none";
    emailSuccessView.style.display = "block";
    emailSuccessView.innerHTML =
      '<h2 style="margin-bottom: 0">Création de l\'alliance...</h2><div class="loader" style="margin-top:20px"><div></div><div></div><div></div></div>';

    HUD.setState("PERSONNALISATION...", "#ffcc55"); // S'allume en Or

    // 🚨 L'APPEL AU SERVEUR EST ICI 🚨 (envoi du code OTP par email)
    const res = await window.API.registerAccount(emailVal);

    if (res && res.ok) {
      // Le code est parti : on persiste l'email (reprise si la page est fermée)
      // et on bascule sur la saisie du code OTP.
      localStorage.setItem("sphere_pending_email", emailVal);
      showCodeEntry(emailVal);
    } else {
      // ÉCHEC DU SERVEUR
      emailSuccessView.innerHTML =
        '<h2 style="margin-bottom: 0; color:#ff4444">La sphère est troublée. Réessaie.</h2>';

      setTimeout(() => {
        emailSuccessView.style.display = "none";
        emailFormView.style.display = "block";
        HUD.setState("ÉCOUTE ACTIVE");
      }, 3000);
    }
  });

// --- Étape 8 : saisie + vérification du code OTP -------------------------
let pendingEmail = "";
const emailCodeView = document.getElementById("email-code-view");
const codeInput = document.getElementById("code-input");
const codeError = document.getElementById("code-error");

// Ouvre la modal directement sur la vue « saisie du code » (depuis le submit
// email OU au rechargement de page si une confirmation est en attente).
function showCodeEntry(email) {
  pendingEmail = email;
  modalEmail.classList.add("active");
  isUiBlocking = true;
  appStep = 3;
  emailFormView.style.display = "none";
  emailSuccessView.style.display = "none";
  emailCodeView.style.display = "block";
  if (codeError) codeError.textContent = "";
  HUD.setState("EN ATTENTE DU CODE...", "#ffcc55");
  setTimeout(() => {
    if (codeInput) codeInput.focus();
  }, 100);
}

document
  .getElementById("btn-submit-code")
  .addEventListener("click", async () => {
    const code = (codeInput.value || "").replace(/\D/g, "");
    if (code.length < 6 || code.length > 8) {
      codeError.textContent = "Le code comporte 6 à 8 chiffres.";
      return;
    }
    codeError.textContent = "";
    HUD.setState("VÉRIFICATION...", "#ffcc55");

    const res = await window.API.confirmCode(pendingEmail, code);

    if (res && res.ok) {
      // Alliance scellée : on nettoie l'état d'attente, on synchronise, on passe CONNECTÉ.
      localStorage.removeItem("sphere_pending_email");
      window.API.setToken(res.token);
      HUD.setReals(res.reals);
      HUD.setFilaments(res.filaments);
      if (res.anchored) HUD.setAnchored();
      if (res.complexity && res.clarity)
        HUD.setIndicators(res.complexity, res.clarity);

      emailCodeView.style.display = "none";
      emailSuccessView.style.display = "block";
      emailSuccessView.innerHTML =
        '<h2 style="margin-bottom: 0; color:#00f3ff">Alliance confirmée. Ta sphère est connectée.</h2>';

      setTimeout(() => {
        modalEmail.classList.remove("active");
        isUiBlocking = false;
        appStep = 4;
        HUD.setOnline();
      }, 2500);
      setTimeout(() => HUD.setStateColor(""), 10000);
    } else {
      // Code refusé : on laisse l'utilisateur réessayer.
      console.warn("[confirm] réponse:", res); // diagnostic (à retirer une fois OK)
      codeError.textContent =
        res && res.error === "rate_limited"
          ? "Trop de tentatives. Patiente quelques minutes."
          : "Code invalide ou expiré. Réessaie.";
      HUD.setState("EN ATTENTE DU CODE...", "#ffcc55");
    }
  });

// Reprise d'une confirmation en attente au chargement de la page :
//  - lien email « Revenir à ma sphère » → ?confirm=<email> (cross-device)
//  - sinon, email mémorisé en localStorage (même appareil, onglet fermé)
// On n'affiche le champ code QUE si l'utilisateur n'est pas déjà connecté.
function resumePendingConfirmation() {
  if (appStep === 4) return; // déjà connecté (bootSync l'a établi)

  const params = new URLSearchParams(window.location.search);
  const fromLink = params.get("confirm");
  const stored = localStorage.getItem("sphere_pending_email");
  const email = (fromLink && fromLink.includes("@") ? fromLink : null) || stored;

  if (!email) return;

  localStorage.setItem("sphere_pending_email", email);
  if (fromLink) {
    // Nettoie l'URL (évite de laisser l'email dans l'historique / au partage)
    window.history.replaceState(null, null, window.location.pathname);
  }
  setTimeout(() => showCodeEntry(email), 600);
}

/* ============================================================
         14b. AIDES FORMULAIRE (cohérence / erreur)
         ============================================================ */
const MSG_INCOHERENT =
  "La sphère n'a pas capté d'intention réelle… Parle-nous de ce que tu veux vraiment créer.";
const MSG_ERROR = "La sphère est troublée. Réessaie dans un instant.";

function showFormMessage(msg, clearInput) {
  const err = document.getElementById("coherence-error");
  if (err) {
    err.textContent = msg;
    err.style.display = "block";
  }
  if (clearInput) dreamInput.value = "";
  dreamInput.focus();
}
function showCoherenceError() {
  showFormMessage(MSG_INCOHERENT, true); // incohérent : on vide le champ
}
function showSphereError() {
  showFormMessage(MSG_ERROR, false); // erreur serveur : on garde le texte
}
function hideCoherenceError() {
  const err = document.getElementById("coherence-error");
  if (err) err.style.display = "none";
}
dreamInput.addEventListener("input", hideCoherenceError);

/* ============================================================
         15. RIDES D'IMPACT
         ============================================================ */
const rippleGroup = new THREE.Group();
outerShell.add(rippleGroup);
const MAX_RIPPLES = isMobile ? 6 : 12;
const ripples = [];
const rippleGeometry = new THREE.PlaneGeometry(1, 1);

function addMark(localPt) {
  const pos = localPt
    .clone()
    .normalize()
    .multiplyScalar(SPHERE_R * 1.002);
  let slot = ripples.find((r) => !r.active);

  if (!slot) {
    const mat = new THREE.MeshBasicMaterial({
      map: ringTex,
      color: 0xbfe6ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(rippleGeometry, mat);
    rippleGroup.add(mesh);
    slot = { sprite: mesh, active: false, age: 0 };
    ripples.push(slot);
  }

  slot.sprite.position.copy(pos);
  const targetLook = pos.clone().normalize().add(pos);
  slot.sprite.lookAt(targetLook);
  slot.sprite.material.opacity = 0;
  slot.age = 0;
  slot.active = true;
}

function updateRipples(dt) {
  const DUR = 1.0;
  for (const r of ripples) {
    if (!r.active) continue;
    r.age += dt;
    const p = r.age / DUR;
    if (p >= 1) {
      r.active = false;
      r.sprite.material.opacity = 0;
      r.sprite.scale.set(0.001, 0.001, 1);
      continue;
    }
    const ease = 1 - Math.pow(1 - p, 3);
    const size = 0.15 + ease * 0.7;
    r.sprite.scale.set(size, size, 1);
    r.sprite.material.opacity = 0.8 * (1 - p);
  }
}

/* ============================================================
         16. ÉVEIL DU CŒUR
         ============================================================ */
const _tmp = new THREE.Vector3();
function wakeCore(localPt) {
  let best = -1,
    bestD = Infinity;
  const samples = 16;
  for (let f = 0; f < filaments.length; f++) {
    const c = filaments[f].baseCurve;
    for (let s = 0; s <= samples; s++) {
      c.getPoint(s / samples, _tmp);
      const d = _tmp.distanceToSquared(localPt);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
  }
  if (best >= 0) {
    filaments[best].wakeAge = 0;
    if (Math.random() < 0.4) playWake();
    let launched = 0;
    for (let i = 0; i < NB_SPARKS && launched < 14; i++) {
      if (!sparkData[i].alive) {
        sparkData[i].fi = best;
        sparkData[i].t = 0;
        sparkData[i].delay = launched * 0.04;
        sparkData[i].alive = true;
        sparkData[i].speed = 0.006 + Math.random() * 0.006;
        launched++;
      }
    }
  }
}

/* ============================================================
         17. AUDIO
         ============================================================ */
const Audio = { ctx: null, ready: false, master: null };
function ensureAudio() {
  if (Audio.ready) {
    if (Audio.ctx.state === "suspended") Audio.ctx.resume();
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  Audio.ctx = ctx;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp);
  comp.connect(ctx.destination);
  Audio.master = master;
  Audio.ready = true;
}
function playClick(vol = 0.1) {
  if (!Audio.ready) return;
  const ctx = Audio.ctx,
    t = ctx.currentTime;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(3200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.03);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  osc.connect(gain);
  gain.connect(Audio.master);
  osc.start(t);
  osc.stop(t + 0.04);
}
function playZap(vol = 0.015) {
  if (!Audio.ready) return;
  const ctx = Audio.ctx,
    t = ctx.currentTime;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(150 + Math.random() * 100, t);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2500 + Math.random() * 1000, t);
  filter.Q.value = 5;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(Audio.master);
  osc.start(t);
  osc.stop(t + 0.2);
}
function playWake() {
  if (!Audio.ready) return;
  const ctx = Audio.ctx,
    t = ctx.currentTime;
  const baseFreq = 110 + Math.random() * 15;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
  const oscBase = ctx.createOscillator();
  oscBase.type = "sine";
  oscBase.frequency.setValueAtTime(baseFreq, t);
  const oscGlass = ctx.createOscillator();
  oscGlass.type = "triangle";
  oscGlass.frequency.setValueAtTime(baseFreq * 3.02, t);
  const glassGain = ctx.createGain();
  glassGain.value = 0.15;
  oscGlass.connect(glassGain);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.linearRampToValueAtTime(2200, t + 0.6);
  lp.frequency.exponentialRampToValueAtTime(300, t + 3.5);
  oscBase.connect(lp);
  glassGain.connect(lp);
  lp.connect(g);
  g.connect(Audio.master);
  oscBase.start(t);
  oscBase.stop(t + 3.6);
  oscGlass.start(t);
  oscGlass.stop(t + 3.6);
}

/* ============================================================
         18. RESPIRATION
         ============================================================ */
const glowEl = document.getElementById("glow");
function breath(time) {
  const slow = Math.sin(time * 0.45),
    sub = Math.sin(time * 0.17 + 1.3);
  return slow * 0.7 + sub * 0.3;
}
const pulse = {
  active: false,
  start: 0,
  duration: 2.2,
  next: 4 + Math.random() * 5,
  fired: false,
  spawned: false,
};
function maybeTriggerPulse(time) {
  if (!pulse.active && time > pulse.next) {
    pulse.active = true;
    pulse.start = time;
    pulse.fired = false;
    pulse.spawned = false;
    pulse.next = time + pulse.duration + 5 + Math.random() * 7;
  }
  if (pulse.active && time > pulse.start + pulse.duration) pulse.active = false;
}
function pulseFront(time) {
  return pulse.active ? (time - pulse.start) / pulse.duration : -1;
}

/* ============================================================
         19. HUD (Reals, Complexité, Clarté) — géré dans hud.js
         ============================================================ */

/* ============================================================
         20. BOUCLE D'ANIMATION
         ============================================================ */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  outerShell.rotation.y += 0.0005;

  const b = breath(time);
  outerShell.scale.setScalar(1 + b * 0.025);
  const glowIntensity = 0.5 + (b * 0.5 + 0.5) * 0.6;
  glowEl.style.opacity = glowIntensity.toFixed(3);
  glowEl.style.transform = `translate(-50%,-50%) scale(${(1 + b * 0.04).toFixed(3)})`;

  for (let pi = 0; pi < 2; pi++) {
    const baseBreath = 0.9 + (b * 0.5 + 0.5) * 0.3;
    poleSprites[pi].scale.setScalar(1.8 * baseBreath);
    poleSprites[pi].material.opacity = 0.1 + (b * 0.5 + 0.5) * 0.04;
  }

  outerShell.updateMatrixWorld();

  if (!isMobile) {
    hasHit = raycastSphere();
    cursorGlow.style.opacity = hasHit && !isUiBlocking ? "0.9" : "0";
    shellMaterial.opacity = 0.32 + (hasHit && !isUiBlocking ? 0.08 : 0);
  }

  updateRipples(dt);
  updateArcs(dt);
  maybeTriggerPulse(time);
  const front = pulseFront(time);

  const sp = sparkGeo.attributes.position.array;
  const sa = sparkGeo.attributes.aAlpha.array;
  const ss = sparkGeo.attributes.aSize.array;
  idleSpawnTimer -= dt;
  if (idleSpawnTimer <= 0) {
    idleSpawnTimer = 1.6 + Math.random() * 2.4;
    const idleFils = filaments
      .map((f, i) => (f.aliveIdle ? i : -1))
      .filter((i) => i >= 0);
    if (idleFils.length) {
      const fi = idleFils[Math.floor(Math.random() * idleFils.length)];
      for (let i = 0; i < NB_SPARKS; i++) {
        if (!sparkData[i].alive) {
          sparkData[i].alive = true;
          sparkData[i].t = 0;
          sparkData[i].delay = 0;
          sparkData[i].fi = fi;
          sparkData[i].speed = 0.003 + Math.random() * 0.003;
          break;
        }
      }
    }
  }
  if (pulse.active && !pulse.spawned) {
    for (let i = 0; i < NB_SPARKS && i < 8; i++) {
      if (!sparkData[i].alive) {
        sparkData[i].alive = true;
        sparkData[i].t = 0;
        sparkData[i].fi = Math.floor(Math.random() * filaments.length);
      }
    }
    pulse.spawned = true;
  }
  for (let i = 0; i < NB_SPARKS; i++) {
    const s = sparkData[i];
    if (!s.alive || s.delay > 0) {
      if (s.delay > 0) s.delay -= dt;
      ss[i] = 0;
      sa[i] = 0;
      continue;
    }
    s.t += s.speed;
    if (s.t >= 1) {
      s.alive = false;
      ss[i] = 0;
      sa[i] = 0;
      continue;
    }
    const p = filaments[s.fi].baseCurve.getPointAt(s.t, _sparkP);
    sp[i * 3] = p.x;
    sp[i * 3 + 1] = p.y;
    sp[i * 3 + 2] = p.z;
    const fade = Math.min(1, s.t / 0.12) * Math.min(1, (1 - s.t) / 0.12);
    sa[i] = fade;
    ss[i] = 0.13 * (0.4 + 0.6 * fade);
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.aAlpha.needsUpdate = true;
  sparkGeo.attributes.aSize.needsUpdate = true;

  filaments.forEach((f, idx) => {
    if (f.wakeAge >= 0) {
      f.wakeAge += dt;
      const a = f.wakeAge;
      let env;
      if (a < 0.18) env = 1;
      else {
        const d = a - 0.18;
        env =
          Math.exp(-d * 1.6) *
          (1 + 0.18 * Math.sin(d * 14) * Math.exp(-d * 2.5));
      }
      f.wake = Math.max(0, env);
      if (a > 3.2) {
        f.wakeAge = -1;
        f.wake = 0;
      }
    }
    let op = 0.05;
    if (f.aliveIdle)
      op += 0.1 * (0.5 + 0.5 * Math.sin(time * 0.6 + f.flickerPhase));
    op += f.wake * 0.85;
    if (front >= 0) {
      const localT = (idx / NB_FILAMENTS) % 1,
        dist = Math.abs(localT - front),
        wave = Math.max(0, 1 - dist * 6);
      op += wave * 0.35;
    }
    f.line.material.color
      .copy(f.baseColor)
      .lerp(new THREE.Color(0xfff2cc), Math.min(1, f.wake));
    f.line.material.opacity = Math.min(1, op);
  });
  if (front >= 0 && front < 0.12)
    glowEl.style.opacity = Math.min(1.2, glowIntensity + 0.3).toFixed(3);

  controls.update();
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Ancrage cliquable à tout moment (mock géoloc en Étape 2 ; sauvegarde DB à l'Étape 4).
// Au succès : effet visuel d'éveil sur la sphère.
HUD.initAncrage(() => playWake());

animate();
