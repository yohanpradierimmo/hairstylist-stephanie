/* Independent analytics tracker. Load ONLY after appropriate consent, where required. */
(function(){
  const ENDPOINT='https://REPLACE_WITH_YOUR_WORKER_DOMAIN/collect';
  if(!window.crypto?.randomUUID)return;
  let session;
  try{session=sessionStorage.getItem('stephanie_analytics_session');if(!session){session=crypto.randomUUID();sessionStorage.setItem('stephanie_analytics_session',session)}}catch{return}
  const url=new URL(location.href);
  let ref='';
  try{if(document.referrer)ref=new URL(document.referrer).hostname}catch{}
  function send(type,contact){
    const body=JSON.stringify({type,session,page:location.pathname,referrer:ref,source:url.searchParams.get('utm_source')||'',medium:url.searchParams.get('utm_medium')||'',campaign:url.searchParams.get('utm_campaign')||'',contact});
    try{fetch(ENDPOINT,{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain'},body,keepalive:true}).catch(()=>{})}catch{}
  }
  send('pageview');
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[href]');if(!a)return;
    const href=a.getAttribute('href')||'';
    const contact=href.startsWith('tel:')?'telephone':href.startsWith('mailto:')?'email':/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(href)?'whatsapp':null;
    if(contact)send('contact_click',contact);
  },{capture:true});
})();
