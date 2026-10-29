/* Mesure d'audience du site, déclenchée uniquement après consentement. */
(function () {
  'use strict';
  const ENDPOINT = 'https://stephanie-analytics.stephanie-analytics.workers.dev/collect';
  const CONSENT_KEY = 'stephanie_analytics_consent';
  const VISITOR_KEY = 'stephanie_analytics_visitor';
  const MAX_VISITOR_AGE = 13 * 30 * 24 * 60 * 60 * 1000;
  let started = false;

  const consented = () => { try { return localStorage.getItem(CONSENT_KEY) === 'granted'; } catch (_) { return false; } };
  function visitorId() {
    try {
      const saved = JSON.parse(localStorage.getItem(VISITOR_KEY) || 'null');
      if (saved?.id && saved.createdAt && Date.now() - saved.createdAt < MAX_VISITOR_AGE) return saved.id;
      const id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, JSON.stringify({ id, createdAt: Date.now() }));
      return id;
    } catch (_) { return crypto.randomUUID(); }
  }
  function start() {
    if (started || !consented() || !window.crypto?.randomUUID || !window.sessionStorage) return;
    started = true;
    let session;
    try {
      session = sessionStorage.getItem('stephanie_analytics_session');
      if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('stephanie_analytics_session', session); }
    } catch (_) { return; }
    const page = location.pathname.slice(0, 180) || '/';
    const startedAt = performance.now();
    const current = new URL(location.href);
    let referrer = '';
    try { if (document.referrer) referrer = new URL(document.referrer).hostname; } catch (_) {}
    const context = { session, visitor: visitorId(), page, referrer, source: current.searchParams.get('utm_source') || '', medium: current.searchParams.get('utm_medium') || '', campaign: current.searchParams.get('utm_campaign') || '', screen: `${window.screen?.width || 0}x${window.screen?.height || 0}` };
    function send(type, extra) {
      const body = JSON.stringify({ ...context, type, ...(extra || {}) });
      try { fetch(ENDPOINT, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {}); } catch (_) {}
    }
    send('pageview');
    let exited = false;
    function exit() { if (!exited) { exited = true; send('page_exit', { duration_ms: Math.max(0, Math.round(performance.now() - startedAt)) }); } }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') exit(); });
    window.addEventListener('pagehide', exit, { once: true });
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]'); if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const contact = href.startsWith('tel:') ? 'telephone' : href.startsWith('sms:') ? 'sms' : href.startsWith('mailto:') ? 'email' : /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(href) ? 'whatsapp' : /instagram\.com/i.test(href) ? 'instagram' : null;
      if (contact) send('contact_click', { contact });
    }, { capture: true });
  }
  window.addEventListener('stephanie-consent-updated', event => { if (event.detail?.analytics) start(); });
  if (consented()) start();
})();
