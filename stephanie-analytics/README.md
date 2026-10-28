# Stéphanie Analytics (remplacement autonome de Matomo)

Prototype initial indépendant de Matomo : Cloudflare Worker + D1, tableau de bord protégé par mot de passe, collecte des pages vues et clics de contact.

## Mise en service
1. Créer un compte Cloudflare et installer Node.js + Wrangler.
2. Depuis ce dossier, exécuter `npx wrangler login`, puis `npx wrangler d1 create stephanie-analytics`.
3. Copier le `database_id` retourné dans `wrangler.toml`.
4. Exécuter `npx wrangler d1 execute stephanie-analytics --remote --file=./schema.sql`.
5. Définir les secrets côté Cloudflare : `npx wrangler secret put ADMIN_USER` puis `npx wrangler secret put ADMIN_PASSWORD` (mot de passe long et unique).
6. Déployer avec `npx wrangler deploy`.
7. Remplacer `REPLACE_WITH_YOUR_WORKER_DOMAIN` dans `tracker.js` par le domaine Worker HTTPS réel.
8. Intégrer `tracker.js` aux pages du site public **seulement après vérification des obligations de consentement**. Ce prototype ne modifie pas encore les pages publiques.
9. Consulter `https://votre-worker.workers.dev/admin` avec vos identifiants.

## Confidentialité
- Aucune IP stockée ; pas de cookie, fingerprint, géolocalisation ni identification nominative.
- Identifiant aléatoire en sessionStorage pour compter des sessions approximatives. Il peut être soumis au consentement selon les conditions d'usage et les règles applicables.
- Aucun paramètre de requête complet ou contenu de formulaire collecté.
- Origine CORS limitée au domaine du site, mais CORS n'est pas une protection anti-spam. Prévoir protection anti-abus, politique de conservation, et mentions d'information avant production.
- Le tableau de bord est protégé par mot de passe sur HTTPS. Pour un usage durable, privilégier Cloudflare Access avec MFA.
- La formule gratuite Cloudflare est soumise à des quotas et peut évoluer.

## Limites de la première version
Ce MVP n'est pas équivalent à toutes les fonctionnalités de Matomo : pas encore de géolocalisation, d'objectifs configurables, d'import d'historique, de temps réel détaillé, de funnels, ni de Search Console. Les chiffres commencent uniquement après installation du tracker. Ne pas installer en production avant tests, conformité RGPD et contrôle anti-abus.
