/* Stéphanie Analytics - opt-in, cookieless, privacy-first tracker. */
(function () {
  'use strict';
  const ENDPOINT = 'https://stephanie-analytics.stephanie-analytics.workers.dev/collect';
  if (!window.crypto?.randomUUID || !window.sessionStorage) return;
  // Audience-only mode: no banner is required when the CNIL exemption conditions
  // are met. Visitors can opt out at any time from the privacy page.
  if (window.localStorage?.getItem('stephanie_analytics_optout') === '1') return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  let session;
  try {
    session = sessionStorage.getItem('stephanie_analytics_session');
    if (!session) {
      session = crypto.randomUUID();
      sessionStorage.setItem('stephanie_analytics_session', session);
    }
  } catch (_) { return; }
  const page = location.pathname.slice(0, 180) || '/';
  const started = performance.now();
  const current = new URL(location.href);
  let referrer = '';
  try { if (document.referrer) referrer = new URL(document.referrer).hostname; } catch (_) {}
  const context = {
    session, page, referrer,
    source: current.searchParams.get('utm_source') || '',
    medium: current.searchParams.get('utm_medium') || '',
    campaign: current.searchParams.get('utm_campaign') || '',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`
  };
  function send(type, extra) {
    const body = JSON.stringify({ ...context, type, ...(extra || {}) });
    try {
      fetch(ENDPOINT, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
    } catch (_) {}
  }
  send('pageview');
  let exited = false;
  function exit() {
    if (exited) return;
    exited = true;
    send('page_exit', { duration_ms: Math.max(0, Math.round(performance.now() - started)) });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') exit(); });
  window.addEventListener('pagehide', exit, { once: true });
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    const contact = href.startsWith('tel:') ? 'telephone'
      : href.startsWith('sms:') ? 'sms'
      : href.startsWith('mailto:') ? 'email'
      : /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com)\//i.test(href) ? 'whatsapp'
      : /instagram\.com/i.test(href) ? 'instagram'
      : null;
    if (contact) send('contact_click', { contact });
  }, { capture: true });
  window.stephanieAnalyticsOptOut = function () {
    try {
      localStorage.setItem('stephanie_analytics_optout', '1');
      sessionStorage.removeItem('stephanie_analytics_session');
    } catch (_) {}
  };
})();
