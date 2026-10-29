# Stéphanie Analytics

Remplacement indépendant de Matomo : Worker Cloudflare + D1, tableau de bord privé et collecte sans cookie ni adresse IP.

## Ce qui est inclus

- Pages vues, sessions techniques, pages d'entrée/sortie, sources UTM/référents, appareils, navigateurs et contacts mesurés.
- Durée moyenne et taux de rebond estimés à partir d'un événement de sortie, avec limites clairement affichées.
- Vue des visiteurs actifs sur les cinq dernières minutes et événements récents.
- Authentification Basic côté serveur, en-têtes de sécurité, vérification d'origine, validation des données et limitation légère anti-abus.
- Conservation automatique de 395 jours via un Cron Worker, sans collecte d'IP, cookie, fingerprint, position ou contenu de formulaire.
- Le tracker est explicitement opt-in : il ne collecte rien tant que `localStorage.stephanie_analytics_consent` n'est pas égal à `granted`.

## Mise en service Cloudflare

1. Depuis ce dossier, exécuter `npx wrangler login`.
2. Créer la base : `npx wrangler d1 create stephanie-analytics`.
3. Remplacer `REPLACE_WITH_D1_DATABASE_ID` dans `wrangler.toml` par l'identifiant retourné.
4. Initialiser la base : `npx wrangler d1 execute stephanie-analytics --remote --file=./schema.sql`.
5. Définir les secrets : `npx wrangler secret put ADMIN_USER` et `npx wrangler secret put ADMIN_PASSWORD`.
6. Remplacer `REPLACE_WITH_YOUR_WORKER_DOMAIN` dans `tracker.js` par le domaine HTTPS du Worker.
7. Déployer : `npx wrangler deploy`.
8. Après validation et information/consentement conformes, charger `tracker.js` sur les pages publiques.
9. Ouvrir `/admin` sur le domaine du Worker avec les identifiants définis.

Ne jamais mettre l'identifiant D1, les secrets ou un token Cloudflare dans GitHub. Le dashboard ne doit pas être ajouté au menu, au sitemap ou aux pages publiques.

## Limites assumées

Ce projet ne prétend pas identifier des personnes, mesurer des appels réellement décrochés, fournir une position précise ou inventer des données SEO. Search Console, import Matomo et MFA Cloudflare Access nécessitent encore une configuration de compte séparée. Cloudflare Free inclut des quotas qui doivent être surveillés avant la mise en production.
