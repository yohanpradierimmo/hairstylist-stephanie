// Stéphanie Analytics — Cloudflare Worker + D1, privacy-first site analytics.
const BASE = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: { ...BASE, ...extra, 'Content-Type': 'application/json; charset=utf-8' }
});
const clean = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const validSession = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const originAllowed = (request, env) => request.headers.get('Origin') === env.ALLOWED_ORIGIN;
const cors = env => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin'
});
const limiter = new Map();

function device(ua = '') {
  ua = ua.toLowerCase();
  return /ipad|tablet|android(?!.*mobile)/.test(ua) ? 'Tablette' : /mobi|iphone|android/.test(ua) ? 'Mobile' : 'Ordinateur';
}
function browser(ua = '') {
  ua = ua.toLowerCase();
  return /edg\//.test(ua) ? 'Edge' : /firefox\//.test(ua) ? 'Firefox' : /chrome\//.test(ua) ? 'Chrome' : /safari\//.test(ua) ? 'Safari' : 'Autre';
}
function operatingSystem(ua = '') {
  ua = ua.toLowerCase();
  return /windows/.test(ua) ? 'Windows' : /mac os|macintosh/.test(ua) ? 'macOS' : /android/.test(ua) ? 'Android' : /iphone|ipad|ios/.test(ua) ? 'iOS' : /linux/.test(ua) ? 'Linux' : 'Autre';
}
function secure(request) { return request.url.startsWith('https://') || new URL(request.url).hostname === 'localhost'; }
function unauthorized() { return new Response('Connexion requise', { status: 401, headers: { ...BASE, 'WWW-Authenticate': 'Basic realm="Stephanie Analytics"' } }); }
async function sameSecret(request, env) {
  const value = request.headers.get('Authorization') || '';
  if (!value.startsWith('Basic ') || !env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  let user = '', pass = '';
  try { const decoded = atob(value.slice(6)); const split = decoded.indexOf(':'); user = decoded.slice(0, split); pass = decoded.slice(split + 1); } catch (_) { return false; }
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [left, right] = await Promise.all([digest(user + '\n' + pass), digest(env.ADMIN_USER + '\n' + env.ADMIN_PASSWORD)]);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
function rateLimited(session) {
  const now = Date.now(); const old = limiter.get(session) || [];
  const recent = old.filter(time => now - time < 60000);
  recent.push(now); limiter.set(session, recent);
  return recent.length > 60;
}

async function collect(request, env) {
  if (!originAllowed(request, env)) return json({ error: 'Origin refusée' }, 403);
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json') && !type.includes('text/plain')) return json({ error: 'Format incorrect' }, 415, cors(env));
  if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({ error: 'Événement trop volumineux' }, 413, cors(env));
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'JSON invalide' }, 400, cors(env)); }
  const types = ['pageview', 'page_exit', 'contact_click'];
  if (!validSession(body.session) || !types.includes(body.type)) return json({ error: 'Événement invalide' }, 400, cors(env));
  if (rateLimited(body.session)) return json({ error: 'Trop de requêtes' }, 429, { ...cors(env), 'Retry-After': '60' });
  const page = clean(body.page, 180);
  if (!page.startsWith('/') || page.startsWith('//')) return json({ error: 'Page invalide' }, 400, cors(env));
  const duration = body.type === 'page_exit' ? Math.min(86400000, Math.max(0, Number(body.duration_ms) || 0)) : 0;
  const screen = typeof body.screen === 'string' && /^\d{2,5}x\d{2,5}$/.test(body.screen) ? body.screen : '';
  const ua = request.headers.get('User-Agent') || '';
  const row = [
    body.session, body.type, page, clean(body.referrer, 150), clean(body.source, 80), clean(body.medium, 80), clean(body.campaign, 100),
    device(ua), browser(ua), operatingSystem(ua), screen, clean(request.headers.get('Accept-Language'), 10),
    clean(request.cf?.country, 2), clean(request.cf?.region, 100), clean(request.cf?.city, 100),
    body.type === 'contact_click' && ['telephone', 'sms', 'whatsapp', 'email', 'instagram'].includes(body.contact) ? body.contact : null, duration
  ];
  await env.DB.prepare(`INSERT INTO events (session_id,event_type,page,referrer_host,source,medium,campaign,device,browser,os,screen,language,country,region,city,contact_type,duration_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...row).run();
  return json({ ok: true }, 202, cors(env));
}

async function stats(request, env) {
  const url = new URL(request.url); const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '7', 10) || 7));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const query = async (sql, params = []) => (await env.DB.prepare(sql).bind(...params).all()).results;
  const [totals, daily, pages, sources, devices, browsers, contacts, entries, exits, locations, realtime, recent, historical, importedTotals, importedDaily] = await Promise.all([
    query(`SELECT COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) sessions,
      SUM(event_type='pageview') pageviews, SUM(event_type='contact_click') contact_clicks,
      ROUND(AVG(NULLIF(duration_ms,0))/1000,1) avg_duration_seconds,
      COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) - COUNT(DISTINCT CASE WHEN event_type='page_exit' THEN session_id END) AS sessions_without_exit
      FROM events WHERE day>=?`, [since]),
    query(`SELECT day, COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) sessions,
      SUM(event_type='pageview') pageviews, SUM(event_type='contact_click') contact_clicks
      FROM events WHERE day>=? GROUP BY day ORDER BY day`, [since]),
    query(`SELECT page label, COUNT(*) value FROM events WHERE day>=? AND event_type='pageview' GROUP BY page ORDER BY value DESC LIMIT 50`, [since]),
    query(`SELECT COALESCE(NULLIF(source,''),NULLIF(referrer_host,''),'Accès direct / inconnu') label,
      COUNT(DISTINCT session_id) value FROM events WHERE day>=? AND event_type='pageview' GROUP BY label ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT device label, COUNT(DISTINCT session_id) value FROM events WHERE day>=? AND event_type='pageview' GROUP BY device ORDER BY value DESC`, [since]),
    query(`SELECT browser label, COUNT(DISTINCT session_id) value FROM events WHERE day>=? AND event_type='pageview' GROUP BY browser ORDER BY value DESC`, [since]),
    query(`SELECT COALESCE(contact_type,'inconnu') label, COUNT(*) value FROM events WHERE day>=? AND event_type='contact_click' GROUP BY contact_type ORDER BY value DESC`, [since]),
    query(`SELECT page label, COUNT(*) value FROM events e WHERE event_type='pageview' AND day>=? AND created_at=(SELECT MIN(created_at) FROM events x WHERE x.session_id=e.session_id AND x.event_type='pageview') GROUP BY page ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT page label, COUNT(*) value FROM events WHERE day>=? AND event_type='page_exit' GROUP BY page ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT COALESCE(NULLIF(city,''),'Inconnue') label, COUNT(DISTINCT session_id) value FROM events WHERE day>=? AND event_type='pageview' GROUP BY city ORDER BY value DESC LIMIT 50`, [since]),
    query(`SELECT page label, COUNT(DISTINCT session_id) value FROM events WHERE event_type='pageview' AND created_at>=datetime('now','-5 minutes') GROUP BY page ORDER BY value DESC`, []),
    query(`SELECT created_at, event_type, page, device, contact_type FROM events ORDER BY id DESC LIMIT 25`, []),
    query(`SELECT * FROM imported_reports ORDER BY report_date DESC LIMIT 30`, []),
    query(`SELECT COUNT(*) visits, COALESCE(SUM(actions),0) actions, COALESCE(SUM(pageviews),0) pageviews,
      ROUND(COALESCE(AVG(duration_seconds),0),1) avg_duration_seconds FROM imported_visits`, []),
    query(`SELECT substr(started_at,1,10) day, COUNT(*) visits, COALESCE(SUM(pageviews),0) pageviews,
      COALESCE(SUM(actions),0) actions FROM imported_visits GROUP BY substr(started_at,1,10) ORDER BY day`, [])
  ]);
  const bounce = totals[0]?.sessions ? Math.round((Number(totals[0].sessions_without_exit || 0) / Number(totals[0].sessions)) * 100) : 0;
  const live = totals[0] || {};
  const imported = importedTotals[0] || {};
  const combinedDaily = new Map();
  for (const row of [...daily.map(x => ({ ...x, visits: x.sessions })), ...importedDaily]) {
    const current = combinedDaily.get(row.day) || { day: row.day, visits: 0, sessions: 0, pageviews: 0, contact_clicks: 0, actions: 0 };
    current.visits += Number(row.visits || row.sessions || 0);
    current.sessions += Number(row.sessions || 0);
    current.pageviews += Number(row.pageviews || 0);
    current.contact_clicks += Number(row.contact_clicks || 0);
    current.actions += Number(row.actions || 0);
    combinedDaily.set(row.day, current);
  }
  const siteTotals = {
    sessions: Number(live.sessions || 0) + Number(imported.visits || 0),
    visits: Number(live.sessions || 0) + Number(imported.visits || 0),
    pageviews: Number(live.pageviews || 0) + Number(imported.pageviews || 0),
    actions: Number(imported.actions || 0) + Number(live.pageviews || 0) + Number(live.contact_clicks || 0),
    contact_clicks: Number(live.contact_clicks || 0),
    avg_duration_seconds: Number(imported.visits || 0) ? Math.round((Number(imported.avg_duration_seconds || 0) * Number(imported.visits || 0) + Number(live.avg_duration_seconds || 0) * Number(live.sessions || 0)) / (Number(imported.visits || 0) + Number(live.sessions || 0))) : Number(live.avg_duration_seconds || 0),
    bounce_rate: bounce
  };
  const siteDaily = Array.from({ length: days }, (_, index) => {
    const day = new Date(Date.now() - (days - 1 - index) * 86400000).toISOString().slice(0, 10);
    return combinedDaily.get(day) || { day, visits: 0, sessions: 0, pageviews: 0, contact_clicks: 0, actions: 0, empty: true };
  });
  return json({ days, since, totals: { ...(live || {}), bounce_rate: bounce }, siteTotals, daily, siteDaily, pages, sources, devices, browsers, contacts, entries, exits, locations, realtime, recent, historical });
}

async function visits(request, env) {
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare(`SELECT session_id, MIN(created_at) first_seen, MAX(created_at) last_seen,
    COUNT(CASE WHEN event_type='pageview' THEN 1 END) pageviews,
    ROUND(SUM(duration_ms)/1000.0,1) duration_seconds,
    COALESCE(MAX(city),'Inconnue') city, COALESCE(MAX(country),'') country,
    COALESCE(MAX(device),'Inconnu') device, COALESCE(MAX(browser),'Inconnu') browser,
    COALESCE(MAX(os),'Inconnu') os, COALESCE(MAX(screen),'') screen,
    COALESCE(NULLIF(MAX(source),''),NULLIF(MAX(referrer_host),''),'Accès direct') source
    FROM events WHERE day>=? GROUP BY session_id ORDER BY last_seen DESC LIMIT 100`).bind(since).all()).results;
  return json({ days, since, visits: rows });
}

async function visitDetail(request, env, session) {
  if (!validSession(session)) return json({ error: 'Visite invalide' }, 400);
  const rows = (await env.DB.prepare(`SELECT created_at,event_type,page,referrer_host,source,medium,campaign,device,browser,os,screen,language,country,region,city,contact_type,duration_ms
    FROM events WHERE session_id=? ORDER BY created_at`).bind(session).all()).results;
  if (!rows.length) return json({ error: 'Visite introuvable' }, 404);
  return json({ session_id: session, profile: rows[0], events: rows });
}

async function importedVisits(request, env) {
  const url = new URL(request.url);
  const month = clean(url.searchParams.get('month') || '', 7);
  const rows = (await env.DB.prepare(`SELECT visit_key,report_month,started_at,last_seen_at,duration_seconds,actions,pageviews,
    entry_page,exit_page,pages_json,country,region,city,device,browser,os,screen,referrer_type,referrer_name,source,medium,campaign
    FROM imported_visits ${/^\d{4}-\d{2}$/.test(month) ? 'WHERE report_month=?' : ''}
    ORDER BY started_at DESC LIMIT 500`).bind(...(/^\d{4}-\d{2}$/.test(month) ? [month] : [])).all()).results;
  return json({ month: month || null, visits: rows.map(row => ({ ...row, pages: JSON.parse(row.pages_json || '[]') })) });
}

const dashboard = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Stéphanie Analytics</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
:root{--rose:#9d637b;--blue:#b93c5f;--ink:#4c3740;--muted:#8a737c;--line:#eadce2;--bg:#faf6f7;--nav:#fff}*{box-sizing:border-box}body{font:15px system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);margin:0}.layout{display:flex;min-height:100vh}.sidebar{width:260px;background:var(--nav);border-right:1px solid var(--line);padding:22px 16px;position:sticky;top:0;height:100vh;overflow:auto}.brand{font-weight:700;font-size:18px;margin:0 8px 24px}.search{width:100%;padding:13px 14px;border:1px solid #d8cbd1;border-radius:14px;background:#fff;font-size:15px;margin-bottom:20px}.nav-title{font-weight:700;color:var(--blue);font-size:18px;margin:18px 8px 10px}.nav button,.nav-link{display:block;width:100%;border:0;background:transparent;color:#6a6165;text-align:left;padding:11px 12px;border-radius:12px;font-size:15px;cursor:pointer;text-decoration:none}.nav button:hover,.nav button.active,.nav-link:hover,.nav-link.active{background:#f0edef;color:var(--blue)}.nav button.sub,.nav-link.sub{padding-left:34px}.content{flex:1;min-width:0;padding:30px 26px}.content-inner{max-width:1200px;margin:0 auto}h1{font-size:30px;margin:4px 0}.muted{color:var(--muted)}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}.tile,section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 4px 18px #7047580c}.num{font-size:28px;color:var(--rose);margin-top:7px;font-weight:650}.site-tile{border:0;color:#2b2330;text-align:center;padding:14px 10px;border-radius:14px;box-shadow:0 4px 14px #7047581c}.site-tile .num{color:#2b2330;font-size:31px;margin:0}.site-tile .label{font-size:14px}.site-blue{background:#f7e6bf}.site-green{background:#f6bccd}.site-pink{background:#e4587c}.site-gold{background:#d4af37}.site-mauve{background:#b93c5f;color:#fffaf6}.chart-card{padding:18px 16px 12px}.chart-wrap{height:260px}.chart-wrap svg{width:100%;height:100%;overflow:visible}.chart-grid{stroke:#eadfe4;stroke-width:1}.chart-line{fill:none;stroke:#d4af37;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-dot{fill:#d4af37}.chart-legend{display:flex;gap:18px;flex-wrap:wrap;color:#6d6268;font-size:13px}.legend-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}.legend-pages{background:#d4af37}.legend-visits{background:#e4587c}.legend-actions{background:#b93c5f}.map-canvas{height:420px;border:1px solid #eadce2;border-radius:14px;overflow:hidden;background:#f7e6bf}.map-note{margin:10px 0 0;font-size:13px;color:#8a737c}.source-controls{display:flex;align-items:center;gap:10px;margin-bottom:14px}select,button{padding:9px;border-radius:8px;border:1px solid #ddc8d0;background:#fff;color:var(--ink)}button{cursor:pointer}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #f0e5e9;vertical-align:top}th{color:#7d6670}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.view{display:none}.view.active{display:block}.detail{margin-top:14px}.empty{padding:20px 0}@media(max-width:800px){.sidebar{width:220px}.content{padding:20px 14px}}@media(max-width:620px){.layout{display:block}.sidebar{width:auto;height:auto;position:relative;border-right:0;border-bottom:1px solid var(--line);padding:14px 12px}.brand{margin:0 4px 14px;font-size:16px}.search{margin-bottom:12px}.nav{display:grid;grid-template-columns:1fr 1fr;gap:3px}.nav-title{grid-column:1/-1;margin:10px 4px 3px;font-size:15px}.nav button,.nav-link{font-size:13px;padding:9px 8px}.nav button.sub,.nav-link.sub{padding-left:8px}.content{padding:16px 10px}.content-inner{width:100%}h1{font-size:25px}.tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.site-tile{padding:11px 6px}.site-tile .num{font-size:24px}.site-tile .label{font-size:12px}.chart-card{padding:12px 8px}.chart-wrap{height:190px}.map-canvas{height:300px}.chart-legend{gap:10px;font-size:12px}.grid{grid-template-columns:1fr}section{padding:12px;overflow-x:auto}table{min-width:560px;font-size:13px}.detail{min-width:0;overflow-x:auto}}
</style>
</head>
<body>
<div class="layout">
<aside class="sidebar"><p class="brand">STÉPHANIE ANALYTICS</p><input id="search" class="search" type="search" placeholder="Rechercher"><nav class="nav">
<a class="nav-link active" href="#dashboard" data-view="dashboard">▦ &nbsp; Tableau de bord</a><p class="nav-title">◉ &nbsp; Visiteurs</p><a class="nav-link sub" href="#sources" data-view="sources">Source de trafic</a><a class="nav-link sub" href="#pages" data-view="pages">Pages les plus consultées</a><a class="nav-link sub" href="#contacts" data-view="contacts">Contacts</a><a class="nav-link sub" href="#visitors" data-view="visitors">Journal des visites</a><a class="nav-link sub" href="#realtime" data-view="realtime">Carte en temps réel</a><a class="nav-link sub" href="#map" data-view="map">Carte des connexions</a><a class="nav-link sub" href="#devices" data-view="devices">Périphériques</a><a class="nav-link sub" href="#software" data-view="software">Logiciel</a><a class="nav-link sub" href="#hours" data-view="hours">Horaires</a></nav></aside>
<main class="content"><div class="content-inner"><p class="muted">ESPACE PRIVÉ · SANS IP NI IDENTIFICATION NOMINATIVE</p><h1>Stéphanie Analytics</h1><p><label>Période <select id="days"><option value="1">Aujourd'hui</option><option value="7">7 jours</option><option value="14">14 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option><option value="365">365 jours</option></select></label> <span id="status" class="muted">Chargement…</span></p>
<section id="view-dashboard" class="view active"><h2>Analyses Web</h2><p class="muted">Toutes les données réunies pour le site hairstylist-stephanie.com.</p><div class="tiles" id="site-tiles"></div><section class="chart-card"><h2>Évolution du site</h2><div id="traffic-chart" class="chart-wrap"></div><div class="chart-legend"><span><i class="legend-dot legend-pages"></i>Pages vues</span><span><i class="legend-dot legend-visits"></i>Visites</span><span><i class="legend-dot legend-actions"></i>Actions</span></div></section><section><h2>Historique du site</h2><p class="muted">Les données historiques sont intégrées directement aux analyses du site.</p><div id="historical"></div></section><section><h2>Évolution quotidienne</h2><div id="daily"></div></section></section>
<section id="view-sources" class="view"><h2>Source de trafic</h2><p class="muted">La synthèse reprend la période de référence jusqu’au 27 octobre 2026 ; chaque nouvelle visite est ensuite ajoutée automatiquement. Consultez aussi les nouvelles provenances jour par jour.</p><div class="source-controls"><label for="source-day">Période</label><select id="source-day"><option value="all">Toutes les journées</option></select></div><div id="source-traffic"></div></section>
<section id="view-pages" class="view"><h2>Pages les plus consultées</h2><p class="muted">Pages consultées sur la période choisie.</p><div id="pages"></div></section><section id="view-contacts" class="view"><h2>Contacts</h2><p class="muted">Clics vers les moyens de contact depuis le site : appel, SMS, WhatsApp et autres liens de contact.</p><div id="contacts"></div></section>
<section id="view-visitors" class="view"><h2>Journal des visites</h2><p class="muted">Chaque ligne correspond à une visite pseudonymisée. Cliquez pour afficher son parcours.</p><div id="visits"></div><div id="visit-detail" class="detail"></div></section>
<section id="view-realtime" class="view"><h2>Carte en temps réel</h2><p class="muted">Visites actives au cours des 5 dernières minutes, localisées à l’échelle de la ville.</p><div id="live-map" class="map-canvas"></div><p class="map-note" id="live-map-note"></p><div id="realtime"></div></section><section id="view-map" class="view"><h2>Carte des connexions</h2><p class="muted">Choisissez une journée pour afficher tous les lieux de connexion connus ce jour-là.</p><div class="source-controls"><label for="map-day">Journée</label><select id="map-day"><option value="all">Toutes les journées</option></select></div><div id="history-map" class="map-canvas"></div><p class="map-note">Chaque point représente une ville approximative ; il ne s’agit jamais d’une adresse précise.</p><div id="map-data"></div></section><section id="view-devices" class="view"><h2>Périphériques</h2><div id="devices"></div></section><section id="view-software" class="view"><h2>Logiciel</h2><div id="browsers"></div></section><section id="view-hours" class="view"><h2>Horaires</h2><div id="hours"></div></section>
<p class="muted">Les durées sont affichées en minutes et secondes. Les sessions sont une estimation technique.</p></div></main></div>
<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const num=v=>Number(v||0).toLocaleString('fr-FR');const duration=v=>{let s=Math.max(0,Math.round(Number(v)||0));let m=Math.floor(s/60);s=s%60;return m?m+' min '+String(s).padStart(2,'0')+' s':s+' s'};const table=(rows,keys,fmt={})=>{if(!rows?.length)return '<p class="empty">Aucune donnée.</p>';return '<table><thead><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(fmt[k]?fmt[k](r[k],r):r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'};const reportTable=rows=>table(rows,['report_date','source','unique_visitors','visits','actions','pageviews','avg_duration_seconds','bounce_rate'],{source:()=> 'Site',avg_duration_seconds:duration,bounce_rate:v=>v+' %'});const visitTable=rows=>{if(!rows?.length)return '<p class="empty">Aucune visite.</p>';return '<table><thead><tr><th>Début</th><th>Ville</th><th>Appareil</th><th>Navigateur</th><th>Pages</th><th>Durée</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.first_seen)+'</td><td>'+esc(r.city)+'</td><td>'+esc(r.device)+' · '+esc(r.os)+'</td><td>'+esc(r.browser)+'</td><td>'+esc(r.pageviews)+'</td><td>'+duration(r.duration_seconds)+'</td><td><button data-session="'+esc(r.session_id)+'">Voir le détail</button></td></tr>').join('')+'</tbody></table>'};const importedTable=rows=>{if(!rows?.length)return '<p class="empty">Aucune visite importée.</p>';return '<table><thead><tr><th>Visite</th><th>Date</th><th>Ville</th><th>Appareil</th><th>Navigateur</th><th>Pages</th><th>Actions</th><th>Durée</th><th>Provenance</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.visit_key)+'</td><td>'+esc(r.started_at)+'</td><td>'+esc(r.city||'Inconnue')+'</td><td>'+esc(r.device||'Inconnu')+' · '+esc(r.os||'')+'</td><td>'+esc(r.browser||'Inconnu')+'</td><td>'+esc(r.pages?.length||r.pageviews||0)+'</td><td>'+esc(r.actions)+'</td><td>'+duration(r.duration_seconds)+'</td><td>'+esc(r.referrer_name||r.referrer_type||'Direct')+'</td></tr>').join('')+'</tbody></table>'};const eventTable=rows=>table(rows,['created_at','event_type','page','contact_type','duration_ms'],{duration_ms:v=>duration(Number(v||0)/1000)});async function detail(id){const b=document.getElementById('visit-detail');b.innerHTML='<p class="muted">Chargement…</p>';const r=await fetch('/api/visits/'+encodeURIComponent(id));if(!r.ok){b.innerHTML='<p>Impossible de charger.</p>';return}const d=await r.json();b.innerHTML='<h3>Détail de la visite</h3>'+eventTable(d.events);b.scrollIntoView({behavior:'smooth',block:'nearest'})}
function chartSvg(rows){
  if(!rows?.length)return '<p class="empty">Aucune donnée.</p>';
  const w=980,h=270,p=42,bottom=44;
  const max=Math.max(1,...rows.flatMap(r=>[Number(r.pageviews||0),Number(r.visits||0),Number(r.actions||0)]));
  const axisMax=Math.max(25,Math.ceil((max+1)/25)*25);
  const x=i=>p+(w-2*p)*(rows.length===1?0.5:i/(rows.length-1));
  const y=v=>h-bottom-(h-bottom-p)*(v/axisMax);
  const present=rows.map((r,i)=>({r,i})).filter(({r})=>!r.empty);
  const line=k=>present.map(({r,i},n)=>(n?'L':'M')+x(i).toFixed(1)+' '+y(r[k]||0).toFixed(1)).join(' ');
  const dateLabel=d=>{const date=new Date(d+'T00:00:00');return Number.isNaN(date.getTime())?d:date.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}).replace('.','')};
  const labels=rows.map((r,i)=>i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/7))===0?'<text x="'+x(i).toFixed(1)+'" y="'+(h-12)+'" text-anchor="middle" fill="#8a737c" font-size="11">'+dateLabel(r.day)+'</text>':'').join('');
  return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Évolution journalière des pages vues, visites et actions">'+[0,1,2,3,4].map(n=>{const value=Math.round(axisMax*n/4),py=y(value);return '<line class="chart-grid" x1="'+p+'" y1="'+py+'" x2="'+(w-p)+'" y2="'+py+'"/><text x="8" y="'+(py+4)+'" fill="#8a737c" font-size="12">'+value+'</text>'}).join('')+'<path class="chart-line" d="'+line('pageviews')+'"/><path class="chart-line" style="stroke:#e4587c" d="'+line('visits')+'"/><path class="chart-line" style="stroke:#b93c5f" d="'+line('actions')+'"/>'+present.map(({r,i})=>'<circle class="chart-dot" cx="'+x(i).toFixed(1)+'" cy="'+y(r.pageviews||0).toFixed(1)+'" r="4"/><circle class="chart-dot" style="fill:#e4587c" cx="'+x(i).toFixed(1)+'" cy="'+y(r.visits||0).toFixed(1)+'" r="3"/><circle class="chart-dot" style="fill:#b93c5f" cx="'+x(i).toFixed(1)+'" cy="'+y(r.actions||0).toFixed(1)+'" r="3"/>').join('')+labels+'</svg>'
}
function aggregateImported(rows){const out={pages:new Map(),sources:new Map(),locations:new Map(),devices:new Map(),browsers:new Map()};const add=(m,k,n=1)=>{k=(k||'Inconnu').trim()||'Inconnu';m.set(k,(m.get(k)||0)+n)};for(const r of rows||[]){for(const page of (r.pages||[]))add(out.pages,page);add(out.sources,r.referrer_name||r.referrer_type||'Accès direct');add(out.locations,r.city||'Inconnue');add(out.devices,r.device||'Inconnu');add(out.browsers,r.browser||'Inconnu')}return out}const mapRows=m=>[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);const mergeRows=(base,extra)=>{const m=new Map((base||[]).map(r=>[r.label,Number(r.value||0)]));for(const r of extra||[])m.set(r.label,(m.get(r.label)||0)+Number(r.value||0));return mapRows(m)};
function activate(v,updateHash=true){const target=document.getElementById('view-'+v)?v:'dashboard';document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+target));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===target));if(updateHash)history.replaceState(null,'','#'+target)}document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));activate(location.hash.slice(1),false);window.addEventListener('hashchange',()=>activate(location.hash.slice(1),false));
async function load(){const s=document.getElementById('status');s.textContent='Actualisation…';try{const r=await fetch('/api/stats?days='+document.getElementById('days').value);if(!r.ok)throw Error();const d=await r.json(),t=d.totals||{},site=d.siteTotals||t;document.getElementById('site-tiles').innerHTML=[['Pages vues',site.pageviews,'site-blue'],['Visites',site.visits,'site-green'],['Actions',site.actions,'site-pink'],['Contacts',site.contact_clicks,'site-gold'],['Durée moyenne',duration(site.avg_duration_seconds),'site-mauve']].map(x=>'<div class="site-tile '+x[2]+'"><div class="num">'+num(x[1])+'</div><div class="label">'+x[0]+'</div></div>').join('');document.getElementById('traffic-chart').innerHTML=chartSvg(d.siteDaily);document.getElementById('historical').innerHTML=reportTable(d.historical);document.getElementById('daily').innerHTML=table(d.siteDaily,['day','visits','pageviews','actions']);let liveVisits=[];const vr=await fetch('/api/visits?days='+document.getElementById('days').value);if(vr.ok){const vd=await vr.json();liveVisits=vd.visits||[];document.getElementById('visits').innerHTML=visitTable(liveVisits);document.querySelectorAll('[data-session]').forEach(b=>b.addEventListener('click',()=>detail(b.dataset.session)))}const ir=await fetch('/api/imported-visits');let imported=[];if(ir.ok){const iv=await ir.json();imported=iv.visits||[];if(!liveVisits.length)document.getElementById('visits').innerHTML=importedTable(imported)}const a=aggregateImported(imported);const pages=mergeRows(d.pages,mapRows(a.pages)),devices=mergeRows(d.devices,mapRows(a.devices)),browsers=mergeRows(d.browsers,mapRows(a.browsers)),contactNames={telephone:'Appel téléphonique',sms:'SMS',whatsapp:'WhatsApp',email:'E-mail',instagram:'Instagram',inconnu:'Autre'};document.getElementById('pages').innerHTML=table(pages,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('contacts').innerHTML=table(d.contacts,['Type de contact','Clics'],{'Type de contact':(_,row)=>contactNames[row.label]||row.label,Clics:(_,row)=>num(row.value)});document.getElementById('devices').innerHTML=table(devices,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('browsers').innerHTML=table(browsers,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('realtime').innerHTML=table(d.realtime,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('hours').innerHTML=table(d.siteDaily,['day','visits','pageviews'],{visits:v=>num(v),pageviews:v=>num(v)});s.textContent='Actualisé à '+new Date().toLocaleTimeString('fr-FR')}catch(e){s.textContent='Accès aux données impossible'}}document.getElementById('days').addEventListener('change',load);document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('[data-view]').forEach(b=>b.style.display=!q||b.textContent.toLowerCase().includes(q)?'block':'none')});load();setInterval(load,60000);
const cityCoordinates={"Lyon":[45.764,4.8357],"Clermont-Ferrand":[45.7772,3.087],"Andrézieux-Bouthéon":[45.526,4.268],"Sury-le-Comtal":[45.538,4.184],"Shanghai":[31.2304,121.4737],"Saint-Etienne":[45.4397,4.3872],"Mâcon":[46.3069,4.8287],"Nantes":[47.2184,-1.5536],"Villeurbanne":[45.7719,4.8902],"Saint-Cyr-les-Vignes":[45.612,4.297],"Roanne":[46.036,4.068],"Saint-Marcellin-en-Forez":[45.499,4.17],"Marseille":[43.2965,5.3698],"Aix-les-Bains":[45.6885,5.9156],"Chalon-sur-Saône":[46.7833,4.853],"La Voulte-sur-Rhône":[44.799,4.78],"Pézenas":[43.461,3.424],"Le Haillan":[44.872,-0.678],"Saint-Galmier":[45.591,4.317],"Peillonnex":[46.129,6.382],"Saint-Martin-d'Hères":[45.18,5.756],"Grenoble":[45.1885,5.7245]};
let analyticsState={stats:null,live:[],imported:[]};const leafletMaps={};
const dayOf=r=>String(r.started_at||r.first_seen||'').slice(0,10);const trafficReferenceEnd='2026-10-27';const trafficReference=new Map([['Facebook',43],['Google',30],['Direct',26],['hairstylist-stephanie.com',9],['Instagram',9],['Autres sources',2]]);const canonicalSource=row=>{const raw=String(row.source||row.referrer_host||row.referrer_name||row.referrer_type||'').trim();let value=raw.toLowerCase();if(value.startsWith('https://'))value=value.slice(8);if(value.startsWith('http://'))value=value.slice(7);if(value.startsWith('www.'))value=value.slice(4);value=value.split('/')[0];if(value.includes('facebook')||value.includes('fb.com'))return 'Facebook';if(value.includes('google'))return 'Google';if(value.includes('instagram')||value==='ig'||value.endsWith('.ig'))return 'Instagram';if(value.includes('hairstylist-stephanie.com'))return 'hairstylist-stephanie.com';if(!value||value.includes('direct')||value.includes('inconnu')||value.includes('unknown'))return 'Direct';return raw||'Autres sources'};const percentage=v=>Number(v||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' %';
function trackedTraffic(){return analyticsState.live.filter(row=>dayOf(row)>trafficReferenceEnd)}
function sourceRows(day='all'){const values=new Map(day==='all'?trafficReference:[]);for(const row of trackedTraffic()){if(day!=='all'&&dayOf(row)!==day)continue;const label=canonicalSource(row);values.set(label,(values.get(label)||0)+1)}return mapRows(values)}
function sourceTable(rows){const total=rows.reduce((sum,row)=>sum+Number(row.value||0),0);if(!total)return '<p class="empty">Aucune visite pour cette journée.</p>';return '<table><thead><tr><th>Source</th><th>Visites</th><th>Pourcentage</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(row.label)+'</td><td>'+num(row.value)+'</td><td>'+percentage(Number(row.value||0)*100/total)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Total</th><th>'+num(total)+'</th><th>100,00 %</th></tr></tfoot></table>'}
function availableDays(){return [...new Set([...analyticsState.imported,...analyticsState.live].map(dayOf).filter(Boolean))].sort().reverse()}
function populateDaySelect(id,days=availableDays()){const select=document.getElementById(id),selected=select.value||'all';select.innerHTML='<option value="all">Toutes les journées</option>'+days.map(day=>'<option value="'+day+'">'+day+'</option>').join('');select.value=[...select.options].some(o=>o.value===selected)?selected:'all'}
function renderSources(){document.getElementById('source-traffic').innerHTML=sourceTable(sourceRows(document.getElementById('source-day').value))}
function groupedPoints(rows){const groups=new Map();for(const row of rows){const city=(row.city||'').trim(),point=cityCoordinates[city];if(!point)continue;const item=groups.get(city)||{city,point,count:0};item.count++;groups.set(city,item)}return [...groups.values()]}
function drawMap(id,rows){const host=document.getElementById(id);if(!host)return;if(!window.L){host.innerHTML='<p class="empty">La carte ne peut pas être chargée.</p>';return}let state=leafletMaps[id];if(!state){const map=L.map(host,{scrollWheelZoom:false}).setView([45.55,4.35],8);L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19,attribution:'© OpenStreetMap © CARTO'}).addTo(map);state=leafletMaps[id]={map,markers:L.layerGroup().addTo(map)}}state.markers.clearLayers();const points=groupedPoints(rows);if(!points.length){state.map.setView([45.55,4.35],8);setTimeout(()=>state.map.invalidateSize(),0);return}for(const item of points)L.circleMarker(item.point,{radius:7+Math.min(item.count,6),color:'#fffaf6',weight:2,fillColor:'#b93c5f',fillOpacity:.9}).addTo(state.markers).bindPopup('<strong>'+esc(item.city)+'</strong><br>'+item.count+' visite'+(item.count>1?'s':'')+' à l’échelle de la ville');state.map.fitBounds(L.latLngBounds(points.map(p=>p.point)),{padding:[34,34],maxZoom:9});setTimeout(()=>state.map.invalidateSize(),0)}
function renderMaps(){const day=document.getElementById('map-day').value,all=[...analyticsState.imported,...analyticsState.live],history=day==='all'?all:all.filter(r=>dayOf(r)===day);drawMap('history-map',history);const now=Date.now(),active=analyticsState.live.filter(r=>Date.parse(r.last_seen||r.first_seen||0)>=now-300000);drawMap('live-map',active);document.getElementById('live-map-note').textContent=active.length?active.length+' visite'+(active.length>1?'s actives':' active')+' au cours des 5 dernières minutes.':'Aucune visite active au cours des 5 dernières minutes.';const cities=mapRows(history.reduce((m,r)=>{const city=r.city||'Inconnue';m.set(city,(m.get(city)||0)+1);return m},new Map()));document.getElementById('map-data').innerHTML=table(cities,['label','value'],{label:v=>v,value:v=>num(v)})}
async function enhanceDashboard(){try{const days=document.getElementById('days').value;const [statsResponse,liveResponse,importedResponse]=await Promise.all([fetch('/api/stats?days='+days),fetch('/api/visits?days=395'),fetch('/api/imported-visits')]);if(!statsResponse.ok||!liveResponse.ok||!importedResponse.ok)throw Error();analyticsState={stats:await statsResponse.json(),live:(await liveResponse.json()).visits||[],imported:(await importedResponse.json()).visits||[]};populateDaySelect('source-day',[...new Set(trackedTraffic().map(dayOf).filter(Boolean))].sort().reverse());populateDaySelect('map-day');renderSources();renderMaps()}catch(_){document.getElementById('source-traffic').innerHTML='<p class="empty">Données indisponibles.</p>'}}
document.getElementById('source-day').addEventListener('change',renderSources);document.getElementById('map-day').addEventListener('change',renderMaps);document.querySelectorAll('[data-view]').forEach(link=>link.addEventListener('click',()=>setTimeout(renderMaps,0)));document.getElementById('days').addEventListener('change',enhanceDashboard);enhanceDashboard();setInterval(enhanceDashboard,60000);
</script>
</body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/collect' && request.method === 'OPTIONS') return new Response(null, { status: originAllowed(request, env) ? 204 : 403, headers: { ...BASE, ...cors(env) } });
    if (url.pathname === '/collect' && request.method === 'POST') return collect(request, env);
    if (!secure(request)) return json({ error: 'HTTPS requis' }, 403);
    if (url.pathname === '/admin' || url.pathname === '/api/stats' || url.pathname === '/api/visits' || url.pathname.startsWith('/api/visits/') || url.pathname === '/api/imported-visits') {
      if (!await sameSecret(request, env)) return unauthorized();
      if (url.pathname === '/admin') return new Response(dashboard, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: https://*.basemaps.cartocdn.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
      if (url.pathname === '/api/visits') return visits(request, env);
      if (url.pathname.startsWith('/api/visits/')) return visitDetail(request, env, decodeURIComponent(url.pathname.slice('/api/visits/'.length)));
      if (url.pathname === '/api/imported-visits') return importedVisits(request, env);
      return stats(request, env);
    }
    return json({ service: 'Stephanie Analytics', status: 'ok' });
  },
  async scheduled(_event, env) {
    const retention = Math.max(90, Math.min(730, Number(env.RETENTION_DAYS || 395)));
    await env.DB.prepare("DELETE FROM events WHERE created_at < datetime('now', ?)").bind(`-${retention} days`).run();
  }
};
