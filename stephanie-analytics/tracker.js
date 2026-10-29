/* Mesure d'audience du site, déclenchée uniquement après consentement. */
(function () {
  'use strict';
  const ENDPOINT = 'https://stephanie-analytics.stephanie-analytics.workers.dev/collect';
  const CONSENT_KEY = 'stephanie_analytics_consent';
  const VISITOR_KEY = 'stephanie_analytics_visitor';
  const VISITOR_COOKIE = 'stephanie_analytics_visitor_id';
  const ACQUISITION_KEY = 'stephanie_analytics_acquisition';
  const OWN_HOSTS = new Set(['hairstylist-stephanie.com', 'www.hairstylist-stephanie.com']);
  const MAX_VISITOR_AGE = 13 * 30 * 24 * 60 * 60 * 1000;
  let started = false;

  const consented = () => { try { return localStorage.getItem(CONSENT_KEY) === 'granted'; } catch (_) { return false; } };
  const readCookie = name => {
    const prefix = `${name}=`;
    const value = document.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(prefix));
    try { return value ? decodeURIComponent(value.slice(prefix.length)) : ''; } catch (_) { return ''; }
  };
  const writeCookie = value => {
    try { document.cookie = `${VISITOR_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(MAX_VISITOR_AGE / 1000)}; Path=/; SameSite=Lax; Secure`; } catch (_) {}
  };
  const validId = value => /^[a-f0-9-]{36}$/i.test(value || '');
  function uuid() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function visitorId() {
    try {
      const saved = JSON.parse(localStorage.getItem(VISITOR_KEY) || 'null');
      if (validId(saved?.id) && saved.createdAt && Date.now() - saved.createdAt < MAX_VISITOR_AGE) { writeCookie(saved.id); return saved.id; }
      const fromCookie = readCookie(VISITOR_COOKIE);
      if (validId(fromCookie)) {
        localStorage.setItem(VISITOR_KEY, JSON.stringify({ id: fromCookie, createdAt: Date.now() }));
        return fromCookie;
      }
      const id = uuid();
      localStorage.setItem(VISITOR_KEY, JSON.stringify({ id, createdAt: Date.now() }));
      writeCookie(id);
      return id;
    } catch (_) {
      const fromCookie = readCookie(VISITOR_COOKIE);
      if (validId(fromCookie)) return fromCookie;
      const id = uuid(); writeCookie(id); return id;
    }
  }
  function acquisition(current) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ACQUISITION_KEY) || 'null');
      if (saved && typeof saved === 'object' && typeof saved.source === 'string') return saved;
    } catch (_) {}
    let referrer = '';
    try {
      if (document.referrer) {
        const host = new URL(document.referrer).hostname.toLowerCase();
        if (!OWN_HOSTS.has(host)) referrer = host;
      }
    } catch (_) {}
    const data = {
      source: current.searchParams.get('utm_source') || referrer,
      medium: current.searchParams.get('utm_medium') || '',
      campaign: current.searchParams.get('utm_campaign') || '',
      referrer
    };
    try { sessionStorage.setItem(ACQUISITION_KEY, JSON.stringify(data)); } catch (_) {}
    return data;
  }
  function start() {
    if (started || !consented() || !window.crypto?.getRandomValues || !window.sessionStorage) return;
    started = true;
    let session;
    try {
      session = sessionStorage.getItem('stephanie_analytics_session');
      if (!session) { session = uuid(); sessionStorage.setItem('stephanie_analytics_session', session); }
    } catch (_) { return; }
    const page = location.pathname.slice(0, 180) || '/';
    const startedAt = performance.now();
    const current = new URL(location.href);
    const attribution = acquisition(current);
    const context = { session, visitor: visitorId(), page, referrer: attribution.referrer, source: attribution.source, medium: attribution.medium, campaign: attribution.campaign, screen: `${window.screen?.width || 0}x${window.screen?.height || 0}` };
    function send(type, extra) {
      const body = JSON.stringify({ ...context, type, ...(extra || {}) });
      try {
        if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
      } catch (_) {}
      try { fetch(ENDPOINT, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true }).catch(() => {}); } catch (_) {}
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
