<?php
// ============================================================
// go/index.php — QR dynamique : redirect 302 immédiat + log scan + alerte email
//
// Chemin secrets sur n0c :
//   /home/USER/public_html/go/index.php  (ce fichier)
//   /home/USER/private/secrets.php       (hors web root)
//
// Le require remonte de go/ → public_html/ → home/USER/ → private/
//
// Ordre volontaire : on répond 302 au téléphone DÈS que la destination est
// connue, puis on continue (connexion fermée) pour logger le scan et envoyer
// l'alerte. Celui qui scanne ne paie jamais la latence Supabase/Resend.
// ============================================================

$secrets = require __DIR__ . '/../../private/secrets.php';

$supabaseUrl  = $secrets['SUPABASE_URL'];
$anonKey      = $secrets['SUPABASE_ANON_KEY'];
$resendKey    = $secrets['RESEND_API_KEY'];
$resendFrom   = $secrets['RESEND_FROM'];
$adminEmail   = $secrets['ADMIN_ALERT_EMAIL'];

// o= : format court pour les QR ; slug= : fallback pour les anciens QR.
$slug = preg_replace('/[^a-z0-9_-]/i', '', $_GET['o'] ?? $_GET['slug'] ?? 'sphere');
if ($slug === '') $slug = 'sphere';

// ── 1. Lire la destination depuis redirects (seul appel avant le 302) ──
$destination = 'https://yesin.media/'; // fallback si slug inconnu ou Supabase muet

$ch = curl_init($supabaseUrl . '/rest/v1/redirects?slug=eq.' . urlencode($slug) . '&active=eq.true&select=destination&limit=1');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'apikey: ' . $anonKey,
        'Authorization: Bearer ' . $anonKey,
        'Accept: application/json',
    ],
    CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_TIMEOUT        => 3,
]);
$body = curl_exec($ch);
curl_close($ch);

if ($body) {
    $rows = json_decode($body, true);
    if (!empty($rows[0]['destination'])) {
        $destination = $rows[0]['destination'];
    }
}

// ── 2. Rediriger MAINTENANT et fermer la connexion client ──────
ignore_user_abort(true); // le script continue même si le téléphone est parti

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: ' . $destination, true, 302);

if (function_exists('litespeed_finish_request')) {
    litespeed_finish_request();   // n0c tourne sous LiteSpeed
} elseif (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();     // PHP-FPM
} else {
    // Fallback générique : on vide les buffers, le client a son 302.
    header('Content-Length: 0');
    header('Connection: close');
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    flush();
}

// ── 3. Métadonnées du scan ───────────────────────────────────
// REMOTE_ADDR fait foi : pas de proxy devant n0c, et X-Forwarded-For est
// forgeable par le client. Le header Cloudflare est gardé au cas où un CDN
// serait ajouté un jour (il n'existe que derrière Cloudflare).
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
$ip = trim(explode(',', $ip)[0]);

$ipHash    = $ip ? hash('sha256', $ip) : null;
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

// Tentative de géolocalisation par IP (GeoIP natif n0c si disponible, sinon null)
$country = null;
if (function_exists('geoip_country_code_by_name') && $ip) {
    $country = @geoip_country_code_by_name($ip) ?: null;
}

// ── 4. Insérer dans scan_events ──────────────────────────────
$scanPayload = json_encode([
    'slug'       => $slug,
    'ip_hash'    => $ipHash,
    'country'    => $country,
    'user_agent' => $userAgent ? mb_substr($userAgent, 0, 500) : null,
]);

$ch2 = curl_init($supabaseUrl . '/rest/v1/scan_events');
curl_setopt_array($ch2, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $scanPayload,
    CURLOPT_HTTPHEADER     => [
        'apikey: ' . $anonKey,
        'Authorization: Bearer ' . $anonKey,
        'Content-Type: application/json',
        'Prefer: return=minimal',
    ],
    CURLOPT_TIMEOUT => 5,
]);
curl_exec($ch2);
curl_close($ch2);

// ── 5. Alerte email admin via Resend ─────────────────────────
$now     = gmdate('Y-m-d H:i:s') . ' UTC';
$ua      = htmlspecialchars($userAgent ?? '—', ENT_QUOTES);
$ctry    = htmlspecialchars($country ?? '—', ENT_QUOTES);
$ipDisp  = htmlspecialchars($ip ? substr($ip, 0, 8) . '…' : '—', ENT_QUOTES); // tronquée

$emailHtml = "
<p><strong>QR scanné</strong> — slug : <code>{$slug}</code></p>
<table style='border-collapse:collapse;font-size:14px'>
  <tr><td style='padding:4px 12px 4px 0'><strong>Date</strong></td><td>{$now}</td></tr>
  <tr><td style='padding:4px 12px 4px 0'><strong>Pays</strong></td><td>{$ctry}</td></tr>
  <tr><td style='padding:4px 12px 4px 0'><strong>IP (tronquée)</strong></td><td>{$ipDisp}</td></tr>
  <tr><td style='padding:4px 12px 4px 0'><strong>User-Agent</strong></td><td style='max-width:400px;word-break:break-all'>{$ua}</td></tr>
  <tr><td style='padding:4px 12px 4px 0'><strong>Destination</strong></td><td>" . htmlspecialchars($destination, ENT_QUOTES) . "</td></tr>
</table>
";

$emailPayload = json_encode([
    'from'    => 'YESIN Sphere <' . $resendFrom . '>',
    'to'      => [$adminEmail],
    'subject' => '[YESIN] QR scanné — ' . $slug . ' (' . ($country ?? 'pays inconnu') . ')',
    'html'    => $emailHtml,
]);

$ch3 = curl_init('https://api.resend.com/emails');
curl_setopt_array($ch3, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $emailPayload,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $resendKey,
        'Content-Type: application/json',
    ],
    CURLOPT_TIMEOUT => 8,
]);
curl_exec($ch3);
curl_close($ch3);

exit;
