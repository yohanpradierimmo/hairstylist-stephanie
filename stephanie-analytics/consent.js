/* Gestion locale des préférences de confidentialité. */
(function () {
  'use strict';
  const KEY = 'stephanie_cookie_preferences';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
  const notify = preferences => window.dispatchEvent(new CustomEvent('stephanie-consent-updated', { detail: preferences }));
  const save = analytics => {
    const preferences = { essential: true, analytics: !!analytics, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(preferences));
      localStorage.setItem('stephanie_analytics_consent', preferences.analytics ? 'granted' : 'denied');
      if (!preferences.analytics) {
        localStorage.removeItem('stephanie_analytics_visitor');
        sessionStorage.removeItem('stephanie_analytics_session');
        document.cookie = 'stephanie_analytics_visitor_id=; Max-Age=0; Path=/; SameSite=Lax; Secure';
      }
    } catch (_) {}
    notify(preferences);
    return preferences;
  };
  const markup = `
    <div class="cookie-banner" id="cookieBanner" role="dialog" aria-modal="true" aria-labelledby="cookieBannerTitle" hidden>
      <div><strong id="cookieBannerTitle">Vos préférences de confidentialité</strong><p>Nous utilisons des cookies nécessaires au fonctionnement du site. La mesure d’audience est facultative et vous aide à améliorer le site.</p></div>
      <div class="cookie-actions"><button type="button" class="cookie-button cookie-button--secondary" data-cookie-open>Personnaliser</button><button type="button" class="cookie-button" data-cookie-accept>Tout accepter</button></div>
    </div>
    <dialog class="cookie-dialog" id="cookieDialog" aria-labelledby="cookieDialogTitle">
      <button class="dialog-close" type="button" data-cookie-close aria-label="Fermer">×</button>
      <h2 id="cookieDialogTitle">Panneau de gestion des cookies</h2>
      <p class="cookie-intro">Préférences pour tous les services</p>
      <p class="cookie-choice-note">Personnalisez les services facultatifs ci-dessous, puis enregistrez votre choix.</p>
      <section class="cookie-service"><div><h3>Cookies nécessaires</h3><p>Ce site utilise des cookies nécessaires à son bon fonctionnement. Ils ne peuvent pas être désactivés.</p></div><span class="cookie-required">Toujours actifs</span></section>
      <section class="cookie-service"><div><h3>Mesure d’audience</h3><p>Statistiques internes du site : pages consultées, appareil, navigateur, ville approximative et clics vers les moyens de contact. Aucun suivi publicitaire, aucune adresse IP brute ni donnée nominative ne sont conservés.</p></div><label class="cookie-switch"><input id="cookieAnalytics" type="checkbox"><span>Autoriser</span></label></section>
      <section class="cookie-service cookie-service--inactive"><div><h3>APIs et services Google</h3><p>Aucun Google Tag Manager, Google Analytics, service publicitaire ou API Google n’est actuellement chargé par ce site.</p></div><span class="cookie-required">Non utilisés</span></section>
      <p class="cookie-links">Vous pouvez modifier ce choix à tout moment. <a href="https://www.cnil.fr/fr/cookies-et-autres-traceurs" target="_blank" rel="noopener">En savoir plus</a></p>
      <div class="cookie-actions cookie-actions--end"><button type="button" class="cookie-button" data-cookie-save>Enregistrer</button></div>
    </dialog>`;
  function setup() {
    document.body.insertAdjacentHTML('beforeend', markup);
    const banner = document.getElementById('cookieBanner');
    const dialog = document.getElementById('cookieDialog');
    const toggle = document.getElementById('cookieAnalytics');
    const open = () => {
      toggle.checked = !!read()?.analytics;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    };
    const close = () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };
    const finish = analytics => { save(analytics); banner.hidden = true; close(); };
    document.querySelectorAll('[data-cookie-open]').forEach(button => button.addEventListener('click', open));
    document.querySelectorAll('[data-cookie-settings]').forEach(button => button.addEventListener('click', open));
    document.querySelectorAll('[data-cookie-close]').forEach(button => button.addEventListener('click', close));
    document.querySelectorAll('[data-cookie-accept]').forEach(button => button.addEventListener('click', () => finish(true)));
    document.querySelectorAll('[data-cookie-refuse]').forEach(button => button.addEventListener('click', () => finish(false)));
    document.querySelectorAll('[data-cookie-save]').forEach(button => button.addEventListener('click', () => finish(toggle.checked)));
    if (!read()) banner.hidden = false; else notify(read());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
})();
