// Independent privacy-conscious analytics backend. Cloudflare Workers + D1.
const HEADERS = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...HEADERS,...extra,'Content-Type':'application/json; charset=utf-8'}});
const clean=(v,max=200)=>typeof v==='string'?v.slice(0,max):'';
const validSession=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
const isSameOrigin=(req,env)=>req.headers.get('Origin')===env.ALLOWED_ORIGIN;
const cors=env=>({'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});
function category(ua){
 ua=(ua||'').toLowerCase();
 return /tablet|ipad/.test(ua)?'Tablette':/mobi|android|iphone/.test(ua)?'Mobile':'Ordinateur';
}
function browser(ua){
 ua=(ua||'').toLowerCase();
 return /edg\//.test(ua)?'Edge':/firefox\//.test(ua)?'Firefox':/chrome\//.test(ua)?'Chrome':/safari\//.test(ua)?'Safari':'Autre';
}
async function auth(req,env){
 const h=req.headers.get('Authorization')||'';
 if(!h.startsWith('Basic ')||!env.ADMIN_USER||!env.ADMIN_PASSWORD)return false;
 let user='',pass='';
 try{const decoded=atob(h.slice(6));const i=decoded.indexOf(':');user=decoded.slice(0,i);pass=decoded.slice(i+1);}catch{return false;}
 const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(user+'\n'+pass),digest(env.ADMIN_USER+'\n'+env.ADMIN_PASSWORD)]);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
function secure(req,env){return req.url.startsWith('https://')||new URL(req.url).hostname==='localhost';}
const unauth=()=>new Response('Connexion requise',{status:401,headers:{...HEADERS,'WWW-Authenticate':'Basic realm="Stephanie Analytics"'}});
async function collect(req,env){
 if(!isSameOrigin(req,env))return json({error:'Origin refuse'},403);
 const type=req.headers.get('Content-Type')||'';
 if(!type.includes('application/json')&& !type.includes('text/plain'))return json({error:'Format incorrect'},415,cors(env));
 if(Number(req.headers.get('Content-Length')||0)>4096)return json({error:'Trop volumineux'},413,cors(env));
 let body;try{body=await req.json()}catch{return json({error:'JSON invalide'},400,cors(env))}
 if(!validSession(body.session)||!['pageview','contact_click'].includes(body.type))return json({error:'Evenement invalide'},400,cors(env));
 const page=clean(body.page,180);
 if(!page.startsWith('/')||page.startsWith('//'))return json({error:'Page invalide'},400,cors(env));
 const row={
 session:body.session,type:body.type,page,
 ref:clean(body.referrer,150),source:clean(body.source,80),medium:clean(body.medium,80),
 campaign:clean(body.campaign,100),device:category(req.headers.get('User-Agent')),
 browser:browser(req.headers.get('User-Agent')),language:clean(req.headers.get('Accept-Language'),10),
 contact:body.type==='contact_click'&&['telephone','whatsapp','email'].includes(body.contact)?body.contact:null
 };
 await env.DB.prepare('INSERT INTO events (session_id,event_type,page,referrer_host,source,medium,campaign,device,browser,language,contact_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
 .bind(row.session,row.type,row.page,row.ref,row.source,row.medium,row.campaign,row.device,row.browser,row.language,row.contact).run();
 return json({ok:true},202,cors(env));
}
async function stats(req,env){
 const u=new URL(req.url);const days=Math.max(1,Math.min(90,Number.parseInt(u.searchParams.get('days')||'7',10)||7));
 const since=new Date(Date.now()-(days-1)*86400000).toISOString().slice(0,10);
 const q=async(sql,params=[])=> (await env.DB.prepare(sql).bind(...params).all()).results;
 const [totals,daily,pages,referrers,devices,browsers,contacts]=await Promise.all([
 q("SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, SUM(event_type='pageview') AS pageviews, SUM(event_type='contact_click') AS contact_clicks FROM events WHERE day>=?",[since]),
 q("SELECT day, COUNT(DISTINCT session_id) AS sessions, SUM(event_type='pageview') AS pageviews, SUM(event_type='contact_click') AS contact_clicks FROM events WHERE day>=? GROUP BY day ORDER BY day",[since]),
 q("SELECT page AS label, COUNT(*) AS value FROM events WHERE day>=? AND event_type='pageview' GROUP BY page ORDER BY value DESC LIMIT 30",[since]),
 q("SELECT COALESCE(NULLIF(source,''),NULLIF(referrer_host,''),'Accès direct / inconnu') AS label, COUNT(DISTINCT session_id) AS value FROM events WHERE day>=? GROUP BY label ORDER BY value DESC LIMIT 20",[since]),
 q("SELECT device AS label, COUNT(DISTINCT session_id) AS value FROM events WHERE day>=? GROUP BY device ORDER BY value DESC",[since]),
 q("SELECT browser AS label, COUNT(DISTINCT session_id) AS value FROM events WHERE day>=? GROUP BY browser ORDER BY value DESC",[since]),
 q("SELECT contact_type AS label, COUNT(*) AS value FROM events WHERE day>=? AND event_type='contact_click' GROUP BY contact_type ORDER BY value DESC",[since])
 ]);
 return json({days,totals:totals[0]||{},daily,pages,referrers,devices,browsers,contacts});
}
const dashboard=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Stéphanie Analytics</title><style>
body{font:15px system-ui;background:#faf6f7;color:#4c3740;margin:0}main{max-width:1050px;margin:35px auto;padding:0 18px}h1{font-size:29px}.muted{color:#8a737c}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}.tile,section{background:#fff;border:1px solid #e9dce1;border-radius:16px;padding:18px;margin-bottom:16px}.num{font-size:30px;color:#9d637b;margin-top:10px}select{padding:9px;border-radius:8px;border:1px solid #ddc8d0}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px;border-bottom:1px solid #f0e5e9}th{color:#7d6670}section{overflow:auto}
</style></head><body><main><p class="muted">STÉPHANIE HAIRSTYLIST · ESPACE PRIVÉ</p><h1>Statistiques indépendantes</h1><p><label>Période <select id="days"><option value="1">Aujourd'hui</option><option value="7" selected>7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></label></p><p id="status" class="muted">Chargement…</p><div class="tiles" id="tiles"></div><section><h2>Évolution quotidienne</h2><div id="daily"></div></section><section><h2>Pages consultées</h2><div id="pages"></div></section><section><h2>Sources de trafic</h2><div id="referrers"></div></section><section><h2>Appareils</h2><div id="devices"></div></section><section><h2>Navigateurs</h2><div id="browsers"></div></section><section><h2>Contacts</h2><div id="contacts"></div></section><p class="muted">Les sessions sont des estimations, pas des personnes identifiées. Aucune donnée antérieure à l'installation n'est disponible.</p></main><script>
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function table(rows,keys){if(!rows?.length)return '<p>Aucune donnée.</p>';return '<table><thead><tr>'+keys.map(k=>'<th>'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+keys.map(k=>'<td>'+esc(r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
async function load(){document.getElementById('status').textContent='Chargement…';try{const r=await fetch('/api/stats?days='+document.getElementById('days').value);if(!r.ok)throw Error('Accès aux données impossible');const d=await r.json();document.getElementById('tiles').innerHTML=[['Sessions',d.totals.sessions],['Pages vues',d.totals.pageviews],['Clics de contact',d.totals.contact_clicks],['Événements',d.totals.events]].map(([n,v])=>'<div class="tile"><span class="muted">'+n+'</span><div class="num">'+(v||0)+'</div></div>').join('');document.getElementById('daily').innerHTML=table(d.daily,['day','sessions','pageviews','contact_clicks']);for(const k of ['pages','referrers','devices','browsers','contacts'])document.getElementById(k).innerHTML=table(d[k],['label','value']);document.getElementById('status').textContent='Actualisé à '+new Date().toLocaleTimeString('fr-FR')}catch(e){document.getElementById('status').textContent=e.message}}
document.getElementById('days').addEventListener('change',load);load();
</script></body></html>`;
export default {async fetch(req,env){
 const url=new URL(req.url);
 if(url.pathname==='/collect'&&req.method==='OPTIONS'){
  return new Response(null,{status:isSameOrigin(req,env)?204:403,headers:{...HEADERS,...cors(env)}});
 }
 if(url.pathname==='/collect'&&req.method==='POST')return collect(req,env);
 if(!secure(req,env))return json({error:'HTTPS requis'},403);
 if(url.pathname==='/admin'||url.pathname==='/api/stats'){
  if(!await auth(req,env))return unauth();
  if(url.pathname==='/admin')return new Response(dashboard,{headers:{...HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  return stats(req,env);
 }
 return json({service:'Stephanie Analytics',status:'ok'});
}};
