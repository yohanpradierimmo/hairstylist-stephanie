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
const validVisitor = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const displayVisitDate = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value, 40);
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date).replace(',', ' ·');
};
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
  const visitor = validVisitor(body.visitor) ? body.visitor : null;
  if (visitor) {
    const excluded = await env.DB.prepare(`SELECT 1 FROM profile_groups WHERE member_visitor_id=? AND exclude_from_analytics=1 LIMIT 1`).bind(visitor).first();
    if (excluded) return json({ ok: true, excluded: true }, 202, cors(env));
  }
  const row = [
    body.session, visitor, body.type, page, clean(body.referrer, 150), clean(body.source, 80), clean(body.medium, 80), clean(body.campaign, 100),
    device(ua), browser(ua), operatingSystem(ua), screen, clean(request.headers.get('Accept-Language'), 10),
    clean(request.cf?.country, 2), clean(request.cf?.region, 100), clean(request.cf?.city, 100),
    body.type === 'contact_click' && ['telephone', 'sms', 'whatsapp', 'email', 'instagram'].includes(body.contact) ? body.contact : null, duration
  ];
  await env.DB.prepare(`INSERT INTO events (session_id,visitor_id,event_type,page,referrer_host,source,medium,campaign,device,browser,os,screen,language,country,region,city,contact_type,duration_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...row).run();
  return json({ ok: true }, 202, cors(env));
}

async function stats(request, env) {
  const url = new URL(request.url); const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '7', 10) || 7));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const query = async (sql, params = []) => (await env.DB.prepare(sql).bind(...params).all()).results;
  const [totals, engagement, daily, pages, sources, devices, browsers, contacts, entries, exits, locations, realtime, recent, historical, importedTotals, importedEngagement, importedDaily] = await Promise.all([
    query(`SELECT COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) sessions,
      SUM(event_type='pageview') pageviews, SUM(event_type='contact_click') contact_clicks,
      COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) - COUNT(DISTINCT CASE WHEN event_type='page_exit' THEN session_id END) AS sessions_without_exit
      FROM analytics_events WHERE day>=?`, [since]),
    query(`WITH session_metrics AS (
      SELECT session_id, COALESCE(SUM(duration_ms),0) / 1000.0 AS duration_seconds
      FROM analytics_events WHERE day>=? GROUP BY session_id
    ) SELECT SUM(duration_seconds >= 10) AS engaged_visits, SUM(duration_seconds < 10) AS immediate_departures,
      COALESCE(ROUND(AVG(CASE WHEN duration_seconds >= 10 THEN duration_seconds END),1),0) AS avg_duration_seconds
      FROM session_metrics`, [since]),
    query(`SELECT day, COUNT(DISTINCT CASE WHEN event_type='pageview' THEN session_id END) sessions,
      SUM(event_type='pageview') pageviews, SUM(event_type='contact_click') contact_clicks
      FROM analytics_events WHERE day>=? GROUP BY day ORDER BY day`, [since]),
    query(`SELECT page label, COUNT(*) value FROM analytics_events WHERE day>=? AND event_type='pageview' GROUP BY page ORDER BY value DESC LIMIT 50`, [since]),
    query(`WITH session_sources AS (
      SELECT session_id, COALESCE(
        NULLIF(MAX(CASE WHEN source<>'' THEN source END),''),
        NULLIF(MIN(CASE WHEN referrer_host<>'' AND lower(referrer_host) NOT IN ('hairstylist-stephanie.com','www.hairstylist-stephanie.com') THEN referrer_host END),''),
        'Accès direct / inconnu'
      ) label
      FROM analytics_events WHERE day>=? AND event_type='pageview' GROUP BY session_id
    ) SELECT label, COUNT(*) value FROM session_sources GROUP BY label ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT device label, COUNT(DISTINCT session_id) value FROM analytics_events WHERE day>=? AND event_type='pageview' GROUP BY device ORDER BY value DESC`, [since]),
    query(`SELECT browser label, COUNT(DISTINCT session_id) value FROM analytics_events WHERE day>=? AND event_type='pageview' GROUP BY browser ORDER BY value DESC`, [since]),
    query(`SELECT COALESCE(contact_type,'inconnu') label, COUNT(*) value FROM analytics_events WHERE day>=? AND event_type='contact_click' GROUP BY contact_type ORDER BY value DESC`, [since]),
    query(`SELECT page label, COUNT(*) value FROM analytics_events e WHERE event_type='pageview' AND day>=? AND created_at=(SELECT MIN(created_at) FROM analytics_events x WHERE x.session_id=e.session_id AND x.event_type='pageview') GROUP BY page ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT page label, COUNT(*) value FROM analytics_events WHERE day>=? AND event_type='page_exit' GROUP BY page ORDER BY value DESC LIMIT 30`, [since]),
    query(`SELECT COALESCE(NULLIF(city,''),'Inconnue') label, COUNT(DISTINCT session_id) value FROM analytics_events WHERE day>=? AND event_type='pageview' GROUP BY city ORDER BY value DESC LIMIT 50`, [since]),
    query(`SELECT page label, COUNT(DISTINCT session_id) value FROM analytics_events WHERE event_type='pageview' AND created_at>=datetime('now','-5 minutes') GROUP BY page ORDER BY value DESC`, []),
    query(`SELECT created_at, event_type, page, device, contact_type FROM analytics_events ORDER BY id DESC LIMIT 25`, []),
    query(`SELECT * FROM imported_reports ORDER BY report_date DESC LIMIT 30`, []),
    query(`SELECT COUNT(*) visits, COALESCE(SUM(actions),0) actions, COALESCE(SUM(pageviews),0) pageviews
      FROM imported_visits WHERE substr(started_at,1,10)>=?`, [since]),
    query(`SELECT SUM(duration_seconds >= 10) AS engaged_visits, SUM(duration_seconds < 10) AS immediate_departures,
      COALESCE(ROUND(AVG(CASE WHEN duration_seconds >= 10 THEN duration_seconds END),1),0) AS avg_duration_seconds
      FROM imported_visits WHERE substr(started_at,1,10)>=?`, [since]),
    query(`SELECT substr(started_at,1,10) day, COUNT(*) visits, COALESCE(SUM(pageviews),0) pageviews,
      COALESCE(SUM(actions),0) actions FROM imported_visits WHERE substr(started_at,1,10)>=? GROUP BY substr(started_at,1,10) ORDER BY day`, [since])
  ]);
  const bounce = totals[0]?.sessions ? Math.round((Number(totals[0].sessions_without_exit || 0) / Number(totals[0].sessions)) * 100) : 0;
  const live = totals[0] || {};
  const liveEngagement = engagement[0] || {};
  const imported = importedTotals[0] || {};
  const importedEngaged = importedEngagement[0] || {};
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const engagedVisits = number(liveEngagement.engaged_visits) + number(importedEngaged.engaged_visits);
  const immediateDepartures = number(liveEngagement.immediate_departures) + number(importedEngaged.immediate_departures);
  const averageDuration = engagedVisits ? Math.round((number(liveEngagement.avg_duration_seconds) * number(liveEngagement.engaged_visits) + number(importedEngaged.avg_duration_seconds) * number(importedEngaged.engaged_visits)) / engagedVisits) : 0;
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
    sessions: number(live.sessions) + number(imported.visits),
    visits: number(live.sessions) + number(imported.visits),
    pageviews: number(live.pageviews) + number(imported.pageviews),
    actions: number(imported.actions) + number(live.pageviews) + number(live.contact_clicks),
    contact_clicks: number(live.contact_clicks),
    immediate_departures: immediateDepartures,
    engaged_visits: engagedVisits,
    avg_duration_seconds: averageDuration,
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
  const rows = (await env.DB.prepare(`SELECT session_id, COALESCE(MAX(visitor_id),'') visitor_id, MIN(created_at) started_at,
    MIN(created_at) first_seen, MAX(created_at) last_seen,
    COUNT(CASE WHEN event_type='pageview' THEN 1 END) pageviews,
    ROUND(SUM(duration_ms)/1000.0,1) duration_seconds,
    CASE WHEN SUM(duration_ms) < 10000 THEN 1 ELSE 0 END immediate_departure,
    COALESCE(MAX(city),'Inconnue') city, COALESCE(MAX(country),'') country,
    COALESCE(MAX(device),'Inconnu') device, COALESCE(MAX(browser),'Inconnu') browser,
    COALESCE(MAX(os),'Inconnu') os, COALESCE(MAX(screen),'') screen,
    COALESCE(NULLIF(MAX(CASE WHEN source<>'' THEN source END),''),NULLIF(MIN(CASE WHEN referrer_host<>'' AND lower(referrer_host) NOT IN ('hairstylist-stephanie.com','www.hairstylist-stephanie.com') THEN referrer_host END),''),'Accès direct') source
    FROM analytics_events WHERE day>=? GROUP BY session_id ORDER BY last_seen DESC LIMIT 100`).bind(since).all()).results;
  return json({ days, since, visits: rows.map(row => ({ ...row, first_seen: displayVisitDate(row.started_at) })) });
}

async function visitDetail(request, env, session) {
  if (!validSession(session)) return json({ error: 'Visite invalide' }, 400);
  const rows = (await env.DB.prepare(`SELECT created_at,visitor_id,event_type,page,referrer_host,source,medium,campaign,device,browser,os,screen,language,country,region,city,contact_type,duration_ms
    FROM analytics_events WHERE session_id=? ORDER BY created_at`).bind(session).all()).results;
  if (!rows.length) return json({ error: 'Visite introuvable' }, 404);
  // Format dates before sending them: the dashboard must never receive ISO timestamps.
  const formatEvent = row => ({ ...row, created_at: displayVisitDate(row.created_at) });
  return json({
    session_id: session,
    profile: formatEvent(rows[0]),
    events: rows.filter(row => row.event_type !== 'pageview').map(formatEvent)
  });
}

async function profiles(request, env) {
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare(`SELECT COALESCE(groups.profile_id,e.visitor_id) visitor_id, COALESCE(MAX(groups.label),'') profile_label,
    MIN(e.created_at) first_seen, MAX(e.created_at) last_seen, COUNT(DISTINCT e.session_id) visits,
    COUNT(CASE WHEN e.event_type='pageview' THEN 1 END) pageviews, ROUND(SUM(e.duration_ms)/1000.0,1) duration_seconds,
    SUM(e.event_type='contact_click') contact_clicks, COALESCE(MAX(e.city),'Inconnue') city,
    COALESCE(MAX(e.device),'Inconnu') device, COALESCE(MAX(e.os),'Inconnu') os
    FROM analytics_events e LEFT JOIN profile_groups groups ON groups.member_visitor_id=e.visitor_id
    WHERE e.day>=? AND e.visitor_id IS NOT NULL AND e.visitor_id<>''
    GROUP BY COALESCE(groups.profile_id,e.visitor_id) ORDER BY last_seen DESC LIMIT 100`).bind(since).all()).results;
  return json({ days, since, profiles: rows });
}

async function profileDetail(request, env, visitor) {
  if (!validVisitor(visitor)) return json({ error: 'Profil invalide' }, 400);
  const [summary, events] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(MAX(groups.label),'') profile_label, MIN(e.created_at) first_seen, MAX(e.created_at) last_seen,
      COUNT(DISTINCT e.session_id) visits, COUNT(CASE WHEN e.event_type='pageview' THEN 1 END) pageviews,
      ROUND(SUM(e.duration_ms)/1000.0,1) duration_seconds, SUM(e.event_type='contact_click') contact_clicks,
      COALESCE(MAX(e.city),'Inconnue') city, COALESCE(MAX(e.country),'') country,
      COALESCE(MAX(e.device),'Inconnu') device, COALESCE(MAX(e.browser),'Inconnu') browser,
      COALESCE(MAX(e.os),'Inconnu') os, COALESCE(MAX(e.screen),'') screen,
      COALESCE(NULLIF(MAX(CASE WHEN e.source<>'' THEN e.source END),''),NULLIF(MIN(CASE WHEN e.referrer_host<>'' AND lower(e.referrer_host) NOT IN ('hairstylist-stephanie.com','www.hairstylist-stephanie.com') THEN e.referrer_host END),''),'Accès direct') source
      FROM analytics_events e LEFT JOIN profile_groups groups ON groups.member_visitor_id=e.visitor_id
      WHERE COALESCE(groups.profile_id,e.visitor_id)=?`).bind(visitor).all(),
    env.DB.prepare(`SELECT e.created_at,e.session_id,e.event_type,e.page,e.referrer_host,e.source,e.device,e.browser,e.os,e.screen,e.country,e.city,e.contact_type,e.duration_ms
    FROM analytics_events e LEFT JOIN profile_groups groups ON groups.member_visitor_id=e.visitor_id
    WHERE COALESCE(groups.profile_id,e.visitor_id)=? ORDER BY e.created_at DESC LIMIT 500`).bind(visitor).all()
  ]);
  const rows = events.results;
  if (!rows.length) return json({ error: 'Profil introuvable' }, 404);
  return json({ visitor_id: visitor, profile: summary.results[0], events: rows });
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
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Stéphanie Hairstylist ANALYTICS</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
:root{--rose:#9d637b;--blue:#b93c5f;--ink:#4c3740;--muted:#8a737c;--line:#eadce2;--bg:#faf6f7;--nav:#fff}*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{font:15px system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);margin:0}.layout{display:flex;min-height:100vh}.sidebar{width:260px;background:var(--nav);border-right:1px solid var(--line);padding:22px 16px;position:sticky;top:0;height:100vh;overflow:auto}.brand{font-weight:700;font-size:18px;margin:0 8px 24px}.search{width:100%;padding:13px 14px;border:1px solid #d8cbd1;border-radius:14px;background:#fff;font-size:15px;margin-bottom:20px}.nav-title{font-weight:700;color:var(--blue);font-size:18px;margin:18px 8px 10px}.nav button,.nav-link{display:block;width:100%;border:0;background:transparent;color:#6a6165;text-align:left;padding:11px 12px;border-radius:12px;font-size:15px;cursor:pointer;text-decoration:none}.nav button:hover,.nav button.active,.nav-link:hover,.nav-link.active{background:#f0edef;color:var(--blue)}.nav button.sub,.nav-link.sub{padding-left:34px}.content{flex:1;min-width:0;padding:30px 26px}.content-inner{max-width:1200px;margin:0 auto}h1{font-size:30px;margin:4px 0}.muted{color:var(--muted)}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}.tile,section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 4px 18px #7047580c}.num{font-size:28px;color:var(--rose);margin-top:7px;font-weight:650}.site-tile{border:0;color:#2b2330;text-align:center;padding:14px 10px;border-radius:14px;box-shadow:0 4px 14px #7047581c}.site-tile .num{color:#2b2330;font-size:31px;margin:0}.site-tile .label{font-size:14px}.site-blue{background:#f7e6bf}.site-green{background:#f6bccd}.site-pink{background:#e4587c}.site-gold{background:#d4af37}.site-mauve{background:#b93c5f;color:#fffaf6}.chart-card{padding:18px 16px 12px}.chart-wrap{height:260px;position:relative}.chart-wrap svg{width:100%;height:100%;overflow:visible}.chart-point{cursor:pointer;outline:none}.chart-point:focus circle{stroke:#4c3740;stroke-width:2}.chart-tooltip{position:absolute;z-index:3;min-width:164px;padding:9px 11px;border-radius:10px;background:#4c3740;color:#fffaf6;font-size:12px;line-height:1.45;box-shadow:0 8px 22px #4c374066}.chart-grid{stroke:#eadfe4;stroke-width:1}.chart-line{fill:none;stroke:#d4af37;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chart-dot{fill:#d4af37}.chart-legend{display:flex;gap:18px;flex-wrap:wrap;color:#6d6268;font-size:13px}.legend-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}.legend-pages{background:#d4af37}.legend-visits{background:#e4587c}.legend-actions{background:#b93c5f}.map-canvas{height:420px;border:1px solid #eadce2;border-radius:14px;overflow:hidden;background:#f7e6bf}.analytics-map-dot{border:2px solid #fffaf6;border-radius:50%;padding:0;background:#b93c5f;box-shadow:0 2px 10px #4c374080;cursor:pointer}.map-note{margin:10px 0 0;font-size:13px;color:#8a737c}.source-controls{display:flex;align-items:center;gap:10px;margin-bottom:14px}.source-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.source-filters label{display:grid;gap:5px;font-weight:650;color:#6a515c;font-size:13px}.source-filters [hidden]{display:none}select,input,button{padding:9px;border-radius:8px;border:1px solid #ddc8d0;background:#fff;color:var(--ink);font:inherit}button{cursor:pointer}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #f0e5e9;vertical-align:top}th{color:#7d6670}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.view{display:none}.view.active{display:block}.detail{margin-top:14px}.empty{padding:20px 0}.profile-modal{width:min(1120px,calc(100vw - 32px));max-height:min(840px,calc(100vh - 32px));border:1px solid var(--line);border-radius:18px;padding:0;background:var(--bg);color:var(--ink);box-shadow:0 20px 70px #2d1a224d}.profile-modal::backdrop{background:#2c172580}.profile-window{padding:22px;max-height:calc(100vh - 32px);overflow:auto}.profile-close{position:sticky;top:0;float:right;border:0;background:#4c3740;color:#fff;padding:8px 12px;z-index:2}.profile-top{display:flex;align-items:flex-start;gap:18px;margin-right:46px}.profile-avatar{width:90px;height:90px;border-radius:50%;display:grid;place-items:center;background:#f7e6bf;color:#9d637b;font-size:42px;border:1px solid #eadce2;flex:0 0 auto}.profile-id{font-family:ui-monospace,SFMono-Regular,monospace;color:#7d6670;overflow-wrap:anywhere}.profile-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.profile-summary div,.visit-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}.profile-summary strong{display:block;font-size:20px;color:var(--blue)}.profile-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:18px 0}.profile-meta div{padding:9px 11px;background:#fff;border-radius:10px;border:1px solid var(--line)}.profile-meta b{display:block;font-size:12px;color:var(--muted);margin-bottom:3px}.visit-card{margin-top:10px}.visit-card header{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.visit-card h4{margin:0;color:var(--blue)}.visit-stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.visit-stats span{padding:5px 8px;background:#f7e6bf;border-radius:999px;font-size:13px}.visit-path{margin:0;padding-left:20px}.visit-path li{padding:3px 0;overflow-wrap:anywhere}.contact-action{color:#b93c5f;font-weight:700}@media(max-width:800px){.sidebar{width:220px}.content{padding:20px 14px}}@media(max-width:620px){.layout{display:block}.sidebar{width:auto;height:auto;position:relative;border-right:0;border-bottom:1px solid var(--line);padding:14px 12px}.brand{margin:0 4px 14px;font-size:16px}.search{margin-bottom:12px}.nav{display:grid;grid-template-columns:1fr 1fr;gap:3px}.nav-title{grid-column:1/-1;margin:10px 4px 3px;font-size:15px}.nav button,.nav-link{font-size:13px;padding:9px 8px}.nav button.sub,.nav-link.sub{padding-left:8px}.content{padding:16px 10px}.content-inner{width:100%}h1{font-size:25px;line-height:1.1}.tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.site-tile{padding:11px 6px}.site-tile .num{font-size:24px}.site-tile .label{font-size:12px}.chart-card{padding:12px 8px}.chart-wrap{height:190px}.map-canvas{height:300px}.chart-legend{gap:10px;font-size:12px}.grid{grid-template-columns:1fr}section{padding:12px;overflow:visible}table{min-width:0;font-size:13px}table thead{display:none}table,table tbody,table tr,table td{display:block;width:100%}table tr{padding:6px 0;border-bottom:1px solid #eadce2}table tr:last-child{border-bottom:0}table td{display:grid;grid-template-columns:minmax(92px,42%) minmax(0,1fr);gap:9px;padding:7px 2px;border:0;overflow-wrap:anywhere}table td::before{content:attr(data-label);font-weight:700;color:#7d6670}.detail{min-width:0;overflow:visible}.source-controls{align-items:stretch;flex-direction:column}.source-controls select{width:100%}.source-filters{grid-template-columns:1fr}.profile-window{padding:16px 12px}.profile-top{margin-right:0;gap:10px;align-items:center}.profile-avatar{width:58px;height:58px;font-size:28px}.profile-top h2{font-size:20px}.profile-summary{grid-template-columns:repeat(2,minmax(0,1fr));margin:14px 0}.profile-meta{grid-template-columns:1fr}.visit-card header{align-items:flex-start;flex-direction:column}.profile-close{position:relative;float:right;margin-bottom:6px}}
</style>
<style>
/* Direction artistique — écrin champagne, ivoire et rose poudré. */
:root{--rose:#a83f64;--blue:#8f304f;--ink:#36242b;--muted:#826b73;--line:#ead9d5;--bg:#fbf8f3;--nav:#fffdf9;--champagne:#edcf9b;--cream:#fff6e6;--powder:#edb6c4;--gold:#bf8c35;--wine:#6c263e}
body{font-family:ui-rounded,"Avenir Next",Avenir,Montserrat,system-ui,sans-serif;background:radial-gradient(circle at 90% 4%,#f7e4d7 0,transparent 24rem),radial-gradient(circle at 20% 96%,#f5dce2 0,transparent 30rem),var(--bg);color:var(--ink);letter-spacing:.01em}
body:before,body:after{content:"";position:fixed;z-index:-1;border-radius:999px;pointer-events:none;filter:blur(1px)}body:before{width:30rem;height:30rem;right:-18rem;top:18rem;background:#efd7b655}body:after{width:25rem;height:25rem;left:-18rem;bottom:-12rem;background:#e5a3b044}
.sidebar{width:286px;padding:24px 17px;background:linear-gradient(165deg,#fffefc 0%,#fff7ed 52%,#f8e6e8 100%);border-right:1px solid #e7d5d2;box-shadow:10px 0 34px #7047580b}
.sidebar:before{content:"STÉPHANIE HAIRSTYLIST";display:block;margin:0 8px 4px;color:var(--wine);font-family:Georgia,"Times New Roman",serif;font-size:20px;letter-spacing:.09em;line-height:1.15}.brand{font-weight:700;font-size:11px;letter-spacing:.28em;color:var(--gold);margin:0 9px 30px}
.search{padding:13px 15px;border:1px solid #e9d7cf;border-radius:15px;background:#fffdfa;box-shadow:inset 0 1px #fff,0 7px 18px #7e4e580a;color:var(--ink);transition:.2s}.search:focus{outline:0;border-color:#d38ca2;box-shadow:0 0 0 4px #e9a9ba2b}
.nav-title{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#aa7a44;margin:27px 10px 8px}.nav-link{position:relative;color:#6e5a61;padding:11px 12px;margin:2px 0;border-radius:12px;font-size:14px;font-weight:590;transition:transform .18s,background .18s,color .18s}.nav button.sub,.nav-link.sub{padding-left:20px}.nav-link:before{content:"";position:absolute;left:3px;top:50%;width:5px;height:5px;border-radius:99px;background:transparent;transform:translateY(-50%);transition:.18s}.nav button:hover,.nav button.active,.nav-link:hover,.nav-link.active{background:linear-gradient(90deg,#f4dbe1,#f9e9df);color:var(--wine);transform:translateX(2px);box-shadow:0 5px 13px #7b344712}.nav-link.active:before{background:var(--rose);box-shadow:0 0 0 4px #e9a0b432}
.content{padding:38px 38px 56px}.content-inner{max-width:1320px}.content-inner>p:first-child{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid #ecdacb;border-radius:999px;background:#fffaf3;color:#a77b45;font-size:10px;font-weight:800;letter-spacing:.13em;box-shadow:0 4px 12px #7957390c}.content-inner>p:first-child:before{content:"";width:6px;height:6px;background:#bc8d3d;border-radius:50%;box-shadow:0 0 0 4px #efd8ae}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:48px;letter-spacing:-.045em;color:#41252e;margin:15px 0 3px}h1:after{content:"";display:block;width:70px;height:3px;margin-top:14px;border-radius:99px;background:linear-gradient(90deg,var(--rose),var(--champagne),transparent)}
.content-inner>p:nth-of-type(2){display:flex;align-items:center;gap:11px;margin:20px 0 28px;color:var(--muted)}.content-inner>p:nth-of-type(2) label{display:flex;align-items:center;gap:8px;color:#6b505a;font-size:13px;font-weight:700}.content-inner>p:nth-of-type(2) select{border-radius:999px;padding:9px 30px 9px 14px;background:#fffdf9;border-color:#e6d0d2;box-shadow:0 5px 13px #7a4e570d}
section{position:relative;border:1px solid #ebdfd6;border-radius:22px;padding:23px;background:linear-gradient(140deg,#fffefd 0%,#fffdf9 62%,#fdf6f0 100%);box-shadow:0 12px 30px #7047580b;overflow:hidden}section:before{content:"";position:absolute;right:-70px;top:-80px;width:170px;height:170px;border:1px solid #eed9cf;border-radius:50%;opacity:.5;pointer-events:none}.view>h2{font-family:Georgia,"Times New Roman",serif;font-size:34px;font-weight:500;margin:4px 0 8px;color:#472d35}.view>h2+.muted{max-width:650px;margin-top:0}.view>section>h2,.chart-card h2{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:25px;color:#513039;margin-top:0}
.tiles{grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;margin:28px 0 16px}.site-tile{position:relative;overflow:hidden;min-height:132px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;text-align:left;padding:20px 17px;border-radius:19px;box-shadow:0 13px 22px #70475818;isolation:isolate}.site-tile:before{content:"";position:absolute;z-index:-1;right:-24px;top:-28px;width:105px;height:105px;border-radius:50%;background:#fff8;box-shadow:-20px 31px 0 #fff4}.site-tile .num{font-family:Georgia,"Times New Roman",serif;font-size:40px;line-height:1;font-weight:500;letter-spacing:-.06em}.site-tile .label{margin-top:8px;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.site-blue{background:linear-gradient(135deg,#fff4d9,#eed197)}.site-green{background:linear-gradient(135deg,#f9dce3,#eeb5c2)}.site-pink{background:linear-gradient(135deg,#eb708e,#ba3c62);color:#fff9f9}.site-gold{background:linear-gradient(135deg,#e8c957,#bd8730)}.site-mauve{background:linear-gradient(135deg,#993b60,#67243e)}
#duration-note{padding:10px 14px;border-left:3px solid var(--gold);border-radius:0 10px 10px 0;background:#fff8ed;font-size:13px}.chart-card{padding:26px 24px 17px;background:linear-gradient(140deg,#fffdf9,#fff8f6)}.chart-wrap{height:310px}.chart-grid{stroke:#ebdfda}.chart-line{stroke-width:3.4}.chart-dot{filter:drop-shadow(0 3px 3px #9a613066)}.chart-tooltip{border:1px solid #e6cbbd;background:#482d37;box-shadow:0 15px 32px #3d1f2861;border-radius:13px;padding:10px 12px}.chart-legend{padding-top:4px;gap:22px;font-weight:650}.legend-dot{width:11px;height:11px;box-shadow:0 2px 5px #55333c33}
select,input,button{border-color:#e6d0d2;border-radius:11px;background:#fffdfa;transition:border .18s,box-shadow .18s}select:focus,input:focus,button:focus{outline:0;border-color:#cb849a;box-shadow:0 0 0 4px #eaa5b52b}button{background:linear-gradient(135deg,#fffefa,#fff3ed);font-weight:700;color:#794456}.source-filters{padding:14px;border-radius:15px;background:#fff8f0;border:1px solid #efdfd7}.source-filters label{color:#795260}.source-filters input,.source-filters select{min-height:39px}
table{overflow:hidden;border:1px solid #eee2dd;border-radius:14px;background:#fffefa}th{background:#fff7ef;color:#9a6b61;font-size:11px;letter-spacing:.09em;text-transform:uppercase;padding:12px 11px}td{padding:11px;border-bottom-color:#f3e9e4}tbody tr{transition:background .16s}tbody tr:hover{background:#fff5f3}td:first-child{font-weight:650;color:#59404a}.map-canvas{border:1px solid #ebded6;border-radius:18px;background:#fff8ec;box-shadow:inset 0 0 0 6px #fffdfa}.map-note{padding:10px 12px;border-radius:10px;background:#fff8f0}
.profile-modal{border:1px solid #ead4d2;border-radius:24px;background:#fffaf7;box-shadow:0 26px 80px #2a16235c}.profile-modal::backdrop{background:#321a287c;backdrop-filter:blur(5px)}.profile-window{padding:28px}.profile-close{border-radius:999px;background:var(--wine);box-shadow:0 6px 16px #54243740}.profile-avatar{background:linear-gradient(145deg,#f9e7c5,#edb6c4);color:#743149;border:5px solid #fffaf5;box-shadow:0 8px 20px #68414933}.profile-summary div,.visit-card,.profile-meta div{background:#fffefa;border-color:#efdfd7}.profile-summary strong{color:var(--rose)}.visit-card h4{color:var(--wine)}.visit-stats span{background:#fbebd0;color:#68404a}.contact-action{color:#a83f64}
@media(max-width:1120px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.sidebar{width:250px}.content{padding:30px 24px}}@media(max-width:800px){.sidebar{width:214px;padding:18px 11px}.sidebar:before{font-size:24px}.brand{font-size:9px;margin-bottom:20px}.content{padding:25px 16px}h1{font-size:39px}.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.site-tile{min-height:118px}.site-tile .num{font-size:34px}}@media(max-width:620px){body{background:linear-gradient(155deg,#fffaf4,#fbf4f5 58%,#f8e9df)}.sidebar{padding:16px 12px;background:linear-gradient(135deg,#fffefa,#fff2eb);border-bottom:1px solid #e6d5d1}.sidebar:before{font-size:25px;margin-left:5px}.brand{margin:1px 7px 14px}.nav{gap:5px}.nav-title{font-size:10px;margin:15px 5px 3px}.nav-link{font-size:12px;padding:9px 7px}.nav button.sub,.nav-link.sub{padding-left:7px}.content{padding:21px 10px 35px}.content-inner>p:first-child{font-size:9px}.content-inner>p:nth-of-type(2){align-items:flex-start;flex-direction:column;margin:18px 0 20px}h1{font-size:37px;margin-top:12px}.view>h2{font-size:29px}.view>section>h2,.chart-card h2{font-size:23px}.tiles{gap:9px;margin:20px 0 14px}.site-tile{min-height:105px;padding:15px 12px;border-radius:16px}.site-tile .num{font-size:31px}.site-tile .label{font-size:9px;letter-spacing:.08em}.chart-card{padding:18px 12px 13px}.chart-wrap{height:220px}section{border-radius:18px;padding:15px 12px;margin-bottom:11px}.source-filters{padding:11px}.map-canvas{height:290px}.profile-window{padding:17px 13px}.profile-modal{width:calc(100vw - 18px);max-height:calc(100vh - 18px)}}
.dashboard-controls{display:flex;align-items:center;gap:11px;margin:20px 0 28px;color:var(--muted)}.dashboard-controls label{display:flex;align-items:center;gap:8px;color:#6b505a;font-size:13px;font-weight:700}.dashboard-controls select{border-radius:999px;padding:9px 30px 9px 14px;background:#fffdf9;border-color:#e6d0d2;box-shadow:0 5px 13px #7a4e570d}@media(max-width:620px){.dashboard-controls{align-items:flex-start;flex-direction:column;margin:18px 0 20px}}
.mobile-nav-toggle{display:none}@media(max-width:800px){.layout{display:block}.sidebar{width:100%;height:auto;position:relative;padding:17px 13px;border-right:0;border-bottom:1px solid #e6d5d1;background:linear-gradient(135deg,#fffefa,#fff2eb)}.sidebar:before{padding-left:56px;padding-right:0;font-size:clamp(18px,4.7vw,22px);line-height:1.2}.brand{margin:2px 8px 0 64px;font-size:9px}.mobile-nav-toggle{display:flex;position:absolute;left:13px;right:auto;top:18px;width:43px;height:39px;align-items:center;justify-content:center;flex-direction:column;gap:5px;padding:0;border-radius:12px;border:1px solid #dfc8cb;background:#fffdfa;box-shadow:0 5px 14px #69454f1f}.mobile-nav-toggle span{display:block;width:19px;height:2px;border-radius:2px;background:var(--wine);transition:transform .2s,opacity .2s}.sidebar:not(.mobile-menu-open) .search,.sidebar:not(.mobile-menu-open) .nav{display:none}.sidebar.mobile-menu-open{padding-bottom:14px}.sidebar.mobile-menu-open .search{display:block;margin-top:16px}.sidebar.mobile-menu-open .nav{display:block;margin-top:4px}.sidebar.mobile-menu-open .nav-title{display:block;margin:15px 7px 6px}.sidebar.mobile-menu-open .nav-link{display:block;width:100%;padding:11px 12px;font-size:14px}.sidebar.mobile-menu-open .nav-link.sub{padding-left:17px}.sidebar.mobile-menu-open .mobile-nav-toggle span:nth-child(1){transform:translateY(7px) rotate(45deg)}.sidebar.mobile-menu-open .mobile-nav-toggle span:nth-child(2){opacity:0}.sidebar.mobile-menu-open .mobile-nav-toggle span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}}
@media(max-width:800px){.content{padding:25px 13px 35px}.content-inner{min-width:0}.content h1{max-width:100%;font-size:clamp(27px,8.4vw,34px);line-height:1.06;letter-spacing:-.035em;white-space:normal;overflow-wrap:anywhere;word-break:normal}}
</style>
</head>
<body>
<div class="layout">
<aside class="sidebar"><button id="mobile-nav-toggle" class="mobile-nav-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false"><span></span><span></span><span></span></button><p class="brand">HAIRSTYLIST · ANALYTICS</p><input id="search" class="search" type="search" placeholder="Rechercher"><nav class="nav">
<a class="nav-link active" href="#dashboard" data-view="dashboard">▦ &nbsp; Tableau de bord</a><p class="nav-title">◉ &nbsp; Visiteurs</p><a class="nav-link sub" href="#sources" data-view="sources">Source de trafic</a><a class="nav-link sub" href="#pages" data-view="pages">Pages les plus consultées</a><a class="nav-link sub" href="#contacts" data-view="contacts">Contacts</a><a class="nav-link sub" href="#visitors" data-view="visitors">Journal des visites</a><a class="nav-link sub" href="#profiles" data-view="profiles">Profils visiteurs</a><a class="nav-link sub" href="#realtime" data-view="realtime">Carte en temps réel</a><a class="nav-link sub" href="#map" data-view="map">Carte des connexions</a><a class="nav-link sub" href="#devices" data-view="devices">Périphériques</a><a class="nav-link sub" href="#software" data-view="software">Logiciel</a><a class="nav-link sub" href="#hours" data-view="hours">Horaires</a></nav></aside>
<main class="content"><div class="content-inner"><h1>Stéphanie Hairstylist ANALYTICS</h1><div class="dashboard-controls"><label>Période <select id="days"><option value="1">Aujourd'hui</option><option value="7">7 jours</option><option value="14">14 jours</option><option value="30" selected>30 jours</option><option value="90">90 jours</option><option value="365">365 jours</option></select></label> <span id="status" class="muted">Chargement…</span></div>
<section id="view-dashboard" class="view active"><h2>Analyses Web</h2><p class="muted">Toutes les données réunies pour le site hairstylist-stephanie.com.</p><div class="tiles" id="site-tiles"></div><p class="muted" id="duration-note"></p><section class="chart-card"><h2>Évolution du site</h2><div id="traffic-chart" class="chart-wrap"></div><div class="chart-legend"><span><i class="legend-dot legend-pages"></i>Pages vues</span><span><i class="legend-dot legend-visits"></i>Visites</span><span><i class="legend-dot legend-actions"></i>Actions</span></div></section><section><h2>Historique du site</h2><p class="muted">Les données historiques sont intégrées directement aux analyses du site.</p><div id="historical"></div></section><section><h2>Évolution quotidienne</h2><div id="daily"></div></section></section>
<section id="view-sources" class="view"><h2>Source de trafic</h2><p class="muted">Choisissez la période à analyser. Les visites et pourcentages sont recalculés pour les seules dates sélectionnées.</p><div class="source-filters"><label>Afficher<select id="source-range"><option value="all">Total historique</option><option value="today">Aujourd’hui</option><option value="day">Un jour précis</option><option value="week">Une semaine</option><option value="last7">Les 7 derniers jours</option><option value="current-month">Le mois en cours</option><option value="month">Un mois précis</option><option value="custom">Une période personnalisée</option></select></label><label id="source-day-field" hidden>Journée<input id="source-date" type="date"></label><label id="source-week-field" hidden>Semaine<input id="source-week" type="week"></label><label id="source-month-field" hidden>Mois<input id="source-month" type="month"></label><label id="source-start-field" hidden>Du<input id="source-start" type="date"></label><label id="source-end-field" hidden>Au<input id="source-end" type="date"></label></div><p id="source-period-note" class="muted"></p><div id="source-traffic"></div></section>
<section id="view-pages" class="view"><h2>Pages les plus consultées</h2><p class="muted">Pages consultées sur la période choisie.</p><div id="pages"></div></section><section id="view-contacts" class="view"><h2>Contacts</h2><p class="muted">Clics vers les moyens de contact depuis le site : appel, SMS, WhatsApp et autres liens de contact.</p><div id="contacts"></div></section>
<section id="view-visitors" class="view"><h2>Journal des visites</h2><p class="muted">Chaque ligne correspond à une visite pseudonymisée. Cliquez pour afficher son parcours.</p><div id="visits"></div><div id="visit-detail" class="detail"></div></section><section id="view-profiles" class="view"><h2>Profils visiteurs</h2><p class="muted">Regroupement pseudonymisé des visites répétées après accord pour la mesure d’audience.</p><div id="profiles"></div><div id="profile-detail" class="detail"></div></section>
<section id="view-realtime" class="view"><h2>Carte en temps réel</h2><p class="muted">Visites actives au cours des 5 dernières minutes, localisées à l’échelle de la ville.</p><div id="live-map" class="map-canvas"></div><p class="map-note" id="live-map-note"></p><div id="realtime"></div></section><section id="view-map" class="view"><h2>Carte des connexions</h2><p class="muted">Choisissez une journée pour afficher les lieux de connexion situés en France.</p><div class="source-controls"><label for="map-day">Journée</label><select id="map-day"><option value="all">Toutes les journées</option></select></div><div id="history-map" class="map-canvas"></div><p class="map-note">Chaque point représente une ville française approximative ; il ne s’agit jamais d’une adresse précise.</p><div id="map-data"></div></section><section id="view-devices" class="view"><h2>Périphériques</h2><div id="devices"></div></section><section id="view-software" class="view"><h2>Logiciel</h2><div id="browsers"></div></section><section id="view-hours" class="view"><h2>Horaires</h2><div id="hours"></div></section>
<p class="muted">Les durées sont affichées en minutes et secondes. Les sessions sont une estimation technique.</p></div></main></div>
<dialog id="profile-modal" class="profile-modal" aria-labelledby="profile-modal-title"></dialog>
<script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const num=v=>Number(v||0).toLocaleString('fr-FR');const duration=v=>{let s=Math.max(0,Math.round(Number(v)||0));let m=Math.floor(s/60);s=s%60;return m?m+' min '+String(s).padStart(2,'0')+' s':s+' s'};const metricTile=(label,value,color,format=num)=>'<div class="site-tile '+color+'"><div class="num">'+esc(format(value))+'</div><div class="label">'+esc(label)+'</div></div>';const table=(rows,keys,fmt={})=>{if(!rows?.length)return '<p class="empty">Aucune donnée.</p>';return '<table><thead><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+keys.map(k=>'<td data-label="'+esc(k)+'">'+esc(fmt[k]?fmt[k](r[k],r):r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'};const reportTable=rows=>table(rows,['report_date','source','unique_visitors','visits','actions','pageviews','avg_duration_seconds','bounce_rate'],{source:()=> 'Site',avg_duration_seconds:duration,bounce_rate:v=>v+' %'});const visitStatus=r=>Number(r.immediate_departure)||Number(r.duration_seconds||0)<10?'Départ immédiat':'Visite engagée';const visitTable=rows=>{if(!rows?.length)return '<p class="empty">Aucune visite.</p>';return '<table><thead><tr><th>Début</th><th>Ville</th><th>Appareil</th><th>Navigateur</th><th>Pages</th><th>Durée</th><th>Statut</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td data-label="Début">'+esc(r.first_seen)+'</td><td data-label="Ville">'+esc(r.city)+'</td><td data-label="Appareil">'+esc(r.device)+' · '+esc(r.os)+'</td><td data-label="Navigateur">'+esc(r.browser)+'</td><td data-label="Pages">'+esc(r.pageviews)+'</td><td data-label="Durée">'+duration(r.duration_seconds)+'</td><td data-label="Statut">'+esc(visitStatus(r))+'</td><td data-label="Détail"><button data-session="'+esc(r.session_id)+'">Voir le détail</button></td></tr>').join('')+'</tbody></table>'};const importedTable=rows=>{if(!rows?.length)return '<p class="empty">Aucune visite importée.</p>';return '<table><thead><tr><th>Visite</th><th>Date</th><th>Ville</th><th>Appareil</th><th>Navigateur</th><th>Pages</th><th>Actions</th><th>Durée</th><th>Statut</th><th>Provenance</th></tr></thead><tbody>'+rows.map(r=>'<tr><td data-label="Visite">'+esc(r.visit_key)+'</td><td data-label="Date">'+esc(r.started_at)+'</td><td data-label="Ville">'+esc(r.city||'Inconnue')+'</td><td data-label="Appareil">'+esc(r.device||'Inconnu')+' · '+esc(r.os||'')+'</td><td data-label="Navigateur">'+esc(r.browser||'Inconnu')+'</td><td data-label="Pages">'+esc(r.pages?.length||r.pageviews||0)+'</td><td data-label="Actions">'+esc(r.actions)+'</td><td data-label="Durée">'+duration(r.duration_seconds)+'</td><td data-label="Statut">'+esc(visitStatus(r))+'</td><td data-label="Provenance">'+esc(r.referrer_name||r.referrer_type||'Direct')+'</td></tr>').join('')+'</tbody></table>'};const eventTable=rows=>table(rows,['created_at','event_type','page','contact_type','duration_ms'],{duration_ms:v=>duration(Number(v||0)/1000)});async function detail(id){const b=document.getElementById('visit-detail');b.innerHTML='<p class="muted">Chargement…</p>';const r=await fetch('/api/visits/'+encodeURIComponent(id));if(!r.ok){b.innerHTML='<p>Impossible de charger.</p>';return}const d=await r.json();b.innerHTML='<h3>Détail de la visite</h3>'+eventTable(d.events);b.scrollIntoView({behavior:'smooth',block:'nearest'})}
const profileTable=rows=>{if(!rows?.length)return '<p class="empty">Les profils apparaîtront ici après acceptation de la mesure d’audience.</p>';return '<table><thead><tr><th>Profil</th><th>Visites</th><th>Pages</th><th>Durée totale</th><th>Dernière visite</th><th>Appareil</th><th>Contacts</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td data-label="Profil">'+esc(r.profile_label||('Visiteur '+r.visitor_id.slice(0,8)))+'</td><td data-label="Visites">'+num(r.visits)+'</td><td data-label="Pages">'+num(r.pageviews)+'</td><td data-label="Durée totale">'+duration(r.duration_seconds)+'</td><td data-label="Dernière visite">'+esc(r.last_seen)+'</td><td data-label="Appareil">'+esc(r.device)+' · '+esc(r.os)+'</td><td data-label="Contacts">'+num(r.contact_clicks)+'</td><td data-label="Détail"><button data-profile="'+esc(r.visitor_id)+'">Ouvrir la fiche</button></td></tr>').join('')+'</tbody></table>'};
const profileModal=document.getElementById('profile-modal');
const contactLabel=value=>({telephone:'Appel téléphonique',sms:'SMS',whatsapp:'WhatsApp',email:'E-mail',instagram:'Instagram'})[value]||value||'';
const dateTime=value=>{const date=new Date(String(value||'').replace(' ','T')+'Z');return Number.isNaN(date.getTime())?String(value||'—'):date.toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'medium'})};
const profileVisits=events=>{const groups=new Map();for(const event of [...events].reverse()){const visit=groups.get(event.session_id)||{id:event.session_id,events:[],first:event.created_at,last:event.created_at,pages:[],duration:0,actions:0,source:event.source||event.referrer_host||'Accès direct'};visit.events.push(event);visit.last=event.created_at;if(event.event_type==='pageview')visit.pages.push(event.page);if(event.event_type==='page_exit')visit.duration+=Number(event.duration_ms||0)/1000;if(event.event_type==='contact_click')visit.actions++;if(event.source||event.referrer_host)visit.source=event.source||event.referrer_host;groups.set(event.session_id,visit)}return [...groups.values()].reverse()};
function renderProfileModal(data){const p=data.profile||{},visits=profileVisits(data.events||[]),latest=visits[0]||{};const location=[p.city,p.country].filter(Boolean).join(', ')||'Localisation indisponible';const pages=Number(p.pageviews||0),contacts=Number(p.contact_clicks||0),title=p.profile_label||'Profil visiteur';profileModal.innerHTML='<div class="profile-window"><button type="button" class="profile-close" data-close-profile>Fermer ×</button><div class="profile-top"><div class="profile-avatar" aria-hidden="true">◌</div><div><h2 id="profile-modal-title">'+esc(title)+'</h2><p class="profile-id">ID '+esc(data.visitor_id)+'</p><p class="muted">Profil pseudonymisé — aucune identité, adresse ou IP n’est affichée.</p></div></div><div class="profile-meta"><div><b>Localisation approximative</b>'+esc(location)+'</div><div><b>Appareil</b>'+esc(p.device||'Inconnu')+' · '+esc(p.os||'Inconnu')+'</div><div><b>Navigateur et écran</b>'+esc(p.browser||'Inconnu')+(p.screen?' · '+esc(p.screen):'')+'</div><div><b>Dernière provenance</b>'+esc(latest.source||p.source||'Accès direct')+'</div></div><h3>Résumé</h3><div class="profile-summary"><div><strong>'+num(p.visits)+'</strong>visites</div><div><strong>'+num(pages)+'</strong>pages vues</div><div><strong>'+duration(p.duration_seconds)+'</strong>temps total</div><div><strong>'+num(contacts)+'</strong>contact'+(contacts>1?'s':'')+'</div></div><div class="profile-meta"><div><b>Première visite</b>'+esc(dateTime(p.first_seen))+'</div><div><b>Dernière visite</b>'+esc(dateTime(p.last_seen))+'</div></div><h3>Historique des visites</h3>'+visits.map((visit,index)=>'<article class="visit-card"><header><h4>Visite #'+(visits.length-index)+'</h4><span>'+esc(dateTime(visit.first))+'</span></header><div class="visit-stats"><span>'+num(visit.pages.length)+' page'+(visit.pages.length>1?'s':'')+'</span><span>'+duration(visit.duration)+'</span><span>'+esc(visit.source||'Accès direct')+'</span>'+(visit.actions?'<span class="contact-action">'+num(visit.actions)+' action'+(visit.actions>1?'s':'')+' de contact</span>':'')+'</div><ul class="visit-path">'+visit.events.map(event=>event.event_type==='contact_click'?'<li class="contact-action">Contact : '+esc(contactLabel(event.contact_type))+'</li>':event.event_type==='pageview'?'<li>'+esc(event.page)+'</li>':'').filter(Boolean).join('')+'</ul></article>').join('')+'</div>';profileModal.querySelector('[data-close-profile]').addEventListener('click',()=>profileModal.close());}
async function profileDetail(id){profileModal.innerHTML='<div class="profile-window"><button type="button" class="profile-close" data-close-profile>Fermer ×</button><p class="muted">Chargement du profil…</p></div>';profileModal.querySelector('[data-close-profile]').addEventListener('click',()=>profileModal.close());if(!profileModal.open)profileModal.showModal();const response=await fetch('/api/profiles/'+encodeURIComponent(id));if(!response.ok){profileModal.innerHTML='<div class="profile-window"><button type="button" class="profile-close" data-close-profile>Fermer ×</button><p>Impossible de charger ce profil.</p></div>';profileModal.querySelector('[data-close-profile]').addEventListener('click',()=>profileModal.close());return}renderProfileModal(await response.json())}
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
  const point=({r,i},key,color,radius)=>{const text='Date : '+dateLabel(r.day)+' — Pages vues : '+Number(r.pageviews||0)+' — Visites : '+Number(r.visits||0)+' — Actions : '+Number(r.actions||0);return '<g class="chart-point" tabindex="0" role="img" data-date="'+r.day+'" data-pages="'+Number(r.pageviews||0)+'" data-visits="'+Number(r.visits||0)+'" data-actions="'+Number(r.actions||0)+'" aria-label="'+text+'"><title>'+text+'</title><circle class="chart-dot" style="fill:'+color+'" cx="'+x(i).toFixed(1)+'" cy="'+y(r[key]||0).toFixed(1)+'" r="'+radius+'"/></g>'};
  return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Évolution journalière des pages vues, visites et actions">'+[0,1,2,3,4].map(n=>{const value=Math.round(axisMax*n/4),py=y(value);return '<line class="chart-grid" x1="'+p+'" y1="'+py+'" x2="'+(w-p)+'" y2="'+py+'"/><text x="8" y="'+(py+4)+'" fill="#8a737c" font-size="12">'+value+'</text>'}).join('')+'<path class="chart-line" d="'+line('pageviews')+'"/><path class="chart-line" style="stroke:#e4587c" d="'+line('visits')+'"/><path class="chart-line" style="stroke:#b93c5f" d="'+line('actions')+'"/>'+present.flatMap(item=>[point(item,'pageviews','#d4af37',5),point(item,'visits','#e4587c',5),point(item,'actions','#b93c5f',5)]).join('')+labels+'</svg>'
}
function bindChartTooltip(){const host=document.getElementById('traffic-chart');host.querySelector('.chart-tooltip')?.remove();const tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.hidden=true;host.appendChild(tooltip);const show=(point,event)=>{const rect=host.getBoundingClientRect(),source=event?.clientX?{x:event.clientX,y:event.clientY}:(()=>{const r=point.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top}})();tooltip.innerHTML='<b>'+esc(point.dataset.date)+'</b><br>Pages vues : '+esc(point.dataset.pages)+'<br>Visites : '+esc(point.dataset.visits)+'<br>Actions : '+esc(point.dataset.actions);tooltip.hidden=false;tooltip.style.left=Math.max(8,Math.min(rect.width-174,source.x-rect.left+12))+'px';tooltip.style.top=Math.max(6,source.y-rect.top-92)+'px'};host.querySelectorAll('.chart-point').forEach(point=>{point.addEventListener('mouseenter',event=>show(point,event));point.addEventListener('mousemove',event=>show(point,event));point.addEventListener('mouseleave',()=>tooltip.hidden=true);point.addEventListener('focus',()=>show(point));point.addEventListener('blur',()=>tooltip.hidden=true);point.addEventListener('click',event=>show(point,event))})}
function aggregateImported(rows){const out={pages:new Map(),sources:new Map(),locations:new Map(),devices:new Map(),browsers:new Map()};const add=(m,k,n=1)=>{k=(k||'Inconnu').trim()||'Inconnu';m.set(k,(m.get(k)||0)+n)};for(const r of rows||[]){for(const page of (r.pages||[]))add(out.pages,page);add(out.sources,r.referrer_name||r.referrer_type||'Accès direct');add(out.locations,r.city||'Inconnue');add(out.devices,r.device||'Inconnu');add(out.browsers,r.browser||'Inconnu')}return out}const mapRows=m=>[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);const mergeRows=(base,extra)=>{const m=new Map((base||[]).map(r=>[r.label,Number(r.value||0)]));for(const r of extra||[])m.set(r.label,(m.get(r.label)||0)+Number(r.value||0));return mapRows(m)};
function activate(v,updateHash=true){const target=document.getElementById('view-'+v)?v:'dashboard';document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+target));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===target));if(updateHash)history.replaceState(null,'','#'+target)}document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.view)));activate(location.hash.slice(1),false);window.addEventListener('hashchange',()=>activate(location.hash.slice(1),false));
async function load(){const s=document.getElementById('status');s.textContent='Actualisation…';try{const selectedDays=document.getElementById('days').value;const r=await fetch('/api/stats?days='+selectedDays);if(!r.ok)throw Error();const d=await r.json(),t=d.totals||{},site=d.siteTotals||t;document.getElementById('site-tiles').innerHTML=[['Pages vues',site.pageviews,'site-blue',num],['Visites',site.visits,'site-green',num],['Actions',site.actions,'site-pink',num],['Contacts',site.contact_clicks,'site-gold',num],['Départs immédiats',site.immediate_departures,'site-gold',num],['Durée moyenne',site.avg_duration_seconds,'site-mauve',duration]].map(x=>metricTile(x[0],x[1],x[2],x[3])).join('');const engaged=Number(site.engaged_visits)||0;document.getElementById('duration-note').textContent=engaged?'Durée moyenne calculée sur '+num(engaged)+' visite'+(engaged>1?'s':'')+' engagée'+(engaged>1?'s':'')+' (au moins 10 secondes sur le site).':'La durée moyenne apparaîtra après une première visite d’au moins 10 secondes.';document.getElementById('traffic-chart').innerHTML=chartSvg(d.siteDaily);bindChartTooltip();document.getElementById('historical').innerHTML=reportTable(d.historical);document.getElementById('daily').innerHTML=table(d.siteDaily,['day','visits','pageviews','actions']);let liveVisits=[];const vr=await fetch('/api/visits?days='+selectedDays);if(vr.ok){const vd=await vr.json();liveVisits=vd.visits||[];document.getElementById('visits').innerHTML=visitTable(liveVisits);document.querySelectorAll('[data-session]').forEach(b=>b.addEventListener('click',()=>detail(b.dataset.session)))}const profileResponse=await fetch('/api/profiles?days='+selectedDays);if(profileResponse.ok){const profileData=await profileResponse.json();document.getElementById('profiles').innerHTML=profileTable(profileData.profiles||[]);document.querySelectorAll('[data-profile]').forEach(button=>button.addEventListener('click',()=>profileDetail(button.dataset.profile)))}const ir=await fetch('/api/imported-visits');let imported=[];if(ir.ok){const iv=await ir.json();imported=iv.visits||[];if(!liveVisits.length)document.getElementById('visits').innerHTML=importedTable(imported)}const a=aggregateImported(imported);const pages=mergeRows(d.pages,mapRows(a.pages)),devices=mergeRows(d.devices,mapRows(a.devices)),browsers=mergeRows(d.browsers,mapRows(a.browsers)),contactNames={telephone:'Appel téléphonique',sms:'SMS',whatsapp:'WhatsApp',email:'E-mail',instagram:'Instagram',inconnu:'Autre'};document.getElementById('pages').innerHTML=table(pages,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('contacts').innerHTML=table(d.contacts,['Type de contact','Clics'],{'Type de contact':(_,row)=>contactNames[row.label]||row.label,Clics:(_,row)=>num(row.value)});document.getElementById('devices').innerHTML=table(devices,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('browsers').innerHTML=table(browsers,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('realtime').innerHTML=table(d.realtime,['label','value'],{label:v=>v,value:v=>num(v)});document.getElementById('hours').innerHTML=table(d.siteDaily,['day','visits','pageviews'],{visits:v=>num(v),pageviews:v=>num(v)});s.textContent='Actualisé à '+new Date().toLocaleTimeString('fr-FR')}catch(e){s.textContent='Accès aux données impossible'}}document.getElementById('days').addEventListener('change',load);document.getElementById('search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('[data-view]').forEach(b=>b.style.display=!q||b.textContent.toLowerCase().includes(q)?'block':'none')});load();setInterval(load,60000);
const cityCoordinates={"Lyon":[45.764,4.8357],"Clermont-Ferrand":[45.7772,3.087],"Andrézieux-Bouthéon":[45.526,4.268],"Sury-le-Comtal":[45.538,4.184],"Shanghai":[31.2304,121.4737],"Saint-Etienne":[45.4397,4.3872],"Mâcon":[46.3069,4.8287],"Nantes":[47.2184,-1.5536],"Villeurbanne":[45.7719,4.8902],"Saint-Cyr-les-Vignes":[45.612,4.297],"Roanne":[46.036,4.068],"Saint-Marcellin-en-Forez":[45.499,4.17],"Marseille":[43.2965,5.3698],"Aix-les-Bains":[45.6885,5.9156],"Chalon-sur-Saône":[46.7833,4.853],"La Voulte-sur-Rhône":[44.799,4.78],"Pézenas":[43.461,3.424],"Le Haillan":[44.872,-0.678],"Saint-Galmier":[45.591,4.317],"Peillonnex":[46.129,6.382],"Saint-Martin-d'Hères":[45.18,5.756],"Grenoble":[45.1885,5.7245]};
let analyticsState={stats:null,live:[],imported:[]};const mapStates={};
const dayOf=r=>String(r.started_at||r.first_seen||'').slice(0,10);const trafficReferenceEnd='2026-10-27';const trafficReference=new Map([['Facebook',52],['Google',30],['Direct',26],['Instagram',9],['Autres sources',2]]);const canonicalSource=row=>{const raw=String(row.source||row.referrer_host||row.referrer_name||row.referrer_type||'').trim();let value=raw.toLowerCase();if(value.startsWith('https://'))value=value.slice(8);if(value.startsWith('http://'))value=value.slice(7);if(value.startsWith('www.'))value=value.slice(4);value=value.split('/')[0];if(value.includes('facebook')||value.includes('fb.com'))return 'Facebook';if(value.includes('google'))return 'Google';if(value.includes('instagram')||value==='ig'||value.endsWith('.ig'))return 'Instagram';if(value.includes('hairstylist-stephanie.com'))return 'Direct';if(!value||value.includes('direct')||value.includes('inconnu')||value.includes('unknown'))return 'Direct';return raw||'Autres sources'};const percentage=v=>Number(v||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' %';const isoDay=date=>date.toISOString().slice(0,10);const shiftDay=(day,offset)=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return isoDay(date)};const localToday=()=>isoDay(new Date());
function trackedTraffic(){return analyticsState.live.filter(row=>dayOf(row)>trafficReferenceEnd)}
function isoWeekBounds(value){const match=/^(\\d{4})-W(\\d{2})$/.exec(value||'');if(!match)return null;const year=Number(match[1]),week=Number(match[2]),jan4=new Date(Date.UTC(year,0,4)),offset=(jan4.getUTCDay()+6)%7,start=new Date(jan4);start.setUTCDate(jan4.getUTCDate()-offset+(week-1)*7);return{start:isoDay(start),end:shiftDay(isoDay(start),6)}}
function isoWeekValue(day){const date=new Date(day+'T00:00:00Z'),target=new Date(date.valueOf());target.setUTCDate(target.getUTCDate()+3-((target.getUTCDay()+6)%7));const firstThursday=new Date(Date.UTC(target.getUTCFullYear(),0,4));const week=1+Math.round(((target-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7))/7);return target.getUTCFullYear()+'-W'+String(week).padStart(2,'0')}
function endOfMonth(month){const match=/^(\\d{4})-(\\d{2})$/.exec(month||'');if(!match)return null;return isoDay(new Date(Date.UTC(Number(match[1]),Number(match[2]),0)))}
function sourceFilter(){const mode=document.getElementById('source-range').value,today=localToday();if(mode==='all')return{all:true,label:'Total historique'};if(mode==='today')return{start:today,end:today,label:'Aujourd’hui'};if(mode==='last7')return{start:shiftDay(today,-6),end:today,label:'Les 7 derniers jours'};if(mode==='day'){const day=document.getElementById('source-date').value||today;return{start:day,end:day,label:'Le '+new Date(day+'T00:00:00').toLocaleDateString('fr-FR',{dateStyle:'long'})}}if(mode==='week'){const bounds=isoWeekBounds(document.getElementById('source-week').value);return bounds?{...bounds,label:'Du '+new Date(bounds.start+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long'})+' au '+new Date(bounds.end+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}:{start:today,end:today,label:'Semaine sélectionnée'}}if(mode==='month'||mode==='current-month'){const month=mode==='month'?document.getElementById('source-month').value:today.slice(0,7),end=endOfMonth(month);return end?{start:month+'-01',end,label:new Date(month+'-01T00:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}:{start:today,end:today,label:'Mois sélectionné'}}const start=document.getElementById('source-start').value||today,end=document.getElementById('source-end').value||today;return start<=end?{start,end,label:'Du '+new Date(start+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})+' au '+new Date(end+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}:{start:end,end:start,label:'Période personnalisée'}}
function sourceRows(filter){const values=new Map(filter.all?trafficReference:[]);if(filter.all){for(const row of trackedTraffic()){const label=canonicalSource(row);values.set(label,(values.get(label)||0)+1)}return mapRows(values)}for(const row of [...analyticsState.imported,...trackedTraffic()]){const day=dayOf(row);if(day>=filter.start&&day<=filter.end){const label=canonicalSource(row);values.set(label,(values.get(label)||0)+1)}}return mapRows(values)}
function sourceTable(rows){const total=rows.reduce((sum,row)=>sum+Number(row.value||0),0);if(!total)return '<p class="empty">Aucune visite pour cette journée.</p>';return '<table><thead><tr><th>Source</th><th>Visites</th><th>Pourcentage</th></tr></thead><tbody>'+rows.map(row=>'<tr><td data-label="Source">'+esc(row.label)+'</td><td data-label="Visites">'+num(row.value)+'</td><td data-label="Pourcentage">'+percentage(Number(row.value||0)*100/total)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Total</th><th>'+num(total)+'</th><th>100,00 %</th></tr></tfoot></table>'}
function availableDays(){return [...new Set([...analyticsState.imported,...analyticsState.live].map(dayOf).filter(Boolean))].sort().reverse()}
function populateDaySelect(id,days=availableDays()){const select=document.getElementById(id),selected=select.value||'all';select.innerHTML='<option value="all">Toutes les journées</option>'+days.map(day=>'<option value="'+day+'">'+day+'</option>').join('');select.value=[...select.options].some(o=>o.value===selected)?selected:'all'}
function updateSourceFields(){const mode=document.getElementById('source-range').value,fields={day:'source-day-field',week:'source-week-field',month:'source-month-field',custom:'source-start-field'};for(const id of ['source-day-field','source-week-field','source-month-field','source-start-field','source-end-field'])document.getElementById(id).hidden=true;if(fields[mode])document.getElementById(fields[mode]).hidden=false;if(mode==='custom')document.getElementById('source-end-field').hidden=false}
function renderSources(){const filter=sourceFilter();document.getElementById('source-traffic').innerHTML=sourceTable(sourceRows(filter));document.getElementById('source-period-note').textContent=filter.all?'Le total historique reprend la synthèse de référence et les nouvelles visites enregistrées depuis le 28 octobre 2026.':'Période sélectionnée : '+filter.label+'. Les pourcentages sont calculés sur 100 % des visites de cette période.'}
function groupedPoints(rows){const groups=new Map();for(const row of rows){const city=(row.city||'').trim(),point=cityCoordinates[city];if(!point)continue;const item=groups.get(city)||{city,point,count:0};item.count++;groups.set(city,item)}return [...groups.values()]}
function drawMap(id,rows){const host=document.getElementById(id);if(!host)return;if(!window.maplibregl){host.innerHTML='<p class="empty">La carte ne peut pas être chargée.</p>';return}let state=mapStates[id];const paint=()=>{if(!state||!state.ready)return;state.markers.forEach(marker=>marker.remove());state.markers=[];const points=groupedPoints(state.rows);if(!points.length){state.map.jumpTo({center:[4.35,45.55],zoom:8});return}const bounds=new maplibregl.LngLatBounds();for(const item of points){const dot=document.createElement('button');dot.type='button';dot.className='analytics-map-dot';dot.style.width=(14+Math.min(item.count,6)*2)+'px';dot.style.height=dot.style.width;dot.setAttribute('aria-label',item.city);const popup=new maplibregl.Popup({offset:16}).setHTML('<strong>'+esc(item.city)+'</strong><br>'+item.count+' visite'+(item.count>1?'s':'')+' à l’échelle de la ville');state.markers.push(new maplibregl.Marker({element:dot,anchor:'center'}).setLngLat([item.point[1],item.point[0]]).setPopup(popup).addTo(state.map));bounds.extend([item.point[1],item.point[0]])}state.map.fitBounds(bounds,{padding:50,maxZoom:9,duration:0})};if(!state){host.innerHTML='';const map=new maplibregl.Map({container:host,style:'https://tiles.openfreemap.org/styles/liberty',center:[4.35,45.55],zoom:8,attributionControl:true});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');state=mapStates[id]={map,markers:[],rows,ready:false};map.on('load',()=>{state.ready=true;paint()});map.on('error',()=>{if(!state.ready)host.innerHTML='<p class="empty">Le fond de carte est momentanément indisponible.</p>'})}else{state.rows=rows;paint()}}
const isFrance=row=>['fr','france'].includes(String(row.country||'').trim().toLowerCase());const adminMapCities=new Set(['lyon','clermont-ferrand']);const mapEligible=row=>isFrance(row)&&!adminMapCities.has(String(row.city||'').trim().toLowerCase());
function renderMaps(){const day=document.getElementById('map-day').value,all=[...analyticsState.imported,...analyticsState.live],history=(day==='all'?all:all.filter(r=>dayOf(r)===day)).filter(mapEligible);drawMap('history-map',history);const now=Date.now(),active=analyticsState.live.filter(r=>Date.parse(r.last_seen||r.first_seen||0)>=now-300000).filter(mapEligible);drawMap('live-map',active);document.getElementById('live-map-note').textContent=active.length?active.length+' visite'+(active.length>1?'s actives':' active')+' au cours des 5 dernières minutes.':'Aucune visite active au cours des 5 dernières minutes.';const cities=mapRows(history.reduce((m,r)=>{const city=r.city||'Inconnue';m.set(city,(m.get(city)||0)+1);return m},new Map()));document.getElementById('map-data').innerHTML=table(cities,['label','value'],{label:v=>v,value:v=>num(v)})}
async function enhanceDashboard(){try{const days=document.getElementById('days').value;const [statsResponse,liveResponse,importedResponse]=await Promise.all([fetch('/api/stats?days='+days),fetch('/api/visits?days=395'),fetch('/api/imported-visits')]);if(!statsResponse.ok||!liveResponse.ok||!importedResponse.ok)throw Error();analyticsState={stats:await statsResponse.json(),live:(await liveResponse.json()).visits||[],imported:(await importedResponse.json()).visits||[]};populateDaySelect('map-day');updateSourceFields();renderSources();renderMaps()}catch(_){document.getElementById('source-traffic').innerHTML='<p class="empty">Données indisponibles.</p>'}}
const sourceToday=localToday();document.getElementById('source-date').value=sourceToday;document.getElementById('source-week').value=isoWeekValue(sourceToday);document.getElementById('source-month').value=sourceToday.slice(0,7);document.getElementById('source-start').value=sourceToday;document.getElementById('source-end').value=sourceToday;document.getElementById('source-range').addEventListener('change',()=>{updateSourceFields();renderSources()});['source-date','source-week','source-month','source-start','source-end'].forEach(id=>document.getElementById(id).addEventListener('change',renderSources));document.getElementById('map-day').addEventListener('change',renderMaps);document.querySelectorAll('[data-view]').forEach(link=>link.addEventListener('click',()=>setTimeout(renderMaps,0)));document.getElementById('days').addEventListener('change',enhanceDashboard);enhanceDashboard();setInterval(enhanceDashboard,60000);
</script>
<script>
(() => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.getElementById('mobile-nav-toggle');
  if (!sidebar || !toggle) return;
  const closeMenu = () => {
    sidebar.classList.remove('mobile-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
  };
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('mobile-menu-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', closeMenu));
})();
</script>
<script>
/* Présentation uniforme des dates : aucun changement des données. */
(() => {
  const formatDate = value => {
    const date = new Date(String(value).replace(/Z+$/, 'Z'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
  };
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z+$/;
  let pending = false;
  const renderDates = () => {
    pending = false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (iso.test(node.nodeValue.trim())) nodes.push(node);
    }
    nodes.forEach(node => { node.nodeValue = formatDate(node.nodeValue.trim()); });
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(renderDates);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
</script>
</body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/collect' && request.method === 'OPTIONS') return new Response(null, { status: originAllowed(request, env) ? 204 : 403, headers: { ...BASE, ...cors(env) } });
    if (url.pathname === '/collect' && request.method === 'POST') return collect(request, env);
    if (!secure(request)) return json({ error: 'HTTPS requis' }, 403);
    if (url.pathname === '/admin' || url.pathname === '/api/stats' || url.pathname === '/api/visits' || url.pathname.startsWith('/api/visits/') || url.pathname === '/api/profiles' || url.pathname.startsWith('/api/profiles/') || url.pathname === '/api/imported-visits') {
      if (!await sameSecret(request, env)) return unauthorized();
      if (url.pathname === '/admin') return new Response(dashboard, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; font-src data: https://tiles.openfreemap.org; worker-src blob:; base-uri 'none'; frame-ancestors 'none'" } });
      if (url.pathname === '/api/visits') return visits(request, env);
      if (url.pathname.startsWith('/api/visits/')) return visitDetail(request, env, decodeURIComponent(url.pathname.slice('/api/visits/'.length)));
      if (url.pathname === '/api/profiles') return profiles(request, env);
      if (url.pathname.startsWith('/api/profiles/')) return profileDetail(request, env, decodeURIComponent(url.pathname.slice('/api/profiles/'.length)));
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
