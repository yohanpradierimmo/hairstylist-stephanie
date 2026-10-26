import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const base = process.env.MATOMO_URL;
const site = process.env.MATOMO_SITE_ID;
const token = process.env.MATOMO_TOKEN;
const username = process.env.DASHBOARD_USER;
const password = process.env.DASHBOARD_PASSWORD;
if (!base || !site || !token || !username || !password || password.length < 16) {
  console.error('Configurer MATOMO_URL, MATOMO_SITE_ID, MATOMO_TOKEN, DASHBOARD_USER et un DASHBOARD_PASSWORD de 16 caracteres minimum.');
  process.exit(1);
}
const origin = new URL(base);
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw Error('Matomo doit utiliser HTTPS');
function safeEq(a,b) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function authorized(req) {
  const header=req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const pair=Buffer.from(header.slice(6),'base64').toString('utf8');
    const i=pair.indexOf(':');
    return i>=0 && safeEq(pair.slice(0,i),username) && safeEq(pair.slice(i+1),password);
  } catch { return false; }
}
const methods={
  overview:'VisitsSummary.get',
  pages:'Actions.getPageUrls',
  referrers:'Referrers.getAll',
  countries:'UserCountry.getCountry',
  devices:'DevicesDetection.getType',
  browsers:'DevicesDetection.getBrowsers',
  realtime:'Live.getCounters',
};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (!authorized(req)) {res.writeHead(401,{'WWW-Authenticate':'Basic realm="Stephanie Analytics"'});return res.end('Acces prive');}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/report'){
    const key=url.searchParams.get('type');
    if(!Object.hasOwn(methods,key)){res.writeHead(400);return res.end('Rapport inconnu');}
    const date=url.searchParams.get('date')||'today';
    const period=url.searchParams.get('period')||'day';
    if(!/^(today|yesterday|\d{4}-\d{2}-\d{2})$/.test(date)||!['day','week','month'].includes(period)){res.writeHead(400);return res.end('Periode incorrecte');}
    const api=new URL('index.php',origin);
    const params=new URLSearchParams({module:'API',method:methods[key],idSite:site,period,date,format:'JSON'});
    if(key==='realtime')params.set('lastMinutes','30');
    try{
      const upstream=await fetch(api,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...Object.fromEntries(params),token_auth:token}),signal:AbortSignal.timeout(12000)});
      if(!upstream.ok)throw Error('Matomo indisponible');
      const data=await upstream.json();
      if(data?.result==='error')throw Error('Erreur API Matomo');
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify(data));
    }catch{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Rapport indisponible. Verifier la configuration Matomo.'}));}
    return;
  }
  if(url.pathname==='/'||url.pathname==='/index.html'){
    const html=await readFile(new URL('./public/index.html',import.meta.url));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);
  }
  res.writeHead(404);res.end('Introuvable');
});
server.listen(port,()=>console.log('Dashboard prive sur http://localhost:'+port));
