// Stéphanie Analytics — Cloudflare Worker + D1, privacy-first and independent of Matomo.
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
  const row = [
    body.session, body.type, page, clean(body.referrer, 150), clean(body.source, 80), clean(body.medium, 80), clean(body.campaign, 100),
    device(request.headers.get('User-Agent') || ''), browser(request.headers.get('User-Agent') || ''), clean(request.headers.get('Accept-Language'), 10),
    body.type === 'contact_click' && ['telephone', 'whatsapp', 'email', 'instagram'].includes(body.contact) ? body.contact : null, duration
  ];
  await env.DB.prepare(`INSERT INTO events (session_id,event_type,page,referrer_host,source,medium,campaign,device,browser,language,contact_type,duration_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...row).run();
  return json({ ok: true }, 202, cors(env));
}

async function stats(request, env) {
  const url = new URL(request.url); const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '7', 10) || 7));
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const query = async (sql, params = []) => (await env.DB.prepare(sql).bind(...params).all()).results;
  const [totals, daily, pages, sources, devices, browsers, contacts, entries, exits, realtime, recent] = await Promise.all([
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
    query(`SELECT page label, COUNT(DISTINCT session_id) value FROM events WHERE event_type='pageview' AND created_at>=datetime('now','-5 minutes') GROUP BY page ORDER BY value DESC`, []),
    query(`SELECT created_at, event_type, page, device, contact_type FROM events ORDER BY id DESC LIMIT 25`, [])
  ]);
  const bounce = totals[0]?.sessions ? Math.round((Number(totals[0].sessions_without_exit || 0) / Number(totals[0].sessions)) * 100) : 0;
  return json({ days, since, totals: { ...(totals[0] || {}), bounce_rate: bounce }, daily, pages, sources, devices, browsers, contacts, entries, exits, realtime, recent });
}

const dashboard = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Stéphanie Analytics</title><style>
:root{--rose:#9d637b;--ink:#4c3740;--line:#eadce2;--bg:#faf6f7}*{box-sizing:border-box}body{font:15px system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);margin:0}main{max-width:1180px;margin:30px auto;padding:0 18px}h1{font-size:30px;margin:4px 0}.muted{color:#8a737c}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}.tile,section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 4px 18px #7047580c}.num{font-size:28px;color:var(--rose);margin-top:7px;font-weight:650}select{padding:9px;border-radius:8px;border:1px solid #ddc8d0;background:#fff}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #f0e5e9}th{color:#7d6670}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}section{overflow:auto}@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style></head><body><main><p class="muted">STÉPHANIE HAIRSTYLIST · ESPACE PRIVÉ</p><h1>Stéphanie Analytics</h1><p class="muted">Mesure sans cookie, sans IP et sans identification nominative.</p><p><label>Période <select id="days"><option value="1">Aujourd'hui</option><option value="7" selected>7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">365 jours</option></select></label> <span id="status" class="muted">Chargement…</span></p><div class="tiles" id="tiles"></div><section><h2>Évolution quotidienne</h2><div id="daily"></div></section><div class="grid"><section><h2>Pages consultées</h2><div id="pages"></div></section><section><h2>Sources de trafic</h2><div id="sources"></div></section><section><h2>Pages d'entrée</h2><div id="entries"></div></section><section><h2>Pages de sortie</h2><div id="exits"></div></section><section><h2>Appareils</h2><div id="devices"></div></section><section><h2>Navigateurs</h2><div id="browsers"></div></section><section><h2>Contacts mesurés</h2><div id="contacts"></div></section><section><h2>Actifs dans les 5 dernières minutes</h2><div id="realtime"></div></section></div><section><h2>Événements récents</h2><div id="recent"></div></section><p class="muted">Les sessions sont une estimation technique et ne représentent pas nécessairement des personnes. Un clic téléphone ne prouve pas qu'un appel a été effectué.</p></main><script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function table(rows,keys){if(!rows?.length)return '<p>Aucune donnée.</p>';return '<table><thead><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}function n(v){return Number(v||0).toLocaleString('fr-FR')}async function load(){const status=document.getElementById('status');status.textContent='Actualisation…';try{const r=await fetch('/api/stats?days='+document.getElementById('days').value);if(!r.ok)throw Error('Accès aux données impossible');const d=await r.json(),t=d.totals||{};document.getElementById('tiles').innerHTML=[['Sessions',n(t.sessions)],['Pages vues',n(t.pageviews)],['Contacts',n(t.contact_clicks)],['Durée moyenne',(t.avg_duration_seconds||0)+' s'],['Rebond estimé',(t.bounce_rate||0)+' %'],['Actifs maintenant',n((d.realtime||[]).reduce((a,x)=>a+Number(x.value||0),0))]].map(([a,b])=>'<div class="tile"><span class="muted">'+a+'</span><div class="num">'+b+'</div></div>').join('');document.getElementById('daily').innerHTML=table(d.daily,['day','sessions','pageviews','contact_clicks']);for(const k of ['pages','sources','entries','exits','devices','browsers','contacts','realtime'])document.getElementById(k).innerHTML=table(d[k],['label','value']);document.getElementById('recent').innerHTML=table(d.recent,['created_at','event_type','page','device','contact_type']);status.textContent='Actualisé à '+new Date().toLocaleTimeString('fr-FR')}catch(e){status.textContent=e.message}}document.getElementById('days').addEventListener('change',load);load();setInterval(load,60000);
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/collect' && request.method === 'OPTIONS') return new Response(null, { status: originAllowed(request, env) ? 204 : 403, headers: { ...BASE, ...cors(env) } });
    if (url.pathname === '/collect' && request.method === 'POST') return collect(request, env);
    if (!secure(request)) return json({ error: 'HTTPS requis' }, 403);
    if (url.pathname === '/admin' || url.pathname === '/api/stats') {
      if (!await sameSecret(request, env)) return unauthorized();
      if (url.pathname === '/admin') return new Response(dashboard, { headers: { ...BASE, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
      return stats(request, env);
    }
    return json({ service: 'Stephanie Analytics', status: 'ok' });
  },
  async scheduled(_event, env) {
    const retention = Math.max(90, Math.min(730, Number(env.RETENTION_DAYS || 395)));
    await env.DB.prepare("DELETE FROM events WHERE created_at < datetime('now', ?)").bind(`-${retention} days`).run();
  }
};
